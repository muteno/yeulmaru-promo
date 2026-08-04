#!/usr/bin/env node
// 3면(사업 결과 비교) 스샷 + DOM 실측 — smoke_layout.mjs의 서빙/목데이터 배선 재사용(실API·PII 미접촉).
// 사용: node tools/scratch/probe_3split_shot.mjs <출력png> [폭 높이]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || 'shot.png';
const W = parseInt(process.argv[3] || '1920', 10), H = parseInt(process.argv[4] || '1080', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return null;
}
// 흰 도형 하단선 실측 = smoke_layout.mjs와 같은 판정(칠해진 밝은 배경 + 조상 overflow 클립)
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
    let white=null,tag=null;
    box.querySelectorAll('*').forEach(e=>{if(e.offsetParent===null)return;const rr=e.getBoundingClientRect();
      if(rr.height<2||rr.width<20||!lightBg(e))return;const b=clipBottom(e);
      if(white===null||b>white){white=b;tag=(e.id||e.className||e.tagName).toString().slice(0,42);}});
    return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),inner:+inner.toFixed(1),
            white:white===null?null:+white.toFixed(1),whiteEl:tag,scroll:+(box.scrollHeight-box.clientHeight).toFixed(1)};
  };
  return {page:(window._bizmState||{}).page,rdet:(window._bizmState||{}).rdet,year:(window._bizmState||{}).year,
          live:(window._bizmState||{}).live,left:col('#biz-main'),right:col('#rail-yrm')};
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
await page.waitForTimeout(400);
await page.evaluate(`(()=>{try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){}})()`);
await page.waitForTimeout(2600);
const m = await page.evaluate(MEASURE);
console.log(JSON.stringify(m, null, 1));
if (m.left && m.left.white != null) console.log('좌 흰 도형 ↔ 안선 틈 =', +(m.left.inner - m.left.white).toFixed(1), 'px');
if (m.right && m.right.white != null) console.log('우 흰 도형 ↔ 안선 틈 =', +(m.right.inner - m.right.white).toFixed(1), 'px');
if (m.left && m.right) console.log('좌↔우 박스 하단선 Δ =', +(m.left.bottom - m.right.bottom).toFixed(1), 'px · 흰 도형 Δ =', +((m.left.white ?? 0) - (m.right.white ?? 0)).toFixed(1), 'px');
await page.screenshot({ path: OUT });
console.log('shot →', OUT, `${W}x${H}`);
const jsErr = errs.filter(e => /ReferenceError|TypeError|SyntaxError|is not defined|is not a function/.test(e));
console.log('JS 오류', jsErr.length, jsErr.slice(0, 4));
await browser.close();
