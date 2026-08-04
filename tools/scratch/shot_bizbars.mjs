#!/usr/bin/env node
// [260804] 3면(사업 결과 비교) 판매현황 막대 — 실스냅샷(260730 · asof 07-29) 형태로 헤드리스 렌더 → 스크린샷.
// 목적 = 매출 편차(최대 486M ↔ 최소 0.9M = 540:1)로 막대가 뭉개지는 현상의 전/후 실측.
// 데이터 = docs/reports/260803_…플레이그라운드.html 안 DATA(이미 커밋된 스냅샷) 재사용 — 실API·PII 미접촉.
// 실행: node tools/scratch/shot_bizbars.mjs <출력.png> [폭 높이]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || '/tmp/bizbars.png';
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

// 시안 HTML 안의 실스냅샷을 그대로 뽑아 쓴다(값 창작 0)
const PG = readFileSync(join(ROOT, 'docs/reports/260803_사업결과비교_판매현황_플레이그라운드.html'), 'utf8');
const DATA = JSON.parse(PG.match(/var DATA=(\{.*?\});\n/s)[1]);
const YEAR = 2026;

// 운영대장(정리) 행 — 2026 실적분 + 평년(23~25) 장르 축적용 과거분
const opsRows = [];
const pushRow = (y, m, d, name, genre, seat, paid) => opsRows.push({
  '상태': '', '사업구분': '공연', '티켓구분': '유료', '기본좌석': seat, '발권유료': paid,
  '년도': y, '월': m, '일': d, '공연구분': '기획', '장르1': genre, '공연명': name, '수익성': ''
});
DATA.shows.filter(s => s.paid > 0).forEach(s => {
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

// 판매 축(일일입력·공연마스터 조인 결과 = _salesBuild 산출물) 스텁 — 매출·판매좌석·상태만
const salesRows = process.env.NOREV ? [] : DATA.shows.filter(s => s.paid > 0)
  .map(s => ({ name: s.name, money: s.rev, seats: s.paid, status: s.status === '판매중' ? 'active' : 'ended' }));

const INIT = `(function(){
  window.__MOCK_OPS=${JSON.stringify({ rows: opsRows, headers: Object.keys(opsRows[0]) })};
  window.__MOCK_SALES=${JSON.stringify(salesRows)};
  var real=null;
  function wrapped(method,path){
    var p=String(path||'');
    if(p.indexOf('/api/ops')===0&&decodeURIComponent(p).indexOf('세부운영관리대장')>=0)return Promise.resolve(window.__MOCK_OPS);
    return real?real(method,path):Promise.resolve({rows:[],headers:[],programs:[]});
  }
  try{ Object.defineProperty(window,'_qaApi',{configurable:true,get:function(){return wrapped;},set:function(v){real=v;}}); }catch(e){}
})();`;

const FEED = `(()=>{
  if(typeof _bizState!=='undefined'&&_bizState)_bizState.raw=window.__MOCK_OPS;
  if(typeof _salesState!=='undefined'&&_salesState){ _salesState.ops=window.__MOCK_OPS; _salesState._opsIdx=null;
    _salesState.daily={rows:[]}; _salesState.master={rows:[]}; }
  window._salesBuild=function(){ return window.__MOCK_SALES; };   // 판매 축 조인 스텁(집계 로직 무접촉 — 산출물만 주입)
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
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
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
    await page.evaluate('_bizmTo(3)');
    await page.waitForTimeout(2500);
    await page.evaluate('try{_bizInlineRender()}catch(e){}');
    await page.waitForTimeout(2500);

    // 실측 — 막대 픽셀 높이(작은 사업이 몇 px로 뭉개지는지) + 축 눈금
    const probe = await page.evaluate(`(()=>{
      const d=document.getElementById('bizm-chart'); if(!d)return {err:'no chart'};
      const bars=[...d.querySelectorAll('.barlayer .point path')].map(p=>{const b=p.getBBox();return +b.height.toFixed(1);});
      const ticks=[...d.querySelectorAll('.yaxislayer-above text, .yaxislayer text')].map(t=>t.textContent);
      const shapes=d.querySelectorAll('.shapelayer path').length;
      return {bars, ticks, shapes, h:d.getBoundingClientRect().height};
    })()`);
    console.log(JSON.stringify(probe));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 5).join(' | '));

    const box = await page.$('#biz-main');
    await box.screenshot({ path: OUT });
    const card = await page.$('#bizm-chart');
    if (card) await card.screenshot({ path: OUT.replace(/\.png$/, '_chart.png') });
    console.log('shot → ' + OUT);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
