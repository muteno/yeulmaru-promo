#!/usr/bin/env node
/* 완전동일 명세 생성기 — 원본 대시보드(사업 실적 = biz-mode)를 헤드리스로 실렌더해
   ① DOM 구조 트리 ② 핵심 요소의 computed style 실측값 ③ 원본 CSS 블록 발췌를 뽑아
   이관본/완전동일_명세.md 로 쓴다. 산문 해석이 아니라 실측 정본이므로 MISO 재현 충실도가 올라간다.
   전제: node tools/miso/build_standalone.mjs 선실행(이관본/standalone.html 필요)
   사용: node tools/miso/build_fidelity_spec.mjs
   ⚠️ 기계산출물 — 손편집 금지. 원본(index.html)을 고치고 재실행. */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SA = join(ROOT, '이관본', 'standalone.html');
const OUT = join(ROOT, '이관본', '완전동일_명세.md');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';

if (!existsSync(SA)) { console.error('이관본/standalone.html 없음 — build_standalone.mjs 먼저'); process.exit(1); }
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core 필요'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'fid-'));
copyFileSync(SA, join(dir, 'a.html'));
const srv = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(readFileSync(join(dir, 'a.html'))); });
await new Promise(r => srv.listen(8447, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--ignore-certificate-errors'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto('http://127.0.0.1:8447/a.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pin-step', { state: 'visible', timeout: 15000 });
for (const d of '0510') await page.keyboard.type(d);
await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
await page.waitForTimeout(10000); // 오프라인 래치 + 렌더 완료

const dump = await page.evaluate(() => {
  // DOM 구조 트리 — 태그+클래스+짧은 텍스트, 깊이 제한
  function tree(el, depth, max) {
    if (!el || depth > max) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 4);
    const id = el.id ? '#' + el.id : '';
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    const node = { t: el.tagName.toLowerCase() + id + (cls.length ? '.' + cls.join('.') : '') };
    if (own) node.x = own.length > 60 ? own.slice(0, 60) + '…' : own;
    const kids = Array.from(el.children).map(c => tree(c, depth + 1, max)).filter(Boolean);
    if (kids.length) node.c = kids;
    return node;
  }
  // computed style 실측 — 재현에 필요한 속성만
  const PROPS = ['display', 'flexDirection', 'gridTemplateColumns', 'flex', 'gap', 'padding', 'margin',
    'width', 'height', 'minHeight', 'maxWidth', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'color', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow', 'backdropFilter',
    'textAlign', 'position', 'overflow'];
  function styles(sel) {
    const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el); const o = {};
    for (const p of PROPS) { const v = cs[p]; if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') o[p] = v; }
    const r = el.getBoundingClientRect(); o['@rect'] = `${Math.round(r.width)}×${Math.round(r.height)}`;
    return o;
  }
  const SELS = {
    '내비 바': '.nav',
    '내비 로고': '.nav .logo, .nav img',
    '내비 메뉴 컨테이너': '#nav-menus',
    '내비 메뉴 항목(활성)': '#nav-menus .mv-seg .on, #nav-menus a.on, #nav-menus .active',
    '본문 랩': '#body-wrap',
    '좌측 사업실적 통': '#biz-main',
    '좌측 카드': '#biz-main .bizm-card',
    'KPI 스트립': '#biz-main .bizm-strip',
    'KPI 칸': '#biz-main .bizm-strip .cell',
    '섹션 제목': '#biz-main .bizm-sec-tt, #biz-main .bizm-tt',
    '전체 실적표': '#biz-main table',
    '표 헤더셀': '#biz-main table th',
    '표 데이터셀': '#biz-main table td',
    '우측 판매레일': '#sales-rail',
    '레일 헤더': '.srail-head',
    '레일 타이틀': '.srail-ttltext',
    '판매현황 통': '#rail-yrm',
    '판매현황 리스트': '#rail-yrm-list',
    '분야 그룹 머리글': '#rail-yrm-list .ry-grp-hd',
    '판매현황 표': '#rail-yrm-list table',
    '판매현황 헤더셀': '#rail-yrm-list th',
    '판매현황 데이터셀': '#rail-yrm-list td',
  };
  const st = {}; for (const [k, s] of Object.entries(SELS)) { const v = styles(s); if (v) st[k] = v; }

  // 표 텍스트 실측(열 구성 확인용)
  function tableDump(sel, maxRows) {
    const t = document.querySelector(sel); if (!t) return null;
    const rows = Array.from(t.querySelectorAll('tr')).slice(0, maxRows);
    return rows.map(tr => Array.from(tr.children).map(c => (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)));
  }
  return {
    bizTree: tree(document.querySelector('#biz-main'), 0, 8),
    railTree: tree(document.querySelector('#sales-rail'), 0, 8),
    navTree: tree(document.querySelector('.nav'), 0, 4),
    styles: st,
    bizTable: tableDump('#biz-main table', 8),
    railTable: tableDump('#rail-yrm-list table', 6),
    navText: (document.querySelector('#nav-menus') || {}).innerText || '',
    kpiText: (document.querySelector('#biz-main .bizm-strip') || {}).innerText || '',
    railGroups: Array.from(document.querySelectorAll('#rail-yrm-list .ry-grp-hd')).map(e => e.innerText.trim()),
    panelText: {
      '좌측 사업실적 전체': ((document.querySelector('#biz-main')||{}).innerText||'').slice(0,1400),
      '우측 판매현황 전체': ((document.querySelector('#sales-rail')||{}).innerText||'').slice(0,1400),
    },
    viewport: `${innerWidth}×${innerHeight}`,
  };
});
await browser.close(); srv.close();

// 원본 CSS 블록 발췌
const src = readFileSync(join(ROOT, 'index.html'), 'utf8').split('\n');
function cssBlock(from, to) { return src.slice(from - 1, to).join('\n'); }
const cssRoot1 = cssBlock(41, 57), cssRoot2 = cssBlock(1610, 1636);
const cssRail = cssBlock(1886, 2033), cssBiz = cssBlock(2034, 2218);

function treeText(n, d = 0) {
  if (!n) return '';
  let s = '  '.repeat(d) + n.t + (n.x ? `  「${n.x}」` : '') + '\n';
  for (const c of (n.c || [])) s += treeText(c, d + 1);
  return s;
}
function styleTable(st) {
  let s = '';
  for (const [k, v] of Object.entries(st)) {
    s += `\n**${k}** (실측 ${v['@rect']})\n\n\`\`\`css\n`;
    for (const [p, val] of Object.entries(v)) if (p !== '@rect') s += `${p.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${val};\n`;
    s += '```\n';
  }
  return s;
}

const md = `# 원본 대시보드 완전동일 재현 명세 (실측 정본)

> **생성**: \`tools/miso/build_fidelity_spec.mjs\` — 원본 \`index.html\`을 **1920×1080 헤드리스로 실렌더**해
> DOM 구조·computed style을 실측 추출한 기계산출물이다(손편집 금지 · 산문 해석 아님).
> 뷰포트 ${dump.viewport} 기준. 데이터는 \`예울마루_데이터.json\`을 쓴다.
>
> **용도**: MISO 빌더에게 "화면을 원본과 똑같이" 요구할 때, 아래 §2 구조 트리와 §3 실측 스타일을
> 그대로 따르게 한다. 값을 추측하거나 임의로 예쁘게 바꾸지 말라고 명시할 것.

## 1. 화면 골격 (원본 = 사업 실적이 기본 화면)

\`\`\`
┌─ .nav (상단 내비 1줄, 인디고 불투명 바) ────────────────────────────┐
│  로고  ‹ 7 2026 ›   [대시보드] 캘린더 상품 등록·변경 홍보 신청·확인   │
│                      사업 실적 사업 현황 콘텐츠 제작   ✉ 이름 ✎ ⚙   │
└──────────────────────────────────────────────────────────────────┘
┌─ #body-wrap ────────────────────────────────────────────────────┐
│ ┌ #biz-main (좌, 연간 실적) ──┐ ┌ #sales-rail (우, 판매 현황) ──┐ │
│ │ 헤더: 연간 실적 2012~2026.1Q│ │ 헤더: 판매 현황              │ │
│ │       우측 누적 3,690,031명 │ │                              │ │
│ │ KPI 스트립 4칸              │ │ #rail-yrm-list               │ │
│ │ 연도별 관람·수강 추이 차트   │ │  ● 공연 N (그룹 머리글)      │ │
│ │ 전체 실적표(2020~2025+누계) │ │  표: 일자·프로그램·판매율…   │ │
│ │ 하단 페이지 도트 ‹ • • ›    │ │  ● 전시 N                    │ │
│ └────────────────────────────┘ └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

**내비 메뉴 실측 텍스트**
\`\`\`
${dump.navText.trim()}
\`\`\`

**KPI 스트립 실측 텍스트**
\`\`\`
${dump.kpiText.trim()}
\`\`\`

**판매 현황 그룹 머리글 실측**: ${dump.railGroups.map(g => `\`${g.replace(/\n/g, ' ')}\``).join(' · ') || '(없음)'}

