#!/usr/bin/env node
/* 발행본 검증기 — MISO 발행 URL을 curl로 미러링해 로컬에서 실렌더하고, 깃 정본과 대조한다.
   왜 미러링? 이 세션의 헤드리스 브라우저는 외부 라이브에 붙을 때 프록시가 연결을 리셋한다
   (curl은 정상). → 에셋을 curl로 받아 로컬 서버로 서빙하면 헤드리스 렌더가 가능해진다.

   사용: node tools/miso/verify_published.mjs <발행URL> [--pin 0510]
   예  : node tools/miso/verify_published.mjs https://gscyeulmaru.miso.gs/site/FXIOhDpkS5b2qFNU/

   출력: 콘솔 리포트 + 이관본/검증리포트.md (깃 정본 대조 결과)
   ⚠️ 기계산출물 — 손편집 금지. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '이관본', '검증리포트.md');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const URL_ = process.argv[2];
const PIN = (process.argv.includes('--pin') ? process.argv[process.argv.indexOf('--pin') + 1] : '0510');
if (!URL_) { console.error('사용: node tools/miso/verify_published.mjs <발행URL> [--pin 0510]'); process.exit(1); }

const u = new URL(URL_);
const basePath = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
const MIR = join(ROOT, '.miso-mirror');
rmSync(MIR, { recursive: true, force: true });
mkdirSync(join(MIR, basePath, 'assets'), { recursive: true });

function curl(url, dest) {
  try { execFileSync('curl', ['-sS', '-f', '--max-time', '90', '-o', dest, url], { stdio: 'pipe' }); return true; }
  catch { return false; }
}
// 1) 셸
const shellPath = join(MIR, basePath, 'index.html');
if (!curl(u.origin + basePath, shellPath)) { console.error(`셸 다운로드 실패: ${u.origin + basePath}`); process.exit(1); }
const shell = readFileSync(shellPath, 'utf8');
// 2) 에셋(셸 참조 + JS 내부 참조 2패스)
const got = new Set();
function fetchAssets(text) {
  const found = [...text.matchAll(new RegExp(basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'assets/[A-Za-z0-9_.\\-]+', 'g'))].map(m => m[0]);
  const rel = [...text.matchAll(/["'`](?:\.\/)?assets\/([A-Za-z0-9_.\-]+)["'`]/g)].map(m => basePath + 'assets/' + m[1]);
  let n = 0;
  for (const a of new Set([...found, ...rel])) {
    if (got.has(a)) continue; got.add(a);
    if (curl(u.origin + a, join(MIR, a))) n++;
  }
  return n;
}
let n1 = fetchAssets(shell);
let n2 = 0;
for (const a of [...got]) { if (/\.(js|css)$/.test(a) && existsSync(join(MIR, a))) n2 += fetchAssets(readFileSync(join(MIR, a), 'utf8')); }
console.log(`미러링: 셸 1 + 에셋 ${n1 + n2}개`);

// 3) 로컬 서빙
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const missing = [];
const srv = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(MIR, p);
  if (existsSync(f)) { r.writeHead(200, { 'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' }); r.end(readFileSync(f)); }
  else { missing.push(p); r.writeHead(404); r.end(); }
});
await new Promise(r => srv.listen(8455, '127.0.0.1', r));

// 4) 헤드리스 렌더 + 추출
let chromium; try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core 필요'); process.exit(1); }
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.goto(`http://127.0.0.1:8455${basePath}`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const entry = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 600), inputs: document.querySelectorAll('input').length }));
// PIN 시도
if (entry.inputs > 0) {
  const boxes = await page.$$('input');
  for (let i = 0; i < PIN.length; i++) {           // 칸별 포커스 후 입력(자동 이동 안 하는 구현 대비)
    try { if (boxes[i]) await boxes[i].click(); } catch {}
    await page.keyboard.type(PIN[i]); await page.waitForTimeout(140);
  }
  await page.waitForTimeout(600);
  // 확인/입장 버튼이 있으면 클릭, 없으면 Enter
  let clicked = false;
  for (const t of ['확인', '입장', '로그인', '들어가기']) {
    const b = await page.$(`button:has-text("${t}")`);
    if (b) { try { await b.click(); clicked = true; break; } catch {} }
  }
  if (!clicked) { try { await page.keyboard.press('Enter'); } catch {} }
}
await page.waitForTimeout(5000);

const got2 = await page.evaluate(() => {
  const txt = document.body.innerText;
  const num = s => { const m = txt.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); return !!m; };
  return {
    text: txt.slice(0, 3000),
    htmlLen: document.body.innerHTML.length,
    tables: document.querySelectorAll('table').length,
    canvases: document.querySelectorAll('canvas, svg').length,
    hexes: (() => { const s = new Set(); for (const el of document.querySelectorAll('*')) { const c = getComputedStyle(el); for (const p of ['color', 'backgroundColor', 'borderColor']) { const v = c[p]; if (v && v.startsWith('rgb')) s.add(v); } } return [...s].slice(0, 60); })(),
    menus: Array.from(document.querySelectorAll('nav a, nav button, header a, header button, [role=tab]')).map(e => e.innerText.trim()).filter(Boolean).slice(0, 15),
  };
});
await page.screenshot({ path: join(ROOT, '.miso-mirror', 'shot.png') });
await browser.close(); srv.close();

// 5) 깃 정본 대조
const db = JSON.parse(readFileSync(join(ROOT, '이관본', '첨부', '예울마루_데이터.json'), 'utf8'));
const c = db.meta.expectedCounts, annual = db.annual || {};
const totInwon = (annual.total || []).find(r => r.key === '인원') || {};
const PALETTE = ['#4A4DE7', '#D88455', '#1A6B3C', '#E24B4A', '#1A1A2E', '#FDF6F3', '#E8E8FD', '#F0C4B8', '#6B6B7B'];
const cssAll = [...got].filter(a => a.endsWith('.css')).map(a => readFileSync(join(MIR, a), 'utf8')).join('\n');
const jsAll = [...got].filter(a => a.endsWith('.js')).map(a => readFileSync(join(MIR, a), 'utf8')).join('\n');

const checks = [];
const K = (label, ok, detail) => checks.push({ label, ok, detail });
K('PIN 게이트 존재', /자리를 입력|PIN/i.test(entry.text) || entry.inputs >= 4, `입력칸 ${entry.inputs}개`);
K('PIN 통과 후 진입', got2.htmlLen > 3000 && !/테스트 화면/.test(got2.text), `bodyHTML ${got2.htmlLen}자`);
K('플레이스홀더 아님', !/테스트 화면입니다/.test(got2.text + jsAll), /테스트 화면입니다/.test(jsAll) ? '⚠️ "테스트 화면입니다" 발견' : '없음');
K(`KPI 누계 ${(totInwon.sum || 0).toLocaleString()}`, got2.text.includes((totInwon.sum || 0).toLocaleString()), '');
K(`누적 ${(annual.grand || 0).toLocaleString()}`, got2.text.includes((annual.grand || 0).toLocaleString()), '');
K('연간 실적 데이터 배선', /annual|1505706|3690031/.test(jsAll) || got2.text.includes('연간'), '');
K('records 데이터 배선', /records/.test(jsAll) || got2.text.includes('홍보'), '');
K('표 렌더', got2.tables > 0, `table ${got2.tables}개`);
K('차트 렌더', got2.canvases > 0, `svg/canvas ${got2.canvases}개`);
K('팔레트 인디고', /#4a4de7/i.test(cssAll), '');
K('팔레트 살몬', /#d88455/i.test(cssAll), '');
K('JS 에러 0', errs.length === 0, errs.slice(0, 2).join(' | '));
K('에셋 404 없음', missing.length === 0, missing.slice(0, 3).join(', '));

const offPalette = [...cssAll.matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0].toLowerCase())
  .filter(h => !PALETTE.map(p => p.toLowerCase()).includes(h));
const offCount = {}; for (const h of offPalette) offCount[h] = (offCount[h] || 0) + 1;
const offTop = Object.entries(offCount).sort((a, b) => b[1] - a[1]).slice(0, 12);

const pass = checks.filter(x => x.ok).length;
const md = `# 발행본 검증 리포트 (깃 정본 대조)

> 생성: \`tools/miso/verify_published.mjs\` — 발행 URL을 curl로 미러링 → 로컬 실렌더 → 깃 정본 대조.
> 대상: ${URL_}
> 미러: 셸 1 + 에셋 ${got.size}개 · 뷰포트 1920×1080 · PIN \`${PIN}\`

## 종합: ${pass}/${checks.length} 통과

| 항목 | 결과 | 상세 |
|---|---|---|
${checks.map(x => `| ${x.label} | ${x.ok ? '✅' : '❌'} | ${x.detail || ''} |`).join('\n')}

## 진입 화면 텍스트
\`\`\`
${entry.text.trim().slice(0, 400)}
\`\`\`

## PIN 통과 후 화면 텍스트 (앞부분)
\`\`\`
${got2.text.trim().slice(0, 1200)}
\`\`\`

## 감지된 메뉴
${got2.menus.length ? got2.menus.map(m => `- ${m.replace(/\n/g, ' ')}`).join('\n') : '(없음)'}

## 팔레트 밖 색 (CSS 기준 상위)
${offTop.length ? offTop.map(([h, n]) => `- \`${h}\` ${n}회`).join('\n') : '(없음)'}

## 다음에 채워야 할 것
${checks.filter(x => !x.ok).map(x => `- **${x.label}** — ${x.detail || '미구현'}`).join('\n') || '- 없음 (전항 통과)'}
`;
writeFileSync(OUT, md, 'utf8');
console.log(`\n✅ 이관본/검증리포트.md — ${pass}/${checks.length} 통과`);
for (const x of checks) console.log(`  ${x.ok ? '✅' : '❌'} ${x.label}${x.detail ? ' — ' + x.detail : ''}`);
