#!/usr/bin/env node
/**
 * 260807 — 연간 실적(_YR) 2026 기준 개정 전/후 스샷 (일회성 프로브)
 *
 * 전 = git HEAD의 index.html · 후 = 작업 트리의 index.html. 같은 화면(openYearBoard)을 두 번 찍고
 * 표의 2026 열 값은 DOM에서 직접 읽는다(손으로 옮겨 적지 않는다).
 *
 * 사용: node tools/scratch/shot_yr_ba.mjs <전용_index.html> <출력디렉터리>
 */
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const [, , BEFORE_HTML, OUTDIR] = process.argv;

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

// 표 2026 열 + 각주 + 부제를 화면에서 직접 읽는다
const READ = `(()=>{
  const b=document.getElementById('yr-body'); if(!b)return {err:'보드 없음'};
  const tbl=b.querySelector('table'); if(!tbl)return {err:'표 없음'};
  const ths=[...tbl.querySelectorAll('thead td')].map(t=>t.textContent.trim());
  const ci=ths.findIndex(t=>t.startsWith('2026'));
  const rows=[...tbl.querySelectorAll('tbody tr')].map(tr=>{
    const tds=[...tr.children].map(t=>t.textContent.trim());
    return {label:tds.slice(0,tds.length-ths.length+1).join(' ').trim(), v2026:tds[ci-(ths.length-tds.length)+1]||''};
  }).filter(r=>r.label);
  const sub=(document.querySelector('#year-board .mhead .sub')||{}).textContent||'';
  const note=[...b.querySelectorAll('div')].map(d=>d.textContent).find(t=>t.indexOf('상반기 잠정치')>=0)||'';
  return {sub:sub.trim(), rows, note:note.replace(/\\s+/g,' ').trim().slice(0,400)};
})()`;

async function shoot(browser, htmlOverride, tag, out) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (p === '/index.html' && htmlOverride) return route.fulfill({ status: 200, body: readFileSync(htmlOverride), contentType: MIME['.html'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    if (u.hostname === 'cdn.plot.ly') {
      const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
      if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' });
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2500);
  await page.evaluate('openYearBoard()');
  await page.waitForSelector('#yr-body table', { timeout: 20000 });
  await page.waitForTimeout(2600);
  const m = await page.evaluate(READ);
  const el = await page.$('#year-board .modal');
  await el.screenshot({ path: join(out, `260807_연간실적_${tag}.png`) });
  // 표만 따로(2026 열이 보이게)
  const t = await page.$('#yr-tscroll');
  if (t) await t.screenshot({ path: join(out, `260807_연간실적_표_${tag}.png`) });
  await ctx.close();
  return m;
}

const { chromium } = await import('playwright-core');
mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const res = {};
try {
  res['전'] = await shoot(browser, BEFORE_HTML, '전', OUTDIR);
  res['후'] = await shoot(browser, null, '후', OUTDIR);
} finally { await browser.close(); }
console.log(JSON.stringify(res, null, 1));
