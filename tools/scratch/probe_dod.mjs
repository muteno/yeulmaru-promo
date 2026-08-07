#!/usr/bin/env node
// [스크래치] 「전일 대비」 칸 DOM 실측 — 머리글 중심 ↔ 내용 중심, 잉크·장식, 두 모드 열 경계 무이동.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const MEASURE = `(()=>{
  const tb=document.querySelector('#rail-yrm-list table.mv-tbl'); if(!tb)return {err:'no table'};
  const hd=[...tb.querySelectorAll('thead td')].map(t=>t.textContent.trim());
  const h4=tb.querySelectorAll('thead td')[3].getBoundingClientRect();
  const rows=[...tb.querySelectorAll('tbody tr')].slice(0,3).map(tr=>{
    const c=tr.children[3], inner=c.firstElementChild;
    const r=(inner||c).getBoundingClientRect();
    const spans=[...c.querySelectorAll('b,span')].map(e=>{const cs=getComputedStyle(e);
      return {t:e.textContent.trim(),color:cs.color,fs:cs.fontSize,fw:cs.fontWeight,td:cs.textDecorationLine};});
    return {txt:c.innerText.replace(/\\n/g,' / '),w:+r.width.toFixed(1),cx:+((r.left+r.right)/2).toFixed(1),spans:spans};
  });
  const cols=[...tb.querySelectorAll('colgroup col')].map(c=>c.style.width);
  const bounds=[...tb.querySelectorAll('thead td')].map(t=>+t.getBoundingClientRect().left.toFixed(1));
  return {hd,h4cx:+((h4.left+h4.right)/2).toFixed(1),h4pr:getComputedStyle(tb.querySelectorAll('thead td')[3]).paddingRight,rows,cols,bounds};
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('[pageerror]', String(e).split('\n')[0]));
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
await page.waitForTimeout(2500);
console.log('── 끔(최근 7일) ──');
const off = await page.evaluate(MEASURE);
console.log(JSON.stringify(off, null, 1));
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
console.log('── 켬(전일 대비) ──');
const on = await page.evaluate(MEASURE);
console.log(JSON.stringify(on, null, 1));
console.log('열 경계 동일?', JSON.stringify(off.bounds) === JSON.stringify(on.bounds), off.bounds, on.bounds);
console.log('머리글 중심 ↔ 내용 중심 Δ', on.rows.map(r => +(r.cx - on.h4cx).toFixed(1)));
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
const back = await page.evaluate(MEASURE);
console.log('왕복 복귀 동일?', JSON.stringify(back.hd) === JSON.stringify(off.hd) && JSON.stringify(back.bounds) === JSON.stringify(off.bounds));
await browser.close();
