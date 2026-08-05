#!/usr/bin/env node
// [260804] 3면(사업 결과 비교) 기획 공연·기획 전시·예술교육 차트 개편 — 전/후 실측 스크린샷 + DOM 프로브.
// 데이터 = shot_bizbars.mjs와 같은 커밋된 스냅샷(공연) + 형태 재현 목(전시 누적·교육 일정 — 실API·PII 미접촉).
// 실행: node tools/scratch/shot_salescharts.mjs <출력.png> [폭 높이]  ·  IDX=<다른 index.html> = 전/후 비교용
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || '/tmp/salescharts.png';
const W = parseInt(process.argv[3] || '1920', 10), H = parseInt(process.argv[4] || '1080', 10);
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

// 공연 스냅샷(커밋본) 재사용 — 값 창작 0
const PG = readFileSync(join(ROOT, 'docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html'), 'utf8');
const DATA = JSON.parse(PG.match(/var DATA=(\{.*?\});\n/s)[1]);
const YEAR = 2026;

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

const D26 = s => new Date(s + 'T00:00:00');
const salesRows = DATA.shows.filter(s => s.paid > 0)
  .map(s => ({ name: s.name, money: s.rev, seats: s.paid, occ: s.occ, totalOpen: s.open, _rcEst: 1, genre: s.genre,
    startDate: D26(s.date), endDate: D26(s.dateEnd), status: s.status === '판매중' ? 'active' : 'ended' }));

// 전시DB 목 = 진행중 GS 1건만(운영 실측 형태 — 상반기 전시는 DB에 없다) → 상반기는 거울(data/exhib_daily_2026.js)이
//   보충하고, GS는 거울에도 있어(「숨 쉬는 SUM」) DB 정본 우선 중복 제거 경로가 같이 실측된다.
const EXM = { headers: [], rows: [
  { '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '연도': 2026, '상태': '진행중', '무료여부': '',
    '목표관객': '2000', '목표금액': '', '최종유료': '155', '최종무료': '0', '최종총인원': '155', '최종매출': '1150000',
    '시작일': '2026-07-21', '종료일': '2026-11-01', '운영일수': '90', '최종점유율': '' }
] };
const exd = [];
[['20260726', 60], ['20260728', 90], ['20260730', 124], ['20260801', 155]]
  .forEach(([d, v]) => exd.push({ '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '기준일자': d, '누계유료': String(v), '누계무료': '0', '누계총인원': String(v), '누계금액': '', '점유율': '' }));
const EXD = { headers: [], rows: exd };

// 예정(오픈 전) 공연 + 예술교육 프로그램(t'a') — PERFS 스텁
const PERFS_STUB = DATA.shows.filter(s => s.status === '예정')
  .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }))
  .concat([
    // [260805 운영자] 교육 = 「화요살롱」(인문학 장르) 1건 · 6월 · 종료 · 수강생 160명(운영대장 교육 행으로 조인)
    { s: '2026-06-09', e: '2026-06-30', n: '화요살롱', f: '화요살롱', t: 'a', g: '인문학', g2: '인문학', rc: 0, id: 'EDU1' }
  ]);

// 운영대장 교육 행 — 끝난 교육의 정본(발권유료 = 수강 인원). 화요살롱 4회 × 40명 = 160명
[9, 16, 23, 30].forEach(d => opsRows.push({
  '상태': '', '사업구분': '교육', '티켓구분': '유료', '기본좌석': 50, '발권유료': 40,
  '년도': 2026, '월': 6, '일': d, '공연구분': '기획', '장르1': '인문학', '공연명': '화요살롱', '수익성': ''
}));

const INIT = `(function(){
  window.__MOCK_OPS=${JSON.stringify({ rows: opsRows, headers: Object.keys(opsRows[0]) })};
  window.__MOCK_EXM=${JSON.stringify(EXM)};
  window.__MOCK_EXD=${JSON.stringify(EXD)};
  window.__MOCK_SALES=${JSON.stringify(salesRows)}.map(function(p){ p.startDate=new Date(p.startDate); p.endDate=new Date(p.endDate); return p; });
  var real=null;
  function wrapped(method,path){
    var p=String(path||''), dp=decodeURIComponent(p);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('전시마스터')>=0)return Promise.resolve(window.__MOCK_EXM);
    if(p.indexOf('/api/ops')===0&&dp.indexOf('전시일일')>=0)return Promise.resolve(window.__MOCK_EXD);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]});
  }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
})();`;

