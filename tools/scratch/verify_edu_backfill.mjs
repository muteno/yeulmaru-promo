#!/usr/bin/env node
// [260805] 「일일 판매 입력」 모달이 **끝난 예술교육(소급)**을 목록에 올리는지 실측 — shot_exmonthly 하네스 계승.
// 실행: node tools/scratch/verify_edu_backfill.mjs [서빙할 index.html]
//
// 재현 대상 = 운영자가 가리킨 그 건: 「2026 화요살롱 - 이낙준(6월)」 · 예술교육 · 판매 6/2~6/30 · 종료 6/30(오늘 8/5 기준 종료).
// 잠그는 계약 4가지:
//   ① 끝난 예술교육이 `_dailyMasters()`에 뜬다(back = 종료일)
//   ② 끝난 **공연**은 종전대로 안 뜬다(회귀 0 — 끝난 공연이 목록에 쏟아지면 안 된다)
//   ③ 폼 select의 보이는 글자에 `· 종료(소급)` 꼬리표가 붙고, **value는 공연명 그대로**(저장 값 무변)
//   ④ 소급 안내줄에 그 프로그램의 종료일이 적힌다
//   ⑤ 그 값이 일일입력에 들어가면 하드코딩 폴백(_BIZ_EDU_SOLD 160)이 **자동 은퇴**한다
//     — 끝난 건이라 선이 아니라 막대(= _mo 없음)로 서고, 값 출처 꼬리표(_vsrc)가 사라진다
//   ⑥ 운영대장에 **사업구분 「기타」**로 적힌 교육 행도 읽힌다(거울 실측 = 이 계열의 관행 표기) ·
//     단 **프로그램 시트에 예술교육으로 있는 이름일 때만** — 이름 밖 「기타」는 안 읽는다(의미 창작 0)
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

// 프로그램 시트 목 = 운영자가 가리킨 실건 형태(예술교육·종료) + 대조군 2종(판매중 교육 · 끝난 공연).
const OVERRIDE = `(function(){
  window.__MOCK_PROGRAMS={programs:[
    {'프로그램ID':'260630_01','풀네임':'2026 화요살롱 - 이낙준(6월)','줄임말':'화요살롱','콘텐츠구분':'예술교육',
     '판매시작일':'2026-06-02','판매종료일':'2026-06-30','시작일':'2026-06-30','종료일':'2026-06-30','장소':'소극장','구분':'망마 기획전','장르':'인문학'},
    {'프로그램ID':'QEDU_LIVE','풀네임':'토요 가족 워크숍','줄임말':'가족워크숍','콘텐츠구분':'예술교육',
     '판매시작일':'2026-05-01','판매종료일':'2026-10-25','시작일':'2026-06-06','종료일':'2026-10-31'},
    {'프로그램ID':'QPF_DONE','풀네임':'2026 봄 실내악','줄임말':'봄 실내악','콘텐츠구분':'공연',
     '판매시작일':'2026-02-01','판매종료일':'2026-03-05','시작일':'2026-03-05','종료일':'2026-03-05','장소':'대극장','구분':'클래식'}
  ]};
})();`;

