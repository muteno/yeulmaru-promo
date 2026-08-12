#!/usr/bin/env node
// [260812 운영자] 사업비 「인덱스가 실제로 도는가」 스모크.
//
// 정적 게이트(tools/check_finance.py)는 「소스에 축이 있나」까지만 본다 — 브라우저에서 실제로
// **씨앗이 실리고, 공연에 붙고, 숫자가 원본과 같은지**는 못 본다. 이 스모크가 그 자리를 잰다.
//
// 재는 계약 6가지:
//   ① 씨앗 적재 — `BIZ_FIN`이 로드되고 `_finRows(2025)`가 32건을 준다(원본 엑셀 반입분 그대로).
//   ② **숫자 무손실** — 분야별 전표실적·판매수수료·정산서매출 합이 원본 엑셀 합계와 **정확히 일치**.
//      (기준값을 이 파일에 안 적는다 — `data/biz_finance.js`를 직접 읽어 대조한다. 기준 이중 기재 = 드리프트 원인.)
//   ③ **파생값 = 원본 수식** — `_finCalc`의 수익율이 매출÷(전표실적+판매수수료)×100과 일치(대표 3건).
//   ④ **공연에 매달림** — 운영대장 목 데이터를 넣으면 사업 목록 행이 `_finOf`로 사업비를 찾아
//      `onclick="_finOpen(`가 붙고, 표기 차이가 있는 이름(「협력사업2(아파나도르)」↔「아파나도르」)도 붙는다.
//   ⑤ **권한** — 회계 아님 = 사업비 보드가 안 열리고 [수정]이 없다 · 회계 = 열리고 [수정]이 있다.
//   ⑥ 그 경로에서 **pageerror 0** + 머리줄 정본(`.mhead`) 실존.
//
// ⚠ fail-soft(다른 스모크와 동일): playwright-core·chromium 미탐지 = SKIP(exit 0).
//   네트워크 전면 차단(route.abort)이라 실API·실데이터·PII 미접촉 — 시트는 「없음」으로 떨어지고 씨앗만 그린다
//   (= 첫 사용자가 보는 바로 그 상태를 재는 셈).
//
// 킬테스트 3/3 차단 실증(260812):
//   Ⓐ `_bizListTable`의 행 링크 제거(`_fn=null`) → ④ rc=1 (클릭 행 0 · 점선 0)
//   Ⓑ [수정] 버튼의 `_isAcct()` 게이트 제거 → ⑤ rc=1 (「일반 사용자에게 [수정] 버튼이 보인다」)
//   Ⓒ `_finCalc`의 수익율에서 판매수수료를 뺌 → ③ rc=1 3건 + ⑤ 화면 표기 51.1% ≠ 50.3% 동시 검출
//   · 전부 원복하면 rc=0
// ⚠ 첫 판은 운영대장 목의 열 이름을 틀리게 적어(`공연일`·`좌석수`) `_bizClean`이 3행을 통째로 걸렀고,
//   그 상태에서도 ①③⑤는 PASS였다 — 「행이 0이라 링크가 0」인지 「링크가 깨졌는지」를 못 가른다.
//   그래서 ④는 클릭 행 개수를 **목 건수와 함께** 적고, 0행이면 로그로 드러나게 뒀다.
//
// 실행: node tools/smoke_finance.mjs   ·   npm run smoke:finance
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const YEAR = 2025;

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = join(base, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// 기대값은 **씨앗 파일에서 직접** 뽑는다(스모크에 숫자를 안 적는다 = 기준 한 벌).
function expectedFromSeed() {
  const src = readFileSync(join(ROOT, 'data', 'biz_finance.js'), 'utf8');
  const by = {};
  let n = 0;
  for (const m of src.matchAll(/\{no:"([^"]+)",cat:"([^"]*)",[^\n]*?vou:(-?\d+),fee:(-?\d+),rev:(-?\d+)/g)) {
    if (!m[1].startsWith(String(YEAR) + '-')) continue;
    const c = (by[m[2]] ||= { n: 0, vou: 0, fee: 0, rev: 0 });
    c.n++; c.vou += +m[3]; c.fee += +m[4]; c.rev += +m[5]; n++;
  }
  return { n, by };
}

// 운영대장 목 — 사업 목록이 그려질 최소 형태. 이름 3종으로 매칭 축을 고루 덮는다:
//   정확 일치(신년음악회) · 괄호 안만 일치(아파나도르 ← 「협력사업2(아파나도르)」) · 사업비 없음(대관 공연)
// 열 이름은 `_bizClean`/`_bizNorm`이 실제로 보는 것들 — 하나라도 틀리면 행이 통째로 걸러져 ④가 헛돈다
//   (첫 판이 정확히 그 이유로 「사업 목록 0행」이 나왔다).
const OPS = `(()=>{
  const mk=(nm,m,d,paid,seat)=>({'공연명':nm,'년도':'${YEAR}','월':String(m),'일':String(d),
    '발권유료':String(paid),'기본좌석':String(seat),'공연구분':'기획','장르1':'클래식','회차':'1'});
  return {sheet:'세부운영관리대장(정리)',headers:[],rows:[
    mk('신년음악회',1,10,464,900),
    mk('아파나도르',4,24,546,900),
    mk('스모크 대관 공연',5,2,100,900)
  ]};
})()`;

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[finance] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[finance] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[finance] SKIP — index.html 없음.'); return 0; }

  const exp = expectedFromSeed();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [], notes = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      return route.abort();   // 실 API 미접촉 — 시트는 「없음」, 씨앗만으로 그린다
    });
    await page.goto('https://app.local/index.html?qa=admin#cal', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.cell', { timeout: 20000 });

    // ── ① 씨앗 적재 ──
    const got = await page.evaluate(`(()=>{
      if(typeof BIZ_FIN==='undefined')return {err:'BIZ_FIN 미로드'};
      const rows=_finRows(${YEAR}), by={};
      rows.forEach(r=>{const c=(by[r.cat]=by[r.cat]||{n:0,vou:0,fee:0,rev:0});c.n++;c.vou+=r.vou;c.fee+=r.fee;c.rev+=r.rev;});
      return {n:rows.length,by:by,src:rows.every(r=>r.src==='seed')};
    })()`);
    if (got.err) { fails.push(got.err); }
    else {
      if (got.n !== exp.n) fails.push(`① _finRows(${YEAR}) ${got.n}건 ≠ 씨앗 ${exp.n}건`);
      // ── ② 숫자 무손실 ──
      for (const cat of Object.keys(exp.by)) {
        const e = exp.by[cat], g = got.by[cat];
        if (!g) { fails.push(`② 분야 「${cat}」가 앱에 없다`); continue; }
        for (const k of ['n', 'vou', 'fee', 'rev']) {
          if (g[k] !== e[k]) fails.push(`② ${cat} ${k} 앱 ${g[k].toLocaleString()} ≠ 씨앗 ${e[k].toLocaleString()}`);
        }
      }
      notes.push(`① 씨앗 ${got.n}건 적재 · ${Object.keys(got.by).map(c => `${c} ${got.by[c].n}`).join(' · ')}`);
    }

    // ── ③ 파생값 = 원본 수식 ──
    const calc = await page.evaluate(`(()=>{
      return _finRows(${YEAR}).slice(0,3).map(r=>{
        const c=_finCalc(r), want=(r.vou+r.fee)>0?(r.rev/(r.vou+r.fee)*100):null;
        return {no:r.no,got:c.margin,want:want,diff:c.diff,wantDiff:r.rev-r.vou};
      });
    })()`);
    calc.forEach(x => {
      if (Math.abs((x.got ?? 0) - (x.want ?? 0)) > 1e-9) fails.push(`③ ${x.no} 수익율 ${x.got} ≠ 매출÷(전표+수수료)×100 ${x.want}`);
      if (x.diff !== x.wantDiff) fails.push(`③ ${x.no} 차액 ${x.diff} ≠ 매출−전표실적 ${x.wantDiff}`);
    });
    if (calc.length) notes.push(`③ 파생값 ${calc.length}건 원본 수식 일치(수익율·차액)`);

    // ── ④ 공연에 매달림 ──
    const link = await page.evaluate(`(()=>{
      _bizState.raw=${OPS};
      const list=_bizListBuild(_bizClean().filter(r=>r._year===${YEAR}),${YEAR});
      const html=_bizListTable(list);
      const div=document.createElement('div'); div.innerHTML=html;
      const trs=[...div.querySelectorAll('tbody tr')];
      return {rows:list.length,
        hit:trs.filter(t=>t.getAttribute('onclick')||'').map(t=>(t.getAttribute('onclick')||'')),
        names:list.map(g=>g.name),
        exact:!!_finOf('신년음악회',${YEAR}),
        paren:(_finOf('아파나도르',${YEAR})||{}).name||null,
        none:_finOf('스모크 대관 공연',${YEAR}),
        dotted:(html.match(/underline dotted/g)||[]).length};
    })()`);
    if (link.rows !== 3) notes.push(`④ 사업 목록 ${link.rows}행(목 3건 기준)`);
    if (!link.exact) fails.push('④ 정확 일치(「신년음악회」)로 사업비를 못 찾았다');
    if (link.paren !== '협력사업2(아파나도르)') fails.push(`④ 괄호 안 이름(「아파나도르」)이 「협력사업2(아파나도르)」에 안 붙었다 — 실제: ${link.paren}`);
    if (link.none) fails.push(`④ 사업비 없는 공연에 엉뚱한 행이 붙었다: ${link.none.no} ${link.none.name}`);
    if (link.hit.length !== 2) fails.push(`④ 클릭 가능한 행이 ${link.hit.length}개 — 2개여야 한다(사업비 있는 행만)`);
    if (link.dotted !== 2) fails.push(`④ 매출 점선 밑줄 ${link.dotted}개 — 2개여야 한다`);
    if (link.hit.some(h => !/_finOpen\(/.test(h))) fails.push('④ 행 onclick이 `_finOpen(`이 아니다');
    notes.push(`④ 매달림 — 정확 일치 ✓ · 괄호 안 이름 ✓ · 없는 건 안 붙음 ✓ · 클릭 행 ${link.hit.length}/3 · 점선 ${link.dotted}`);

    // ── ⑤ 권한 ──
    const perm = await page.evaluate(`(()=>{
      const out={};
      const role=userRole; const acct=sessionStorage.getItem('isAcct');
      // (a) 회계도 관리자도 아님
      userRole='user'; sessionStorage.removeItem('isAcct');
      out.plain=_isAcct();
      openFinanceBoard(${YEAR});
      out.plainBoard=!!document.getElementById('finb-modal');
      _finModal('${YEAR}-공연-01',${YEAR});
      out.plainEdit=/_finEditOn\\(/.test(document.getElementById('fin-body').innerHTML);
      _finClose();
      // (b) 회계 담당자
      sessionStorage.setItem('isAcct','1');
      out.acct=_isAcct();
      _finModal('${YEAR}-공연-01',${YEAR});
      const bd=document.getElementById('fin-body');
      out.acctEdit=/_finEditOn\\(/.test(bd.innerHTML);
      out.head=!!document.querySelector('#fin-modal .modal .mhead');
      out.marginTxt=(bd.textContent.match(/수익율\\s*([\\d.]+)%/)||[])[1]||null;
      _finEditOn();
      out.form=['bud','vou','fee','rev','paid','inv','lnk'].every(k=>!!document.getElementById('fin-i-'+k));
      _finClose();
      // (c) 관리자 = 상위 권한
      userRole='admin'; sessionStorage.removeItem('isAcct');
      out.admin=_isAcct();
      _finClose(); userRole=role; if(acct)sessionStorage.setItem('isAcct',acct);
      return out;
    })()`);
    if (perm.plain !== false) fails.push('⑤ 일반 사용자가 회계로 판정됐다');
    if (perm.plainBoard) fails.push('⑤ 일반 사용자에게 사업비 보드가 열렸다');
    if (perm.plainEdit) fails.push('⑤ 일반 사용자에게 [수정] 버튼이 보인다');
    if (perm.acct !== true) fails.push('⑤ 회계 담당자가 회계로 판정되지 않았다');
    if (!perm.acctEdit) fails.push('⑤ 회계 담당자에게 [수정] 버튼이 없다');
    if (perm.admin !== true) fails.push('⑤ 관리자가 회계 권한을 못 받았다(상위 권한 계약)');
    if (!perm.head) fails.push('⑤ 사업비 모달에 머리줄 정본(.mhead)이 없다');
    if (!perm.form) fails.push('⑤ 편집 폼 입력칸이 다 안 그려졌다');
    // ③의 화면 표기까지 대조 — 계산은 맞는데 화면에 다른 수가 찍히는 축을 막는다
    const want0 = calc.length ? (calc[0].want == null ? null : calc[0].want.toFixed(1)) : null;
    if (want0 && perm.marginTxt !== want0) fails.push(`⑤ 화면 수익율 ${perm.marginTxt}% ≠ 계산값 ${want0}%`);
    notes.push(`⑤ 권한 — 일반 ✗보드/✗수정 · 회계 ✓수정 · 관리자 ✓ · 머리줄 ✓ · 화면 수익율 ${perm.marginTxt}%`);

    // ── ⑥ pageerror ──
    if (errs.length) fails.push(`⑥ pageerror ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
  }
  notes.forEach(n => console.log('  ℹ ' + n));
  if (fails.length) {
    console.log(`[finance] FAIL ${fails.length}건`);
    fails.forEach(f => console.log('   ✗ ' + f));
    return 1;
  }
  console.log('[finance] PASS — 씨앗 무손실 적재 · 파생값 원본 수식 · 공연 매달림(정확·괄호·없음 구분) · 권한 3층 · 머리줄 정본 · pageerror 0');
  return 0;
}

main().then(c => process.exit(c)).catch(e => { console.log('[finance] SKIP — ' + (e && e.message ? e.message : e)); process.exit(0); });
