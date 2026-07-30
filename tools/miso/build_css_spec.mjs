#!/usr/bin/env node
/* 정본 CSS 추출기 — index.html <style> 전량을 파싱해, 실렌더로 「실제 화면에 존재하는 선택자」만 골라
   원문 그대로(한 글자도 안 바꿈) 이관용 CSS 파일 + 지시 md를 만든다.
   왜 필요한가: 산문으로 옮기면 매번 빠지는 규칙이 생긴다(운영자 지적 "css 놓친 부분"). 기계로 뽑으면 누락 0.

   판정 규칙
     · 실렌더에서 상태별(메인/모달/캘린더/프로그램) class·id 토큰을 전량 수집
     · 규칙의 선택자 목록 중 하나라도 수집 토큰을 포함하면 채택 → 원문 블록 그대로 출력
     · 토큰이 아예 없는 선택자(body·table·*·input[type=..])는 무조건 채택
     · 채택 규칙이 참조하는 @keyframes만 함께 채택
     · 모바일 전용 @media(max-width ≤ 900px)는 제외(이관 대상 = 데스크톱 대시보드) — 목록은 md에 남긴다
   우선순위 태그: P1 메인화면·인트로(보이는 것) · P2 모달(열어서 보인 것) · P3 캘린더/프로그램 · P4 휴면(DOM만)

   전제: node tools/miso/build_standalone.mjs 선실행(이관본/standalone.html)
   사용: node tools/miso/build_css_spec.mjs
   산출: 이관본/첨부/정본_스타일.css · 이관본/첨부/CSS_정본_지시.md
   ⚠️ 기계산출물 — 손편집 금지. index.html을 고치고 재실행. */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'index.html');
const SA = join(ROOT, '이관본', 'standalone.html');
const OUT_CSS = join(ROOT, '이관본', '첨부', '정본_스타일.css');
const OUT_MD = join(ROOT, '이관본', '첨부', 'CSS_정본_지시.md');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const PORT = 8461;

if (!existsSync(SA)) { console.error('이관본/standalone.html 없음 — node tools/miso/build_standalone.mjs 먼저'); process.exit(1); }

// 사람이 읽는 설명 사전 — 접두어(네임스페이스)와 토큰의 뜻. 표에만 쓰이고 판정엔 개입 안 한다.
const NS_DESC = {
  '.pin': 'PIN 입력 4칸 (동그라미)', '.login': '인트로 로그인 카드', '#login': '인트로 화면 컨테이너',
  '.dot': 'PIN 성공/힌트 링(SVG)', '.nav': '상단 내비게이션 바', '#nav': '내비 슬롯',
  '.cal': '홍보 캘린더 격자', '.c': '캘린더 날짜 셀', '.wk': '캘린더 주 단위 펼침',
  '.modal': '모달 공통 셸(백드롭·카드·헤더·본문)', '.mv': '메인 전환 세그먼트(실적↔캘린더)',
  '.bizm': '사업 실적 좌 보드(KPI 스트립·표·차트)', '.srail': '우측 판매 레일(캘린더 옆 사업현황)',
  '#srail': '판매 레일 슬롯', '#rail': '연간 실적 틀 우측 이식 슬롯', '#biz': '사업 실적 좌 보드 슬롯',
  '.kpi': 'KPI 카드', '.hero': '히어로 그라디언트 블록', '.fbar': '필터·정렬 바(칩·세그먼트)',
  '.ana': '판매·사업현황 분석 보드', '.bp': '예매 프로세스 보드', '.yc': '연간 일정 통합 보드',
  '.panel': '우측 상세 패널', '#panel': '패널 슬롯', '.badge': '상태 배지', '.chip': '필터 칩',
  '.btn': '버튼', '.toast': '토스트 알림', '.pm': '프로그램 카드/필터', '.tbl': '표 공통',
  '.sk': '스켈레톤 로딩', '.empty': '빈 상태 카드', '.ctx': '우클릭 컨텍스트 메뉴',
  '.dd': '드롭다운', '.seg': '세그먼트 컨트롤', '.pet': '캘린더 하단 펫 무대',
  '.ae': '앱 진입 순차 등장', '.lm': '로그인 안내 문구', '.lw': '로고 글자',
  '.ry': '연간실적 우측 목록 — 분야 그룹 행(공연/전시/교육)', '#rail-yrm': '연간실적 우측 목록 슬롯',
  '.dh': '캘린더 요일 머리행(월~일 · 토=파랑 · 일=빨강)', '.dn': '캘린더 셀 안 일정 이름 줄',
  '.sp': '캘린더 셀 하단 특별일정 트랙', '.cb': '챗봇 위젯(우하단 FAB + 창)',
  '.p': '캘린더 셀 안 홍보 카드 · 플랫폼 미니 배지', '.on': '활성 상태 modifier(선택된 탭·칩·셀)',
  '.done': '완료 상태 modifier(투명도 낮춤)', '.biz': '사업 실적 모드 플래그(레이아웃 전환)',
  '#app': '앱 셸(인트로 다음 화면 전체)', '#body': '본문 랩',
  '.nm': '지난달/다음달 셀(흐리게)', '.past': '지난 날짜(흐리게)', '.today': '오늘 셀 강조',
  '.mc': '모달 본문 구획', '.mrow': '모달 입력 행', '.tag': '태그 배지',
};
const VAR_DESC = {
  '--accent': '강조 인디고 — 주 버튼·활성·채운 PIN 원', '--accent-light': '강조 옅은 배경(활성 셀)',
  '--accent-glow': '강조 글로우(히어로·포커스)', '--peach': '살몬 — 배경 그라디언트·호버',
  '--peach-light': '살몬 옅은 면', '--peach-bg': '살몬 배경 베이스', '--peach-text': '살몬 글자(계정명·전시)',
  '--bg': '앱 배경 그라디언트', '--surface': '카드 면(유리)', '--surface-solid': '카드 면(불투명)',
  '--glass': '유리 흰 알파', '--glass-border': '유리 테두리', '--glass-shadow': '유리 그림자(2단)',
  '--border': '기본 테두리', '--border2': '진한 테두리', '--text': '본문 잉크',
  '--dim': '흐린 글자', '--muted': '가장 흐린 글자·빈 PIN 테두리',
  '--green': '성공 초록 — PIN 성공 링', '--danger': '경고 빨강', '--danger-btn': '삭제 버튼 빨강',
  '--radius': '기본 라운드 16', '--radius-lg': '라운드 20', '--radius-xl': '라운드 24(로그인 카드)',
  '--neutral': '중립 면', '--neutral-text': '중립 글자', '--r-btn': '버튼 라운드 10',
  '--r-pop': '팝오버 라운드 16', '--r-modal': '모달 라운드 20', '--elev': '모달 그림자',
  '--backdrop': '모달 백드롭 딤', '--glass-surface': '유리 면 78%', '--glass-menu': '유리 메뉴 45%',
  '--cell-pad-y': '표 셀 세로 패딩', '--cell-pad-x': '표 셀 가로 패딩', '--cell-fs': '표 셀 글자 크기',
  '--z-modal': 'z-index 모달', '--z-toast': 'z-index 토스트', '--z-nav': 'z-index 내비',
};

