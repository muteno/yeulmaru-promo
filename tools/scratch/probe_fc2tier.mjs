#!/usr/bin/env node
// [260808-2] 「판매중 = 예상 판매분 2단 페이드 · 판매 시작 전은 안 그린다」 실측 프로브
//   ① 기획 공연 차트: 예정(티켓 오픈 전) 자리 수 · 예상 페이드 칸 수(bzp 그라데이션) · 콘솔 에러
//   ② 판매 실적 목록(#rail-yrm-list): 「오픈 예정」 행 수 · 총 행 수
//   실행: node tools/scratch/probe_fc2tier.mjs <출력.png> [폭 높이]   · IDX=<다른 index.html> 로 전/후 비교
//
//   데이터 = docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html 안 DATA(커밋된 스냅샷) 재사용 = 실API·PII 미접촉.
//   ⚠ **일일 판매 시계열(days)·fcRate는 그 스냅샷에 없어 여기서 합성한다** — 예측 엔진(_bizFcSeat)이 실측 7건을
//     요구하기 때문. 그래서 이 프로브가 재는 것은 「예상 수치가 맞는가」가 아니라 **「2단이 그려지는가·게이트가 도는가」**
//     라는 형태 축이다. 합성 규칙 = 최근 7일 균등 증분(증분 = 누적판매의 2%, 최소 1) · fcRate = 그 증분(=일평균).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || '/tmp/fc2tier.png';
const W = parseInt(process.argv[3] || '1600', 10), H = parseInt(process.argv[4] || '1000', 10);
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

const PG = readFileSync(join(ROOT, 'docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html'), 'utf8');
const DATA = JSON.parse(PG.match(/var DATA=(\{.*?\});\n/s)[1]);
const YEAR = 2026;
const TODAY = new Date('2026-08-06T00:00:00');

// ── 운영대장 목데이터(종료 사업) = 기존 probe_bizfade와 같은 문법 ────────────────────────────
const opsRows = [];
const pushRow = (y, m, d, name, genre, seat, paid) => opsRows.push({
  '상태': '', '사업구분': '공연', '티켓구분': '유료', '기본좌석': seat, '발권유료': paid,
  '년도': y, '월': m, '일': d, '공연구분': '기획', '장르1': genre, '공연명': name, '수익성': ''
});
DATA.shows.filter(s => s.paid > 0 && s.status === '종료').forEach(s => {
  const [y, m, d] = s.date.split('-').map(Number);
  const nd = Math.max(1, Math.round((new Date(s.dateEnd) - new Date(s.date)) / 86400000) + 1);
  for (let i = 0; i < nd; i++) {
    const dt = new Date(y, m - 1, d + i);
    pushRow(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), s.name, s.genre, Math.round(s.open / nd), Math.round(s.paid / nd));
  }
});
let sd = 11; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
[2023, 2024, 2025].forEach(y => Object.keys(DATA.bench).forEach(g => {
  const tot = DATA.bench[g]['y' + String(y).slice(2)] || 0; if (!tot) return;
  const n = 12, per = Math.round(tot / n);
  for (let i = 0; i < n; i++) pushRow(y, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27), g + ' 공연 ' + y + '-' + i, g, 926, per);
}));

// ── 판매 축 목데이터 — 판매중 6건에 **합성 일일 시계열**을 붙인다(위 ⚠ 참조) ──────────────────
const D26 = s => new Date(s + 'T00:00:00');
const ymd = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const salesRows = DATA.shows.filter(s => s.paid > 0).map(s => {
  const active = s.status === '판매중';
  const inc = Math.max(1, Math.round(s.paid * 0.02));
  const days = [];
  if (active) for (let k = 6; k >= 0; k--) {              // 최근 7일(어제까지) 누적 시계열
    const dt = new Date(TODAY.getTime() - (k + 1) * 86400000);
    const seat = Math.max(0, s.paid - k * inc);
    days.push({ bd: ymd(dt), seat, occ: s.open > 0 ? Math.min(seat / s.open * 100, 100) : 0, x: 0 });
  }
  return {
    name: s.name, money: s.rev, seats: s.paid, occ: s.occ, totalOpen: s.open, _rcEst: 1, genre: s.genre,
    startDate: D26(s.date), endDate: D26(s.dateEnd), status: active ? 'active' : 'ended',
    noData: false, dday: Math.round((D26(s.date) - TODAY) / 86400000),
    days, fcRate: active ? inc : null, 목표: 50, deltaPP: null, spark: []
  };
});
// 라이브 화면에 있던 「오픈 예정」 행(판매 실적 목록) 재현 — 집계 전 + 첫 공연일 전
const yesu = DATA.shows.find(s => s.name.indexOf('여수세계섬박람회') >= 0);
if (yesu) salesRows.push({
  name: yesu.name, money: 0, seats: 0, occ: 0, totalOpen: 926, _rcEst: 1, genre: yesu.genre || '기타',
  startDate: D26(yesu.date), endDate: D26(yesu.dateEnd), status: 'active',
  noData: true, dday: Math.round((D26(yesu.date) - TODAY) / 86400000),
  days: [], fcRate: null, 목표: 50, deltaPP: null, spark: []
});

