#!/usr/bin/env node
/* 세부 판매현황(드릴) 정본 실측기 — 원본 standalone을 실렌더해 「프로그램 클릭 → 개별 상세」를
   공연·전시 양쪽으로 실제 열어보고 DOM·텍스트·computed·차트 구조·버튼을 전량 덤프한다.
   왜: MISO 빌드에 이 화면이 아예 없다(운영자 지적 "제일 급한거는 각 프로그램 클릭했을때 세부 판매현황").
       산문으로 옮기면 또 새므로 실측값으로 명세를 만든다.

   진입 경로 2종(실측 — 서로 다른 화면이다)
     A) 기본 화면(사업 실적) 판매현황 표 행
          #rail-yrm-list tbody tr.clk  → onclick _railYrmPick(kind, key)  → _ryDrillOpen(want)
          → 박스가 통째로 .ry-detail 로 교체(책장 넘김 mv-swipe) · 안에 .srail-card 1장 + .ry-nav(‹ • • ›)
          → 카드의 클릭 핸들러는 _ryDrillStrip이 떼어낸다(상세는 이 박스 안에서만 바뀐다)
          → 복귀 = [‹ 목록]
     B) 캘린더 모드 판매 레일 (기본 화면에선 숨어 있다)
          .srail-card / 레일 표 행 → _srailDrill('perf', 프로그램명) / ('ex', 전시ID)
          → _srailRenderDrill / _srailRenderDrillEx → .srail-drill (KPI 4칸 + 차트 + AI 카드)
          → 복귀 = _srailBack()  「← 목록」

   전제: node tools/miso/build_standalone.mjs 선실행
   사용: node tools/miso/build_drill_spec.mjs
   산출: 이관본/첨부/세부판매현황_정본.md · 이관본/드릴_공연.png · 이관본/드릴_전시.png
   ⚠️ 기계산출물 — 손편집 금지. index.html을 고치고 재실행. */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SA = join(ROOT, '이관본', 'standalone.html');
const OUT = join(ROOT, '이관본', '첨부', '세부판매현황_정본.md');
const PNG_P = join(ROOT, '이관본', '드릴_공연.png');
const PNG_E = join(ROOT, '이관본', '드릴_전시.png');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const PORT = 8463;

