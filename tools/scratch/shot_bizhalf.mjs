#!/usr/bin/env node
/**
 * 3면 하단 반반 줄(기획 전시 │ 예술교육) 전/후 스샷 — 260807-20 매출 토글 확장 실측용.
 *
 * 왜 스크래치인가 = 게이트가 아니라 **눈으로 대조할 그림**을 뽑는 자리다(운영자 「전과 후를 이미지로」).
 * 데이터 = 커밋된 거울(`data/exhib_daily_2026.js` 정산서 + `_BIZ_EDU_SOLD` 운영자 확정) — 실API·PII 미접촉.
 *
 * 사용: node tools/scratch/shot_bizhalf.mjs <서빙할 index.html> <출력 접두사>
 *   예) node tools/scratch/shot_bizhalf.mjs index.html docs/reports/260807-20_후
 *   산출 = <접두사>_매출.png · <접두사>_관객수.png
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const YEAR = 2026;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const SRC = process.argv[2] || 'index.html';
const OUT = process.argv[3] || 'docs/reports/shot';

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

// 공연 축 = smoke_bizchart와 **같은 스냅샷 스텁**(화면이 실물과 같은 모양으로 서야 반반 줄도 실제 자리에 앉는다)
function stubs() {
  const PG = readFileSync(join(ROOT, 'docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html'), 'utf8');
  const DATA = JSON.parse(PG.match(/var DATA=(\{.*?\});\n/s)[1]);
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
  const D = s => new Date(s + 'T00:00:00');
  const sales = DATA.shows.filter(s => s.paid > 0).map(s => ({
    name: s.name, money: s.rev, seats: s.paid, occ: s.occ, totalOpen: s.open, _rcEst: 1, genre: s.genre,
    startDate: D(s.date), endDate: D(s.dateEnd), status: s.status === '판매중' ? 'active' : 'ended'
  }));
  // 프로그램 시트(예술교육 화요살롱) = 거울 `이관본/data/programs.csv` 실측 행 그대로
  const perfs = [{ s: '2026-06-30', e: '2026-06-30', n: '화요살롱', f: '2026 화요살롱 - 이낙준(6월)', t: 'a', g: '', g2: '인문학', rc: 1, id: '260630_01' }];
  return { opsRows, sales, perfs };
}
const { opsRows, sales, perfs: PERFS } = stubs();

const { chromium } = await import('playwright-core');
const exe = findChromium();
if (!exe) { console.log('[shot] SKIP — chromium 미탐지'); process.exit(0); }

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      const disk = (p === '/index.html') ? SRC : join(ROOT, p);
      try { return route.fulfill({ status: 200, body: readFileSync(disk), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    if (u.hostname === 'cdn.plot.ly') {
      const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
      if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
    }
    return route.abort();
  });
  await page.addInitScript(`(function(){
    window.__OPS=${JSON.stringify({ rows: opsRows, headers: Object.keys(opsRows[0]) })};
    window.__SALES=${JSON.stringify(sales)}.map(function(p){p.startDate=new Date(p.startDate);p.endDate=new Date(p.endDate);return p;});
    var real=null;
    function wrapped(method,path){ var p=String(path||'');
      if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__OPS);
      return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]}); }
    try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
  })();`);
  await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  // 전시 = 거울(EXHIB_DAILY_2026)만 · 교육 = 프로그램 시트 1건 + `_BIZ_EDU_SOLD` 폴백(운영대장·일일입력 0줄 = 라이브 실측 그대로)
  await page.evaluate(`(()=>{
    try{ PERFS = ${JSON.stringify(PERFS)}; }catch(e){}
    try{ _perfReady = true; }catch(e){}
    if(typeof _anaState!=='undefined'&&_anaState)_anaState._exMaster={rows:[]};
    window._anaExhibBuild=function(){ return []; };
    if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__OPS;
    if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__OPS; _salesState._opsIdx=null;
      _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
    window._salesBuild=function(){ return window.__SALES; };
    if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
  })()`);
  await page.evaluate('_bizBookGo(3)');
  await page.waitForTimeout(1800);

  const shoot = async (tag) => {
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2200);
    const row = await page.$('#bizm-ex-chart');
    if (!row) { console.log('  [shot] ' + tag + ' — 전시 차트 없음'); return; }
    const box = await page.evaluate(`(()=>{const c=document.getElementById('bizm-ex-chart').closest('.bizm-card');
      const r=c.parentElement.getBoundingClientRect(); return {x:r.x-6,y:r.y-6,width:r.width+12,height:r.height+12};})()`);
    const path = join(ROOT, OUT + '_' + tag + '.png');
    await page.screenshot({ path, clip: box });
    const full = await page.evaluate(`(()=>{const r=document.getElementById('biz-main').getBoundingClientRect();
      return {x:Math.max(0,r.x-4),y:Math.max(0,r.y-4),width:Math.min(r.width+8,1590),height:Math.min(r.height+8,990)};})()`);
    await page.screenshot({ path: join(ROOT, OUT + '_' + tag + '_전체.png'), clip: full });
    const unit = await page.evaluate(`[...document.querySelectorAll('#biz-main .bizm-card .ct')].map(function(c){return c.textContent.trim().replace(/\\s+/g,' ');})`);
    console.log('  [shot] ' + tag + ' → ' + path + '  | 카드 머리 = ' + JSON.stringify(unit));
  };

  await shoot('매출');                                   // 기본 = 매출(_bizmState.metric='rev')
  await page.evaluate(`_bizmState.metric='aud'`);
  await shoot('관객수');
} finally { await browser.close(); }
