#!/usr/bin/env node
// [260805-24] 정본 컴포넌트 **패리티 실측 스모크(래칫)** — 260805-23 모달 머리줄 스모크가 쓴 방법을
// 기틀 §2 정본 컴포넌트 전체로 복제한 것.
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────────
// 이 레포의 게이트는 지금까지 전부 **소스 축**이었다: check_design은 「raw hex가 늘었나」,
// check_modal_head는 「소스에 _mhead가 있나」. 그런데 260805-23에 **소스는 전건 PASS인데 화면엔
// 소스가 글자로 찍힌** 사고가 실제로 났다(따옴표 이스케이프). 「소스에 있다」와 「그려졌다」는 다른 축이다.
// 그 사고를 잡은 게 브라우저 실측 스모크였고, 이 파일은 그 방법을 컴포넌트 전체로 넓힌다.
//
// ── 무엇을 재나 ────────────────────────────────────────────────────────────────
// 계약 한 줄: **「클래스가 같으면 픽셀도 같아야 한다」.**
//   같은 정본 컴포넌트(같은 클래스 조합 · 같은 부모 문맥 · 같은 상태)가 자리마다 다르게 그려진다면
//   누군가 그 자리에서 손으로 다시 튜닝한 것 = 드리프트. 기준값을 이 파일에 **안 적는다** —
//   정본은 CSS 하나뿐이고 스모크는 「서로 같은가」만 묻는다(기준 이중 기재가 곧 드리프트 원인).
//
// 키 = (자기 클래스 정렬) [readonly/disabled/태그]
//   · readonly/disabled를 넣는 이유 = 클래스가 아니라 **속성**으로 갈리는 정본 상태(입력칸 읽기전용 등).
//   ⚠ 부모 문맥은 **일부러 키에 안 넣는다**(260805-24 킬테스트로 확인): 부모를 넣으면
//     `.modal-acts > .m-btn.save`가 `.m-btn.save`와 다른 키로 쪼개져, 그 자리만 인라인으로 다시 튜닝해도
//     「그 키의 유일한 인스턴스」라 갈래가 1로 남아 **드리프트를 통째로 못 잡았다**. 문맥을 빼면
//     `.mhead .sub`처럼 자손 선택자로 갈리는 것들이 갈래로 잡히는데, 그건 **맨 `.sub`이 여러 뜻으로
//     과적재됐다는 사실 자체가 findings**라 baseline에 남겨 두고 운영자 판단으로 넘긴다(놓치는 것보다 낫다).
// 신호 = color · background · border(폭/스타일/색) · border-radius · font-size/weight · padding · box-shadow
//   (폭·높이 같은 내용 의존 기하는 뺀다 — 그건 컴포넌트 정체성이 아니다.)
//
// ── 판정: 래칫(「지금보다 나빠지지만 마라」 = check_design ①~⑥과 같은 축) ──────────────
//   baseline(`tools/component_parity_baseline.json` · **기계산출물, 손편집 금지**)에 적힌 갈래 수보다
//   늘면 FAIL. 새 컴포넌트가 처음부터 갈려 있어도 FAIL. 줄면 PASS + 「baseline 하향 권장」 안내.
//   ⚠ baseline에 남은 갈래 = **이미 있는 부채**이지 승인된 정본이 아니다. 어느 쪽으로 통일할지는
//   값 선택이라 세션이 임의로 못 정한다(기틀 규칙 3) → 목록·후보는 `docs/reports/260805_컴포넌트_패리티_실측.md`,
//   결정은 운영자.
//
// ⚠ fail-soft: playwright-core·chromium 미탐지 = SKIP(exit 0). QA 진입로(?qa=admin) = 실API·PII 미접촉.
//
// 실행: node tools/smoke_component_parity.mjs        (검사)
//       node tools/smoke_component_parity.mjs --update (baseline 재생성 — 운영자 승인분 반영용)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT } from './qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'tools', 'component_parity_baseline.json');
const UPDATE = process.argv.includes('--update');
const W = 1500, H = 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// 기틀 §2 정본 컴포넌트 15종의 클래스 + 앱에서 그만큼 반복되는 준정본(m-btn·prog-tab·admin-item·ana-chip).
// ⚠ 이 목록은 **기틀 §2 표가 정본**이다 — 표에 컴포넌트가 늘면 여기도 같이 늘린다.
const ROOTS = ['btn', 'u-backdrop', 'u-pop', 'u-surface', 'u-empty', 'sw', 'sw-k', 'ry-live-tg',
  'icon-btn', 'toast', 'chip', 'chips', 'chip-dot', 'chip-count', 'chip-label',
  'modal-acts', 'modal-x', 'mhead', 'sub',
  'nb-btn', 'nb-chip', 'nb-input', 'nb-field', 'nb-label', 'nb-col', 'nb-flow',
  'cell', 'cell-corner', 'sub-pop', 'cb-fab', 'cb-hdr', 'cb-body', 'cb-chip', 'qa-fab',
  'pm-fbtn', 'ol-dots', 'iobtn', 'iowrap', 'm-btn', 'prog-tab', 'ana-chip', 'admin-item'];