if (!existsSync(SA)) { console.error('이관본/standalone.html 없음 — build_standalone.mjs 먼저'); process.exit(1); }
let chromium; try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core 필요'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'drill-'));
copyFileSync(SA, join(dir, 'a.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(readFileSync(join(dir, 'a.html'))); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--ignore-certificate-errors', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 })).newPage();
page.on('pageerror', e => console.warn('  [page]', String(e).slice(0, 110)));
await page.goto(`http://127.0.0.1:${PORT}/a.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pin-step', { state: 'visible', timeout: 20000 });
for (const d of '0510') await page.keyboard.type(d);
await page.waitForSelector('#app', { state: 'visible', timeout: 20000 });
await page.waitForTimeout(9000);

// ── 판매현황 표에서 클릭 가능한 행 목록 뽑기
const rows = await page.evaluate(() => [...document.querySelectorAll('#rail-yrm-list tbody tr')].map((tr, i) => ({
  i, clickable: tr.classList.contains('clk') || !!tr.getAttribute('onclick'),
  onclick: (tr.getAttribute('onclick') || '').slice(0, 120),
  text: (tr.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90),
})));
console.log(`판매현황 표 행 ${rows.length}개 (클릭가능 ${rows.filter(r => r.clickable).length})`);

// ── 드릴 캡처 공용 — 실제 클릭으로 연다
const CAPTURE = sel => `(() => {
  const D = document.querySelector('${sel}');
  if (!D) return { 오류: '${sel} 없음 — 드릴이 안 열렸다' };
  const R = {};
  const cs = (el, ps) => { if (!el) return '요소없음'; const c = getComputedStyle(el); const o = {}; ps.forEach(p => { const v = c[p]; if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') o[p] = v; }); return o; };
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height); };

  // 구조 트리 (깊이 6 · 클래스+짧은 텍스트)
  function tree(el, d, max) {
    if (!el || d > max || !(el instanceof HTMLElement)) return null;
    const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden') return null;
    const cl = String(el.className || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3);
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ');
    const n = { t: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cl.length ? '.' + cl.join('.') : '') };
    if (own) n.x = own.length > 70 ? own.slice(0, 70) + '…' : own;
    const k = [...el.children].map(x => tree(x, d + 1, max)).filter(Boolean);
    if (k.length) n.c = k;
    return n;
  }
  R.트리 = tree(D, 0, 6);
  R.전체텍스트 = (D.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);

  // 헤더 (제목 + 우측 버튼)
  const hd = D.querySelector('.srail-dhd');
  R.헤더 = { 제목: hd && hd.querySelector('.srail-dname') ? hd.querySelector('.srail-dname').innerText.trim() : null,
    제목_스타일: cs(hd && hd.querySelector('.srail-dname'), ['fontSize','fontWeight','color','maxWidth','overflow','textOverflow','whiteSpace']),
    버튼: [...D.querySelectorAll('.srail-dhd button')].map(b => ({ 문구: b.innerText.trim(), title: b.getAttribute('title'), 클래스: b.getAttribute('class'), onclick: (b.getAttribute('onclick')||'').slice(0,70) })),
    레이아웃: cs(hd, ['display','alignItems','gap','marginBottom','fontSize']) };

  // 메타 한 줄
  const meta = D.querySelector('.srail-meta');
  R.메타줄 = { 텍스트: meta ? meta.innerText.trim() : null, 스타일: cs(meta, ['fontSize','color','marginBottom','lineHeight']) };

  // KPI 4칸
  const kbox = D.querySelector('.ana-kpis');
  R.KPI = { 컨테이너: cs(kbox, ['display','gridTemplateColumns','gap','marginBottom']), 크기: rect(kbox),
    칸: [...D.querySelectorAll('.ana-kpi')].map(k => ({
      라벨: k.querySelector('.lab') ? k.querySelector('.lab').innerText.trim() : null,
      값: k.querySelector('.val') ? k.querySelector('.val').innerText.trim() : null,
      값색: k.querySelector('.val') ? getComputedStyle(k.querySelector('.val')).color : null,
      보조: k.querySelector('.sub2') ? k.querySelector('.sub2').innerText.trim() : null,
      보조색: k.querySelector('.sub2') ? getComputedStyle(k.querySelector('.sub2')).color : null,
      크기: rect(k) })),
    칸_스타일: cs(D.querySelector('.ana-kpi'), ['background','border','borderRadius','padding','boxShadow','textAlign']),
    라벨_스타일: cs(D.querySelector('.ana-kpi .lab'), ['fontSize','fontWeight','color','marginBottom']),
    값_스타일: cs(D.querySelector('.ana-kpi .val'), ['fontSize','fontWeight','lineHeight','fontVariantNumeric']) };

  // 차트
  const ch = D.querySelector('.srail-chart'), svg = ch && ch.querySelector('svg');
  R.차트 = { 컨테이너_스타일: cs(ch, ['background','border','borderRadius','padding','height','marginTop','marginBottom']), 크기: rect(ch),
    svg있나: !!svg, svg크기: rect(svg), viewBox: svg && svg.getAttribute('viewBox'),
    요소집계: svg ? Object.fromEntries(['path','rect','circle','line','text','g','polyline','polygon'].map(t => [t, svg.querySelectorAll(t).length])) : null,
    svg텍스트: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent.trim()).filter(Boolean).slice(0, 30) : null,
    선색: svg ? [...new Set([...svg.querySelectorAll('path,polyline,line')].map(e => e.getAttribute('stroke')).filter(Boolean))] : null,
    면색: svg ? [...new Set([...svg.querySelectorAll('rect,path,circle')].map(e => e.getAttribute('fill')).filter(v => v && v !== 'none'))] : null };

  // AI 분석 카드
  const ai = D.querySelector('.sr-ai-card');
  R.AI카드 = { 스타일: cs(ai, ['background','border','borderRadius','padding','marginTop','boxShadow']),
    헤더: ai && ai.firstElementChild ? ai.firstElementChild.innerText.trim() : null,
    줄: [...D.querySelectorAll('.sr-ai-row, .sr-ai-card > div')].map(r => (r.innerText||'').trim()).filter(Boolean).slice(0, 8),
    구분선: cs(D.querySelector('.sr-ai-div'), ['height','background','margin']) };

  // .ry-detail 전용 — 안쪽 카드 · 프로그램 넘김 nav
  const card = D.querySelector('.srail-card');
  R.카드 = card ? { 클래스: card.getAttribute('class'), 크기: rect(card),
    스타일: cs(card, ['background','backdropFilter','border','borderRadius','padding','boxShadow','display','flexDirection','gap']),
    클릭핸들러_제거됨: !card.getAttribute('onclick') && !card.getAttribute('role'),
    텍스트: (card.innerText||'').split('\\n').map(s=>s.trim()).filter(Boolean),
    내부요소: [...card.querySelectorAll('[class]')].map(e=>e.getAttribute('class')).slice(0,40),
    svg: (()=>{const g=card.querySelector('svg'); return g?{크기:rect(g),viewBox:g.getAttribute('viewBox'),
      집계:Object.fromEntries(['path','rect','circle','line','text','g','polyline'].map(t=>[t,g.querySelectorAll(t).length])),
      텍스트:[...g.querySelectorAll('text')].map(t=>t.textContent.trim()).filter(Boolean).slice(0,24),
      선색:[...new Set([...g.querySelectorAll('path,polyline,line')].map(e=>e.getAttribute('stroke')).filter(Boolean))],
      면색:[...new Set([...g.querySelectorAll('rect,path,circle')].map(e=>e.getAttribute('fill')).filter(v=>v&&v!=='none'))]}:null})() } : '카드없음';
  const rn = D.querySelector('.ry-nav');
  R.프로그램넘김 = rn ? { 스타일: cs(rn, ['display','justifyContent','marginTop','padding']),
    구조: rn.innerHTML.replace(/\\s+/g,' ').slice(0,300),
    점개수: rn.querySelectorAll('.dot').length, 활성점: rn.querySelectorAll('.dot.on').length,
    화살표: [...rn.querySelectorAll('button.nav')].map(b=>b.innerText.trim()) } : '넘김없음';
  R.책장넘김 = cs(D, ['animation','animationName','animationDuration','transform','transition']);

  // 드릴 컨테이너 자체 + nav 슬롯
  R.컨테이너 = { 스타일: cs(D, ['padding','animation','animationName','animationDuration','background']), 크기: rect(D) };
  const nav = document.getElementById('srail-nav-slot');
  R.nav슬롯 = { 표시: nav ? getComputedStyle(nav).display : '없음',
    버튼: nav ? [...nav.querySelectorAll('button')].map(b => ({ 문구: b.innerText.trim(), 클래스: b.getAttribute('class'), 스타일: cs(b, ['fontSize','padding','background','border','borderRadius','color','fontWeight']) })) : [] };
  // 필터 슬롯이 숨겨졌는지(원본은 드릴 진입 시 숨긴다)
  const fs = document.getElementById('srail-filter-slot');
  R.필터슬롯_표시 = fs ? getComputedStyle(fs).display : '없음';
  return R;
})()`;

// ── A) 기본 화면 경로: 표 행을 실제로 클릭 → .ry-detail
async function openRyDetail(kind) {
  const clicked = await page.evaluate((k) => {
    const rows = [...document.querySelectorAll('#rail-yrm-list tbody tr')];
    const want = rows.find(tr => (tr.getAttribute('onclick') || '').includes(`_railYrmPick('${k}'`));
    if (!want) return null;
    const label = (want.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    want.click();
    return label;
  }, kind);
  if (!clicked) return { 오류: `${kind} 행을 못 찾음`, _클릭한행: null };
  await page.waitForTimeout(1500);
  const dump = await page.evaluate(CAPTURE('.ry-detail'));
  dump._클릭한행 = clicked;
  return dump;
}
// ── B) 레일 경로: 기본 화면에선 숨어 있으므로 함수를 직접 호출 → .srail-drill
async function openSrailDrill(kind) {
  const target = await page.evaluate((k) => {
    const el = [...document.querySelectorAll(`[onclick*="_srailDrill('${k}'"]`)][0];
    if (!el) return null;
    const m = (el.getAttribute('onclick') || '').match(/_srailDrill\('[^']+','([^']*)'\)/);
    if (!m) return null;
    try { window._srailDrill(k, m[1]); } catch (e) { return { 오류: String(e).slice(0, 120) }; }
    return m[1];
  }, kind);
  if (!target) return { 오류: `_srailDrill('${kind}') 대상을 못 찾음`, _클릭한행: null };
  if (target.오류) return { 오류: target.오류, _클릭한행: null };
  await page.waitForTimeout(1500);
  const dump = await page.evaluate(CAPTURE('.srail-drill'));
  dump._클릭한행 = target;
  return dump;
}

// A) 기본 화면 = 운영자가 말한 「프로그램 클릭 → 세부 판매현황」 바로 그것
const perf = await openRyDetail('perf');
if (!perf.오류) { try { await (await page.$('.ry-detail')).screenshot({ path: PNG_P }); } catch (e) { console.warn('  공연 스샷 실패', e.message); } }
console.log(`[A 기본화면] 공연 상세: ${perf.오류 || '캡처 OK — ' + perf._클릭한행}`);
await page.evaluate(() => { try { _ryDrillBack && _ryDrillBack(); } catch (e) { try { _railYrmRender && _railYrmRender(); } catch (_) { } } });
await page.waitForTimeout(1400);

const ex = await openRyDetail('ex');
if (!ex.오류) { try { await (await page.$('.ry-detail')).screenshot({ path: PNG_E }); } catch (e) { console.warn('  전시 스샷 실패', e.message); } }
console.log(`[A 기본화면] 전시 상세: ${ex.오류 || '캡처 OK — ' + ex._클릭한행}`);

// B) 레일 경로(캘린더 모드) — 참고용
const railPerf = await openSrailDrill('perf');
console.log(`[B 레일] 공연 드릴: ${railPerf.오류 || '캡처 OK — ' + railPerf._클릭한행}`);

// 레일 카드 경로도 존재 확인
const cardPath = await page.evaluate(() => {
  const c = document.querySelector('.srail-card');
  return c ? { 있나: true, onclick: (c.getAttribute('onclick') || '').slice(0, 90), role: c.getAttribute('role'), tabindex: c.getAttribute('tabindex'), title: c.getAttribute('title') } : { 있나: false };
});

// 소스에서 산식 구간 발췌 (재현에 필요한 계산 규칙)
const src = readFileSync(join(ROOT, 'index.html'), 'utf8').split('\n');
function grab(from, to) { return src.slice(from - 1, to).join('\n'); }
const srcBlocks = {
  '_srailDrill 진입(표 행 onclick)': (src.find(l => l.includes("_srailDrill('perf'")) || '').trim().slice(0, 260),
  '어제대비 임계(공연·전시 공통)': grab(6065, 6070),
  '또래 비교': grab(6071, 6076),
};

await browser.close(); srv.close();

// ─────────────────────────────────────────────── md
const J = o => '```json\n' + JSON.stringify(o, null, 1) + '\n```';
const listify = a => (a && a.length) ? a.map((t, i) => (i + 1) + '. `' + t + '`').join('\n') : '(없음)';
function treeText(n, d = 0) { if (!n) return ''; let s = '  '.repeat(d) + n.t + (n.x ? `  「${n.x}」` : '') + '\n'; for (const k of (n.c || [])) s += treeText(k, d + 1); return s; }

const md = `# 프로그램 클릭 → 세부 판매현황 — 정본 실측 명세

> 생성 \`tools/miso/build_drill_spec.mjs\` — 원본 \`standalone.html\`을 1920×1080으로 실렌더하고
> **판매현황 표 행을 실제로 클릭해서** 열린 상세 화면을 전량 덤프한 값이다. 산문 해석·추정 0.
> 스크린샷: \`이관본/드릴_공연.png\` · \`이관본/드릴_전시.png\`

---

## 0. 결론 — 클릭하면 무엇이 일어나는가

**모달이 아니다.** 목록이 있던 **박스가 통째로 그 프로그램 상세로 넘어간다**(책장 넘김).

\`\`\`
[기본 화면 = 사업 실적]
 우측 「판매 현황」 박스
   ├ (목록 상태) 판매현황 표 — 그룹 머리글 ● 공연 N / ● 전시 N + 행들
   └ 행 클릭 ─────────────────────────────────────────┐
                                                       ▼
   (상세 상태) .ry-detail                    ← 표가 사라지고 이걸로 교체
     ├ .ry-detail-body
     │    └ .srail-card  1장  (그 프로그램의 카드 · 클릭 핸들러는 떼어냄)
     └ .ry-nav
          └ .bizm-pgctl  ‹ ● ● ● ›   ← 프로그램 넘김(좌 보드 페이지 넘김과 같은 부품)
   복귀 = 「‹ 목록」
\`\`\`

### 배선 체인 (실측)

| 단계 | 실제 코드 |
|---|---|
| 1 | 표 행에 \`class="clk"\` \`onclick="_railYrmPick('perf'\|'ex', <키>)"\` \`data-uhakey\` |
| 2 | \`_railYrmPick\` → \`_srailUhaKick()\`(자동전환 잠시 정지) + \`_srailUhaShow(idx)\` + **\`_ryDrillOpen(want)\`** |
| 3 | \`_ryDrillOpen\` → 진입 직전 \`_ryDrillCapture()\`로 **표에 보이던 DOM 순서를 캡처**(그룹·정렬·필터 반영) |
| 4 | \`_ryDrillHtml(p,key)\` = \`<div class="ry-detail"><div class="ry-detail-body">\` + \`_srailCard(p)\` 또는 \`_srailCardEx(p)\` + \`</div>\` + \`_ryDrillNav(key)\` + \`</div>\` |
| 5 | \`_ryDrillStrip(box)\` → 카드의 \`onclick\`·\`onkeydown\`·\`role\`·\`tabindex\` **제거** + \`cursor:default\` |
| 6 | \`_ryFlip(el, 1)\` → \`.mv-swipe\` 클래스로 책장 넘김(복귀는 \`.rev\` 추가 = 반대 방향) |

> ⚠️ **카드 안에서 다시 클릭해도 아무 일이 없어야 한다.** 원본은 일부러 핸들러를 떼어낸다
> (운영자 지시 "이 안에 국한"). 카드를 또 클릭 가능하게 만들면 원본과 다르다.

### 프로그램 넘김 (\`.ry-nav\`)

| 항목 | 규칙 |
|---|---|
| 부품 | 좌측 보드 페이지 넘김 \`.bizm-pgctl\`을 **그대로 계승** (\`‹\` + \`.dots\` + \`›\`) |
| 점 개수 | 표에 보이던 행 수와 같다 (\`_ryDrillOrder()\`) |
| 순서 | **표의 DOM 순서** — 그룹·정렬·필터가 반영된 상태. 원본 목록 순서가 아니다 |
| 순환 | 마지막에서 \`›\` 누르면 처음으로 (\`((i%n)+n)%n\`) |
| 접근성 | 점 = \`aria-label="N번째 프로그램"\` \`aria-pressed\` · 화살표 = \`aria-label="이전/다음 프로그램"\` |
| 2개 미만 | \`_ryDrillNav\`가 **빈 문자열 반환** = 넘김 UI 자체를 안 그린다 |

### 표 쪽에서 같이 일어나는 것

- 선택된 행에 \`.on\` 클래스가 붙는다 (\`_railYrmMarkRow\`) — 자동 5초 전환 때도 따라 움직인다
- 액티브 행 하이라이트 pill이 행 사이를 **미끄러진다** (\`_railYrmHlTo\` — 상단 nav 호버 pill과 같은 문법)
- 첫 등장만 제자리 페이드(\`is-instant\`), 이후 \`top\`/\`height\` 전이

---

## 1. 공연 상세 — 실측 전량

**클릭한 행**: \`${perf._클릭한행 || '(실패)'}\`
${perf.오류 ? '\n> ⚠️ 캡처 실패: ' + perf.오류 + '\n' : ''}
### 1-1. 화면에 보이는 텍스트 (위→아래 순서 그대로)

${listify(perf.전체텍스트)}

### 1-2. 구조 트리 (깊이 6)

\`\`\`
${perf.트리 ? treeText(perf.트리) : '(없음)'}\`\`\`

### 1-3. 카드 (\`.srail-card\`) — 상세의 본체
${J(perf.카드 || {})}

### 1-4. 프로그램 넘김 (\`.ry-nav\`)
${J(perf.프로그램넘김 || {})}

### 1-5. 책장 넘김 애니메이션 (\`.ry-detail\`)
${J(perf.책장넘김 || {})}

### 1-6. 컨테이너 · nav 슬롯 · 필터 슬롯
${J({ 컨테이너: perf.컨테이너, nav슬롯: perf.nav슬롯, 필터슬롯_표시: perf.필터슬롯_표시 })}

---

## 2. 전시 상세 — 실측 전량

**클릭한 행**: \`${ex._클릭한행 || '(실패)'}\`
${ex.오류 ? '\n> ⚠️ 캡처 실패: ' + ex.오류 + '\n' : ''}
### 2-1. 화면에 보이는 텍스트

${listify(ex.전체텍스트)}

### 2-2. 구조 트리 (깊이 6)

\`\`\`
${ex.트리 ? treeText(ex.트리) : '(없음)'}\`\`\`

### 2-3. 카드 · 넘김
${J({ 카드: ex.카드, 프로그램넘김: ex.프로그램넘김 })}

> **공연 카드와 다른 점** — \`_srailCardEx\`가 그린다. 지표가 좌석 점유가 아니라 **목표관객 대비 달성률**이다.

---

## 3. 참고 — 캘린더 모드의 별도 상세 (\`.srail-drill\`)

기본 화면의 \`.ry-detail\`과 **다른 화면이다.** 캘린더 모드 우측 판매 레일에서 카드를 누르면 열린다.
KPI 4칸 + 큰 차트 + AI 분석 카드 구성이라 훨씬 무겁다. **MISO 1차 이식 범위에서는 후순위**로 둔다.

**실측**: \`${railPerf.오류 || railPerf._클릭한행}\`
${railPerf.오류 ? '' : J({ 텍스트: railPerf.전체텍스트, 헤더: railPerf.헤더, 메타줄: railPerf.메타줄, KPI: railPerf.KPI, 차트: railPerf.차트, AI카드: railPerf.AI카드 })}

### 이쪽 진입점
${J(cardPath)}

---

## 4. 계산 규칙 (원본 소스 — 그대로 구현)

### 4-1. 어제대비 (\`deltaPP\`) — 공연·전시 공통 임계

\`\`\`js
${srcBlocks['어제대비 임계(공연·전시 공통)']}
\`\`\`

| 조건 | 표기 | 색 |
|---|---|---|
| \`null\` | \`수집 전\` | \`--dim\` #888 |
| \`> 0.04\` | \`▲ +N.N%p\` | \`--green\` #1A6B3C |
| \`< -0.04\` | \`▼ -N.N%p\` | \`--danger\` #E24B4A |
| 그 사이 | \`보합\` | \`--dim\` |

> ⚠️ 임계가 **0.04**다. 0으로 하면 미세 변동이 전부 ▲/▼로 나와 화면이 시끄러워진다.

### 4-2. 목표 / 차이

\`\`\`
목표 = p.목표 || 50          ← 기본값 50%
차이 = 현재점유율 - 목표
표기 = "+N.N%p"(0 이상 → --green) / "-N.N%p"(음수 → --danger)
noData면 차이 줄 자체를 출력하지 않는다
\`\`\`

### 4-3. 또래 비교

\`\`\`js
${srcBlocks['또래 비교']}
\`\`\`

\`\`\`
① 같은 사업성격축 + 같은 장르의 **종료** 공연을 모은다
② 표본이 3건 미만이면 축 전체로 넓힌다
③ 그 집단의 점유율 중앙값과 비교
표기 = "또래(N건) 중앙값 NN% 대비 +N%p"  /  표본 0이면 "비교할 또래 종료공연 없음"
\`\`\`

---

## 5. MISO 구현 체크리스트

| # | 확인 | 기대 |
|---|---|---|
| 1 | 판매현황 표 행 클릭 | **목록이 사라지고 같은 박스 안에서** 상세로 교체 (모달·새 페이지·새 탭 전부 아님) |
| 2 | 전환 연출 | 우→중앙 책장 넘김. 복귀는 좌→중앙(반대 방향) |
| 3 | 상세 내용 | 그 프로그램의 카드 **1장** (\`.srail-card\` 문법) |
| 4 | 카드 재클릭 | **아무 일도 안 일어난다** (핸들러 제거가 원본 규칙) |
| 5 | 하단 넘김 | \`‹ ● ● ● ›\` · 점 개수 = 표 행 수 · 순서 = 표의 DOM 순서 · 마지막→처음 순환 |
| 6 | 행이 1개뿐일 때 | 넘김 UI를 **안 그린다** |
| 7 | 복귀 | 「‹ 목록」 → 표로 돌아가고 선택 행에 \`.on\` 유지 |
| 8 | 선택 행 표시 | 표로 돌아왔을 때 그 행에 \`.on\` + 하이라이트 pill |
| 9 | 자동 전환 | 상세 진입 시 5초 자동전환이 **잠시 멈춘다**(읽는 중) · 유휴 뒤 재개 |
| 10 | 전시 행 | 공연과 다른 카드(\`_srailCardEx\`) · 목표관객 대비 달성률 |
| 11 | 데이터 없는 행 | 클릭 불가 (\`noData\`면 \`.clk\` 미부착) |

---

## 6. CSS는 이미 뽑혀 있다 — 새로 쓰지 마라

이 화면의 CSS(\`.ry-detail\`·\`.ry-detail-body\`·\`.ry-nav\`·\`.srail-card\`·\`.bizm-pgctl\`·\`.dot\`·\`.mv-swipe\`·\`.ry-grp\`·\`.ry-grp-hd\`·\`.ry-hl\` 등)는
**\`이관본/첨부/정본_스타일.css\`(133KB) 안에 원문 그대로** 들어 있다. 사용법 = \`이관본/첨부/CSS_정본_지시.md\`
`;
writeFileSync(OUT, md, 'utf8');
console.log(`\n✅ ${OUT.replace(ROOT + '/', '')} — ${Math.round(Buffer.byteLength(md) / 1024)}KB`);
console.log(`   [A] 공연 ${perf.전체텍스트 ? perf.전체텍스트.length : 0}줄 · 카드 ${perf.카드 && perf.카드 !== "카드없음" ? "O" : "X"} · 넘김점 ${perf.프로그램넘김 && perf.프로그램넘김.점개수 || 0}`);
console.log(`   [A] 전시 ${ex.전체텍스트 ? ex.전체텍스트.length : 0}줄 · 카드 ${ex.카드 && ex.카드 !== "카드없음" ? "O" : "X"}`);
console.log(`   [B] 레일 ${railPerf.오류 ? railPerf.오류 : (railPerf.전체텍스트||[]).length + "줄 · KPI " + ((railPerf.KPI&&railPerf.KPI.칸)||[]).length + "칸"}`);
