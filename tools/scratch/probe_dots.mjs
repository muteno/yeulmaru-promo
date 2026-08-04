#!/usr/bin/env node
// 진단 — 대시보드 하단 슬라이더 바(#bizm-dots-row)의 좌우 위치가 면 전환마다 얼마나 흔들리는지 실측.
// 사용: node probe_dots.mjs [폭 높이 ...]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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

const MEASURE = `(()=>{
  const q=s=>{const e=document.querySelector(s);if(!e||e.offsetParent===null)return null;const b=e.getBoundingClientRect();return {l:+b.left.toFixed(1),r:+b.right.toFixed(1),w:+b.width.toFixed(1),c:+((b.left+b.right)/2).toFixed(1)};};
  const dr=document.getElementById('bizm-dots-row');
  return {
    page:(window._bizmState||{}).page,
    zoom:(typeof _bizZ==='function')?_bizZ():1,
    dots: dr? {c:+((dr.getBoundingClientRect().left+dr.getBoundingClientRect().right)/2).toFixed(1), tx:dr.style.transform||''} : null,
    bar: q('#bizm-dots-row .bizm-pgctl'),
    L: q('#biz-main'),
    R: q('#rail-yrm'),
    mainArea: q('#main-area'),
    rail: q('#sales-rail'),
    lbox: q('#biz-main [data-bizmbox]'),
    rbox: q('#rail-yrm [data-bizmbox]'),
  };
})()`;

async function run(W, H) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
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
    await page.waitForTimeout(1200);

    const rows = [];
    for (const p of [1, 3, 4, 1, 3, 1]) {
      await page.evaluate(`_bizmTo(${p})`);
      await page.waitForTimeout(1400);
      rows.push(await page.evaluate(MEASURE));
    }
    console.log(`\n===== ${W}×${H} =====`);
    for (const r of rows) {
      console.log(`면${r.page} zoom=${r.zoom} | bar중심=${r.bar ? r.bar.c : 'x'} tx=${r.dots ? r.dots.tx : 'x'} | #biz-main l=${r.L?.l} w=${r.L?.w} | #rail-yrm l=${r.R?.l} w=${r.R?.w} | main-area w=${r.mainArea?.w} rail w=${r.rail?.w}`);
    }
    const cs = rows.map(r => r.bar ? r.bar.c : null).filter(v => v !== null);
    if (cs.length) console.log(`  → bar중심 스윙 = ${(Math.max(...cs) - Math.min(...cs)).toFixed(1)}px  (min ${Math.min(...cs)} / max ${Math.max(...cs)})`);
  } finally { await browser.close(); }
}

const sizes = process.argv.slice(2);
const pairs = sizes.length ? [] : [[1920, 1080], [1600, 900], [1440, 820], [1280, 760]];
for (let i = 0; i < sizes.length; i += 2) pairs.push([+sizes[i], +sizes[i + 1]]);
for (const [w, h] of pairs) await run(w, h);