// 화면 상태를 넓히는 진입로 — 열리는 것만 센다(데이터 의존으로 안 열리면 조용히 건너뛴다).
const OPENERS = ['openKakaoDesigner()', 'openPromoCheck()', 'openProgFilter()', "showComingSoon('행사 관리')",
  'openLockSettings()', 'openYeulPersona()', 'openAdminPanel()', 'openSalesBoard()', 'openAnalyticsBoard()',
  'openBusinessBoard()', 'openYearBoard()', 'openLogoMaker()', 'openCardMaker()', 'openHwpEditor()',
  'openVideoEditor()', 'openOfficeEditor()', 'openFileSlimmer()', 'openDocMd()', 'openCafeSchedule()',
  'openScheduleSync()', 'openLinkGrab()', 'openTicketReg()', 'openNaverBlogTool()', '_qaOpen()', 'openQaBoard()',
  'openDailyInput()', 'openPromoBoard()', "openSpecialEntry('add')", 'openVenueMap()', 'openDidPartnersMap()',
  'openPlatformBoard()', 'openAnnualCalendar()', 'openSignageManager()', 'openMemberLookup()', 'openFolderTreeModal(0)'];

const SWEEP = `(roots=>{
  const P=['color','backgroundColor','backgroundImage','borderTopWidth','borderTopStyle','borderTopColor',
           'borderBottomColor','borderRadius','fontSize','fontWeight','paddingTop','paddingRight',
           'paddingBottom','paddingLeft','boxShadow'];
  const out={};
  document.querySelectorAll('*').forEach(e=>{
    if(!e.classList||!e.classList.length)return;
    const cls=[...e.classList];
    if(!cls.some(c=>roots.includes(c)))return;
    const cs=getComputedStyle(e);
    if(cs.display==='none'||cs.visibility==='hidden')return;
    const st=[e.hasAttribute('readonly')?'ro':'',e.hasAttribute('disabled')?'dis':'',e.tagName].filter(Boolean).join(',');
    const key=cls.slice().sort().join('.')+' ['+st+']';
    const sig=P.map(p=>cs[p]).join('|');
    out[key]=out[key]||{};
    out[key][sig]=out[key][sig]||{n:0,who:[]};
    out[key][sig].n++;
    const t=(e.textContent||'').trim().slice(0,24);
    if(out[key][sig].who.length<3&&t&&!out[key][sig].who.includes(t))out[key][sig].who.push(t);
  });
  return out;
})(${JSON.stringify(ROOTS)})`;

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
  catch { console.log('[parity] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[parity] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[parity] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const agg = {};
  const merge = o => {
    for (const k of Object.keys(o)) {
      agg[k] = agg[k] || {};
      for (const s of Object.keys(o[k])) {
        agg[k][s] = agg[k][s] || { n: 0, who: [] };
        agg[k][s].n += o[k][s].n;
        for (const w of o[k][s].who) if (agg[k][s].who.length < 3 && !agg[k][s].who.includes(w)) agg[k][s].who.push(w);
      }
    }
  };
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
    merge(await page.evaluate(SWEEP));
    for (const js of OPENERS) {
      try {
        await page.evaluate(`(function(){document.querySelectorAll('.modal-bg.show').forEach(function(e){e.classList.remove('show')});})()`);
        await page.evaluate(js);
        await page.waitForTimeout(700);
        merge(await page.evaluate(SWEEP));
      } catch { /* 데이터 의존 = 건너뜀 */ }
    }
  } finally { await browser.close(); }

  const now = {};
  for (const k of Object.keys(agg)) now[k] = Object.keys(agg[k]).length;
  const split = Object.keys(now).filter(k => now[k] > 1).sort();

  if (UPDATE) {
    const out = {};
    for (const k of split) out[k] = now[k];
    writeFileSync(BASE, JSON.stringify({
      _주의: '기계산출물 — 손편집 금지. node tools/smoke_component_parity.mjs --update 로만 갱신한다.',
      _뜻: '정본 컴포넌트가 자리마다 다르게 그려지는 「갈래 수」의 래칫 기준. 남아 있는 값 = 승인된 정본이 아니라 이미 있는 부채(결정 = 운영자).',
      _생성: 'tools/smoke_component_parity.mjs',
      갈래: out,
    }, null, 1) + '\n', 'utf8');
    console.log(`[parity] baseline 재생성 — 갈린 컴포넌트 ${split.length}종 기록(${BASE}).`);
    return 0;
  }

  let base = {};
  try { base = (JSON.parse(readFileSync(BASE, 'utf8')) || {}).갈래 || {}; }
  catch { console.log('[parity] SKIP — baseline 없음. `node tools/smoke_component_parity.mjs --update`로 먼저 만든다.'); return 0; }

  const fails = [], infos = [];
  for (const k of split) {
    const b = base[k];
    if (b === undefined) fails.push(`신규 드리프트 — .${k}가 ${now[k]}가지로 갈렸다(baseline 미등재).`);
    else if (now[k] > b) fails.push(`드리프트 증가 — .${k} ${b} → ${now[k]}가지.`);
    else if (now[k] < b) infos.push(`.${k} ${b} → ${now[k]}가지 (청산 성과 · baseline 하향 갱신 권장)`);
  }
  for (const k of Object.keys(base)) if (!(k in now)) infos.push(`.${k} = 이번 실측에 안 나타남(그 화면이 안 열렸을 수 있다 · 판정 제외)`);

  if (fails.length) {
    console.error(`[parity] FAIL — 정본 컴포넌트 패리티 악화 ${fails.length}건:`);
    for (const f of fails) {
      console.error('  · ' + f);
      const key = Object.keys(agg).find(k => f.includes(k));
      if (key) Object.entries(agg[key]).sort((a, b) => b[1].n - a[1].n).slice(0, 4)
        .forEach(([s, d]) => console.error(`      [${d.n}] ${s.slice(0, 130)}  ← ${d.who.join(' / ')}`));
    }
    console.error('  계약 = 「클래스가 같으면 픽셀도 같아야 한다」. 그 자리에서 인라인으로 다시 튜닝하지 말고 정본 CSS를 고쳐라.');
    console.error('  값을 새로 정해야 하면 운영자에게 물어라(기틀 규칙 3 · 임의 창작 금지).');
    return 1;
  }
  infos.forEach(i => console.log('  ℹ ' + i));
  console.log(`[parity] PASS — 정본 클래스 조합 ${Object.keys(now).length}종 실측 · 갈린 것 ${split.length}종(baseline 이내 · 증가 0).`);
  return 0;
}

main().then(c => process.exit(c)).catch(e => {
  console.error('[parity] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
