#!/usr/bin/env node
// [260808] AI 홍보 ▸ 고객 분류 실측 프로브 — 전(origin/main)·후(작업트리)를 같은 조건에서 렌더해 스샷+DOM 실측.
//   데이터 = QA 목(tools/qa_mock_ops.mjs)뿐 = **실데이터·PII 미접촉**. 명단에 뜨는 이름·번호는 전부 지어낸 값이다.
//   실행: node tools/scratch/probe_seg.mjs [전_index경로]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports', '260808_고객분류_전후');
const BEFORE = process.argv[2] || '';
const W = 1500, H = 1020;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// 열린 모달만 잘라 찍는다 — 뒤 화면까지 넣으면 무엇이 바뀌었는지 안 보인다
const SHOT = async (page, file) => {
  const el = await page.$('#promo-check .modal');
  if (el) await el.screenshot({ path: join(OUT, file) });
  else await page.screenshot({ path: join(OUT, file) });
};

const TABS = `(()=>{const t=[...document.querySelectorAll('#pc-tabs .prog-tab')].map(b=>b.textContent.trim());
  const v=['check','ai','seg'].filter(k=>document.getElementById('pc-view-'+k));
  return {tabs:t,views:v};})()`;

const RESULT = `(()=>{const h=document.getElementById('seg-result');if(!h)return null;
  const tb=h.querySelector('table');const tr=tb?[...tb.querySelectorAll('tr')]:[];
  const card=h.querySelector('.bizm-card > div');
  return {cond:card?card.textContent.trim():'', cols:tr.length?[...tr[0].querySelectorAll('th')].map(x=>x.textContent.trim()):[],
    rows:Math.max(0,tr.length-1), first:tr[1]?[...tr[1].querySelectorAll('td')].map(x=>x.textContent.trim()):[],
    foot:(h.textContent.match(/하한[^·]*/)||[''])[0].slice(0,40)};})()`;

async function run(page, label, seg) {
  const out = { label };
  await page.evaluate('openPromoCheck()');
  await page.waitForTimeout(700);
  out.head = await page.evaluate(`(()=>{const h=document.querySelector('#promo-check .mhead');return h?h.textContent.trim():'';})()`);
  Object.assign(out, await page.evaluate(TABS));
  await SHOT(page, `${label}_탭.png`);
  if (!seg) return out;
  await page.evaluate(`_pcTab('seg')`);
  await page.waitForTimeout(400);
  await SHOT(page, `${label}_조건.png`);
  await page.evaluate('_segRun()');
  await page.waitForTimeout(1400);
  out.result = await page.evaluate(RESULT);
  await SHOT(page, `${label}_명단.png`);
  // 「최근 5년」으로 바꿔 임의 N이 실제로 먹는지 — 운영자 「3년이 아니라 5년이면 5년으로」
  await page.evaluate(`(()=>{document.getElementById('seg-num').value='5';document.getElementById('seg-min').value='3';})()`);
  await page.evaluate('_segRun()');
  await page.waitForTimeout(1200);
  out.result5 = await page.evaluate(RESULT);
  await SHOT(page, `${label}_명단_5년3회.png`);
  return out;
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[seg] SKIP — playwright-core 미설치'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[seg] SKIP — chromium 미탐지'); return 0; }
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    for (const [label, root] of [['후', ''], ['전', BEFORE]]) {
      if (label === '전' && !root) continue;
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => errs.push(`${label}: ${String(e.message).split('\n')[0].slice(0, 120)}`));
      await page.route('**/*', route => {
        const u = new NodeURL(route.request().url());
        if (u.hostname === 'app.local') {
          let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
          const f = (p === '/index.html' && root) ? root : join(ROOT, p);
          try { return route.fulfill({ status: 200, body: readFileSync(f), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
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
      await page.waitForTimeout(2600);
      await page.evaluate(FEED_SCRIPT);   // 목 주입 = _qaApi가 죽는 자리를 우회(qa_mock_ops.mjs 주석)
      await page.waitForTimeout(500);
      const r = await run(page, label, label === '후');
      console.log(`\n── ${label} ──`);
      console.log(`  머리줄: ${r.head}`);
      console.log(`  탭 ${r.tabs.length}개: ${r.tabs.join(' | ')}  · 뷰: ${r.views.join(',')}`);
      if (r.result) {
        console.log(`  [3년·5회] 조건="${r.result.cond}" · 행 ${r.result.rows} · 열 ${r.result.cols.length}(${r.result.cols.join('/')})`);
        console.log(`            첫 행: ${r.result.first.join(' | ')}`);
        console.log(`            꼬리: ${r.result.foot}`);
      }
      if (r.result5) console.log(`  [5년·3회] 조건="${r.result5.cond}" · 행 ${r.result5.rows}`);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(`\n스샷 → ${OUT}`);
  if (errs.length) { console.log('✗ 콘솔 에러:'); errs.forEach(e => console.log('   ' + e)); return 1; }
  console.log('✓ 콘솔 에러 0');
  return 0;
}
main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
