#!/usr/bin/env node
// [260809] 기획 공연 막대 값 라벨 실측 — 「① 라벨↔막대 꼭대기 세로 간격이 라벨마다 다른가 ② 서 있는 막대 중 숫자가
//   없는 게 몇 개인가 ③ 라벨 잉크가 몇 갈래인가」를 픽셀로 잰다(운영자 260809 지시 3항의 전/후 자).
// 하네스·데이터 = tools/scratch/shot_bizbars.mjs 그대로 계승 + 예상 2단(그라데이션) 스텁(smoke_bizchart.mjs와 같은 벌).
// 실행: node tools/scratch/probe_barlabel.mjs <출력.png> [폭 높이]   (IDX=<index.html 경로> = 다른 판으로 재기)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || '/tmp/barlabel.png';
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
let sd = 11; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
[2023, 2024, 2025].forEach(y => Object.keys(DATA.bench).forEach(g => {
  const tot = DATA.bench[g]['y' + String(y).slice(2)] || 0; if (!tot) return;
  const n = 12, per = Math.round(tot / n);
  for (let i = 0; i < n; i++) pushRow(y, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27), g + ' 공연 ' + y + '-' + i, g, 926, per);
}));

const D26 = s => new Date(s + 'T00:00:00');
const salesRows = DATA.shows.filter(s => s.paid > 0)
  .map(s => ({ name: s.name, money: s.rev, seats: s.paid, occ: s.occ, totalOpen: s.open, _rcEst: 1, genre: s.genre,
    startDate: D26(s.date), endDate: D26(s.dateEnd), status: s.status === '판매중' ? 'active' : 'ended' }));

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
  // 예상 2단(그라데이션) 스텁 — 운영자 화면에 뜬 그 칸을 재현한다(smoke_bizchart.mjs와 같은 벌).
  window._bizFcSeat=function(p){ return (p&&p.seats>0&&p.status==='active')?Math.round(p.seats*1.6):null; };
})()`;

// ── 실측: 막대 꼭대기 ↔ 값 라벨 아랫변 간격 · 라벨 없는 막대 · 잉크 갈래 ────────────────────────────
const MEASURE = `(()=>{
  const d=document.getElementById('bizm-chart'); if(!d)return {err:'차트 없음'};
  const R=d.getBoundingClientRect(), r=v=>+v.toFixed(2);
  // 막대 = 실막대 트레이스(0) + 예상 칸(있으면) — 자리 트레이스(투명 호버)는 값이 없는 자리라 뺀다.
  const traces=[...d.querySelectorAll('.barlayer > .trace')];
  const bars=[];
  traces.forEach((t,ti)=>[...t.querySelectorAll('.point > path')].forEach(p=>{
    const b=p.getBoundingClientRect(); if(b.height<0.5)return;
    bars.push({ti,cx:r(b.x+b.width/2-R.x),top:r(b.y-R.y),bot:r(b.y+b.height-R.y),h:r(b.height),fill:p.getAttribute('style')||''});
  }));
  // 값 라벨 = ① 막대 트레이스 안 텍스트(Plotly text) ② 주석층의 **숫자만인** 텍스트(1Q·보수 기간·진행 완료 등은 제외)
  const labs=[];
  [...d.querySelectorAll('.barlayer text')].forEach(t=>{
    const s=t.textContent.trim(); if(!/^[0-9,]+$/.test(s))return;
    const b=t.getBoundingClientRect();
    labs.push({src:'trace',t:s,cx:r(b.x+b.width/2-R.x),w:r(b.width),bot:r(b.y+b.height-R.y),top:r(b.y-R.y),fill:getComputedStyle(t).fill});
  });
  [...d.querySelectorAll('.annotation text')].forEach(t=>{   // ⚠ Plotly 주석은 .infolayer > g.annotation (annotationlayer 아님)
    const s=t.textContent.trim(); if(!/^[0-9,]+$/.test(s))return;
    const b=t.getBoundingClientRect();
    labs.push({src:'anno',t:s,cx:r(b.x+b.width/2-R.x),w:r(b.width),bot:r(b.y+b.height-R.y),top:r(b.y-R.y),fill:getComputedStyle(t).fill});
  });
  // 라벨 ↔ 그 라벨이 이고 있는 막대(같은 x에서 라벨 아래로 가장 가까운 꼭대기)
  labs.forEach(L=>{
    let best=null;
    bars.forEach(B=>{ const dx=Math.abs(B.cx-L.cx); if(dx>14)return;
      const gap=B.top-L.bot; if(gap<-4)return;              // 라벨이 막대 안으로 들어간 경우는 제외
      if(!best||gap<best.gap)best={gap:r(gap),dx:r(dx),ti:B.ti,top:B.top}; });
    L.gap=best?best.gap:null; L.ti=best?best.ti:null;
  });
  // 숫자가 없는 막대 = 자기 꼭대기 위 14px 안에 라벨이 없는 막대(같은 x 기준) · 예상 칸이 얹힌 실막대는 제외(그 칸이 라벨을 인다)
  const labeled=B=>labs.some(L=>Math.abs(L.cx-B.cx)<=14&&Math.abs((B.top-L.bot))<=24&&B.top-L.bot>=-4);
  const covered=B=>bars.some(O=>O!==B&&Math.abs(O.cx-B.cx)<=2&&O.bot<=B.top+1.5&&O.ti!==B.ti);   // 위에 예상 칸이 얹힌 실막대
  const naked=bars.filter(B=>!labeled(B)&&!covered(B)).map(B=>({ti:B.ti,cx:B.cx,top:B.top,h:B.h}));
  const inks={}; labs.forEach(L=>{ inks[L.fill]=(inks[L.fill]||0)+1; });
  // 숫자끼리 포개졌나 — 실제 글상자(클라이언트 사각형)끼리의 겹침. 「다 보이게」의 반대편 축이다.
  const ov=[]; for(let a=0;a<labs.length;a++)for(let b=a+1;b<labs.length;b++){
    const A=labs[a],B=labs[b];
    if(Math.abs(A.cx-B.cx)<(A.w+B.w)/2&&Math.abs(A.bot-B.bot)<13)ov.push(A.t+'↔'+B.t);
  }
  const gaps=labs.map(L=>L.gap).filter(g=>g!=null);
  return {nBar:bars.length, nLab:labs.length, naked, inks, ov,
    gapMin:gaps.length?r(Math.min(...gaps)):null, gapMax:gaps.length?r(Math.max(...gaps)):null,
    gapSpread:gaps.length?r(Math.max(...gaps)-Math.min(...gaps)):null,
    labs:labs.sort((a,b)=>a.cx-b.cx)};
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
    await page.waitForTimeout(2500);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2500);

    const m = await page.evaluate(MEASURE);
    console.log(JSON.stringify(m, null, 1));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 5).join(' | '));
    const card = await page.$('#bizm-chart');
    if (card) await card.screenshot({ path: OUT });
    const box = await page.$('#biz-main');
    if (box) await box.screenshot({ path: OUT.replace(/\.png$/, '_full.png') });
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
