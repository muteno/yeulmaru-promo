#!/usr/bin/env node
// [260806-9] 3면(사업 결과 비교) 조작부 「매출 ↔ 관객수」 토글 — 전/후 실측 스크린샷 + DOM 프로브.
//   데이터 배선·목데이터 = shot_salescharts.mjs 그대로 계승(커밋된 스냅샷 · 실API·PII 미접촉).
//   찍는 것 = ① 조작부 머리줄(매출) ② 보드 전면(매출) ③ 조작부 머리줄(관객수) ④ 보드 전면(관객수).
//   재는 것 = y축 제목 · 막대 값 라벨 · 토글 aria-checked/라벨 — 「축이 실제로 갈렸나」의 근거.
// 실행: node tools/scratch/shot_bizmetric.mjs <출력디렉터리> [폭 높이]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = process.argv[2] || '/tmp/bizmetric';
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

const EXM = { headers: [], rows: [
  { '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '연도': 2026, '상태': '진행중', '무료여부': '',
    '목표관객': '2000', '목표금액': '', '최종유료': '155', '최종무료': '0', '최종총인원': '155', '최종매출': '1150000',
    '시작일': '2026-07-21', '종료일': '2026-11-01', '운영일수': '90', '최종점유율': '' }
] };
const exd = [];
[['20260726', 60], ['20260728', 90], ['20260730', 124], ['20260801', 155]]
  .forEach(([d, v]) => exd.push({ '전시ID': 'EXB', '전시명': 'GS칼텍스 예울마루 기획전시 <숨: 쉬는 SUM>', '기준일자': d, '누계유료': String(v), '누계무료': '0', '누계총인원': String(v), '누계금액': '', '점유율': '' }));
const EXD = { headers: [], rows: exd };

const PERFS_STUB = DATA.shows.filter(s => s.status === '예정')
  .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }))
  .concat([{ s: '2026-06-09', e: '2026-06-30', n: '화요살롱', f: '화요살롱', t: 'a', g: '인문학', g2: '인문학', rc: 0, id: 'EDU1' }]);
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

// 축이 실제로 갈렸나 — y축 제목 · 값 라벨 · 조작부 토글 상태
const PROBE = `(()=>{
  const out={};
  const hd=document.querySelector('#biz-main [data-bizmhead]');
  out.tools=hd?[...hd.querySelectorAll('.ry-yr-tg,.ry-hd-div,.ry-live-tg')].map(n=>
    n.classList.contains('ry-hd-div')?'│':(n.textContent.trim()+(n.getAttribute('aria-checked')?('['+n.getAttribute('aria-checked')+']'):''))):null;
  out.toolInk=hd?[...hd.querySelectorAll('.ry-live-tg')].map(n=>{const s=getComputedStyle(n);
    return n.textContent.trim()+' '+s.color+' '+s.fontWeight+' '+s.fontSize+' '+s.padding+' '+s.borderRadius;}):null;
  const d=document.getElementById('bizm-chart');
  if(d){
    out.yTitle=(d.querySelector('.g-ytitle text')||{}).textContent||null;
    out.yTicks=[...d.querySelectorAll('.yaxislayer-above text')].map(t=>t.textContent);
    out.bars=d.querySelectorAll('.barlayer .point path').length;
    out.labels=[...d.querySelectorAll('.barlayer text, g.points text')].map(t=>t.textContent).slice(0,6);
    out.chartH=Math.round(d.getBoundingClientRect().height);
  }
  out.kpi=[...document.querySelectorAll('#biz-main .bizm-kpi')].map(k=>k.textContent.trim().replace(/\\s+/g,' '));
  out.cards=[...document.querySelectorAll('#biz-main .bizm-card .ct')].map(t=>t.textContent.trim());
  return out;
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  mkdirSync(OUTDIR, { recursive: true });
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

    const shoot = async (tag) => {
      const box = await page.$('#biz-main');
      if (box) await box.screenshot({ path: join(OUTDIR, tag + '_board.png') });
      const hd = await page.$('#biz-main [data-bizmhead]');
      if (hd) await hd.screenshot({ path: join(OUTDIR, tag + '_head.png') });
      const ch = await page.$('#bizm-chart');
      if (ch) await ch.screenshot({ path: join(OUTDIR, tag + '_chart.png') });
      const p = await page.evaluate(PROBE);
      console.log(tag.toUpperCase() + ' ' + JSON.stringify(p, null, 1));
      return p;
    };

    const rev = await shoot('rev');

    // 토글 = 사용자가 실제로 누르는 그 버튼(마지막 .ry-live-tg = 매출/관객수)
    const btn = await page.$('#biz-main [data-bizmhead] .ry-live-tg:last-of-type');
    if (!btn) throw new Error('metric toggle not found');
    await btn.click();
    await page.waitForTimeout(2200);
    const aud = await shoot('aud');

    // 되돌리기 — 두 번 누르면 원래 화면(회귀 0)인가
    const btn2 = await page.$('#biz-main [data-bizmhead] .ry-live-tg:last-of-type');
    await btn2.click();
    await page.waitForTimeout(2200);
    const back = await page.evaluate(PROBE);
    console.log('ROUNDTRIP ' + JSON.stringify({
      yTitle: [rev.yTitle, aud.yTitle, back.yTitle],
      sameAsStart: JSON.stringify(back.yTicks) === JSON.stringify(rev.yTicks) && JSON.stringify(back.labels) === JSON.stringify(rev.labels),
      kpiUnchanged: JSON.stringify(rev.kpi) === JSON.stringify(aud.kpi)
    }));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 6).join(' | '));
    console.log('shots → ' + OUTDIR);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
