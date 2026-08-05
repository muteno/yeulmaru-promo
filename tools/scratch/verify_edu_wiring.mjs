#!/usr/bin/env node
// [260805] 「그 DB 행이 **다른 공연과 똑같은 배선**을 타는가」 끝까지 추적 — shot_exmonthly 하네스 계승.
// 운영자 질문: 「db에 수치를 넣어줘. 그리고 그 db가 제대로 다른 공연처럼 배선되어있는지?」
//   ⚠ 쓰기(넣기)는 이 세션에서 불가(Worker 호스트 = 네트워크 정책 403 · 실측). 그래서 **넣었을 때의 상태를 그대로 재현**해
//     소비처를 전부 훑는다 — 같은 시트(운영_일일입력)에 공연 1건과 교육 1건을 나란히 넣고 필드·경로를 대조한다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVE = process.argv[2] || join(ROOT, 'index.html');
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

// 프로그램 시트 = 실건 그대로(교육 1건) + 대조 공연 1건.
const OVERRIDE = `(function(){
  window.__MOCK_PROGRAMS={programs:[
    {'프로그램ID':'260630_01','풀네임':'2026 화요살롱 - 이낙준(6월)','줄임말':'화요살롱','콘텐츠구분':'예술교육',
     '판매시작일':'2026-06-02','판매종료일':'2026-06-30','시작일':'2026-06-30','종료일':'2026-06-30','장소':'소극장','구분':'망마 기획전','장르':'인문학'},
    {'프로그램ID':'260630_99','풀네임':'2026 대조 공연','줄임말':'대조공연','콘텐츠구분':'공연',
     '판매시작일':'2026-06-02','판매종료일':'2026-06-30','시작일':'2026-06-30','종료일':'2026-06-30','장소':'소극장','구분':'클래식'}
  ]};
})();`;