const PROBE = `(()=>{
  // 모달이 읽는 그릇에 프로그램 시트를 직접 넣는다(openDailyInput의 로드 단계와 같은 자리).
  _dailyState.programs = window.__MOCK_PROGRAMS.programs;
  _dailyState.master   = {rows:[],headers:[]};                       // 공연마스터 미등록 = 프로그램 폴백 경로
  const ms = _dailyMasters();
  const out = { list: ms.map(m=>({name:m.name, cat:m.cat, back:m.back||null})) };
  // 폼 select 실렌더 — 보이는 글자 vs value
  const host = document.createElement('div'); host.id='daily-body'; document.body.appendChild(host);
  host.innerHTML = _dailyRowHtml(null, null);
  out.options = [...host.querySelectorAll('select.d-perf option')].map(o=>({value:o.value, text:o.textContent}));
  host.remove();
  return out;
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
    await page.waitForTimeout(600);

    const r = await page.evaluate(PROBE);
    console.log(JSON.stringify(r, null, 1));

    // 실모달 캡처 — 3번째 인자로 출력 png 경로를 주면 「일일 판매 입력」 모달을 그대로 찍는다.
    if (process.argv[3]) {
      await page.evaluate(`(()=>{ _dailyState.exMaster={rows:[],headers:[]}; _dailyState.exDaily={rows:[],headers:[]}; openDailyInput('bizmenu'); })()`);
      await page.waitForTimeout(1200);
      const m = await page.$('#daily-input .modal');
      if (m) await m.screenshot({ path: process.argv[3] });
      console.log('shot → ' + process.argv[3]);
    }

    // ⑤ 저장 뒤 상태 재현 — 일일입력에 그 건 행을 넣고 폴백이 은퇴하는지 본다(값 = 운영자가 말한 160).
    const after = await page.evaluate(`(()=>{
      _salesState.master={rows:[{'ID':'260630_01','사업명':'2026 화요살롱 - 이낙준(6월)','상태':'종료','티켓오픈일':'2026-06-02','시작일':'2026-06-30','종료일':'2026-06-30','기준석':302,'총회차':1,'총오픈석':302,'목표점유율':50}],headers:[]};
      _salesState.daily ={rows:[{'공연ID':'260630_01','공연명':'2026 화요살롱 - 이낙준(6월)','기준일자':20260630,'합계좌석':160,'합계금액':1600000,'전일대비(석)':0}],headers:[]};
      _salesState.rounds=_salesState.rounds||{rows:[],headers:[]}; _salesState.group=_salesState.group||{rows:[],headers:[]};
      return (_bizEduMonthRows(2026)||[]).map(g=>({n:g.name,st:g._st,sold:g._sold,vsrc:g._vsrc||'',mo:g._mo||null}));
    })()`);
    console.log('after-save: ' + JSON.stringify(after));

    // ⑥ 운영대장 「기타」 표기 경로 — 이름 매칭분만 교육으로 읽히는지 / 무관한 기타는 안 읽히는지.
    const etc = await page.evaluate(`(()=>{
      _salesState.master={rows:[],headers:[]}; _salesState.daily={rows:[],headers:[]};   // 판매 축 비우고 대장만으로 판정
      _bizState.raw={headers:[],rows:[
        {'상태':'','사업구분':'기타','티켓구분':'유료','기본좌석':302,'발권유료':160,'년도':2026,'월':6,'일':30,'공연구분':'기획','장르1':'인문학','공연명':'2026 화요살롱 - 이낙준(6월)','수익성':''},
        {'상태':'','사업구분':'기타','티켓구분':'유료','기본좌석':302,'발권유료':999,'년도':2026,'월':7,'일':1,'공연구분':'기획','장르1':'','공연명':'무관한 기타 행사','수익성':''}
      ]};
      const rows=(_bizEduMonthRows(2026)||[]).map(g=>({n:g.name,sold:g._sold,vsrc:g._vsrc||''}));
      return {rows:rows, names:rows.map(g=>g.n)};
    })()`);
    console.log('etc-path: ' + JSON.stringify(etc));

    const fails = [];
    const hy = after.find(g => g.n.indexOf('화요살롱') >= 0);
    if (!hy) fails.push('⑤ 저장 뒤 교육 목록에 그 건이 없다');
    else {
      if (hy.sold !== 160) fails.push('⑤ 수강생이 160이 아니다: ' + hy.sold);
      if (hy.vsrc) fails.push('⑤ 하드코딩 폴백이 은퇴하지 않았다(출처 꼬리표 = ' + hy.vsrc + ')');
      if (hy.mo) fails.push('⑤ 끝난 건인데 꺾은선 원천(_mo)이 붙었다');
    }
    const 화요 = r.list.find(m => m.name.indexOf('화요살롱') >= 0);
    if (!화요) fails.push('① 끝난 예술교육(화요살롱)이 목록에 없다');
    else if (화요.back !== '2026-06-30') fails.push('① back(종료일) 표식이 없다/틀렸다: ' + 화요.back);
    if (!r.list.some(m => m.name === '토요 가족 워크숍')) fails.push('판매중 예술교육이 사라졌다(회귀)');
    if (r.list.some(m => m.name === '2026 봄 실내악')) fails.push('② 끝난 공연이 목록에 올라왔다(회귀)');
    const opt = r.options.find(o => o.value.indexOf('화요살롱') >= 0);
    if (!opt) fails.push('③ select에 그 건이 없다');
    else {
      if (opt.text.indexOf('· 종료(소급)') < 0) fails.push('③ 꼬리표 「· 종료(소급)」가 없다');
      if (opt.value !== '2026 화요살롱 - 이낙준(6월)') fails.push('③ value가 공연명이 아니다(저장 값 오염): ' + opt.value);
    }
    const hy2 = etc.rows.find(g => g.n.indexOf('화요살롱') >= 0);
    if (!hy2 || hy2.sold !== 160) fails.push('⑥ 대장 「기타」 표기 교육이 안 읽힌다: ' + JSON.stringify(hy2 || null));
    else if (hy2.vsrc) fails.push('⑥ 대장 실값인데 폴백 꼬리표가 남았다: ' + hy2.vsrc);
    if (etc.names.some(n => n.indexOf('무관한 기타') >= 0)) fails.push('⑥ 이름 밖 「기타」가 교육으로 새어 들어왔다');

    const regs = errs.filter(e => /ReferenceError|TypeError|SyntaxError/.test(e));
    if (regs.length) fails.push('JS 회귀: ' + regs.slice(0, 3).join(' | '));

    if (!fails.length) { console.log('[edu-backfill] PASS — 끝난 예술교육만 소급 목록에 · 끝난 공연 무변 · 꼬리표는 글자만 · pageerror 0'); return 0; }
    console.error('[edu-backfill] FAIL:'); fails.forEach(f => console.error('  · ' + f)); return 1;
  } finally { await browser.close(); }
}
main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