const ASSET_DESC = {
  'image/bg-yeulmaru.webp': '캘린더·판매레일 뒤 여수 예울마루 항공사진(하위 15% crop · opacity 25%)',
  'image/pets/pet_crab.png': '캘린더 하단 픽셀 펫(크랩) — 배회 연출',
  'image/pets/pet_love.png': '캘린더 하단 펫 하트 이펙트',
  'image/pets/pet.webp': '캘린더 하단 공 차는 펫(webp 애니)',
  'image/classyvogue-latin.woff2': '로고 전용 세리프 글꼴(YEULMARU 워드마크)',
};
const ASSET_FALLBACK = {
  'image/bg-yeulmaru.webp': '유리 카드가 흰 배경 위에 뜬다 — 톤만 밋밋해짐',
  'image/pets/pet_crab.png': '펫이 안 나옴(기능 영향 0)',
  'image/pets/pet_love.png': '하트만 안 나옴',
  'image/pets/pet.webp': '펫이 안 나옴(기능 영향 0)',
};

// ─────────────────────────────────────────────────────────── 1. <style> 추출
const src = readFileSync(SRC, 'utf8');
const sOpen = src.indexOf('<style>');
const sClose = src.indexOf('</style>', sOpen);
if (sOpen < 0 || sClose < 0) { console.error('<style> 블록을 못 찾음'); process.exit(1); }
const CSS = src.slice(sOpen + 7, sClose);
const cssStartLine = src.slice(0, sOpen).split('\n').length;

