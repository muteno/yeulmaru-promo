#!/usr/bin/env node
// [260813] 「그라데이션이 또 사라졌다 + 숫자는 예상 높이에 그대로」 전/후 실측 프로브
//   재현 = 부팅 뒤 **앱이 실제로 하는 일 한 가지**를 그대로 태운다 — `_bizFitSeason()`이 박스 안선에 차트를 맞추며
//   부르는 `Plotly.relayout(차트,{height:…})`. 페이드는 렌더 후 덧칠이라 그 한 번에 칠만 증발한다(defs는 남는다).
//   출력 = ① 칠해진 페이드 칸 수(전/후) ② 값 라벨 원문 목록 ③ 「0」 라벨의 정체(그 자리 사업명·매출·상태)
//   실행: node tools/scratch/probe_fcgrad_ba.mjs <출력.png> [폭 높이]   · IDX=<다른 index.html> 로 전 상태 촬영
//   데이터 = 커밋된 스냅샷(docs/reports/260803_…플레이그라운드.html)에 일일 시계열만 합성 = 실API·PII 미접촉
//            (합성 규칙·근거는 probe_fc2tier.mjs 머리주석과 동일 — 예측 엔진이 실측 7건을 요구하기 때문).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || '/tmp/fcgrad.png';
const W = parseInt(process.argv[3] || '1600', 10), H = parseInt(process.argv[4] || '900', 10);
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
const YEAR = 2026, TODAY = new Date('2026-08-06T00:00:00');

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
const ymd = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const salesRows = DATA.shows.filter(s => s.paid > 0).map(s => {
  const active = s.status === '판매중';
  const inc = Math.max(1, Math.round(s.paid * 0.02));
  const days = [];
  if (active) for (let k = 6; k >= 0; k--) {
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
// 티켓은 열렸는데 아직 매출 0인 공연(운영자 화면의 「0」 라벨 재현) — 라이브에도 있던 자리
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
  function wrapped(method,path){ var p=String(path||'');
    if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]}); }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
})();`;

const PERFS_STUB = DATA.shows.filter(s => s.status === '예정')
  .map(s => ({ s: s.date, e: s.dateEnd, n: s.name, f: s.name, t: 'c', g: s.gu || '', g2: s.genre || '', rc: 1, id: '' }));

const FEED = `(()=>{
  try{ PERFS = ${JSON.stringify(PERFS_STUB)}; }catch(e){}
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null;
    _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
  window._salesBuild=function(){ return window.__MOCK_SALES; };
  if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
})()`;

// 칠해진 페이드 칸 · 값 라벨 원문 · 「0」 라벨의 정체(실막대 트레이스의 customdata에서 이름·상태를 되짚는다)
const MEASURE = `(()=>{
  const d=document.getElementById('bizm-chart'); if(!d)return {err:'no chart'};
  const url=p=>((p.style&&p.style.fill)||'').indexOf('url(')>=0;
  const gs=[...d.querySelectorAll('.barlayer > .trace')].map(g=>{const ps=[...g.querySelectorAll('.point > path')];
    return {n:ps.length, painted:ps.filter(url).length};});
  const NN='[0-9,]+(?:\\\\.[0-9]+)?';   // [260813-2] 0은 소수 한 자리(0.0/0.4)
  const RE=new RegExp('^'+NN+'(?:\\\\('+NN+'\\\\))?$');   // ⚠ 템플릿 리터럴 → 페이지 문자열 → RegExp = 백슬래시 두 겹
  const LB=[...d.querySelectorAll('.annotation')].filter(a=>{const t=a.querySelector('text');return t&&RE.test(t.textContent.trim());})
    .map(a=>{const t=a.querySelector('text'),b=t.getBoundingClientRect(),r=a.querySelector('rect.bg');
      let bg=false; if(r){const cs=getComputedStyle(r),f=String(cs.fill||''),o=(cs.fillOpacity==null||cs.fillOpacity==='')?1:+cs.fillOpacity;
        bg=!!f&&f!=='none'&&o>0.05&&!/,\\s*0\\s*\\)$/.test(f);}
      return {t:t.textContent.trim(),x0:b.x,x1:b.x+b.width,y:b.y+b.height,bg:bg};});
  const labs=LB.map(L=>L.t+(L.bg?'[판]':''));
  const ovl=[]; for(let a=0;a<LB.length;a++)for(let b=a+1;b<LB.length;b++)
    if(LB[a].x1>LB[b].x0&&LB[b].x1>LB[a].x0&&Math.abs(LB[a].y-LB[b].y)<13)
      ovl.push(LB[a].t+'↔'+LB[b].t+' ('+(Math.min(LB[a].x1,LB[b].x1)-Math.max(LB[a].x0,LB[b].x0)).toFixed(1)+'px 겹침)');
  const t0=(d.data||[])[0]||{};
  const zero=((t0.customdata)||[]).map((c,i)=>({name:c[0],genre:c[1],sold:c[2],rev:c[3],occ:c[4],st:c[5],day:c[6],y:t0.y[i]}))
    .filter(r=>r.y!=null&&Math.round(r.y)===0);
  return {gs, defs:d.querySelectorAll('defs linearGradient[id^="bz"]').length, labs, ovl, zero,
    h:Math.round(d.getBoundingClientRect().height)};
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
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
    await page.waitForTimeout(2600);
    console.log('그린 직후  ', JSON.stringify(await page.evaluate(MEASURE)));
    // 앱이 실제로 하는 fit 1패스(_bizFitSeason → Plotly.relayout(height))를 그대로 태운다
    await page.evaluate(`(()=>{const d=document.getElementById('bizm-chart');
      return Plotly.relayout(d,{height:Math.round(d.getBoundingClientRect().height)-6});})()`);
    await page.waitForTimeout(900);
    console.log('fit 1패스 뒤', JSON.stringify(await page.evaluate(MEASURE), null, 1));
    const card = await page.$('#bizm-chart');
    if (card) await card.screenshot({ path: OUT });
    // CLIP="x,y,w,h"(차트 기준 CSS px) = 그 자리만 확대 컷 — 전/후를 **같은 좌표로** 잘라야 비교가 성립한다(probe_fc2tier와 같은 규약)
    if (card && process.env.CLIP) {
      const [cx, cy, cw, ch] = process.env.CLIP.split(',').map(Number);
      const bb = await card.boundingBox();
      await page.screenshot({ path: OUT.replace(/\.png$/, '_zoom.png'), clip: { x: bb.x + cx, y: bb.y + cy, width: cw, height: ch } });
    }
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
