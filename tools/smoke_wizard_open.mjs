#!/usr/bin/env node
// [260806] 홍보 위저드 **열림** 스모크 — 「새 콘텐츠 등록이 안 먹는다」류 무반응 회귀 게이트.
//
// 왜 이 게이트가 필요한가(실사고 260805~260806):
//   260805-23 모달 머리줄 정본화(fa9c9ce)가 `#promo-wizard`의 `<h3>`를 `.mhead` 밴드로 바꿨는데,
//   제목을 넣던 JS 3곳이 계속 `document.querySelector('#promo-wizard h3')`를 짚었다. 셋 중
//   openPromoWizard의 대입만 **무방비**라 거기서 TypeError로 죽었고, 그 줄이 `.classList.add('show')`
//   **앞**이라 위저드가 통째로 안 열렸다 = 관리자 「새 콘텐츠 등록」·사용자 「홍보 신청」·배치·모바일 FAB·
//   임시저장 이어쓰기까지 **신규 등록 전 경로가 무반응**(에러 토스트조차 없음 — 앱에 전역 error 핸들러가 없다).
//   기존 게이트 전부(디자인·머리줄 정적/패리티·레이아웃·차트)가 통과했다 — 아무도 「눌러서 열리는가」를 안 물었다.
//
// 잠그는 계약 3가지:
//   ① 열림: 위저드를 여는 경로가 실제로 `.show` + Step 본문을 그린다(관리자 우클릭 · 사용자 우클릭 · 임시저장 이어쓰기).
//   ② 머리줄: 모드마다 제목이 갈아끼워진다(신청 / 임시저장 이어쓰기 / 홍보 내용 입력 n/N) = 훅(#pw-mtitle) 실존.
//   ③ 무소음 예외 0: 그 경로에서 pageerror(TypeError·ReferenceError 등)가 하나도 안 난다.
//
// ⚠ fail-soft(smoke_login·smoke_layout과 동일): playwright-core·chromium·환경 문제 = SKIP(exit 0).
//   *진짜 무반응 회귀*만 FAIL(exit 1). QA 진입로(?qa)라 실API·실데이터·PII 미접촉.
//
// 실행: node tools/smoke_wizard_open.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

// 프로그램·플랫폼 목 — 「홍보 노출 ON」 프로그램이 하나도 없으면 위저드가 열리기 전에 막히므로(=_perfReady 게이트)
//   형태만 재현해 넣는다. 값은 전부 허구(실 시트·PII 미접촉) · 날짜는 오늘 기준 상대값 = 해가 바뀌어도 안 썩는다.
const FEED = `(()=>{
  const T=new Date(); const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const off=n=>{const d=new Date(T);d.setDate(d.getDate()+n);return iso(d);};
  PERFS=[{'프로그램ID':'SW1','풀네임':'스모크 정기연주회','줄임말':'스모크공연','콘텐츠구분':'공연','장소':'대극장','구분':'클래식',
          '시작일':off(30),'종료일':off(31),'판매시작일':off(-20),'판매종료일':off(29),'홍보시작일':off(-20),'홍보노출':'Y'},
         {'프로그램ID':'SW2','풀네임':'스모크 기획전시','줄임말':'스모크전시','콘텐츠구분':'전시','장소':'7층 전시실',
          '시작일':off(-10),'종료일':off(60),'판매시작일':off(-30),'판매종료일':off(60),'홍보시작일':off(-30),'홍보노출':'Y'}].map(programToPerf);
  try{updatePerfOpen();}catch(e){}
  _perfReady=true;
  PLATFORMS=[{'플랫폼1':'카카오톡','플랫폼2':'-','플랫폼3':'카카오톡'},{'플랫폼1':'인스타그램','플랫폼2':'-','플랫폼3':'인스타그램'}];
  CONTENT_TYPES=['공연','전시','예술교육','대관','기타']; CONTENT_FORMATS=['이미지','영상','텍스트'];
  MANAGERS=[{'담당자':'스모크','담당부서':'예술사업팀','홍보여부':'Y','공연여부':'Y','전시여부':'Y','예술교육여부':'Y','대관여부':'Y','계정여부':'Y'}];
  // 사용자(비관리자) 가지는 접수 설정이 없으면 「접수가 닫혀있습니다」로 갈려 열림 검사가 통째로 건너뛰어진다
  //   → 접수 ON + 이번·다음 달 접수월 + 자동 차단 해제(요일·휴무)로 열어 둔다(전부 목값 · 실 시트 미접촉).
  APPLY_SETTINGS={접수ON:true,접수월:[iso(T).slice(0,7),off(40).slice(0,7)],자동_낮에만:false,자동_일요일:false,자동_휴무:false,이메일알림:false,AI_연일회피:false};
  try{ APPLY_EXCLUSIONS=[]; }catch(e){}
  try{ if(typeof render==='function')render(); }catch(e){}
  return PERFS.length;
})()`;

