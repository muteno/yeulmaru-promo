#!/usr/bin/env node
// [260804] 연간 실적 차트(#yrm-chart) 1장 렌더 영수증 — 2026 예상 점선 마킹 전/후 비교용.
// 골격 = tools/smoke_layout.mjs(가상호스트 서빙 + CDN 로컬 캐시 + ?qa=admin 목데이터)를 그대로 계승.
// 실행: node tools/scratch/shot_yrm_fc.mjs /tmp/out.png [폭 높이]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || '/tmp/yrm.png';
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
await page.waitForSelector('#yrm-chart .main-svg', { timeout: 20000 });
await page.waitForTimeout(2500);

// 차트 카드(제목줄 포함) 단위로 자른다 — #yrm-chart의 .bizm-card 조상
const card = await page.evaluateHandle(() => document.querySelector('#yrm-chart').closest('.bizm-card'));
await card.asElement().screenshot({ path: OUT });

// DOM 실측 — 연도 눈금 x좌표(칸 간격) + 예상 마커 존재 여부
const m = await page.evaluate(() => {
  const svg = document.querySelector('#yrm-chart .main-svg');
  const ticks = [...document.querySelectorAll('#yrm-chart .xtick text')].map(t => ({ y: t.textContent.trim(), x: +t.getBoundingClientRect().left.toFixed(1) + t.getBoundingClientRect().width / 2 }));
  const texts = [...document.querySelectorAll('#yrm-chart text')].map(t => t.textContent.trim()).filter(s => /예상/.test(s));
  const dashed = [...document.querySelectorAll('#yrm-chart .scatterlayer .trace path.js-line')].filter(p => (p.style.strokeDasharray || '').length > 0).length;
  return { ticks, 예상라벨: texts, 점선트레이스: dashed, w: svg ? svg.getAttribute('width') : null };
});
const gaps = m.ticks.slice(1).map((t, i) => +(t.x - m.ticks[i].x).toFixed(1));
console.log(JSON.stringify({ out: OUT, 눈금: m.ticks.map(t => t.y).join(' '), 칸간격: gaps, 예상라벨: m.예상라벨, 점선트레이스: m.점선트레이스, jsErr: errs.slice(0, 3) }, null, 1));
await browser.close();
