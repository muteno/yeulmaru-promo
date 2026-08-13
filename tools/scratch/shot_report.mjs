// [scratch] 리포트 HTML 렌더 확인용 — 실행: node tools/scratch/shot_report.mjs <html경로> <출력png>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
const SRC = process.argv[2], OUT = process.argv[3];
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
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1240, height: 1400 } });
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname);
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, 'docs', 'reports', basename(p))), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  return route.abort();
});
await page.goto('https://app.local/' + encodeURIComponent(basename(SRC)), { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: OUT, fullPage: true });
const miss = await page.evaluate(`[...document.images].filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'))`);
console.log('깨진 이미지', miss.length, miss.slice(0, 4));
await browser.close();
