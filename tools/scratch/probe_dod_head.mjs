#!/usr/bin/env node
// [스크래치] 머리줄 도구 묶음 실측 — 「판매중 구분자 우측에 **동일한 마진간격**」이 실제로 같은지.
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
const HEAD = `(()=>{
  const t=document.querySelector('#rail-yrm .ry-hd-tools'); if(!t)return {err:'no tools'};
  const kids=[...t.children].map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);
    return {tag:e.tagName.toLowerCase(),cls:e.className,txt:e.textContent.trim(),
      l:+r.left.toFixed(1),rt:+r.right.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),
      color:cs.color,fw:cs.fontWeight,fs:cs.fontSize,pad:cs.padding,checked:e.getAttribute('aria-checked')};});
  const gaps=[]; for(let i=1;i<kids.length;i++)gaps.push(+(kids[i].l-kids[i-1].rt).toFixed(2));
  return {gap:getComputedStyle(t).gap,kids,gaps};
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 });
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
const shot = async (name) => {
  const r = await page.evaluate(`(()=>{const c=document.querySelector('#rail-yrm .bizm-card .ct');const b=c.getBoundingClientRect();
    return {x:b.left-8,y:b.top-8,width:b.width+16,height:b.height+16};})()`);
  await page.screenshot({ path: name, clip: r });
};
console.log('── 끔 ──'); console.log(JSON.stringify(await page.evaluate(HEAD), null, 1));
await shot(process.argv[2] || '/tmp/head_off.png');
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
console.log('── 켬 ──'); console.log(JSON.stringify(await page.evaluate(HEAD), null, 1));
await shot(process.argv[3] || '/tmp/head_on.png');
await browser.close();