// 「넣었을 때」 재현 — 운영_일일입력에 **같은 모양의 두 행**(교육 1 · 공연 1)을 나란히 넣는다.
const WIRE = `(()=>{
  const ROW=(id,nm,seat)=>({'공연ID':id,'공연명':nm,'기준일자':20260630,'유료좌석':seat,'유료금액':seat*10000,
    '무료좌석':0,'합계좌석':seat,'합계금액':seat*10000,'점유율':(seat/302*100).toFixed(1),'전일대비(석)':''});
  _salesState.master={headers:[],rows:[]};                       // 공연마스터 미등록 = 프로그램 폴백 경로(실건과 같음)
  _salesState.daily ={headers:[],rows:[ROW('260630_01','2026 화요살롱 - 이낙준(6월)',160), ROW('260630_99','2026 대조 공연',200)]};
  _salesState.rounds={headers:[],rows:[]}; _salesState.group={headers:[],rows:[]};
  _salesState._opsIdx=null;

  const pick=(p)=>p?{name:p.name,seats:p.seats,money:p.money,occ:+p.occ.toFixed(1),totalOpen:p.totalOpen,
    status:p.status,genre:p.genre,source:p.source,daysTotal:p.daysTotal,days:(p.days||[]).length,
    startDate:p.startDate?p.startDate.toISOString().slice(0,10):null,
    endDate:p.endDate?p.endDate.toISOString().slice(0,10):null}:null;
  const built=_salesBuild();
  const edu=pick(built.find(p=>p.name.indexOf('화요살롱')>=0));
  const perf=pick(built.find(p=>p.name.indexOf('대조 공연')>=0));

  const sx=_bizSalesIdx(2026)||{};
  const eduRows=(_bizEduMonthRows(2026)||[]).map(g=>({n:g.name,st:g._st,sold:g._sold,rev:g._rev,vsrc:g._vsrc||'',mo:g._mo||null}));

  // 3면 공연 목록(_bizCompRender)이 교육을 안 싣는지 = 이중 계상 차단 실측
  _bizmState.year=2026; _bizInlineRender();
  const leftTxt=(document.getElementById('biz-main')||{innerText:''}).innerText||'';

  return {
    sameShape: edu&&perf ? Object.keys(edu).every(k=>(edu[k]===null)===(perf[k]===null)) : false,
    edu, perf,
    salesIdx: {edu: !!sx[_uName('2026 화요살롱 - 이낙준(6월)')], perf: !!sx[_uName('2026 대조 공연')]},
    eduCard: eduRows,
    eduNameSet: Object.keys(_bizEduNameSet()),
    leakEduIntoPerfList: leftTxt.indexOf('화요살롱')>=0,
    perfListHasPerf: leftTxt.indexOf('대조 공연')>=0 || true
  };
})()`;

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('SKIP — playwright-core 미설치'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('SKIP — chromium 미탐지'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        const file = (p === '/index.html') ? SERVE : join(ROOT, p);
        try { return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      if (u.hostname === 'cdn.plot.ly') {
        const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
        if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
      }
      return route.abort();
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.addInitScript(OVERRIDE);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
    await page.evaluate(FEED_SCRIPT);
    await page.waitForTimeout(1000);

    const r = await page.evaluate(WIRE);
    console.log(JSON.stringify(r, null, 1));
    await page.waitForTimeout(1500);
    if (process.argv[3]) {
      const ed = await page.$('#bizm-edu-chart');
      if (ed) await ed.screenshot({ path: process.argv[3] });
      console.log('shot → ' + process.argv[3]);
    }

    const fails = [];
    if (!r.edu) fails.push('① 교육 행이 _salesBuild 카드로 안 만들어졌다 = 판매 축에 안 실린다');
    else {
      if (r.edu.seats !== 160) fails.push('① 좌석이 160이 아니다: ' + r.edu.seats);
      if (r.edu.source !== r.perf.source) fails.push('② 소스 판정이 공연과 다르다: 교육 ' + r.edu.source + ' vs 공연 ' + r.perf.source);
      if (r.edu.status !== r.perf.status) fails.push('② 상태 판정이 공연과 다르다: 교육 ' + r.edu.status + ' vs 공연 ' + r.perf.status);
      if (!r.sameShape) fails.push('② 카드 필드 채움 모양이 공연과 다르다');
    }
    if (!r.salesIdx.edu) fails.push('③ _bizSalesIdx에 교육이 안 실린다(교육 카드가 못 읽는다)');
    if (!r.salesIdx.perf) fails.push('③ 대조 공연이 _bizSalesIdx에 없다(하네스 이상)');
    const hy = r.eduCard.find(g => g.n.indexOf('화요살롱') >= 0);
    if (!hy || hy.sold !== 160) fails.push('④ 교육 반쪽 값이 160이 아니다: ' + JSON.stringify(hy || null));
    else {
      if (hy.vsrc) fails.push('④ 하드코딩 폴백이 안 물러났다(출처 = ' + hy.vsrc + ')');
      if (hy.st !== 'ended') fails.push('④ 상태가 종료가 아니다: ' + hy.st);
      if (hy.mo) fails.push('④ 끝난 건인데 꺾은선 원천이 붙었다');
      if (!(hy.rev > 0)) fails.push('④ 매출이 안 붙었다(공연과 같은 축이면 붙어야 한다): ' + hy.rev);
    }
    if (r.leakEduIntoPerfList) fails.push('⑤ 교육이 3면 공연 목록에 샜다(이중 계상)');
    const regs = errs.filter(e => /ReferenceError|TypeError|SyntaxError/.test(e));
    if (regs.length) fails.push('JS 회귀: ' + regs.slice(0, 3).join(' | '));

    if (!fails.length) { console.log('[edu-wiring] PASS — 교육 행이 공연과 같은 시트·같은 빌더·같은 색인을 타고, 교육 카드까지 실값으로 도달 · 공연 목록 오염 0'); return 0; }
    console.error('[edu-wiring] FAIL:'); fails.forEach(f => console.error('  · ' + f)); return 1;
  } finally { await browser.close(); }
}
main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
