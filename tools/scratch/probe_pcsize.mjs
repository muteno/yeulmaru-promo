#!/usr/bin/env node
// [260806] AI 홍보 모달 「창 크기」 실측 프로브 — 탭(점검·전략 추론·고객 분류)을 오갈 때 창이 튀는가.
//   운영자 지시 = 「ai홍보 창 크기를 항상 동일하게 · 지금 ai 홍보 점검 크기를 기준으로 고정」.
//   데이터 = QA 목(tools/qa_mock_ops.mjs)뿐 = 실데이터·PII 미접촉. 골격 = probe_seg.mjs 계승(가상호스트 + ?qa=admin).
//   실행: node tools/scratch/probe_pcsize.mjs [전_index경로]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports', '260806_AI홍보_창크기_전후');
const BEFORE = process.argv[2] || '';
const W = +(process.argv[3] || 1500), H = +(process.argv[4] || 1020);   // 뷰포트 = 인자로 바꿔 좁은 화면도 같은 계약인지 본다
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// 두 벌을 찍는다 — ①창만 잘라(내용 확인용) ②판 전체(뷰포트 · **창이 화면에서 얼마나 튀는지는 판으로만 보인다**
//   — 잘라 찍은 컷은 리포트에서 폭에 맞춰 늘어나 크기 차이가 지워진다).
const SHOT = async (page, file) => {
  const el = await page.$('#promo-check .modal');
  if (el) await el.screenshot({ path: join(OUT, file) });
  else await page.screenshot({ path: join(OUT, file) });
  await page.screenshot({ path: join(OUT, file.replace(/\.png$/, '_판.png')) });
};

// 창 실측 — 폭·높이는 소수 둘째까지(88vh 같은 vh 값은 정수가 아니다)
const RECT = `(()=>{const m=document.querySelector('#promo-check .modal');if(!m)return null;
  const r=m.getBoundingClientRect(),cs=getComputedStyle(m);
  const sc=m.querySelector('div[style*="overflow:auto"]');
  return {w:+r.width.toFixed(2),h:+r.height.toFixed(2),
    css:{w:cs.width,h:cs.height,maxH:cs.maxHeight},
    scroll:sc?{h:+sc.getBoundingClientRect().height.toFixed(2),over:sc.scrollHeight>sc.clientHeight+1}:null};})()`;

async function run(page, label) {
  const rows = [];
  await page.evaluate('openPromoCheck()');
  await page.waitForTimeout(900);
  const TABS = [['check', '점검'], ['ai', '전략추론'], ['seg', '고객분류']];
  for (const [t, ko] of TABS) {
    if (t !== 'check') { await page.evaluate(`_pcTab('${t}')`); await page.waitForTimeout(450); }
    rows.push({ tab: ko, ...(await page.evaluate(RECT)) });
    await SHOT(page, `${label}_${ko}.png`);
    if (t === 'seg') {   // 명단을 실제로 뽑은 뒤(10열 표가 그려진 상태)도 한 번
      await page.evaluate('_segRun()');
      await page.waitForTimeout(1500);
      rows.push({ tab: ko + '(명단)', ...(await page.evaluate(RECT)) });
      await SHOT(page, `${label}_${ko}_명단.png`);
    }
  }
  // 되돌아오기 — 탭을 왕복해도 같은 크기인가(왕복 후 점검)
  await page.evaluate(`_pcTab('check')`);
  await page.waitForTimeout(450);
  rows.push({ tab: '점검(왕복후)', ...(await page.evaluate(RECT)) });
  // 넘치는 날 — 운영자 260806-18 「고정하고 넘어가면 스크롤」. 내용을 창보다 길게 채워도 창은 안 커지고 본문만 스크롤인가.
  await page.evaluate(`(()=>{const v=document.getElementById('pc-view-check');
    v.insertAdjacentHTML('beforeend','<div style="height:1600px"></div>');})()`);
  await page.waitForTimeout(350);
  rows.push({ tab: '점검(내용과다)', ...(await page.evaluate(RECT)) });
  await SHOT(page, `${label}_점검_내용과다.png`);
  return rows;
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[pcsize] SKIP — playwright-core 미설치'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[pcsize] SKIP — chromium 미탐지'); return 0; }
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  const all = {};
  try {
    for (const [label, root] of [['후', ''], ['전', BEFORE]]) {
      if (label === '전' && !root) continue;
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => errs.push(`${label}: ${String(e.message).split('\n')[0].slice(0, 120)}`));
      await page.route('**/*', route => {
        const u = new NodeURL(route.request().url());
        if (u.hostname === 'app.local') {
          let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
          const f = (p === '/index.html' && root) ? root : join(ROOT, p);
          try { return route.fulfill({ status: 200, body: readFileSync(f), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
          catch { return route.fulfill({ status: 404, body: 'nf' }); }
        }
        if (u.hostname === 'cdn.plot.ly') {
          const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
          if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' });
        }
        return route.abort();
      });
      await page.addInitScript(INIT_SCRIPT);
      await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2600);
      await page.evaluate(FEED_SCRIPT);
      await page.waitForTimeout(500);
      all[label] = await run(page, label);
      console.log(`\n── ${label} (뷰포트 ${W}×${H}) ──`);
      all[label].forEach(r => {
        const sc = r.scroll ? (' · 본문 ' + r.scroll.h + ' 스크롤 ' + (r.scroll.over ? 'O' : 'X')) : '';
        console.log('  ' + r.tab.padEnd(14) + String(r.w).padStart(9) + ' × ' + String(r.h).padStart(9)
          + '  (css w=' + r.css.w + ' h=' + r.css.h + ' maxH=' + r.css.maxH + sc + ')');
      });
      const ws = [...new Set(all[label].map(r => r.w))], hs = [...new Set(all[label].map(r => r.h))];
      console.log(`  → 폭 ${ws.length}가지 ${ws.join(' / ')} · 높이 ${hs.length}가지 ${hs.join(' / ')}`);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(`\n스샷 → ${OUT}`);
  console.log(JSON.stringify(all));
  if (errs.length) { console.log('✗ 콘솔 에러:'); errs.forEach(e => console.log('   ' + e)); return 1; }
  console.log('✓ 콘솔 에러 0');
  return 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
