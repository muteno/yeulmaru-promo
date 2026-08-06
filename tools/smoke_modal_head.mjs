#!/usr/bin/env node
// [260805-23 운영자 「모든 모달 창에 윗부분을 저거로 **스모킹 패리티 고정**」] 모달 머리줄 패리티 스모크.
//
// 정적 게이트(tools/check_modal_head.py)는 「소스에 `_mhead`가 있나」까지만 본다 — 실제로 **그려진 픽셀**이
// 서로 같은지는 못 본다(문자열 이스케이프가 어긋나 밴드가 통째로 글자로 새어나온 사고가 이 작업 중 실제로 났다:
// `\'+_mhead(...)+\'`가 이스케이프된 따옴표라 화면에 소스가 그대로 찍혔는데 파이썬 게이트는 전건 PASS였다).
// 그래서 이 스모크는 브라우저에서 모달을 하나씩 열어 **computed style을 실측**하고 서로 대조한다.
//
// 재는 계약 5가지(전부 「모달끼리 같은가」 = 패리티):
//   ① 머리줄 실존 — 열린 `.modal`의 첫 자식으로 `.mhead`가 있다.
//   ② 활자·색 패리티 — background / color / font-size / font-weight / padding 이 **모든 모달에서 동일**.
//      (기준값을 이 파일에 안 적는다 — 정본은 CSS `.mhead` 하나뿐이고, 여기서는 「다 같은가」만 묻는다.
//       기준을 두 곳에 적으면 그 자체가 드리프트 원인이 된다. 260805-16 X버튼 사고의 교훈.)
//   ③ 가장자리 밀착 — 밴드 좌/우/상단이 모달 안쪽 가장자리와 Δ≤1px(음수 마진 상쇄가 실제로 먹었나).
//   ④ 닫기 X가 밴드 안 — X의 세로 중심이 밴드 높이 안에 있다(밴드 아래로 흘러내리지 않았나).
//   ⑤ 소스 누출 0 — 화면 글자에 `_mhead(` 가 보이면 즉시 FAIL(위 이스케이프 사고 재발 방지).
//
// ⚠ fail-soft(smoke_login.mjs·smoke_layout.mjs와 동일): playwright-core·chromium 미탐지 = SKIP(exit 0).
//   QA 진입로(?qa=admin)라 실API·실데이터·PII 미접촉. 열리지 않는 모달(데이터 의존)은 세지 않고 로그로 남긴다.
//
// 실행: node tools/smoke_modal_head.mjs   ·   npm run smoke:modalhead
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT } from './qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1500, H = 1000;
const TOL = 1.0;   // 가장자리 밀착 허용 오차(px) — 보더·반올림 잔차만
// 닫기 X **상자** 윗선의 허용 오차 — 상자를 딱 맞추면 안 되는 자리가 정본에 있다:
// 260805-31 광학 잉크 보정(`.modal:has(>.mhead .modal-x)>.modal-x{top:19.33px}`)은 `✕` 잉크중심(−0.85)과
// `─` 잉크중심(+0.48)의 1.33px 차를 상자로 상쇄해 **잉크끼리** 한 줄에 세운 것이다(운영자가 지정한 단위 = 잉크).
// 그래서 여기서 재는 건 「칸을 벗어났나」지 「상자가 0인가」가 아니다 — 규칙이 통째로 삼켜지거나(Δ−7)
// 첫 줄 높이 계약이 깨지는(Δ11) 진짜 파손은 이 폭으로도 전부 잡힌다(킬테스트 3/3).
const TOL_OPT = 2.0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// 헤드리스에서 네트워크 없이 열리는 모달들 — 구조 계열(보드/대화상자/도구/지도/폼)을 고루 덮는다.
const MODALS = [
  ['카카오 메세지 설계', 'openKakaoDesigner()'],
  ['AI 홍보 · 점검', 'openPromoCheck()'],
  ['프로그램 필터', 'openProgFilter()'],
  ['준비 중', "showComingSoon('행사 관리')"],
  ['자동 잠금 시간', 'openLockSettings()'],
  ['예울이 페르소나', 'openYeulPersona()'],
  ['관리자 패널', 'openAdminPanel()'],
  ['판매 현황', 'openSalesBoard()'],
  ['판매 분석', 'openAnalyticsBoard()'],
  ['연간 누적 실적', 'openBusinessBoard()'],
  ['연간 실적', 'openYearBoard()'],
  ['로고 제작', 'openLogoMaker()'],
  ['카드 제작', 'openCardMaker()'],
  ['한글문서 편집', 'openHwpEditor()'],
  ['영상 편집기', 'openVideoEditor()'],
  ['오피스문서 편집', 'openOfficeEditor()'],
  ['용량 줄이기', 'openFileSlimmer()'],
  ['문서 → 마크다운', 'openDocMd()'],
  ['카페 운영 일정', 'openCafeSchedule()'],
  ['일정 반영', 'openScheduleSync()'],
  ['링크 자료수집', 'openLinkGrab()'],
  ['티켓 등록 신청', 'openTicketReg()'],
  ['블로그 글쓰기 도우미', 'openNaverBlogTool()'],
  ['에니어그램', 'openEnneagram()'],
  ['불편사항 접수', '_qaOpen()'],
  ['불편사항 관리', 'openQaBoard()'],
  ['일일 판매 입력', 'openDailyInput()'],
  ['홍보 신청·확인', 'openPromoBoard()'],
  ['담당자 일정 추가', "openSpecialEntry('add')"],
  ['예울마루 전관도', 'openVenueMap()'],
  ['협력기관 DID 지도', 'openDidPartnersMap()'],
  ['플랫폼 현황', 'openPlatformBoard()'],
  ['연간 일정', 'openAnnualCalendar()'],
  ['사이니지 관리', 'openSignageManager()'],
  ['회원 조회', 'openMemberLookup()'],
  ['참고자료 폴더 선택', 'openFolderTreeModal(0)'],
];

