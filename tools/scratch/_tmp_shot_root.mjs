#!/usr/bin/env node
// 판매현황 상세 표(우 열) 전후 스크린샷 — smoke_layout.mjs의 서빙/목데이터 하네스 재사용.
// 사용: node shot.mjs <출력png> [폭 높이]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';

const ROOT = process.env.SHOT_ROOT || '/home/user/yeulmaru-promo';
const OUT = process.argv[2];
const W = parseInt(process.argv[3] || '1920', 10), H = parseInt(process.argv[4] || '1080', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const SNAP = `(()=>{const q=s=>{const e=document.querySelector(s);if(!e)return 'x';const b=e.getBoundingClientRect();return b.top.toFixed(0)+','+b.bottom.toFixed(0);};
  return q('#biz-main [data-bizmbox]')+'|'+q('#rail-yrm [data-bizmbox]')+'|'+q('#biz-main [data-bizmfill]')+'|'+q('#rail-yrm [data-bizmfill]');})()`;
async function settle(page, min = 900, max = 9000) {
  await page.waitForTimeout(min);
  let prev = null, t = 0;
  while (t < max) { const s = await page.evaluate(SNAP); if (s === prev) return; prev = s; await page.waitForTimeout(250); t += 250; }
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  if (u.hostname === 'cdn.plot.ly') {
    const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
    if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
  }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await settle(page);

const SL = await page.evaluate(`_bizSlides().map(function(s){return s.p+(s.d?'|상세':'|판매실적');})`);
console.log('slides:', SL.join('  '));
const idx = SL.findIndex(s => s.startsWith('3|') && s.endsWith('상세'));
const target = idx >= 0 ? idx + 1 : SL.findIndex(s => s.endsWith('상세')) + 1;
await page.evaluate(`_bizmTo(${target})`);
await settle(page);
console.log('slide ->', target, SL[target - 1]);

// 표 DOM 실측
const meas = await page.evaluate(`(()=>{
  const box=document.querySelector('#rail-yrm [data-bizmbox]'); if(!box)return null;
  const tb=box.querySelector('table'); if(!tb)return {err:'no table'};
  const hd=[...tb.querySelectorAll('thead td')].map(td=>({t:td.innerText.replace(/\\n/g,' / '),x:+td.getBoundingClientRect().left.toFixed(1),w:+td.getBoundingClientRect().width.toFixed(1),al:getComputedStyle(td).textAlign}));
  const rows=[...tb.querySelectorAll('tbody tr')].slice(0,14).map(tr=>[...tr.children].map(td=>td.innerText.trim()));
  const nameCells=[...tb.querySelectorAll('tbody tr')].map(tr=>{const td=tr.children[1];if(!td)return null;const inner=td.querySelector('span,div');
    return {txt:td.innerText.trim(),cw:+td.getBoundingClientRect().width.toFixed(1),sw:td.scrollWidth,h:+td.getBoundingClientRect().height.toFixed(1)};});
  const dateXs=[...tb.querySelectorAll('tbody tr')].map(tr=>{const td=tr.children[0];if(!td)return null;
    const w=document.createTreeWalker(td,NodeFilter.SHOW_TEXT); const tn=[]; let n; while(n=w.nextNode())tn.push(n);
    const vis=tn.filter(t=>getComputedStyle(t.parentElement).visibility!=='hidden');
    if(!vis.length)return null;
    const r=document.createRange(); r.setStart(vis[0],0); r.setEnd(vis[0],1);
    const ink=r.getBoundingClientRect().left;
    let slash=null;
    for(const t of vis){ const i=t.textContent.indexOf('/'); if(i>=0){ const r2=document.createRange(); r2.setStart(t,i); r2.setEnd(t,i+1); slash=r2.getBoundingClientRect().left; break; } }
    return {t:td.innerText.trim(),ink:+ink.toFixed(2),slash:slash==null?null:+slash.toFixed(2)};});
  const nameHd=[...tb.querySelectorAll('thead td')][1];
  const hdInk=(()=>{const w=document.createTreeWalker(nameHd,NodeFilter.SHOW_TEXT);const t=w.nextNode();if(!t)return null;const r=document.createRange();r.setStart(t,0);r.setEnd(t,1);return +r.getBoundingClientRect().left.toFixed(2);})();
  const titleInk=[...tb.querySelectorAll('tbody tr')].slice(0,6).map(tr=>{const sp=tr.children[1].querySelectorAll('span');
    const badge=sp[0]?+sp[0].getBoundingClientRect().left.toFixed(2):null;
    const tx=sp[sp.length-1]?+sp[sp.length-1].getBoundingClientRect().left.toFixed(2):null;
    return {badge:badge,title:tx};});
  return {hdInk:hdInk,titleInk:titleInk,hd:hd,rows:rows,nameCells:nameCells,dateXs:dateXs,tableW:+tb.getBoundingClientRect().width.toFixed(1),scrollW:tb.parentElement.scrollWidth,clientW:tb.parentElement.clientWidth};
})()`);
console.log(JSON.stringify(meas, null, 1));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));

const el = await page.$('#rail-yrm table') || await page.$('#rail-yrm [data-bizmbox]');
await el.screenshot({ path: OUT });
console.log('saved', OUT);
await browser.close();