// ─────────────────────────────────────────────────────────── 2. CSS 토크나이저 (원문 보존)
function tokenize(css) {
  const out = []; const n = css.length; let i = 0;
  const skipComment = (p) => { const e = css.indexOf('*/', p + 2); return e < 0 ? n : e + 2; };
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    if (css[i] === '/' && css[i + 1] === '*') { const end = skipComment(i); out.push({ type: 'comment', raw: css.slice(i, end) }); i = end; continue; }
    // 프렐류드 끝(= '{' 또는 ';') 찾기
    let j = i, inStr = null;
    while (j < n) {
      const c = css[j];
      if (inStr) { if (c === '\\') { j += 2; continue; } if (c === inStr) inStr = null; j++; continue; }
      if (c === '"' || c === "'") { inStr = c; j++; continue; }
      if (c === '/' && css[j + 1] === '*') { j = skipComment(j); continue; }
      if (c === '{' || c === ';') break;
      j++;
    }
    if (j >= n) { out.push({ type: 'raw', raw: css.slice(i) }); break; }
    if (css[j] === ';') { out.push({ type: 'stmt', sel: css.slice(i, j).trim(), raw: css.slice(i, j + 1) }); i = j + 1; continue; }
    // 중괄호 블록 = 짝 찾기
    let k = j, d = 0; inStr = null;
    for (; k < n; k++) {
      const c = css[k];
      if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '/' && css[k + 1] === '*') { k = skipComment(k) - 1; continue; }
      if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) break; }
    }
    const end = Math.min(k + 1, n);
    const sel = css.slice(i, j).trim();
    out.push({ type: sel.startsWith('@') ? 'at' : 'rule', sel, raw: css.slice(i, end), body: css.slice(j + 1, end - 1), line: cssStartLine + css.slice(0, i).split('\n').length - 1 });
    i = end;
  }
  return out;
}
const nodes = tokenize(CSS);

