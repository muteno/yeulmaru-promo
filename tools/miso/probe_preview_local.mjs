#!/usr/bin/env node
/* preview 실시간 진단 — ⚠️ 운영자 PC에서 로컬 실행하는 스크립트 (원격 클코 세션에서는 못 돈다)
   왜 로컬? MISO preview URL은 로그인 벽(403)이라 원격에서 열 수 없다. 운영자 브라우저에는
   이미 로그인 세션이 있으므로, 그 브라우저에 CDP로 붙으면 발행 없이 현재 상태를 전량 뽑을 수 있다.
   그리고 이 스크립트는 로컬 레포(깃 정본) 옆에서 돌기 때문에 대조까지 한 번에 끝난다.

   ── 사용법 (운영자 PC · PowerShell) ────────────────────────────────
   1) 크롬/엣지를 디버깅 포트로 띄운다(기존 창은 모두 닫은 뒤):
        & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222
      (엣지면 msedge.exe · 브레이브면 brave.exe — 경로만 바꾸면 된다)
   2) 그 창에서 MISO preview를 열고 PIN 0510으로 대시보드까지 진입한다.
   3) 레포 폴더에서:
        npm i -D playwright-core          (한 번만)
        node tools/miso/probe_preview_local.mjs
   4) 산출: 이관본/preview진단.md + 이관본/preview진단.png → 이 두 개를 원격(Claude)에 주면 된다.

   옵션: --port 9222 · --url <preview URL 일부> (여러 탭 중 고를 때)
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_MD = join(ROOT, '이관본', 'preview진단.md');
const OUT_PNG = join(ROOT, '이관본', 'preview진단.png');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('--port', '9222');
const URLHINT = arg('--url', 'miso.gs');

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core 필요:  npm i -D playwright-core'); process.exit(1); }

let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch (e) {
  console.error(`\n❌ 브라우저에 붙지 못했습니다 (포트 ${PORT}).`);
  console.error('   크롬을 이렇게 띄웠는지 확인하세요(기존 창 모두 닫은 뒤):');
  console.error(`   & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${PORT}\n`);
  process.exit(1);
}

// 열린 탭 중 MISO 탭 찾기
const pages = browser.contexts().flatMap(c => c.pages());
if (!pages.length) { console.error('열린 탭이 없습니다.'); process.exit(1); }
let page = pages.find(p => p.url().includes(URLHINT)) || pages[0];
console.log(`대상 탭: ${page.url()}`);

// ── 실시간 추출
const dump = await page.evaluate(() => {
  const T = document.body.innerText || '';
  const g = (o, p) => { try { return p.split('.').reduce((a, k) => a[k], o); } catch { return undefined; } };
  const W = window;
  const KEYS = ['records', 'programs', 'special', 'opsMaster', 'opsDaily', 'exhibMaster', 'exhibDaily',
    'platforms', 'contents', 'annual', 'rules', 'perfHistory', 'eduInstitutions', 'messages', 'managers'];
  const data = {};
  for (const k of KEYS) {
    const v = W[k] || g(W, '__DATA__.' + k) || g(W, 'DATA.' + k) || g(W, 'data.' + k);
    if (Array.isArray(v)) data[k] = v.length;
    else if (v && typeof v === 'object') data[k] = 'obj:' + Object.keys(v).length;
  }
  // 팔레트 실측
  const set = new Set();
  for (const el of document.querySelectorAll('*')) {
    const c = getComputedStyle(el);
    for (const p of ['color', 'backgroundColor', 'borderTopColor']) {
      const v = c[p]; if (v && v !== 'rgba(0, 0, 0, 0)') set.add(v);
    }
  }
  const hex = v => { const m = v.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : v; };
  const used = [...set].map(hex);
  // DOM 트리 요약
  function tree(el, d, max) {
    if (!el || d > max || !(el instanceof HTMLElement)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const cls = String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    const node = { t: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '') };
    if (own) node.x = own.slice(0, 50);
    const kids = [...el.children].map(c => tree(c, d + 1, max)).filter(Boolean);
    if (kids.length) node.c = kids;
    return node;
  }
  return {
    url: location.href, title: document.title,
    data, usedColors: used.length, colors: [...new Set(used)].slice(0, 40),
    dom: {
      bodyLen: document.body.innerHTML.length,
      tables: document.querySelectorAll('table').length,
      svg: document.querySelectorAll('svg').length,
      canvas: document.querySelectorAll('canvas').length,
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input').length,
    },
    menus: [...document.querySelectorAll('nav a,nav button,header a,header button,[role=tab]')]
      .map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 20),
    text: T.replace(/\n{2,}/g, '\n').slice(0, 2500),
    treeRoot: tree(document.body.firstElementChild, 0, 5),
  };
});
try { await page.screenshot({ path: OUT_PNG, fullPage: false }); } catch { }

// ── 깃 정본 대조
const DBP = join(ROOT, '이관본', '첨부', '예울마루_데이터.json');
if (!existsSync(DBP)) { console.error(`정본 없음: ${DBP} — 레포 루트에서 실행했는지 확인`); process.exit(1); }
const db = JSON.parse(readFileSync(DBP, 'utf8'));
const c = db.meta.expectedCounts, annual = db.annual || {};
const totInwon = (annual.total || []).find(r => r.key === '인원') || {};
const PAL = ['#4a4de7', '#d88455', '#1a6b3c', '#e24b4a', '#1a1a2e', '#fdf6f3', '#e8e8fd', '#f0c4b8', '#6b6b7b', '#888888', '#ffffff', '#bbbbbb'];

const checks = [];
const K = (label, ok, detail) => checks.push({ label, ok, detail });
for (const [k, want] of Object.entries(c)) {
  const got = dump.data[k];
  K(`데이터 ${k}`, got === want || String(got).startsWith('obj:'), `기대 ${want} / 실제 ${got ?? '없음'}`);
}
K('annual 배선', !!dump.data.annual, `실제 ${dump.data.annual ?? '없음'}`);
K(`KPI ${(totInwon.sum || 0).toLocaleString()} 표시`, dump.text.includes((totInwon.sum || 0).toLocaleString()), '');
K(`누적 ${(annual.grand || 0).toLocaleString()} 표시`, dump.text.includes((annual.grand || 0).toLocaleString()), '');
K('기본 화면 = 사업 실적', /연간 실적|판매 현황/.test(dump.text), '연간실적·판매현황 문구');
K('플레이스홀더 아님', !/테스트 화면/.test(dump.text), '');
K('표 렌더', dump.dom.tables > 0, `table ${dump.dom.tables}`);
K('차트 렌더', dump.dom.svg + dump.dom.canvas > 0, `svg ${dump.dom.svg} · canvas ${dump.dom.canvas}`);
K('쓰기 UI 없음', !/저장|등록|삭제|수정하기/.test(dump.text), '');
const off = dump.colors.filter(h => !PAL.includes(h));
K('팔레트 이탈 적음', off.length <= 8, `이탈 ${off.length}종: ${off.slice(0, 8).join(', ')}`);

const pass = checks.filter(x => x.ok).length;
function treeText(n, d = 0) { if (!n) return ''; let s = '  '.repeat(d) + n.t + (n.x ? `  「${n.x}」` : '') + '\n'; for (const k of (n.c || [])) s += treeText(k, d + 1); return s; }

const md = `# preview 실시간 진단 (발행 없이 · 로컬 브라우저 CDP)

> 생성: \`tools/miso/probe_preview_local.mjs\` — 운영자 PC의 로그인된 브라우저에 CDP로 붙어 실측.
> 대상: ${dump.url}
> 제목: ${dump.title}
> 스크린샷: \`이관본/preview진단.png\`

## 종합: ${pass}/${checks.length} 통과

| 항목 | 결과 | 상세 |
|---|---|---|
${checks.map(x => `| ${x.label} | ${x.ok ? '✅' : '❌'} | ${x.detail} |`).join('\n')}

## DOM 규모
\`\`\`json
${JSON.stringify(dump.dom, null, 1)}
\`\`\`

## 감지된 메뉴
${dump.menus.length ? dump.menus.map(m => `- ${m.replace(/\n/g, ' ')}`).join('\n') : '(없음)'}

## 화면 텍스트 (앞부분)
\`\`\`
${dump.text.slice(0, 1500)}
\`\`\`

## DOM 구조 트리 (깊이 5)
\`\`\`
${treeText(dump.treeRoot).slice(0, 3000)}
\`\`\`

## 사용된 색 (${dump.usedColors}종 중 상위)
${dump.colors.slice(0, 24).map(h => `\`${h}\`${PAL.includes(h) ? '' : ' ⚠️팔레트밖'}`).join(' · ')}

## 다음에 채워야 할 것
${checks.filter(x => !x.ok).map(x => `- **${x.label}** — ${x.detail}`).join('\n') || '- 없음 (전항 통과)'}
`;
writeFileSync(OUT_MD, md, 'utf8');
console.log(`\n✅ 이관본/preview진단.md — ${pass}/${checks.length} 통과`);
for (const x of checks) console.log(`  ${x.ok ? '✅' : '❌'} ${x.label} — ${x.detail}`);
console.log(`\n이 두 파일을 원격(Claude)에 주세요: 이관본/preview진단.md · 이관본/preview진단.png`);
await browser.close();
