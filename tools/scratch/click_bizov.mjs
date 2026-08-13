// [scratch] 분야 선택자 **실클릭** 확인 — 함수 직접 호출이 아니라 버튼을 눌러서 표가 갈리는지.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  return route.abort();
});
await page.goto('https://app.local/index.html?qa=admin#bizov', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(`(()=>{ try{_bizDeckGo('ov');}catch(_e){} try{_bizOvSetYear(2025);}catch(_e){} })()`);
await page.waitForTimeout(1500);

const snap = () => page.evaluate(`(()=>{
  const box=document.querySelector('#biz-main .bizm-card:last-of-type');
  const tb=[...document.querySelectorAll('#biz-main .bizm-card')].pop();
  const rows=[...tb.querySelectorAll('tbody tr')].map(t=>t.children[0].textContent.trim());
  const on=[...tb.querySelectorAll('.ry-live-tg')].map(b=>b.textContent.trim()+(b.getAttribute('aria-checked')==='true'?'*':''));
  const cardRect=tb.getBoundingClientRect(), boxRect=document.querySelector('#biz-main [data-bizmbox]').getBoundingClientRect();
  return {n:rows.length, first:rows[0]||null, chips:on,
          overflowBottom:+(cardRect.bottom-boxRect.bottom).toFixed(1), overflowRight:+(cardRect.right-boxRect.right).toFixed(1)};
})()`);

console.log('기본  ', JSON.stringify(await snap()));
for (const lab of ['전시', '예술교육', '공연']) {
  await page.click(`#biz-main .bizm-card .ry-live-tg:text-is("${lab}")`);
  await page.waitForTimeout(700);
  console.log(lab.padEnd(4), JSON.stringify(await snap()));
}
console.log('pageerror', errs.length, errs.slice(0, 3));
await browser.close();