const STATE = `(()=>{const w=document.getElementById('promo-wizard');
  return {open:!!(w&&w.classList.contains('show')),
          head:((document.getElementById('pw-mtitle')||{}).textContent||'').trim(),
          body:((document.getElementById('pw-body')||{}).innerText||'').trim().length};})()`;
const RESET = `(()=>{try{closePromoWizard(true);}catch(e){try{document.getElementById('promo-wizard').classList.remove('show');}catch(_){}}})()`;

async function boot(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [], con = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  page.on('console', m => { const t = m.text(); if (t.indexOf('[전역 ') === 0) con.push(t.slice(0, 160)); });   // 전역 포착기의 기록 채널(토스트와 별개 축)
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    // 남의 오리진에서 온 스크립트(MSAL·CDN 축)를 흉내 — CORS 헤더 없이 주면 브라우저가 본문을 가려 'Script error.'만 보고한다.
    if (u.hostname === 'x-origin.local') return route.fulfill({ status: 200, contentType: 'text/javascript', body: "throw new Error('cross-origin boom');" });
    return route.abort();
  });
  await page.goto(`https://app.local/index.html?qa=${role}#cal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cell', { timeout: 20000 });
  await page.evaluate(FEED);
  await page.waitForTimeout(900);
  return { page, errs, con };
}

// 캘린더 빈 셀 우클릭 → 메뉴 항목 클릭(실제 사용자 동선 그대로 — 함수 직접 호출로는 onclick 배선 파손을 못 잡는다)
async function viaCell(page, label) {
  // 지난 날짜 셀은 사용자 메뉴가 「신청 불가」로 갈린다 → 앞날 셀을 우선(관리자도 같은 셀로 재는 게 비교에 낫다)
  const c = await page.evaluate(`(()=>{const cs=[...document.querySelectorAll('.cell:not(.nm)')];
    const free=x=>!x.querySelector('.ev');
    const e=cs.find(x=>!x.classList.contains('past')&&free(x))||cs.find(free)||cs[10]; if(!e)return null;
    const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+18)};})()`);
  if (!c) return { err: '캘린더 셀 0개 — 그리드 미렌더' };
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(350);
  const hit = await page.evaluate(`(()=>{const m=document.getElementById('cell-context-menu'); if(!m)return 'no-menu';
    const it=[...m.querySelectorAll('.ccm-item')].find(e=>${JSON.stringify(label)}.split('|').some(s=>e.textContent.indexOf(s)>=0));
    if(!it)return 'no-item:'+m.innerText.replace(/\\n/g,' '); it.click(); return 'ok';})()`);
  if (hit !== 'ok') return { err: `우클릭 메뉴에서 「${label}」 못 찾음(${hit})` };
  await page.waitForTimeout(700);
  return { st: await page.evaluate(STATE) };
}

// ④ [260806 운영자 승인 「관리자에게만 토스트」] 전역 에러 포착 실측 — 이번 사고의 **재발 시 발견 장치** 자체를 잠근다.
//   재는 것 = ⓐ진짜 스크립트 예외 → 안내 1건 ⓑ<img> 404(리소스 로드 실패) → 안내·기록 **둘 다 0건**(스크립트 예외가 아니다) ⓒ처리 안 된 Promise 거절 → 1건
//               ⓓ남의 오리진 스크립트 예외('Script error.') → 안내·기록 **둘 다 0건**(본문이 가려져 손댈 것이 없다 = 잡음).
//   ⚠ 일부러 예외를 던지므로 호출부는 「무소음 예외(pageerror)」 판정을 **끝낸 뒤에** 부른다.
//   두 채널을 따로 센다 — ⓐ**토스트**: showToast를 감싸 호출을 센다(#toast 한 칸을 재사용하는 구조라 DOM만 보면 마지막 1건밖에 못 센다) ·
//   ⓑ**콘솔 기록**: 리소스 실패는 message가 비어 토스트 경로엔 애초에 못 닿는다 = 토스트만 보면 「리소스 제외 규칙」을 지워도 검출이 안 된다(첫 판 킬테스트 실측).
//   그 규칙이 실제로 지키는 건 **기록 채널의 잡음**이므로 콘솔 줄 수로 재야 이빨이 생긴다.
async function globalErrProbe(page, con) {
  const READ = `(()=>{const n=(window.__ge||[]).length; window.__ge=[]; return n;})()`;
  const conN = () => { const n = con.length; con.length = 0; return n; };
  conN();
  await page.evaluate(`(()=>{ window.__ge=[]; if(!window.__geTapped){ window.__geTapped=1; var _o=window.showToast;
    window.showToast=function(m,t){ if(t==='error')window.__ge.push(m); return _o.apply(this,arguments); }; } })()`);
  // 실제 사고와 같은 모양 = **onclick 핸들러가 던진다**. 리스너 안에서 던진 예외는 호출부로 전파되지 않고
  //   window 에러로 보고되므로 in-page `.click()`으로 부른다(page.click은 위저드가 덮고 있으면 못 누른다).
  await page.evaluate(`(()=>{var b=document.getElementById('__ge_boom');
    if(!b){b=document.createElement('button');b.id='__ge_boom';b.onclick=function(){null.x=1;};b.style.cssText='position:fixed;left:-9999px';document.body.appendChild(b);}
    b.click();})()`);
  await page.waitForTimeout(300);
  const 실예외 = await page.evaluate(READ); conN();
  await page.evaluate(`(()=>{var i=new Image();i.src='/__ge_none__.png';document.body.appendChild(i);})()`);
  await page.waitForTimeout(450);
  const 리소스404 = await page.evaluate(READ), 리소스404기록 = conN();
  await page.evaluate(`(()=>{Promise.reject(new Error('스모크 거절'));})()`);
  await page.waitForTimeout(300);
  const 거절 = await page.evaluate(READ); conN();
  // 남의 오리진 스크립트의 예외 = 브라우저가 'Script error.'만 준다(우리 코드 아님·손댈 것 없음) → 안내·기록 둘 다 0이어야 한다.
  await page.evaluate(`(()=>new Promise(function(res){var s=document.createElement('script');s.src='https://x-origin.local/boom.js';s.onload=function(){setTimeout(res,250);};s.onerror=function(){setTimeout(res,250);};document.head.appendChild(s);}))()`);
  await page.waitForTimeout(250);
  const 남의오리진 = await page.evaluate(READ), 남의오리진기록 = conN();
  return { 실예외, 리소스404, 리소스404기록, 거절, 남의오리진, 남의오리진기록 };
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[wizard] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[wizard] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[wizard] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [];
  try {
    // ── 관리자: 셀 우클릭 → 「새 콘텐츠 등록」 ──
    const A = await boot(browser, 'admin');
    const a = await viaCell(A.page, '새 콘텐츠 등록');
    if (a.err) fails.push('관리자 새 콘텐츠 등록: ' + a.err);
    else {
      if (!a.st.open) fails.push('관리자 「새 콘텐츠 등록」 무반응 — 위저드가 안 열림(.show 미부착)');
      if (a.st.body < 10) fails.push('관리자 「새 콘텐츠 등록」 — 위저드는 떴는데 Step 본문이 비었다(#pw-body 빈칸)');
      if (a.st.head !== '홍보 신청') fails.push(`관리자 위저드 머리줄 제목 = "${a.st.head}" (기대 "홍보 신청" · #pw-mtitle 훅 확인)`);
    }

    // ── 배치(복수) 순차: 머리줄이 「홍보 내용 입력 (n/N)」으로 갈아끼워지는가 ──
    await A.page.evaluate(RESET);
    const b = await A.page.evaluate(`(()=>{ _pwBatchQueue=[{}]; _pwBatchTotal=2;
      try{ openPromoWizard(getTodayKey(),{program:PERFS[0].f,programType:PERFS[0].t,programEnd:PERFS[0].e,date:getTodayKey(),time:'10:00',plat1:'카카오톡',content:'스모크'}); }
      catch(e){ return {thrown:String(e)}; } finally { _pwBatchQueue=null; _pwBatchTotal=0; }
      const w=document.getElementById('promo-wizard');
      return {open:!!(w&&w.classList.contains('show')), head:((document.getElementById('pw-mtitle')||{}).textContent||'').trim()};})()`);
    if (b.thrown) fails.push('배치 순차 등록에서 예외: ' + b.thrown);
    else {
      if (!b.open) fails.push('배치 순차 등록 — 위저드가 안 열림');
      if (!/홍보 내용 입력 \(\d+\/\d+\)/.test(b.head)) fails.push(`배치 머리줄 제목 = "${b.head}" (기대 "홍보 내용 입력 (n/N)")`);
    }

    // ── 임시저장 이어쓰기: _pwResumeDraft가 열리고 머리줄이 바뀌는가 ──
    await A.page.evaluate(RESET);
    const d = await A.page.evaluate(`(()=>{
      const key=getTodayKey();
      const rec={_rowIndex:990001,'No':9001,'날짜':key,'프로그램':PERFS[0].f,'콘텐츠 구분':'공연','콘텐츠 제목':'스모크 임시',
        '플랫폼 1':'카카오톡','플랫폼 2':'-','콘텐츠 형식':'이미지','콘텐츠 내용':'','게시 담당자':'','진행 상태':'임시','신청자':'스모크','비고':''};
      records.push(rec);
      try{ _pwResumeDraft(990001); }catch(e){ return {thrown:String(e)}; }
      finally{ const i=records.indexOf(rec); if(i>=0)records.splice(i,1); }
      const w=document.getElementById('promo-wizard');
      return {open:!!(w&&w.classList.contains('show')), head:((document.getElementById('pw-mtitle')||{}).textContent||'').trim()};})()`);
    if (d.thrown) fails.push('임시저장 이어쓰기에서 예외: ' + d.thrown);
    else {
      if (!d.open) fails.push('임시저장 이어쓰기 — 위저드가 안 열림');
      if (d.head !== '임시저장 이어쓰기') fails.push(`임시저장 머리줄 제목 = "${d.head}" (기대 "임시저장 이어쓰기")`);
    }
    if (A.errs.length) fails.push('관리자 경로 무소음 예외: ' + A.errs.slice(0, 3).join(' | '));
    // ⚠ 아래 ④는 **일부러 예외를 던진다** → 위 「무소음 예외」 판정을 먼저 끝낸 뒤에만 돌린다(순서 고정).
    const ga = await globalErrProbe(A.page, A.con);
    if (ga.실예외 !== 1) fails.push(`전역 에러 포착(관리자): 진짜 예외에 안내 ${ga.실예외}건 (기대 1건 — head 최상단 window.onerror 배선 확인)`);
    if (ga.리소스404 !== 0) fails.push(`전역 에러 포착(관리자): <img> 404에 안내 ${ga.리소스404}건 (기대 0건 — 리소스 로드 실패는 스크립트 예외가 아니다)`);
    if (ga.리소스404기록 !== 0) fails.push(`전역 에러 포착: <img> 404가 콘솔에 ${ga.리소스404기록}건 기록됨 (기대 0건 — 리소스 로드 실패 제외 규칙 확인: e.target.nodeType===1이면 return)`);
    if (ga.거절 !== 1) fails.push(`전역 에러 포착(관리자): 처리 안 된 Promise 거절에 안내 ${ga.거절}건 (기대 1건)`);
    if (ga.남의오리진 !== 0 || ga.남의오리진기록 !== 0) fails.push(`전역 에러 포착: 남의 오리진 스크립트 예외에 안내 ${ga.남의오리진}건·기록 ${ga.남의오리진기록}건 (기대 0·0 — 'Script error.' 필터 확인: 본문이 가려져 손댈 것이 없다)`);
    await A.page.close();

    // ── 사용자: 셀 우클릭 → 「홍보 신청」(관리자와 다른 메뉴 가지 = 같은 위저드) ──
    const U = await boot(browser, '1');
    const u = await viaCell(U.page, '홍보 신청');
    // 접수 기간·제외일 설정에 따라 사용자에겐 「신청 불가」 안내만 뜨는 날이 정상적으로 있다 = 그 경우는 검사 대상 밖.
    if (u.err && /no-item/.test(u.err) && /신청 불가/.test(u.err)) console.log('[wizard] ℹ 사용자 경로 = 오늘 신청 불가일(접수 설정) — 열림 검사 생략.');
    else if (u.err) fails.push('사용자 홍보 신청: ' + u.err);
    else {
      if (!u.st.open) fails.push('사용자 「홍보 신청」 무반응 — 위저드가 안 열림');
      if (u.st.body < 10) fails.push('사용자 「홍보 신청」 — Step 본문이 비었다');
    }
    if (U.errs.length) fails.push('사용자 경로 무소음 예외: ' + U.errs.slice(0, 3).join(' | '));
    const gu = await globalErrProbe(U.page, U.con);   // 사용자 화면은 종전대로 조용해야 한다(운영자 선택 = 관리자에게만)
    const guTotal = gu.실예외 + gu.리소스404 + gu.거절 + gu.남의오리진;
    if (guTotal !== 0) fails.push(`전역 에러 포착(사용자): 일반 사용자에게 안내 ${guTotal}건 (기대 0건 — 범위는 관리자 전용)`);
    await U.page.close();

    if (!fails.length) { console.log('[wizard] PASS — 위저드 열림 계약 유지(관리자·사용자 우클릭 · 배치 · 임시저장 이어쓰기 · 머리줄 훅 · 무소음 예외 0 · 전역 에러 포착 관리자 전용).'); return 0; }
    console.error('[wizard] FAIL — 홍보 위저드 열림 계약 위반:');
    fails.forEach(f => console.error('  · ' + f));
    console.error('  기준: 여는 경로가 .show + Step 본문을 그리고, 머리줄 제목(#pw-mtitle)이 모드대로 바뀌며, pageerror 0.');
    return 1;
  } finally { await browser.close(); }
}

process.exit(await main().catch(e => { console.log('[wizard] SKIP — 하네스 오류(환경): ' + String(e).split('\n')[0]); return 0; }));
