#!/usr/bin/env node
// [260809] 판매현황 상세 표 **머리글 세로 정렬** 실측 — 1줄 머리글(일시·공연명·장르)이
//   2줄 머리글(관객수·오픈석·점유율·매출 = 「(단위: …)」 부줄)의 높이 안에서 어디에 앉는가.
//   shot_saletbl.mjs의 서빙/목데이터 하네스 재사용 · 산출 = 머리글 크롭 png + 줄 단위 좌표.
// 사용: node probe_saletbl_hdvalign.mjs <출력png>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2];
const W = 1920, H = 1080;
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

const SNAP = `(()=>{const q=s=>{const e=document.querySelector(s);if(!e)return 'x';const b=e.getBoundingClientRect();return b.top.toFixed(0)+','+b.bottom.toFixed(0);};
  return q('#biz-main [data-bizmbox]')+'|'+q('#rail-yrm [data-bizmbox]')+'|'+q('#biz-main [data-bizmfill]')+'|'+q('#rail-yrm [data-bizmfill]');})()`;
async function settle(page, min = 900, max = 9000) {
  await page.waitForTimeout(min);
  let prev = null, t = 0;
  while (t < max) { const s = await page.evaluate(SNAP); if (s === prev) return; prev = s; await page.waitForTimeout(250); t += 250; }
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3 });
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
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await settle(page);

const SL = await page.evaluate(`_bizSlides().map(function(s){return s.p+(s.d?'|상세':'|판매실적');})`);
const idx = SL.findIndex(s => s.startsWith('3|') && s.endsWith('상세'));
await page.evaluate(`_bizmTo(${(idx >= 0 ? idx : SL.findIndex(s => s.endsWith('상세'))) + 1})`);
await settle(page);

// ── 머리글 각 칸: 칸 상자 · 제목줄(첫 텍스트 노드) · 단위줄 실좌표 ──────────────────────
const meas = await page.evaluate(`(()=>{
  const tb=document.querySelector('#rail-yrm [data-bizmbox] table'); if(!tb)return {err:'no table'};
  const tds=[...tb.querySelectorAll('thead td')];
  const rowTop=Math.min(...tds.map(td=>td.getBoundingClientRect().top));
  const out=tds.map(td=>{
    const b=td.getBoundingClientRect(), cs=getComputedStyle(td);
    const sub=td.querySelector('div');
    // 제목줄 = td 직속 첫 텍스트 노드의 Range 사각형
    let ttl=null;
    for(const n of td.childNodes){ if(n.nodeType===3&&n.textContent.trim()){ const r=document.createRange(); r.selectNodeContents(n); ttl=r.getBoundingClientRect(); break; } }
    const sb=sub?sub.getBoundingClientRect():null;
    return {
      name:(td.textContent||'').replace(/\\s+/g,' ').trim(),
      lines:sub?2:1,
      valign:cs.verticalAlign,
      cell:{top:+(b.top-rowTop).toFixed(2), h:+b.height.toFixed(2)},
      title:ttl?{top:+(ttl.top-rowTop).toFixed(2), mid:+((ttl.top+ttl.bottom)/2-rowTop).toFixed(2), h:+ttl.height.toFixed(2)}:null,
      unit:sb?{top:+(sb.top-rowTop).toFixed(2), mid:+((sb.top+sb.bottom)/2-rowTop).toFixed(2), h:+sb.height.toFixed(2)}:null
    };
  });
  return {rowH:+(Math.max(...tds.map(td=>td.getBoundingClientRect().bottom))-rowTop).toFixed(2), cols:out};
})()`);

const two = meas.cols.filter(c => c.lines === 2);
const one = meas.cols.filter(c => c.lines === 1);
// 2줄 칸의 「잉크 덩어리 중심」 = 제목줄 top ~ 단위줄 bottom 의 중점
const inkMid = two.length ? two.reduce((a, c) => a + (c.title.top + (c.unit.top + c.unit.h)) / 2, 0) / two.length : null;
console.log('── 머리글 줄 좌표(행 상단 기준 px · devicePixelRatio 무관 CSS px) ──');
for (const c of meas.cols) {
  console.log(` ${String(c.lines) + '줄'} ${c.name.padEnd(16)} valign=${c.valign.padEnd(6)} 제목 mid=${c.title ? c.title.mid.toFixed(2) : '-'}` + (c.unit ? `  단위 mid=${c.unit.mid.toFixed(2)}` : ''));
}
console.log(`행 높이 ${meas.rowH}`);
console.log(`2줄 칸 잉크 중심 = ${inkMid === null ? '-' : inkMid.toFixed(2)}`);
for (const c of one) console.log(`Δ(1줄 「${c.name}」 제목 중심 − 2줄 잉크 중심) = ${(c.title.mid - inkMid).toFixed(2)}px`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));

// ── 짝 화면 확인: 「연간 누적 실적」 모달(`_bizRender`)도 같은 빌더를 쓰는가 ────────────
//   check_biz_list.py는 「소스에 호출이 2곳」까지만 본다 — 그려진 픽셀은 여기서 본다.
try {
  await page.evaluate('openBusinessBoard()');
  await page.waitForFunction("!!document.querySelector('#biz-body table thead td')", null, { timeout: 20000 });
  const m = await page.evaluate(`(()=>{
    const tds=[...document.querySelectorAll('#biz-body table')].map(t=>[...t.querySelectorAll('thead td')])
      .find(a=>a.length===7&&a[0].textContent.trim()==='일시');
    if(!tds)return {err:'모달에서 사업 목록 표 못 찾음'};
    const rowTop=Math.min(...tds.map(td=>td.getBoundingClientRect().top));
    return tds.map(td=>{ const sub=td.querySelector('div'); let ttl=null;
      for(const n of td.childNodes){ if(n.nodeType===3&&n.textContent.trim()){ const r=document.createRange(); r.selectNodeContents(n); ttl=r.getBoundingClientRect(); break; } }
      return {name:(td.textContent||'').replace(/\\s+/g,' ').trim(), lines:sub?2:1,
              valign:getComputedStyle(td).verticalAlign, mid:+((ttl.top+ttl.bottom)/2-rowTop).toFixed(2)};});
  })()`);
  console.log('── 모달(`_bizRender`) 같은 표 ──');
  console.log(JSON.stringify(m));
} catch (e) { console.log('모달 확인 실패:', String(e).split('\n')[0]); }
await page.evaluate('try{closeBusinessBoard()}catch(e){}');
await page.waitForTimeout(500);

// ── 크롭 촬영: 머리글 + 본문 3행 ────────────────────────────────────────────
const box = await page.evaluate(`(()=>{
  const tb=document.querySelector('#rail-yrm [data-bizmbox] table');
  const hd=tb.querySelector('thead'), rows=[...tb.querySelectorAll('tbody tr')].slice(0,3);
  const a=hd.getBoundingClientRect(), z=rows[rows.length-1].getBoundingClientRect(), t=tb.getBoundingClientRect();
  return {x:t.left, y:a.top, width:t.width, height:z.bottom-a.top};
})()`);
if (OUT) { await page.screenshot({ path: OUT, clip: box }); console.log('saved', OUT); }
await browser.close();