## 1-9. 화면 전체 텍스트 실측 (이 문구·숫자가 그대로 나와야 한다)

### 좌측 「연간 실적」 패널
\`\`\`
${dump.panelText['좌측 사업실적 전체'].trim()}
\`\`\`

### 우측 「판매 현황」 패널
\`\`\`
${dump.panelText['우측 판매현황 전체'].trim()}
\`\`\`

## 2. DOM 구조 트리 (실렌더 추출 — 이 계층을 그대로 재현)

### 2-1. 상단 내비 \`.nav\`
\`\`\`
${treeText(dump.navTree).trimEnd()}
\`\`\`

### 2-2. 좌측 「연간 실적」 \`#biz-main\`
\`\`\`
${treeText(dump.bizTree).trimEnd()}
\`\`\`

### 2-3. 우측 「판매 현황」 \`#sales-rail\`
\`\`\`
${treeText(dump.railTree).trimEnd()}
\`\`\`

## 3. 핵심 요소 computed style 실측 (이 값을 그대로 쓸 것)
${styleTable(dump.styles)}

## 4. 표 구성 실측

### 4-1. 전체 실적표 (\`#biz-main table\`)
${(dump.bizTable || []).map(r => '| ' + r.join(' | ') + ' |').join('\n') || '(없음)'}

### 4-2. 판매 현황 표 (\`#rail-yrm-list table\`)
${(dump.railTable || []).map(r => '| ' + r.join(' | ') + ' |').join('\n') || '(없음)'}

## 5. 원본 CSS 발췌 (verbatim — 값 변경 금지)

### 5-1. \`:root\` 토큰 블록 1 (index.html L41~57)
\`\`\`css
${cssRoot1}
\`\`\`

### 5-2. \`:root\` 토큰 블록 2 (index.html L1610~1636)
\`\`\`css
${cssRoot2}
\`\`\`

### 5-3. 판매 레일 \`.srail-*\` (index.html L1886~2033)
\`\`\`css
${cssRail}
\`\`\`

### 5-4. 사업 실적 \`biz-mode\`·\`bizm-*\`·\`ry-*\` (index.html L2034~2218)
\`\`\`css
${cssBiz}
\`\`\`

---

**재현 지시 문구(빌더에게 그대로 전달)**

> 위 §2 DOM 트리의 계층과 §3 실측 스타일 값을 그대로 재현해라. 값을 추측하거나 "더 예쁘게" 바꾸지 마라.
> §5 CSS는 원본 verbatim이므로 클래스명·수치를 그대로 옮기고, Tailwind 4 \`@theme\`에 \`:root\` 토큰을 등록해
> 그 변수만 참조해라. 표의 열 구성은 §4 실측과 동일해야 한다.
`;

writeFileSync(OUT, md, 'utf8');
console.log(`✅ 이관본/완전동일_명세.md — ${(Buffer.byteLength(md) / 1024).toFixed(0)}KB`);
console.log(`   DOM 트리 3종 · computed style ${Object.keys(dump.styles).length}요소 · CSS 4블록`);
console.log(`   내비: ${dump.navText.replace(/\n/g, ' ').slice(0, 60)}`);
console.log(`   판매현황 그룹: ${dump.railGroups.join(' / ') || '(없음)'}`);