const INIT = `(function(){
  window.__MOCK_OPS=${JSON.stringify({ rows: opsRows, headers: Object.keys(opsRows[0]) })};
  window.__MOCK_SALES=${JSON.stringify(salesRows)}.map(function(p){ p.startDate=new Date(p.startDate); p.endDate=new Date(p.endDate); return p; });
  var real=null;
  function wrapped(method,path){
    var p=String(path||'');
    if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]});
  }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
})();`;

const PERFS_STUB = DATA.shows.filter(s => s.status === '예정')
  .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }));

const FEED = `(()=>{
  try{ PERFS = ${JSON.stringify(PERFS_STUB)}; }catch(e){ console.warn('PERFS stub', e); }
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null;
    _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
  window._salesBuild=function(){ return window.__MOCK_SALES; };
  if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
  // AUD=1 → 3면 조작부 「매출 ↔ 관객수」(260806-9)의 관객수 축에서 같은 것을 잰다 — 2단은 축이 바뀌어도 성립해야 한다
  if(${process.env.AUD ? 'true' : 'false'}&&typeof _bizmState!=='undefined'&&_bizmState)_bizmState.metric='aud';
})()`;

// ── 실측 = ① 차트(예정 자리·예상 2단) ② 판매 실적 목록(오픈 예정 행) ────────────────────────
const MEASURE = `(()=>{
  const d=document.getElementById('bizm-chart'); if(!d)return {err:'no chart'};
  const traces=[...d.querySelectorAll('.barlayer > .trace')].map((g,i)=>{
    const ps=[...g.querySelectorAll('.point > path')];
    return {i, n:ps.length, faded:ps.filter(p=>(p.style.fill||'').indexOf('url(')>=0).length,
      h:ps.map(p=>+p.getBBox().height.toFixed(1))};
  });
  const grads={ bzf:d.querySelectorAll('defs linearGradient[id^="bzf"]').length,
                bzs:d.querySelectorAll('defs linearGradient[id^="bzs"]').length,
                bzp:d.querySelectorAll('defs linearGradient[id^="bzp"]').length };
  // 툴팁 원문(예상 칸) — 「예상 최종 N석」이 실제로 실려 있는지
  const tips=(d.data||[]).map(t=>Array.isArray(t.text)?t.text.slice(0,2):null).filter(Boolean);
  const proj=(d.data||[]).filter(t=>t.base&&t.base.length).map(t=>({n:t.base.length, base:t.base.map(v=>+(+v).toFixed(2)), y:t.y.map(v=>+(+v).toFixed(2))}));
  // 판매 실적 목록
  const box=document.getElementById('rail-yrm-list');
  const rows=box?[...box.querySelectorAll('table.mv-tbl tbody tr')]:[];
  const list={ rows:rows.length,
    openSoon:rows.filter(r=>r.textContent.indexOf('오픈 예정')>=0).length,
    names:rows.map(r=>(r.querySelector('td:nth-child(2)')||{}).textContent||'').map(s=>s.trim().slice(0,22)),
    groups:box?[...box.querySelectorAll('.ry-grp-hd')].map(h=>h.textContent.trim()):[] };
  return {traces, grads, proj, tips:tips.slice(-2), list,
    planRows:(function(){ try{ return (_bizmState&&_bizmState._lastN)||null; }catch(e){ return null; } })()};
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        const f = (p === '/index.html' && process.env.IDX) ? process.env.IDX : join(ROOT, p);
        try { return route.fulfill({ status: 200, body: readFileSync(f), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      if (u.hostname === 'cdn.plot.ly') {
        const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
        if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
      }
      return route.abort();
    });
    await page.addInitScript(INIT);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.evaluate(FEED);
    await page.evaluate('_bizBookGo(3)');
    await page.waitForTimeout(2000);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.evaluate('try{_srailRender()}catch(e){}');
    await page.waitForTimeout(2600);

    console.log(JSON.stringify(await page.evaluate(MEASURE), null, 1));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 4).join(' | '));

    const card = await page.$('#bizm-chart');
    if (card) await card.screenshot({ path: OUT });
    // CLIP="x,y,w,h"(차트 기준 CSS px) = 그 자리만 확대 컷 — 전/후 같은 좌표로 잘라야 비교가 성립한다
    if (card && process.env.CLIP) {
      const [cx, cy, cw, ch] = process.env.CLIP.split(',').map(Number);
      const bb = await card.boundingBox();
      await page.screenshot({ path: OUT.replace(/\.png$/, '_zoom.png'), clip: { x: bb.x + cx, y: bb.y + cy, width: cw, height: ch } });
    }
    const list = await page.$('#rail-yrm');
    if (list) {   // 표 아래 빈 자리는 잘라낸다(전/후를 같은 높이로 잘라야 비교가 성립 — 행 수가 달라지는 변경이라 자연 높이로 두면 축척이 갈린다)
      const bb = await list.boundingBox();
      await page.screenshot({ path: OUT.replace(/\.png$/, '_list.png'),
        clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(bb.height, 560) } });
    }
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