const FEED = `(()=>{
  try{ PERFS = ${JSON.stringify(PERFS_STUB)}; }catch(e){ console.warn('PERFS stub', e); }
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null;
    _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
  if(typeof _anaState==='undefined'||!_anaState)window._anaState={screen:1,cat:'공연',genre:'전체',year:null,drillName:null,xstep:3,cmp:{tray:[],bars:false}};
  _anaState._exMaster=window.__MOCK_EXM; _anaState._exDaily=window.__MOCK_EXD;
  window._salesBuild=function(){ return window.__MOCK_SALES; };
  if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
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
    await page.evaluate('_bizmTo(1)');
    await page.waitForTimeout(2000);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2500);

    const probe = await page.evaluate(`(()=>{
      const out={};
      const cts=[...document.querySelectorAll('#biz-main .bizm-card .ct')].map(t=>t.textContent.trim().replace(/\\s+/g,' '));
      out.titles=cts;
      const d=document.getElementById('bizm-chart');
      if(d){
        out.xTicks=[...d.querySelectorAll('.xaxislayer-above text')].map(t=>t.textContent);
        out.bars=d.querySelectorAll('.barlayer .point path').length;
        out.shapes=d.querySelectorAll('.shapelayer path').length;
        out.chartH=Math.round(d.getBoundingClientRect().height);
        out.annos=[...d.querySelectorAll('.infolayer .annotation text')].map(t=>t.textContent).slice(0,8);
      }
      const ex=document.getElementById('bizm-ex-chart');
      if(ex){
        out.exFills=ex.querySelectorAll('.scatterlayer .js-fill').length;
        out.exTicks=[...ex.querySelectorAll('.xaxislayer-above text')].map(t=>t.textContent);
      }
      const ed=document.getElementById('bizm-edu-chart');
      if(ed){
        out.eduShapes=ed.querySelectorAll('.shapelayer path').length;
        out.eduTicks=[...ed.querySelectorAll('.xaxislayer-above text')].map(t=>t.textContent);
      }
      out.kpi=[...document.querySelectorAll('#biz-main .bizm-kpi')].map(k=>k.textContent.trim());
      return out;
    })()`);
    console.log(JSON.stringify(probe, null, 1));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 6).join(' | '));

    // ZONEPROBE — 구획 경계가 진행중 사업을 실제로 품는지(운영자 260805) 실측
    const zone = await page.evaluate(`(()=>{
      const out={};
      try{
        const Y=_bizmState.year, ax=_bizMonthAxis(Y,false);
        const rows=_bizExhibRows(Y);
        out.cut=Math.round(_bizZoneCut(rows,Y,ax.x0,ax.x1));
        out.cutDate=new Date(Y,0,out.cut).toISOString().slice(0,10);
        out.ex=rows.map(g=>({n:g.name.slice(0,18),st:g._st,col:g._col,
          s:g.start?g.start.toISOString().slice(0,10):null,
          inZone:g.start?(_bizXDay(g.start,Y)>=out.cut-0.5):null}));
        const ed=_bizEduMonthRows(Y);
        out.eduCut=Math.round(_bizZoneCut(ed,Y,ax.x0,ax.x1));
        out.eduCutDate=new Date(Y,0,out.eduCut).toISOString().slice(0,10);
        out.edu=ed.map(g=>({i:g._idx,n:g.name.slice(0,14),st:g._st,inZone:_bizXDay(g.start,Y)>=out.eduCut-0.5}));
      }catch(e){ out.err=String(e); }
      return out;
    })()`);
    console.log('ZONE ' + JSON.stringify(zone, null, 1));

    const box = await page.$('#biz-main');
    await box.screenshot({ path: OUT });
    const card = await page.$('#bizm-chart');
    if (card) await card.screenshot({ path: OUT.replace(/\.png$/, '_perf.png') });
    const split = await page.$('#biz-main [data-bizmfill]');
    if (split) await split.screenshot({ path: OUT.replace(/\.png$/, '_split.png') });
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
