#!/usr/bin/env node
/**
 * 연간 일정 스냅샷 빌더 — index.html의 `<!-- YC-AUTO-START -->` 구간을 다시 찍는다.
 *
 * 왜 스냅샷이 필요한가: 연간 일정은 `?annual` 공유 링크·내려받은 HTML처럼 **로그인 없이** 열리는 경로가 있고,
 * 거기선 프로그램 시트 API(`api()` = 앱 비번 헤더 필요)를 못 부른다. 그래서 마크업에 마지막 스냅샷을 박아 둔다.
 * 로그인 상태에서는 `_ycSync()`가 같은 렌더러로 실시간 재생성하므로, 스냅샷은 「비로그인 화면의 기본값」일 뿐이다.
 *
 * 드리프트 0 장치: 렌더러를 여기 복제하지 않는다. index.html의 `// YC-BUILD-START ~ // YC-BUILD-END`
 * 구간을 그대로 읽어 실행한다 → 앱 화면과 스냅샷은 **항상 같은 코드**가 만든다.
 *
 * 입력(데이터) = `이관본/data/programs.csv`(프로그램 시트 거울). 라이브 시트는 인증이 필요해 CI에서 못 읽는다 —
 * 거울이 낡았으면 거울을 먼저 갱신하고 돌린다.
 *
 * 실행: node tools/build_annual.mjs         (기록 · index.html 갱신)
 *       node tools/build_annual.mjs --check (검사만 · 다르면 exit 1)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const CSV = join(ROOT, '이관본/data/programs.csv');
const CHECK = process.argv.includes('--check');

function cut(src, a, b, what) {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0 || j < i) throw new Error(`${what} 마커를 못 찾음: ${a} … ${b}`);
  const from = src.indexOf('\n', i + a.length) + 1;   // 마커 줄 꼬리 주석은 버리고 다음 줄부터
  return { i, j, body: src.slice(from, j) };
}

// 최소 CSV 파서 — 따옴표 안 콤마/개행 허용(공연명에 콤마가 있다: 「실내악, 그 이상의 세계」)
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.replace(/^﻿/, '').trim());
  return rows.filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? '').trim()])));
}

const src = readFileSync(INDEX, 'utf8');

// ① 렌더러 = index.html에서 그대로 가져와 실행 (복제 금지)
const build = cut(src, '// YC-BUILD-START', '// YC-BUILD-END', '렌더러');
const R = new Function(build.body + '\nreturn {_ycItems,_ycBuild};')();

// ② 데이터 = 프로그램 시트 거울 → PERFS 모양(programToPerf와 같은 필드명)
const TYPE = { '공연': 'c', '전시': 'e', '예술교육': 'a', '대관': 'r', '기타': 'c' };
const iso = v => (String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/) || [''])[0];
const perfs = parseCsv(readFileSync(CSV, 'utf8')).map(p => ({
  s: iso(p['시작일']), e: iso(p['종료일']),
  f: p['풀네임'] || '', n: p['줄임말'] || '',
  t: TYPE[p['콘텐츠구분']] || 'c',
  l: p['장소'] || '', u: p['URL'] || '', g: p['구분'] || '',
}));

const html = R._ycBuild(R._ycItems(perfs));
const items = R._ycItems(perfs);
const nEv = items.filter(x => x.k === 'ev').length, nEx = items.filter(x => x.k === 'ex').length;

// ③ 스냅샷 교체
const A = '<!-- YC-AUTO-START', B = '<!-- YC-AUTO-END -->';
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < 0) { console.error('[build_annual] YC-AUTO 마커를 못 찾음 — index.html 확인'); process.exit(1); }
const headEnd = src.indexOf('-->', i) + 3;
const head = src.slice(i, headEnd);
const next = head + '\n' + html + '\n' + B;
const out = src.slice(0, i) + next + src.slice(j + B.length);

if (out === src) { console.log(`✓ build_annual 최신 — 공연 ${nEv} · 전시 ${nEx} (변경 없음)`); process.exit(0); }
if (CHECK) {
  console.error(`✗ build_annual 스냅샷이 시트와 다름 — 공연 ${nEv} · 전시 ${nEx}. \`node tools/build_annual.mjs\`로 다시 찍어라.`);
  process.exit(1);
}
writeFileSync(INDEX, out);
console.log(`✓ build_annual 기록 — 공연 ${nEv} · 전시 ${nEx} → index.html YC-AUTO 구간 갱신`);