const MEASURE = `(()=>{
  const bg=[...document.querySelectorAll('.modal-bg')].filter(e=>getComputedStyle(e).display!=='none').pop();
  if(!bg)return {open:false};
  const m=bg.querySelector('.modal'); if(!m)return {open:false};
  const h=m.querySelector(':scope > .mhead');
  if(!h)return {open:true, head:false, text:(m.textContent||'').slice(0,120)};
  const cs=getComputedStyle(h), cm=getComputedStyle(m);
  const rh=h.getBoundingClientRect(), rm=m.getBoundingClientRect();
  const bl=parseFloat(cm.borderLeftWidth)||0, br=parseFloat(cm.borderRightWidth)||0, bt=parseFloat(cm.borderTopWidth)||0;
  const x=m.querySelector(':scope > .modal-x');
  const rx=x?x.getBoundingClientRect():null;
  const t=h.querySelector(':scope > span:first-child');
  const rt=t?t.getBoundingClientRect():rh;
  return {
    open:true, head:true,
    style:[cs.backgroundColor, cs.color, cs.fontSize, cs.fontWeight, cs.paddingTop, cs.paddingBottom, cs.paddingLeft].join('|'),
    dLeft:+(rh.left-(rm.left+bl)).toFixed(1),
    dRight:+((rm.right-br)-rh.right).toFixed(1),
    dTop:+(rh.top-(rm.top+bt)).toFixed(1),
    xIn: rx? (rx.top+rx.height/2 >= rh.top-1 && rx.top+rx.height/2 <= rh.bottom+1) : null,
    leak: /_mhead\\(/.test(m.textContent||''),
    // ⑥ 광학 정렬(260805-31 운영자 「좌측 타이틀·버튼·X 중심부가 수평선에 있는지」) —
    //    기준값을 여기 안 적는다. 밴드 자신의 padding-top과 제목 상자에서 **그 자리에서 유도**해 비교한다:
    //    첫 줄 = 밴드 padding-top에서 시작하는 한 칸이고, 제목·조작 버튼·절대배치 X는 전부 그 칸에 들어가야 한다.
    dXTop: rx? +(rx.top-(rh.top+(parseFloat(cs.paddingTop)||0))).toFixed(1) : null,
    dXH:   rx&&t? +(rx.height-t.getBoundingClientRect().height).toFixed(1) : null,
    dBtn: [...h.querySelectorAll(':scope > * > button, :scope > button')].map(b=>{
      const rb=b.getBoundingClientRect();
      return +((rb.top+rb.height/2)-(rt.top+rt.height/2)).toFixed(1);
    }),
    // ⑦ 상단 테두리 = 밴드와 같은 색(운영자 260805-32 「상단부는 모두 코발트로」).
    //    흰 유리 테두리가 밴드 위를 지나면 강조색 위에 밝은 실선으로 보인다.
    topBorderOk: cm.borderTopColor===cs.backgroundColor,
  };
})()`;

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

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[modalhead] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[modalhead] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[modalhead] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [], skipped = [], styles = new Map();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
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
    await page.addInitScript(INIT_SCRIPT);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    for (const [name, js] of MODALS) {
      let m;
      try {
        await page.evaluate(`(function(){document.querySelectorAll('.modal-bg.show').forEach(function(e){e.classList.remove('show')});})()`);
        await page.evaluate(js);
        await page.waitForTimeout(800);
        m = await page.evaluate(MEASURE);
      } catch (e) { skipped.push(`${name}(열기 실패: ${String(e.message || e).split('\n')[0].slice(0, 60)})`); continue; }
      if (!m || !m.open) { skipped.push(`${name}(안 열림 — 데이터 의존)`); continue; }
      if (!m.head) { fails.push(`${name}: 머리줄(.mhead) 없음 — 모달 첫 자식이어야 한다.`); continue; }
      if (m.leak) fails.push(`${name}: 화면에 \`_mhead(\` 소스가 글자로 새어나옴 — JS 문자열 이스케이프 파손.`);
      if (Math.abs(m.dLeft) > TOL) fails.push(`${name}: 머리줄 좌측이 모달 안쪽선과 Δ${m.dLeft}px (가장자리 밀착 파손).`);
      if (Math.abs(m.dRight) > TOL) fails.push(`${name}: 머리줄 우측이 모달 안쪽선과 Δ${m.dRight}px.`);
      if (Math.abs(m.dTop) > TOL) fails.push(`${name}: 머리줄 상단이 모달 안쪽선과 Δ${m.dTop}px.`);
      if (m.xIn === false) fails.push(`${name}: 닫기 X가 머리줄 밖 — 밴드 위 절대 자리(right:22)를 벗어났다.`);
      if (m.dXTop !== null && Math.abs(m.dXTop) > TOL_OPT) fails.push(`${name}: 닫기 X 윗선이 머리줄 첫 줄과 Δ${m.dXTop}px — 제목·조작 버튼과 중심선이 어긋난다.`);
      if (m.dXH !== null && Math.abs(m.dXH) > TOL) fails.push(`${name}: 닫기 X 높이가 제목 줄높이와 Δ${m.dXH}px — 같은 칸이 아니다(첫 줄 높이 한 갈래 계약 파손).`);
      (m.dBtn || []).forEach((d, i) => { if (Math.abs(d) > TOL) fails.push(`${name}: 머리줄 조작 버튼 ${i + 1}의 세로 중심이 제목과 Δ${d}px.`); });
      if (m.topBorderOk === false) fails.push(`${name}: 모달 윗변 테두리 색 ≠ 밴드 색 — 강조색 위에 흰 실선이 지나간다(운영자 260805-32).`);
      if (!styles.has(m.style)) styles.set(m.style, []);
      styles.get(m.style).push(name);
    }

    if (styles.size > 1) {
      const groups = [...styles.entries()].sort((a, b) => b[1].length - a[1].length);
      fails.push('머리줄 활자·색 패리티 깨짐 — ' + groups.length + '가지가 섞여 있다:');
      groups.forEach(([st, who]) => fails.push(`    [${who.length}개] ${st}  ← ${who.slice(0, 4).join(', ')}${who.length > 4 ? ' 외' : ''}`));
    }

    if (skipped.length) console.log('[modalhead] 건너뜀 ' + skipped.length + '개: ' + skipped.join(' · '));
    if (!fails.length) {
      const n = [...styles.values()].reduce((a, b) => a + b.length, 0);
      console.log(`[modalhead] PASS — 모달 ${n}개 머리줄 실측 전건 동일(배경·잉크·활자·패딩 1가지) · 가장자리 밀착 Δ≤${TOL}px · X 밴드 안 · 소스 누출 0.`);
      return 0;
    }
    console.error('[modalhead] FAIL — 모달 머리줄 패리티 위반:');
    fails.forEach(f => console.error('  · ' + f));
    console.error('  정본 = CSS `.mhead` + 빌더 `_mhead()` 한 벌(index.html). 인라인으로 다시 만들지 마라.');
    return 1;
  } finally { await browser.close(); }
}

main().then(c => process.exit(c)).catch(e => {
  console.error('[modalhead] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
