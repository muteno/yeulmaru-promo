#!/usr/bin/env node
// 3면 조작부(연도 ▾ │ 전체·판매중) + 하단 반반(전시│교육) 실클릭 흐름 점검 — 상태마다 기하 실측 + 스샷.
// 사용: node tools/scratch/probe_3split_flow.mjs <출력디렉터리> [폭 높이]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.argv[2] || '.';
const W = parseInt(process.argv[3] || '1920', 10), H = parseInt(process.argv[4] || '1080', 10);
mkdirSync(DIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return null;
}
const MEASURE = `(()=>{
  const lightBg=e=>{const m=/^rgba?\\(([^)]+)\\)/.exec(getComputedStyle(e).backgroundColor);if(!m)return false;
    const p=m[1].split(',').map(parseFloat),a=p.length>3?p[3]:1;return a>=0.5&&p[0]>=240&&p[1]>=240&&p[2]>=240;};
  const col=sel=>{
    const box=document.querySelector(sel+' [data-bizmbox]');
    if(!box||box.offsetParent===null)return null;
    const cs=getComputedStyle(box), r=box.getBoundingClientRect();
    const inner=r.bottom-(parseFloat(cs.borderBottomWidth)||0)-(parseFloat(cs.paddingBottom)||0);
    const clipBottom=el=>{let b=el.getBoundingClientRect().bottom,n=el.parentElement;
      while(n){const c=getComputedStyle(n);
        if(/auto|scroll|hidden/.test(c.overflowY)){const rr=n.getBoundingClientRect();b=Math.min(b,rr.bottom-(parseFloat(c.borderBottomWidth)||0));}
        if(n===box)break;n=n.parentElement;}return b;};
    let white=null;
    box.querySelectorAll('*').forEach(e=>{if(e.offsetParent===null)return;const rr=e.getBoundingClientRect();
      if(rr.height<2||rr.width<20||!lightBg(e))return;const b=clipBottom(e);if(white===null||b>white)white=b;});
    return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),inner:+inner.toFixed(1),white:white===null?null:+white.toFixed(1)};
  };
  const halves=[...document.querySelectorAll('#biz-main [data-bizmfill] > .bizm-card')].map(c=>{
    const b=c.getBoundingClientRect();return {ttl:(c.querySelector('.ct')||{}).textContent.trim().slice(0,24),w:+b.width.toFixed(1),h:+b.height.toFixed(1),bottom:+b.bottom.toFixed(1)};});
  const tools=[...document.querySelectorAll('#biz-main [data-bizmhead] button')].map(b=>b.textContent.trim());
  return {year:_bizmState.year,live:_bizmState.live,page:_bizmState.page,rdet:_bizmState.rdet,
          tools:tools,halves:halves,left:col('#biz-main'),right:col('#rail-yrm'),
          exBars:(document.querySelectorAll('#bizm-ex-chart .point, #bizm-ex-chart .bars path').length||null)};
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'nf' }); } }
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
    if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(300);
await page.evaluate(`(()=>{try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){}})()`);
await page.waitForTimeout(2400);

async function step(tag, file) {
  const m = await page.evaluate(MEASURE);
  const gapL = (m.left && m.left.white != null) ? +(m.left.inner - m.left.white).toFixed(1) : null;
  const gapR = (m.right && m.right.white != null) ? +(m.right.inner - m.right.white).toFixed(1) : null;
  const dBox = (m.left && m.right) ? +(m.left.bottom - m.right.bottom).toFixed(1) : null;
  const dWhite = (m.left && m.right && m.left.white != null && m.right.white != null) ? +(m.left.white - m.right.white).toFixed(1) : null;
  const dHalf = (m.halves.length === 2) ? +(m.halves[0].bottom - m.halves[1].bottom).toFixed(1) : null;
  console.log(`[${tag}] year=${m.year} live=${m.live} 도구=${JSON.stringify(m.tools)} 반쪽=${JSON.stringify(m.halves.map(h => h.ttl + ':' + h.w + '×' + h.h))}`);
  console.log(`        박스하단Δ=${dBox} 흰도형Δ=${dWhite} 좌틈=${gapL} 우틈=${gapR} 반쪽하단Δ=${dHalf}`);
  if (file) await page.screenshot({ path: join(DIR, file) });
}

await step('① 기본(전체)', `flow1_default_${W}.png`);

// ② 「전체 → 판매중」 실클릭
await page.click('#biz-main [data-bizmhead] .ry-live-tg');
await page.waitForTimeout(1500);
await step('② 판매중', `flow2_live_${W}.png`);

// ③ 다시 「판매중 → 전체」
await page.click('#biz-main [data-bizmhead] .ry-live-tg');
await page.waitForTimeout(1500);
await step('③ 전체 복귀', null);

// ④ 연도 드롭다운 열기
await page.click('#biz-main [data-bizmhead] .ry-yr-tg');
await page.waitForTimeout(600);
const ddItems = await page.evaluate(`(()=>{const p=document.getElementById('dd-pop');return p?[...p.querySelectorAll('button')].map(b=>b.textContent.trim()):null;})()`);
console.log('[④ 연도 목록]', JSON.stringify(ddItems));
await page.screenshot({ path: join(DIR, `flow4_yeardd_${W}.png`) });

// ⑤ 2025 선택
if (ddItems && ddItems.includes('2025')) {
  await page.evaluate(`(()=>{const p=document.getElementById('dd-pop');[...p.querySelectorAll('button')].find(b=>b.textContent.trim()==='2025').click();})()`);
  await page.waitForTimeout(1700);
  await step('⑤ 2025', `flow5_2025_${W}.png`);
  await page.evaluate(`_bizmSetYear(2026)`);
  await page.waitForTimeout(1600);
}

// ⑥ 슬라이드 2 = 좌 3-1 · 우 3-2(판매현황 상세)
await page.evaluate(`_bizmTo(2)`);
await page.waitForTimeout(1900);
await step('⑥ 슬라이드2(우=상세)', `flow6_slide2_${W}.png`);

// ⑦ 그 상태에서 판매중 토글 = 두 열 동시 갱신
await page.click('#biz-main [data-bizmhead] .ry-live-tg');
await page.waitForTimeout(1700);
await step('⑦ 슬라이드2 · 판매중', `flow7_slide2_live_${W}.png`);
await page.click('#biz-main [data-bizmhead] .ry-live-tg');
await page.waitForTimeout(1500);
await step('⑧ 슬라이드2 · 전체 복귀', null);

const jsErr = errs.filter(e => /ReferenceError|TypeError|SyntaxError|is not defined|is not a function/.test(e));
console.log('JS 오류', jsErr.length, jsErr.slice(0, 5));
await browser.close();
