#!/usr/bin/env node
// [260802f 운영자 「항상 '후'와 같게 고정할 방법」] 대시보드 책(1·3·4면) **레이아웃 계약 스모크 게이트**.
// 이젤(유리 블러 박스)과 그 안 흰 카드의 하단선이 좌·우 같은 수평선에 있는지를 커밋 전에 헤드리스로 실측한다.
//
// 잠그는 계약 4가지(전부 이미 코드에 있는 규약 — 이 파일은 「감시」만 한다):
//   ① 좌·우 유리박스 상단·하단선 Δ ≤ 1px       (260802d 이젤 고정 + 260802e 열별 높이)
//   ② 좌·우 「마지막 흰 도형」 하단선 Δ ≤ 1px    (260802e fill·스트레치 + 260802f 마지막 도형 여백 0)
//   ③ 흰 도형 하단 ↔ 박스 안선(패딩 18) 틈 ≤ 2px = 박스 밖으로 안 넘치고 빈 유리도 안 남는다
//   ④ 재계산(_srailAlignTop·fit) 반복해도 값이 안 흔들린다 = 상태 1개
// 검사 면 = 1면(데이터 有/無) · 3면(짝 면) · 4면(고객 분석) · 1면 복귀(왕복 회귀).
//
// ⚠ fail-soft 원칙(smoke_login.mjs와 동일): playwright-core·chromium·환경 문제 = SKIP(exit 0).
//   *진짜 정렬 파손*만 FAIL(exit 1). QA 진입로(?qa=admin)라 실API·실데이터·PII 미접촉.
//
// 실행: node tools/smoke_layout.mjs  [폭 높이]   (기본 1920×1080 · 예: node tools/smoke_layout.mjs 1600 900)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from './qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = parseInt(process.argv[2] || '1920', 10), H = parseInt(process.argv[3] || '1080', 10);
const TOL_LINE = 1.2;   // 좌↔우 하단선 허용 오차(px) — 보더·반올림 잔차만 허용
const TOL_GAP  = 2.5;   // 흰 도형 ↔ 박스 안선 틈 허용(px)
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

// 페이지 안에서 도는 실측기 — 각 열의 유리박스 안선과 「마지막 흰 도형」 하단을 잰다.
const MEASURE = `(()=>{
  const inner=b=>{const c=getComputedStyle(b);return b.getBoundingClientRect().bottom-(parseFloat(c.borderBottomWidth)||0)-(parseFloat(c.paddingBottom)||0);};
  const col=sel=>{
    const box=document.querySelector(sel+' [data-bizmbox]');
    if(!box||box.offsetParent===null)return null;
    const r=box.getBoundingClientRect();
    // [260803 2차] 「흰 도형」 판정을 **클래스 목록 → 실제로 칠해졌는지**로 바꾼다(운영자 「다른 각 창도 넘어간 거 많음」).
    //   구판 후보 = .bizm-card/.bizm-strip/[data-bizmfill]/#rail-yrm-uha 뿐이라 두 겹의 사각이 있었다:
    //     ① 투명한 껍데기(#rail-yrm-uha 빈 슬롯 4px)를 흰 도형으로 셌다 → 우 카드가 18px 높이 끝나도 Δ0 통과(260803 1차).
    //     ② 그 클래스가 없는 면(4면 고객 분석 = 인라인 스타일 카드)은 후보 0 → **아예 검사를 안 했다**(4면 좌 열이
    //        이젤을 뚫고 유리 하단 테두리까지 내려온 Δ18을 못 잡음 — 운영자 실측 제보).
    //   새 판정 = 배경 alpha≥.5 & 밝은(≥240) 요소 중 **조상 overflow로 잘리는 하단**(패딩박스 하단)이 가장 아래인 것.
    //   = 눈에 보이는 흰색의 마지막 선. 스크롤 중인 목록 안 행·스크롤 박스 안 카드도 잘린 위치로 잡힌다.
    const lightBg=e=>{const m=/^rgba?\\(([^)]+)\\)/.exec(getComputedStyle(e).backgroundColor);if(!m)return false;
      const p=m[1].split(',').map(parseFloat), a=p.length>3?p[3]:1;
      return a>=0.5&&p[0]>=240&&p[1]>=240&&p[2]>=240;};
    const clipBottom=el=>{let b=el.getBoundingClientRect().bottom,n=el.parentElement;
      while(n){const c=getComputedStyle(n);
        if(/auto|scroll|hidden/.test(c.overflowY)){const rr=n.getBoundingClientRect();b=Math.min(b,rr.bottom-(parseFloat(c.borderBottomWidth)||0));}
        if(n===box)break;n=n.parentElement;}
      return b;};
    let white=null;
    box.querySelectorAll('*').forEach(e=>{
      if(e.offsetParent===null)return;
      const rr=e.getBoundingClientRect();
      if(rr.height<2||rr.width<20||!lightBg(e))return;
      const b=clipBottom(e);
      if(b>r.top&&(white===null||b>white))white=b;
    });
    return {top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), innerBottom:+inner(box).toFixed(1),
      white:white===null?null:+white.toFixed(1),
      overflow:+(box.scrollHeight-box.clientHeight).toFixed(1)};
  };
  return {page:(window._bizmState||{}).page, wide:(typeof _bizBookWide==='function')?_bizBookWide():null, L:col('#biz-main'), R:col('#rail-yrm')};
})()`;

