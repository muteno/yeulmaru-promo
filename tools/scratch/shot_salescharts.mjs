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

// 전시 목 — 종료 1(일일 누계 곡선) · 진행중 1(GS칼텍스 형태) · 예정 1(값 없음)
const EXM = { headers: [], rows: [
  { '전시ID': 'EXA', '전시명': '2026 봄 기획전 <결>', '연도': 2026, '상태': '종료', '무료여부': '',
    '목표관객': '1500', '목표금액': '', '최종유료': '820', '최종무료': '410', '최종총인원': '1230', '최종매출': '9840000',
    '시작일': '2026-03-05', '종료일': '2026-05-11', '운영일수': '58', '최종점유율': '' },
  { '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '연도': 2026, '상태': '진행중', '무료여부': '',
    '목표관객': '2000', '목표금액': '', '최종유료': '155', '최종무료': '0', '최종총인원': '155', '최종매출': '1150000',
    '시작일': '2026-07-21', '종료일': '2026-11-01', '운영일수': '90', '최종점유율': '' },
  { '전시ID': 'EXC', '전시명': '겨울 공예전 <손>', '연도': 2026, '상태': '예정', '무료여부': '',
    '목표관객': '', '목표금액': '', '최종유료': '', '최종무료': '', '최종총인원': '', '최종매출': '',
    '시작일': '2026-11-20', '종료일': '2026-12-28', '운영일수': '', '최종점유율': '' }
] };
const exd = [];
[['20260312', 90], ['20260328', 260], ['20260415', 520], ['20260430', 840], ['20260511', 1230]]
  .forEach(([d, v]) => exd.push({ '전시ID': 'EXA', '전시명': '2026 봄 기획전 <결>', '기준일자': d, '누계유료': String(Math.round(v * 0.66)), '누계무료': '', '누계총인원': String(v), '누계금액': '', '점유율': '' }));
[['20260726', 60], ['20260728', 90], ['20260730', 124], ['20260801', 155]]
  .forEach(([d, v]) => exd.push({ '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '기준일자': d, '누계유료': String(v), '누계무료': '0', '누계총인원': String(v), '누계금액': '', '점유율': '' }));
const EXD = { headers: [], rows: exd };

// 예정(오픈 전) 공연 + 예술교육 프로그램(t'a') — PERFS 스텁
const PERFS_STUB = DATA.shows.filter(s => s.status === '예정')
  .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }))
  .concat([
    { s: '2026-03-10', e: '2026-06-25', n: '아카데미 봄', f: '예울마루 아카데미 봄학기', t: 'a', g: '', g2: '', rc: 0, id: 'EDU1' },
    { s: '2026-04-08', e: '2026-04-08', n: '해설음악회', f: '청소년 해설 음악회', t: 'a', g: '', g2: '', rc: 0, id: 'EDU2' },
    { s: '2026-07-29', e: '2026-08-22', n: '여름예술캠프', f: '어린이 여름 예술캠프', t: 'a', g: '', g2: '', rc: 0, id: 'EDU3' },
    { s: '2026-09-02', e: '2026-11-27', n: '아카데미 가을', f: '예울마루 아카데미 가을학기', t: 'a', g: '', g2: '', rc: 0, id: 'EDU4' },
    { s: '2026-10-16', e: '2026-10-17', n: '무대예술워크숍', f: '무대예술 워크숍', t: 'a', g: '', g2: '', rc: 0, id: 'EDU5' }
  ]);

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
