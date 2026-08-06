#!/usr/bin/env node
// [260806-7] 기획 공연 차트 실측 프로브 — ① 값 없는 자리(파선→페이드) ② 보수 기간 라벨 자리(잉크 광학 중심)
//   데이터 = docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html 안 DATA(커밋된 스냅샷) 재사용 = 실API·PII 미접촉.
//   실행: node tools/scratch/probe_bizfade.mjs <출력.png> [폭 높이]   · IDX=<다른 index.html> 로 전/후 비교
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || '/tmp/bizfade.png';
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
  globalThis.__FCR=${process.env.FCR||1.6};
  var process_FC=${process.env.FC?'true':'false'};
  try{ PERFS = ${JSON.stringify(PERFS_STUB)}; }catch(e){ console.warn('PERFS stub', e); }
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null;
    _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
  window._salesBuild=function(){ return window.__MOCK_SALES; };
  if(typeof _bizmState!=='undefined'&&_bizmState)_bizmState.year=${YEAR};
  if(process_FC)window._bizFcSeat=function(p){ return (p&&p.seats>0&&p.status==='active')?Math.round(p.seats*(+(globalThis.__FCR||1.6))):null; };   // [260806-9] 예상 최종석 스텁 = 2단 페이드 재현(라이브는 일일 실측에서 나온다)
})()`;

// ── 실측 ①②를 한 번에: 막대 트레이스별 채움 · 파선 도형 · 보수 라벨 잉크 픽셀 ──────────────
const MEASURE = `(()=>{
  const d=document.getElementById('bizm-chart'); if(!d)return {err:'no chart'};
  const gd=d, fl=gd._fullLayout, xa=fl.xaxis;
  const px=v=>+(xa.d2p(v)+xa._offset).toFixed(2);
  const dayToStr=v=>{ const t=new Date(${YEAR},0,1); t.setDate(t.getDate()+Math.round(v)-1);
    return (t.getMonth()+1)+'/'+t.getDate(); };
  // 막대 트레이스 그룹(= 트레이스별 점 묶음)
  const groups=[...d.querySelectorAll('.barlayer > .trace')].map((g,i)=>{
    const ps=[...g.querySelectorAll('.point > path')];
    return {i, n:ps.length, fills:[...new Set(ps.map(p=>p.style.fill||p.getAttribute('fill')||''))].slice(0,3),
      h:ps.map(p=>+p.getBBox().height.toFixed(1)).slice(0,12)};
  });
  // 파선 도형(값 없는 자리)
  const sh=(gd.layout.shapes||[]);
  const dash=sh.map((s,i)=>({i,dash:s.line&&s.line.dash,x0:s.x0,x1:s.x1,y1:s.y1})).filter(s=>s.dash==='dash');
  const dashDom=[...d.querySelectorAll('.shapelayer path')].filter(p=>((p.getAttribute('style')||'')+(p.getAttribute('stroke-dasharray')||'')).includes('dash')).length;
  // 보수 라벨 = 잉크 광학 중심 실측(박스 rect + 픽토 image의 합집합)
  const anns=[...d.querySelectorAll('.annotation')].map(a=>{
    const t=a.querySelector('text'); return {txt:t?t.textContent.trim():'', a};
  }).filter(o=>o.txt.indexOf('보수')>=0);
  const imgs=[...d.querySelectorAll('.imagelayer image')].map(im=>{ const b=im.getBoundingClientRect(); return {x:b.x,w:b.width,cx:b.x+b.width/2}; });
  const root=d.getBoundingClientRect();
  const maint=anns.map((o,k)=>{
    const box=o.a.querySelector('rect')||o.a.querySelector('path');
    const b=box.getBoundingClientRect(), t=o.a.querySelector('text').getBoundingClientRect();
    const im=imgs[k]||null;
    // 광학 잉크 = **보이는 것들의 합집합** = 픽토 왼끝 ~ 글자 오른끝(앞 전각 공백은 픽토가 앉는 자리라 잉크가 아니다 → 폭을 빼고 잰다)
    let lead=0; try{ lead=o.a.querySelector('text').getSubStringLength(0,1)||0; }catch(e){}
    const gx0=t.x+lead;
    const x0=im?Math.min(im.x,gx0):gx0, x1=Math.max(t.x+t.width, im?im.x+im.w:0);
    return {box:{x:+(b.x-root.x).toFixed(2),w:+b.width.toFixed(2),cx:+(b.x+b.width/2-root.x).toFixed(2)},
      text:{x:+(t.x-root.x).toFixed(2),w:+t.width.toFixed(2),cx:+(t.x+t.width/2-root.x).toFixed(2)},
      icon:im?{x:+(im.x-root.x).toFixed(2),cx:+(im.cx-root.x).toFixed(2),w:+im.w.toFixed(2)}:null,
      inkCx:+((x0+x1)/2-root.x).toFixed(2)};
  });
  // _YC_MAINT가 뜻하는 기간(달) → 지금 코드가 그리는 자리
  const mt=(typeof _YC_MAINT!=='undefined'?_YC_MAINT:[]).map(m=>{
    const a=_bizXDay(new Date(${YEAR},m.ms[0],1),${YEAR}), b=_bizXDay(new Date(${YEAR},m.ms[m.ms.length-1]+1,1),${YEAR})-0.5;
    const a1=_bizXDay(new Date(${YEAR},m.ms[0]-1,1),${YEAR}), b1=_bizXDay(new Date(${YEAR},m.ms[m.ms.length-1],1),${YEAR})-0.5;
    return {ms:m.ms, 현행:{범위:dayToStr(a)+'~'+dayToStr(b), 중심:dayToStr((a+b)/2), 중심px:px((a+b)/2)},
                     '1based':{범위:dayToStr(a1)+'~'+dayToStr(b1), 중심:dayToStr((a1+b1)/2), 중심px:px((a1+b1)/2)}};
  });
  const xc=[...d.querySelectorAll('.barlayer > .trace')].map((g,i)=>({i,
    cx:[...g.querySelectorAll('.point > path')].map(p=>{const b=p.getBBox();return +(b.x+b.width/2).toFixed(2);}),
    w:[...g.querySelectorAll('.point > path')].map(p=>+p.getBBox().width.toFixed(2)).slice(0,3)}));
  const ticks=[...d.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>({t:t.textContent,x:+(+t.getAttribute('x')).toFixed(1)}));
  return {xc, barmode:(gd._fullLayout||{}).barmode, groups, dashLay:dash.length, dashDom, dash:dash.slice(0,10), maint, mt, ticks,
    plot:{l:+xa._offset.toFixed(1), w:+xa._length.toFixed(1)}, cut:(gd.layout.shapes||[]).length};
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
    await page.waitForTimeout(2200);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2200);

    // 페이드 배선 진단 — _bizFadePlanned가 실제로 받는 rows/술어와, 그때 만들어진 그라데이션 수
    console.log('PLAN ' + JSON.stringify(await page.evaluate(`(()=>{
      if(typeof _bizFadePlanned!=='function')return {err:'no fn'};
      var rec=null, orig=_bizFadePlanned;
      window._bizFadePlanned=function(div,rows,planFn,gcolFn){
        if(div&&div.id==='bizm-chart')rec={rows:rows.length, planned:rows.map(function(g,i){return planFn(g)?i:-1;}).filter(function(i){return i>=0;}),
          pts:div.querySelectorAll('.plot .points > .point > path').length};
        return orig.apply(this,arguments);
      };
      try{ _bizInlineRender(); }catch(e){ return {err:String(e)}; }
      var d=document.getElementById('bizm-chart');
      rec=rec||{}; rec.grads=d?d.querySelectorAll('defs linearGradient[id^="bzf"]').length:-1;
      rec.faded=d?[...d.querySelectorAll('.barlayer .point path')].filter(function(p){return (p.style.fill||'').indexOf('url(')>=0;}).length:-1;
      window._bizFadePlanned=orig;
      return rec;
    })()`)));
    await page.waitForTimeout(600);
    await page.waitForTimeout(1500);   // ⚠ 앞 PLAN 블록이 재렌더를 던져 놓은 상태 — 그리기가 끝나기 전에 재면 파선·페이드가 둘 다 0으로 잡힌다(실측)
    // 3면(공연·전시·교육) 한 번에 — 남은 파선 · 페이드 수 · 콘솔 에러
    console.log('CARDS ' + JSON.stringify(await page.evaluate(`(()=>{
      return [...document.querySelectorAll('#biz-main .js-plotly-plot')].map(function(d){
        var ps=[...d.querySelectorAll('.barlayer .point path, .scatterlayer .point')];
        return {id:d.id,
          dash:[...d.querySelectorAll('.shapelayer path')].filter(function(p){return ((p.getAttribute('style')||'')+(p.getAttribute('stroke-dasharray')||'')).includes('dash');}).length,
          fade:[...d.querySelectorAll('.barlayer .point path')].filter(function(p){return (p.style.fill||'').indexOf('url(')>=0;}).length,
          bars:d.querySelectorAll('.barlayer .point path').length};
      });
    })()`)));
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
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