// ─────────────────────────────────────────────────────────── 3. 실렌더 → 상태별 토큰 수집
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core 필요: npm i -D playwright-core'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'cssspec-'));
copyFileSync(SA, join(dir, 'a.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(readFileSync(join(dir, 'a.html'))); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--ignore-certificate-errors'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
page.on('pageerror', e => console.warn('  [page]', String(e).slice(0, 100)));

// 로그인(PIN) 상태 토큰도 필요 → 앱 진입 전에 먼저 수집
// visOnly=true → 실제로 화면에 보이는 요소만(원본은 모달 DOM이 처음부터 전부 들어있어, 전량 수집하면 등급이 부푼다)
const COLLECT_FN = `(visOnly => { const s=new Set();
  for (const el of document.querySelectorAll('*')) {
    if (visOnly) { if (!el.getClientRects || !el.getClientRects().length) continue; }
    if (el.id) s.add('#'+el.id);
    const c = el.getAttribute && el.getAttribute('class');
    if (c && typeof c === 'string') for (const t of c.trim().split(/\\s+/)) if (t) s.add('.'+t);
  } return [...s]; })`;
const COLLECT = `${COLLECT_FN}(true)`;         // 보이는 것만
const COLLECT_ALL = `${COLLECT_FN}(false)`;    // DOM 전량(휴면 포함)

await page.goto(`http://127.0.0.1:${PORT}/a.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pin-step', { state: 'visible', timeout: 20000 });
const tkIntro = await page.evaluate(COLLECT);
console.log(`인트로 토큰 ${tkIntro.length}`);

for (const d of '0510') await page.keyboard.type(d);
await page.waitForSelector('#app', { state: 'visible', timeout: 20000 });
await page.waitForTimeout(9000);   // 오프라인 래치 + 렌더 완료
const tkMain = await page.evaluate(COLLECT);
const tkDormant = await page.evaluate(COLLECT_ALL);
console.log(`메인(사업 실적) 보이는 토큰 ${tkMain.length} / DOM 전량 ${tkDormant.length}`);

// 모달 — 메인 화면의 onclick 트리거를 순차 클릭해 누적 수집(파괴적·이탈 핸들러 제외)
const tkModal = await page.evaluate(async () => {
  const s = new Set();
  const vis = el => el.getClientRects && el.getClientRects().length > 0;
  const bad = /logout|로그아웃|_fullLogout|reload|location\s*[.=]|삭제|delete|remove|save|저장|submit|window\.open|href/i;
  const good = /open|show|drill|detail|modal|popup|view|보기|상세/i;
  const cand = [...document.querySelectorAll('[onclick]')].filter(el => {
    const h = el.getAttribute('onclick') || '';
    if (bad.test(h) || !good.test(h)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }).slice(0, 36);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const grab = () => { for (const el of document.querySelectorAll('*')) { if (!vis(el)) continue; if (el.id) s.add('#' + el.id); const c = el.getAttribute && el.getAttribute('class'); if (c && typeof c === 'string') for (const t of c.trim().split(/\s+/)) if (t) s.add('.' + t); } };
  for (const el of cand) {
    try { el.click(); } catch (e) { continue; }
    await sleep(420); grab();
    // 닫기 — 전역 닫기 함수 → 닫기 버튼 → Esc
    try { if (typeof window.closeModal === 'function') window.closeModal(); } catch (e) { }
    for (const sel of ['.modal.show .modal-close', '.modal-close', '.mclose', '[onclick*="close"]']) {
      const b = document.querySelector(sel); if (b) { try { b.click(); } catch (e) { } break; }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(160);
  }
  // 표 행 드릴(2×2 상세) — 메인 모달의 핵심 경로
  for (const sel of ['#rail-yrm-list tbody tr', '#biz-main table tbody tr', '.srail-card']) {
    const rows = [...document.querySelectorAll(sel)].slice(0, 3);
    for (const r0 of rows) { try { r0.click(); } catch (e) { } await sleep(380); grab(); }
  }
  return [...s];
});
console.log(`모달 누적 토큰 ${tkModal.length}`);

// 캘린더 모드 · 프로그램 메뉴
const tkOther = await page.evaluate(async () => {
  const s = new Set();
  const vis = el => el.getClientRects && el.getClientRects().length > 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const grab = () => { for (const el of document.querySelectorAll('*')) { if (!vis(el)) continue; if (el.id) s.add('#' + el.id); const c = el.getAttribute && el.getAttribute('class'); if (c && typeof c === 'string') for (const t of c.trim().split(/\s+/)) if (t) s.add('.' + t); } };
  const hit = (re) => [...document.querySelectorAll('a,button,[onclick],[role=tab]')].find(e => re.test((e.innerText || '').trim()));
  for (const re of [/홍보\s*캘린더|캘린더/, /프로그램/, /사업\s*실적|대시보드/]) {
    const b = hit(re); if (!b) continue;
    try { b.click(); } catch (e) { continue; }
    await sleep(1400); grab();
  }
  return [...s];
});
console.log(`캘린더·프로그램 토큰 ${tkOther.length}`);

// 팔레트 실측(md 참고용)
const usedVars = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement); const o = {};
  for (const s of document.styleSheets) { try { for (const r of s.cssRules) { if (r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--')) o[p] = cs.getPropertyValue(p).trim(); } } catch (e) { } }
  return o;
});
await browser.close(); srv.close();

// ─────────────────────────────────────────────────────────── 4. 채택 판정
const S_INTRO = new Set(tkIntro), S_MAIN = new Set(tkMain), S_MODAL = new Set(tkModal), S_OTHER = new Set(tkOther);
const S_DORM = new Set(tkDormant);   // DOM엔 있으나 이번 순회에서 한 번도 보이지 않은 것(휴면 모달·조건부 UI)

function splitSelectorList(sel) {
  const out = []; let d = 0, cur = '', inStr = null;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (inStr) { cur += c; if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; cur += c; continue; }
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const selTokens = s => s.match(/[.#][A-Za-z_-][\w-]*/g) || [];
function decide(sel) {         // → null(제외) | {tier}
  let best = null;
  for (const part of splitSelectorList(sel)) {
    const tk = selTokens(part);
    if (!tk.length) return { tier: 'P0' };                        // 요소·속성 선택자 = 항상
    if (tk.some(t => S_MAIN.has(t))) return { tier: 'P1' };
    if (tk.some(t => S_INTRO.has(t))) best = best || { tier: 'P1' };
    if (tk.some(t => S_MODAL.has(t))) best = best || { tier: 'P2' };
    if (tk.some(t => S_OTHER.has(t))) best = best || { tier: 'P3' };
    if (tk.some(t => S_DORM.has(t))) best = best || { tier: 'P4' };
  }
  return best;
}
const isMobileMedia = cond => /max-width\s*:\s*(\d+)px/.test(cond) && Number(cond.match(/max-width\s*:\s*(\d+)px/)[1]) <= 900;

const kept = [];        // {raw, tier, sel, lead[]}
const dropped = [];     // {sel, why}
const keyframeDefs = new Map();
let pendingLead = [];
const SECTION = /═══/;

function handleRule(nd, forceTier) {
  const v = decide(nd.sel);
  if (!v) { dropped.push({ sel: nd.sel, why: '화면에 없음' }); pendingLead = []; return; }
  kept.push({ raw: nd.raw, tier: forceTier || v.tier, sel: nd.sel, lead: pendingLead });
  pendingLead = [];
}

for (const nd of nodes) {
  if (nd.type === 'comment') {
    if (SECTION.test(nd.raw)) { kept.push({ raw: nd.raw, tier: 'SEC', sel: '', lead: [], section: true }); pendingLead = []; }
    else pendingLead.push(nd.raw);
    continue;
  }
  if (nd.type === 'stmt' || nd.type === 'raw') { kept.push({ raw: nd.raw, tier: 'P0', sel: nd.sel || '', lead: pendingLead }); pendingLead = []; continue; }
  if (nd.type === 'rule') {
    if (/^:root\b/.test(nd.sel) || /^\*/.test(nd.sel) || /^html\b|^body\b/.test(nd.sel)) { kept.push({ raw: nd.raw, tier: 'P0', sel: nd.sel, lead: pendingLead }); pendingLead = []; continue; }
    handleRule(nd);
    continue;
  }
  // @-규칙
  const at = nd.sel.split(/\s+/)[0].toLowerCase();
  if (at === '@keyframes' || at === '@-webkit-keyframes') { keyframeDefs.set(nd.sel.replace(/^@-?\w*-?keyframes\s+/i, '').trim(), { raw: nd.raw, lead: pendingLead }); pendingLead = []; continue; }
  if (at === '@font-face' || at === '@import' || at === '@charset' || at === '@property') { kept.push({ raw: nd.raw, tier: 'P0', sel: nd.sel, lead: pendingLead }); pendingLead = []; continue; }
  if (at === '@media' || at === '@supports') {
    const cond = nd.sel.slice(at.length).trim();
    if (at === '@media' && isMobileMedia(cond)) { dropped.push({ sel: nd.sel, why: '모바일 전용(이관 대상 아님)' }); pendingLead = []; continue; }
    const inner = tokenize(nd.body);
    const keepInner = []; let lead2 = [];
    for (const ind of inner) {
      if (ind.type === 'comment') { lead2.push(ind.raw); continue; }
      if (ind.type === 'at') {
        const at2 = ind.sel.split(/\s+/)[0].toLowerCase();
        if (at2 === '@keyframes' || at2 === '@-webkit-keyframes') { keyframeDefs.set(ind.sel.replace(/^@-?\w*-?keyframes\s+/i, '').trim(), { raw: ind.raw, lead: lead2 }); lead2 = []; continue; }
        keepInner.push(lead2.join('\n') + (lead2.length ? '\n' : '') + ind.raw); lead2 = []; continue;
      }
      if (ind.type !== 'rule') { keepInner.push(ind.raw); lead2 = []; continue; }
      if (/^:root\b|^\*|^html\b|^body\b/.test(ind.sel) || decide(ind.sel)) { keepInner.push(lead2.join('\n') + (lead2.length ? '\n' : '') + ind.raw); }
      else dropped.push({ sel: `${nd.sel} { ${ind.sel} }`, why: '화면에 없음' });
      lead2 = [];
    }
    if (!keepInner.length) { dropped.push({ sel: nd.sel, why: '내부 규칙 전부 미사용' }); pendingLead = []; continue; }
    kept.push({ raw: `${nd.sel}{\n${keepInner.map(r => '  ' + r.replace(/\n/g, '\n  ')).join('\n')}\n}`, tier: 'P0', sel: nd.sel, lead: pendingLead });
    pendingLead = []; continue;
  }
  kept.push({ raw: nd.raw, tier: 'P0', sel: nd.sel, lead: pendingLead }); pendingLead = [];
}

// 참조된 @keyframes만 채택 (채택 CSS 전체에서 animation 이름 탐색)
const keptCssRaw = kept.map(k => k.raw).join('\n');
const usedNames = new Set();
for (const [name] of keyframeDefs) {
  const re = new RegExp('(animation(?:-name)?\\s*:[^;}]*\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b)');
  if (re.test(keptCssRaw)) usedNames.add(name);
}
const kfKept = [...keyframeDefs.entries()].filter(([n]) => usedNames.has(n));
const kfDropped = [...keyframeDefs.keys()].filter(n => !usedNames.has(n));

// ─────────────────────────────────────────────────────────── 5. CSS 파일 출력
const stamp = `/* 예울마루 정본 스타일 — index.html <style>(L${cssStartLine}~) 에서 기계 추출.
   생성기: tools/miso/build_css_spec.mjs · 원문 무변(주석 포함) · 손편집 금지.
   채택 ${kept.filter(k => !k.section).length}규칙 + @keyframes ${kfKept.length}개 / 제외 ${dropped.length}건(모바일·미사용).
   ⚠️ 이 파일은 그대로 글로벌 CSS로 넣어라. 값을 바꾸면 원본과 달라진다. */\n`;
let cssOut = stamp + kept.map(k => (k.lead.length ? k.lead.join('\n') + '\n' : '') + k.raw).join('\n')
  + '\n\n/* ═══ @keyframes (위 규칙들이 참조하는 것만) ═══ */\n'
  + kfKept.map(([, v]) => (v.lead.length ? v.lead.join('\n') + '\n' : '') + v.raw).join('\n') + '\n';

// ── 자산 처리: 작은 것(로고 웹폰트)은 data:URI로 박아 넣어 「파일 못 찾음」을 원천 제거.
//    큰 것(배경 사진·펫)은 경로를 남기고 md에 업로드 안내를 낸다(base64로 부풀리면 붙여넣기 불가).
const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const INLINE_MAX = 40 * 1024;                    // 40KB 초과분은 인라인하지 않는다
const assetRefs = [...new Set((cssOut.match(/url\(\s*["']?([^"')]+)["']?\s*\)/g) || [])
  .map(m => m.replace(/^url\(\s*["']?/, '').replace(/["']?\s*\)$/, '')).filter(u => !/^data:/.test(u)))];
const assetsInlined = [], assetsExternal = [];
for (const rel of assetRefs) {
  const clean = rel.split('?')[0];
  const p = join(ROOT, clean);
  if (!existsSync(p)) { assetsExternal.push({ rel: clean, size: 0, note: '레포에 없음(확인 필요)' }); continue; }
  const size = readFileSync(p).length;
  if (size <= INLINE_MAX) {
    const ext = clean.slice(clean.lastIndexOf('.'));
    const uri = `data:${MIME[ext] || 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;
    const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cssOut = cssOut.replace(new RegExp('url\\(\\s*["\']?' + esc + '["\']?\\s*\\)', 'g'), `url("${uri}")`);
    assetsInlined.push({ rel: clean, size });
  } else assetsExternal.push({ rel: clean, size, note: '' });
}
writeFileSync(OUT_CSS, cssOut, 'utf8');
const kb = n => n >= 1024 ? `${Math.round(n / 1024)}KB` : `${n}B`;

// ─────────────────────────────────────────────────────────── 6. 네임스페이스 집계(구현 체크리스트용)
const ns = new Map();
for (const k of kept) {
  if (k.section || !k.sel) continue;
  for (const part of splitSelectorList(k.sel)) for (const t of selTokens(part)) {
    const m = t.match(/^([.#])([a-zA-Z][\w]*?)(?:-|$)/); if (!m) continue;
    const key = m[1] + m[2];
    const e = ns.get(key) || { n: 0, tiers: new Set(), sample: new Set() };
    e.n++; e.tiers.add(k.tier); if (e.sample.size < 5) e.sample.add(t);
    ns.set(key, e);
  }
}
const nsRows = [...ns.entries()].filter(([, v]) => v.n >= 3).sort((a, b) => b[1].n - a[1].n).slice(0, 46);
const tierOf = v => ['P1','P2','P3','P4'].find(t => v.tiers.has(t)) || 'P0';

const cssKb = Math.round(Buffer.byteLength(cssOut) / 1024);
const cnt = t => kept.filter(k => k.tier === t && !k.section).length;

const md = `# CSS 정본 이식 지시 — 「원문 그대로」 붙여넣어라

> 생성: \`tools/miso/build_css_spec.mjs\` (기계 추출 · 원문 무변)
> 첨부 파일: **\`정본_스타일.css\`** (${cssKb}KB · ${kept.filter(k => !k.section).length}규칙 + @keyframes ${kfKept.length}개)

---

## 0. 결론 — 뭘 해야 하나

지금 화면들이 원본과 조금씩 다른 이유는 **CSS를 눈으로 보고 다시 만들었기** 때문이다.
그러면 매번 몇 줄씩 빠진다. 그러지 말고 **첨부 CSS를 통째로 넣어라.**

1. 첨부 \`정본_스타일.css\` 를 프로젝트에 **파일 그대로** 추가한다 → \`src/styles/yeulmaru.css\`
2. 엔트리에서 **Tailwind 다음에** 불러온다 (순서가 중요하다 — 뒤에 와야 이긴다)
   \`\`\`css
   /* src/index.css */
   @import "tailwindcss";
   @import "./styles/yeulmaru.css";   /* ← 반드시 마지막 */
   \`\`\`
3. **컴포넌트에서는 이 CSS의 클래스명만 쓴다.** Tailwind 유틸리티로 다시 칠하지 마라.
   (\`className="cal"\` ○ / \`className="cal rounded-xl border bg-white"\` ✕)
4. shadcn 기본 컴포넌트(\`Button\`·\`Input\`·\`Card\`·\`Dialog\`)를 이 화면들에 쓰지 마라.
   그 컴포넌트들이 자기 테두리·배경·라운드를 들고 와서 원본 형태를 덮는다.
   **평범한 \`<div>\`·\`<button>\`·\`<table>\` + 위 클래스명** 조합이 정답이다.

---

## 1. 무엇이 들어있나 (우선순위별)

| 등급 | 뜻 | 규칙 수 |
|---|---|---|
| **P0** | 전역·토큰·리셋·미디어쿼리 — 무조건 필요 | ${cnt('P0')} |
| **P1** | **메인화면(사업 실적)·인트로에 실제로 보이는 것** — 최우선 | ${cnt('P1')} |
| **P2** | **메인에서 띄우는 모달** — 다음 우선 | ${cnt('P2')} |
| P3 | 캘린더·프로그램 화면 | ${cnt('P3')} |
| P4 | DOM엔 있으나 이번 순회에서 안 열린 화면(조건부 모달 등) — 나중 | ${cnt('P4')} |
| @keyframes | 위 규칙들이 참조하는 애니메이션만 | ${kfKept.length} |

> 제외한 것: **${dropped.length}건** — 모바일 전용 미디어쿼리, 그리고 이관 대상 화면에 나타나지 않는 규칙
> (콘텐츠 제작 도우미 \`.nb-*\`·\`.ve-*\`, 위저드 \`.wz-*\` 등). 나중에 그 화면을 만들 때 다시 뽑아준다.
> 미사용 @keyframes ${kfDropped.length}개도 제외했다.

---

## 2. 네임스페이스 = 화면 구성 체크리스트

이 접두어들이 곧 원본의 컴포넌트 목록이다. **각 줄이 화면에 실제로 있는지 확인해라.**
개수는 그 접두어에 걸린 CSS 규칙 수 — 많을수록 형태가 복잡하다(= 대충 만들면 확실히 티가 난다).

| 접두어 | 규칙 | 등급 | 무엇 | 예시 선택자 |
|---|---|---|---|---|
${nsRows.map(([k, v]) => `| \`${k}\` | ${v.n} | ${tierOf(v)} | ${NS_DESC[k] || ''} | ${[...v.sample].map(s => '`' + s + '`').join(' ')} |`).join('\n')}

---

## 3. :root 토큰 — 이게 색·모양의 뿌리다

**새 색을 만들지 마라.** 아래가 이 앱의 색 전부다(팔레트 폐쇄형).
\`정본_스타일.css\` 안에 이미 \`:root\` 블록으로 들어있으니 따로 옮길 필요는 없다 — 아래는 확인용이다.

| 토큰 | 값 | 쓰임 |
|---|---|---|
${Object.entries(usedVars).filter(([, v]) => v).map(([k, v]) => `| \`${k}\` | \`${v}\` | ${VAR_DESC[k] || ''} |`).join('\n')}

> 색을 조정하고 싶으면 **토큰 값만** 바꿔라. 개별 규칙에 hex를 새로 쓰면 팔레트가 깨진다.

---

## 4. 글꼴 — 이것도 놓치기 쉽다

원본 글꼴은 **Pretendard**(본문 전체)이고, 로고 한 곳만 **ClassyVogue**다.
글꼴이 다르면 글자 폭이 달라져 표·카드 줄바꿈이 전부 어긋난다 — 가장 티가 크게 나는 차이다.

\`\`\`html
<!-- index.html <head> 에 넣어라 (원본과 동일한 두 줄) -->
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Serif+Display&display=swap" rel="stylesheet">
\`\`\`

- **사내망에서 위 CDN이 막히면** Pretendard를 npm으로 넣어라 → \`npm i pretendard\` 후 \`import "pretendard/dist/web/static/pretendard.css"\`.
- 그것도 안 되면 폰트 없이 가도 된다(레이아웃은 유지된다). 단 \`*{font-family:'Pretendard',-apple-system,sans-serif}\` 규칙은 **지우지 마라** — 폴백 순서가 원본과 같아야 한다.
- **ClassyVogue(로고용)는 첨부 CSS 안에 data:URI로 이미 박아 넣었다.** 별도 파일이 필요 없다.

### 이미지 자산

${assetsInlined.length ? `**CSS에 이미 박아 넣은 것(추가 작업 없음)**\n\n${assetsInlined.map(a => `- \`${a.rel}\` (${kb(a.size)}) → data:URI 인라인 완료`).join('\n')}\n` : ''}
${assetsExternal.length ? `**따로 올려야 하는 것** — 프로젝트에 아래 **경로 그대로** 넣어라(경로가 CSS에 박혀 있다).\n\n| 파일 | 크기 | 쓰임 | 없으면 |\n|---|---|---|---|\n${assetsExternal.map(a => `| \`${a.rel}\` | ${a.note || kb(a.size)} | ${ASSET_DESC[a.rel] || ''} | ${ASSET_FALLBACK[a.rel] || '해당 배경만 안 보임 (레이아웃은 정상)'} |`).join('\n')}\n\n> 이 파일들은 **장식**이다. 못 올려도 화면이 깨지지 않는다 — 데이터·레이아웃부터 맞추고 나중에 채워도 된다.\n` : ''}
---

## 5. 흔히 놓치는 CSS 7가지 (지금까지 실제로 빠졌던 것)

| # | 놓치는 것 | 증상 | 정본 |
|---|---|---|---|
| 1 | \`backdrop-filter\` | 유리 카드가 그냥 흰 박스로 보인다 | \`.login-card\` \`blur(32px) saturate(1.35)\` · \`.cal\`·\`.srail\` 등 글래스 서피스 전부 |
| 2 | \`box-shadow\` 2단 겹침 | 카드가 종이처럼 납작하다 | 대부분 \`0 8px 32px rgba(74,77,231,.08), 0 2px 8px rgba(0,0,0,.04)\` (넓은 인디고 + 좁은 검정) |
| 3 | \`::before\`/\`::after\` 가상요소 | 동그라미·블릿·액센트 바가 사라진다 | PIN 동그라미, 카드 제목 블릿, 섹션 소제목 앞 accent 바 |
| 4 | \`transition\` | 상태가 툭툭 바뀐다 | 셀·칩·버튼 대부분 \`.18s\`~\`.22s ease\` |
| 5 | \`animation\` + \`@keyframes\` | 등장·펄스·링 draw가 없다 | @keyframes ${kfKept.length}개 전부 필요 |
| 6 | \`:has()\` 상태 선택자 | 입력해도 모양이 안 바뀐다 | \`.pin-slot:has(.pin.filled)\` 같은 부모-반응 규칙 |
| 7 | CSS 변수 \`--i\` 인라인 | 순차 애니메이션이 동시에 터진다 | \`style="--i:0"\`~\`3\` 을 HTML에 넣어야 \`calc(var(--i)*.1s)\` 가 작동 |

---

## 6. 넣은 뒤 자기검증 (F12 실측 · 눈대중 금지)

\`\`\`js
// 콘솔에 붙여넣어라 — 정본 CSS가 실제로 먹었는지 확인한다
(() => {
  const q = s => document.querySelector(s);
  const g = (s, p, pe) => { const e = q(s); return e ? getComputedStyle(e, pe || null)[p] : '없음'; };
  console.table({
    '카드 유리':      g('.login-card','backdropFilter') ,
    '카드 배경':      g('.login-card','backgroundColor'),
    'PIN 원 크기':    g('.pin-slot','width','::before'),
    'PIN 원 라운드':  g('.pin-slot','borderRadius','::before'),
    'PIN 슬롯 테두리':g('.pin-slot','border'),
    '성공링 색':      g('.dot-ring circle','stroke'),
    '토큰 accent':    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    '토큰 개수':      [...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch(e){return []}})
                        .filter(r=>r.selectorText===':root').flatMap(r=>[...r.style]).filter(p=>p.startsWith('--')).length,
    '정본 CSS 로드':  [...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.selectorText&&/\\.pin-slot/.test(r.selectorText))}catch(e){return false}}),
  });
})()
\`\`\`

**기대값**

| 항목 | 기대 |
|---|---|
| 카드 유리 | \`blur(32px) saturate(1.35)\` |
| 카드 배경 | \`rgba(255, 255, 255, 0.22)\` |
| PIN 원 크기 / 라운드 | \`15px\` / \`50%\` |
| PIN 슬롯 테두리 | \`0px none rgb(...)\` = **테두리 없음** |
| 성공링 색 | \`rgb(26, 107, 60)\` |
| 토큰 accent | \`#4A4DE7\` |
| 토큰 개수 | **${Object.keys(usedVars).length}** 이상 |
| 정본 CSS 로드 | \`true\` |

---

## 7. 보고 형식

\`\`\`
[정본 CSS 이식]
파일: src/styles/yeulmaru.css (○KB) · import 위치: index.css 마지막 ○
Tailwind 충돌: 없음 / 있음(어디: ○○○ → 어떻게 해결: ○○○)
shadcn 제거: ○개 컴포넌트를 순수 div/button/table로 교체 (목록: ○○○)
자기검증 8항: ○/8 통과 (미통과: ○○○)
남은 차이(눈으로 본 것): ○○○
\`\`\`
`;

// 설명 사전 — 코드 하단에 두면 위 템플릿에서 참조 못하므로 호이스팅되는 함수 스코프 변수로 선언
writeFileSync(OUT_MD, md, 'utf8');

console.log(`\n✅ ${OUT_CSS.replace(ROOT + '/', '')} — ${cssKb}KB · 채택 ${kept.filter(k => !k.section).length}규칙 + kf ${kfKept.length}`);
console.log(`✅ ${OUT_MD.replace(ROOT + '/', '')} — ${Math.round(Buffer.byteLength(md) / 1024)}KB`);
console.log(`   등급: P0 ${cnt('P0')} · P1 ${cnt('P1')} · P2 ${cnt('P2')} · P3 ${cnt('P3')} · P4 ${cnt('P4')}`);
console.log(`   제외: 규칙 ${dropped.length} · @keyframes ${kfDropped.length}`);
console.log(`   토큰: :root ${Object.keys(usedVars).length}개`);