const STABILITY = `(()=>{
  const snap=()=>{
    const q=s=>{const e=document.querySelector(s);if(!e)return 'x';const b=e.getBoundingClientRect();return b.top.toFixed(0)+','+b.bottom.toFixed(0);};
    return q('#biz-main [data-bizmbox]')+'|'+q('#rail-yrm [data-bizmbox]')+'|'+q('#yrm-chart');
  };
  const seen=new Set([snap()]);
  for(let i=0;i<12;i++){
    try{_srailAlignTop();}catch(e){}
    try{if(typeof _bizFitViewport==='function')_bizFitViewport();}catch(e){}
    try{if(typeof _bizFitSeason==='function')_bizFitSeason();}catch(e){}
    seen.add(snap());
  }
  return [...seen];
})()`;

function judge(tag, m, fails) {
  if (!m || !m.L) return;                       // 그 면에 좌 박스가 없다(좁은 화면 등) = 검사 대상 아님
  if (m.wide === false) return;                 // 좁은 화면(≤1200) = 이젤 계약 비적용(자연 높이)
  if (!m.R) return;                             // 우 열 없음(레일 숨김) = 좌우 비교 불가
  const dTop = Math.abs(m.L.top - m.R.top), dBot = Math.abs(m.L.bottom - m.R.bottom);
  if (dTop > TOL_LINE) fails.push(`${tag}: 유리박스 상단선 Δ${dTop.toFixed(1)}px (좌 ${m.L.top} / 우 ${m.R.top})`);
  if (dBot > TOL_LINE) fails.push(`${tag}: 유리박스 하단선 Δ${dBot.toFixed(1)}px (좌 ${m.L.bottom} / 우 ${m.R.bottom})`);
  // [260803 2차] m.*.white = 이미 「눈에 보이는(잘린) 흰 하단」 — 그대로 비교한다.
  //   구판은 min(흰, 안선)으로 깎아 봤는데, 그러면 **박스가 스크롤 중일 때 흰색이 유리 하단 여백(18)까지
  //   내려온 것**(4면 좌 열 실측 1047 vs 안선 1029)이 안선으로 보정돼 사라졌다 = 운영자가 본 어긋남을 못 잡음.
  if (m.L.white != null && m.R.white != null) {
    const dW = Math.abs(m.L.white - m.R.white);
    if (dW > TOL_LINE) fails.push(`${tag}: 흰 카드 하단 수평선 Δ${dW.toFixed(1)}px (좌 ${m.L.white} / 우 ${m.R.white} · 안선 ${m.L.innerBottom})`);
  }
  for (const [side, c] of [['좌', m.L], ['우', m.R]]) {
    if (c.white == null) continue;
    const gap = c.innerBottom - c.white;        // +: 빈 유리(불량) · −: 유리 하단 여백까지 흰색이 내려옴(불량)
    if (gap > TOL_GAP) fails.push(`${tag}: ${side} 흰 도형 아래 빈 유리 ${gap.toFixed(1)}px (안선 ${c.innerBottom} / 흰 ${c.white})`);
    if (gap < -TOL_GAP) fails.push(`${tag}: ${side} 흰 도형이 안선 아래로 ${Math.abs(gap).toFixed(1)}px 내려옴(유리 하단 여백 잠식 = 박스 스크롤 클립선까지 내려온 상태)`);
  }
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[layout] SKIP — playwright-core 미설치(npm install 후 활성). 레이아웃 검사 건너뜀.'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[layout] SKIP — chromium 바이너리 미탐지. 건너뜀.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[layout] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [], pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));
    // 리포 파일을 가상 호스트로 서빙(파일 경로 그대로) · 외부 CDN은 로컬 캐시 있으면 쓰고 없으면 차단(차트 없이도 기하 계약은 성립)
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
    await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
    await page.waitForTimeout(2000);

    judge('1면(판매 실적 빈 데이터)', await page.evaluate(MEASURE), fails);
    await page.evaluate(FEED_SCRIPT);
    await page.waitForTimeout(900);
    judge('1면(데이터 있음)', await page.evaluate(MEASURE), fails);

    const states = await page.evaluate(STABILITY);
    if (states.length > 1) fails.push(`1면: 재계산 12회에 기하가 흔들림(상태 ${states.length}개) — ${states.join(' / ')}`);

    for (const p of [3, 4, 1]) {
      await page.evaluate(`_bizmTo(${p})`);
      await page.waitForTimeout(1600);
      judge(`${p}면${p === 1 ? '(복귀)' : ''}`, await page.evaluate(MEASURE), fails);
    }

    const regressions = pageErrors.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
    if (regressions.length) fails.push('JS 회귀: ' + regressions.slice(0, 3).join(' | '));

    if (!fails.length) { console.log(`[layout] PASS — ${W}×${H} 이젤·흰 라인 계약 유지(박스 Δ0 · 흰 카드 하단 Δ0 · 안선 밀착 · 흔들림 0).`); return 0; }
    console.error('[layout] FAIL — 대시보드 정렬 계약 위반:');
    fails.forEach(f => console.error('  · ' + f));
    console.error('  기준: 좌↔우 선 Δ≤' + TOL_LINE + 'px · 흰 도형↔안선 틈 ≤' + TOL_GAP + 'px (정본 = _srailAlignTop 이젤/스트레치 · _bizFitViewport · _bizFitSeason)');
    return 1;
  } finally { await browser.close(); }
}

main().then(c => process.exit(c)).catch(e => {
  console.error('[layout] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
