#!/usr/bin/env node
// [스크래치] 전/후 확대 — 머리줄 도구 + 첫 3행(추이 칸)만 잘라 낸다.
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
const CLIP = `(()=>{
  const card=document.querySelector('#rail-yrm .bizm-card');
  const rows=[...document.querySelectorAll('#rail-yrm-list table.mv-tbl tbody tr')].slice(0,4);
  const a=card.getBoundingClientRect(), b=rows[rows.length-1].getBoundingClientRect();
  return {x:Math.round(a.left-6),y:Math.round(a.top-6),width:Math.round(a.width+12),height:Math.round(b.bottom-a.top+12)};
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('[pageerror]', String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
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
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(2500);
await page.screenshot({ path: process.argv[2], clip: await page.evaluate(CLIP) });
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
await page.screenshot({ path: process.argv[3], clip: await page.evaluate(CLIP) });
console.log('saved', process.argv[2], process.argv[3]);
await browser.close();
