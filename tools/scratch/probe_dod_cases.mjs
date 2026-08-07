#!/usr/bin/env node
// [스크래치] _ryDodCell 경우의 수 실측 — 증가·감소·무변동·금액없음·첫입력·시트 diff 우선.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const CASES = `(()=>{
  const D=(bd,seat,mny)=>({bd:bd,seat:seat,mny:mny});
  const cs=[
   ['증가',        {days:[D(20260806,110,14189000),D(20260807,113,14605000)],diff:null,_unit:'석'}],
   ['감소',        {days:[D(20260806,110,14189000),D(20260807,95,13000000)],diff:null,_unit:'석'}],
   ['무변동',      {days:[D(20260806,24,1146000),D(20260807,24,1146000)],diff:null,_unit:'석'}],
   ['금액 없음',   {days:[D(20260806,60,null),D(20260807,91,null)],diff:null,_unit:'명'}],
   ['첫 입력분',   {days:[D(20260806,16,80000)],diff:null,_unit:'명'}],
   ['시트 diff 우선',{days:[D(20260806,110,14189000),D(20260807,113,14605000)],diff:51,_unit:'석'}],
   ['음수 diff',   {days:[D(20260805,0,110600),D(20260806,-15,92000)],diff:-15,_unit:'석'}]
  ];
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#fff;padding:16px 20px;font-family:inherit';
  box.innerHTML='<table style="border-collapse:collapse;font-size:13px">'+cs.map(c=>
    '<tr><td style="padding:9px 22px 9px 0;color:#888">'+c[0]+'</td><td style="text-align:center">'+_ryDodCell(c[1])+'</td></tr>').join('')+'</table>';
  document.body.appendChild(box);
  return cs.map(c=>{const d=_ryDodPick(c[1]);return c[0]+' → '+JSON.stringify(d);});
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('[pageerror]', String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
for (const l of await page.evaluate(CASES)) console.log(l);
await page.screenshot({ path: process.argv[2] || '/tmp/cases.png', clip: { x: 0, y: 0, width: 380, height: 330 } });
await browser.close();
