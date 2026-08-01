#!/usr/bin/env node
/* 공연별 페이지 접속통계 빌더 — data/access_stats/*.csv → data/perf_access_stats.js
   원천 = 예매 사이트 「공연별 접속 통계」 내려받기 CSV(로그인 회원 기준 접속수 + 연령대·지역 비율).
   실행: node tools/build_access_stats.mjs
   ⚠️ 산출물(data/perf_access_stats.js)은 기계산출물 — 손편집 금지. 값이 바뀌면 CSV를 갈아끼우고 이 스크립트를 다시 돌린다. */
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'data/access_stats';
const OUT = 'data/perf_access_stats.js';

// 따옴표 포함 CSV 파서(줄바꿈 내장 셀까지)
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };

const AGE_COLS = ['20세 미만', '20~29세', '30~39세', '40~49세', '50~59세', '60~69세', '70세 이상'];
const REGION_COLS = ['여수', '순천', '광양', '호남', '광주', '호남 외 지역'];

const files = fs.readdirSync(SRC_DIR).filter(f => f.toLowerCase().endsWith('.csv')).sort();
if (!files.length) { console.error('[access-stats] CSV 없음: ' + SRC_DIR); process.exit(1); }

const out = [];
for (const f of files) {
  const rows = parseCsv(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
  const head = rows[0].map(h => String(h).trim());
  const idx = name => head.findIndex(h => h === name || h.replace(/\(.*\)$/, '').trim() === name);
  const col = { s: idx('공연시작일'), e: idx('공연종료일'), c: idx('구분'), v: idx('공연장'), n: idx('공연명'), t: idx('총 접속수') };
  const ageIdx = AGE_COLS.map(a => head.findIndex(h => h.replace(/\(%\)$/, '').trim() === a));
  const regIdx = REGION_COLS.map(a => head.findIndex(h => h.replace(/\(%\)$/, '').trim() === a));
  // 성별 열은 현재 내려받기 CSV에 없다 — 있으면(남성(%)/여성(%)) 우세 성별을 x로 실어 문장에 「40대 여성」으로 붙는다.
  const mIdx = head.findIndex(h => /^남(성|자)/.test(h.replace(/\(%\)$/, '').trim()));
  const fIdx = head.findIndex(h => /^여(성|자)/.test(h.replace(/\(%\)$/, '').trim()));
  for (const r of rows.slice(1)) {
    const name = String(r[col.n] ?? '').trim();
    if (!name) continue;
    const mv = mIdx >= 0 ? num(r[mIdx]) : null, fv = fIdx >= 0 ? num(r[fIdx]) : null;
    const x = (mv === null || fv === null) ? '' : (fv >= mv ? '여성' : '남성');
    out.push({
      ...(x ? { x } : {}),
      s: String(r[col.s] ?? '').trim(),
      e: String(r[col.e] ?? '').trim(),
      c: String(r[col.c] ?? '').trim(),
      v: String(r[col.v] ?? '').trim(),
      n: name,
      t: Math.round(num(r[col.t])),
      a: ageIdx.map(i => (i >= 0 ? num(r[i]) : 0)),
      g: regIdx.map(i => (i >= 0 ? num(r[i]) : 0)),
    });
  }
}
out.sort((x, y) => (x.s < y.s ? -1 : x.s > y.s ? 1 : 0));

const stamp = (process.env.ACCESS_STATS_ASOF || new Date().toISOString().slice(0, 10));
const body = `/* [기계산출물 — 손편집 금지] 공연별 페이지 접속통계.
   생성 = tools/build_access_stats.mjs · 원천 = ${SRC_DIR}/ (${files.join(', ')})
   a = 연령대 비율(%) [${AGE_COLS.join(' · ')}]
   g = 지역 비율(%) [${REGION_COLS.join(' · ')}]
   t = 총 접속수(로그인 회원) */
var PERF_ACCESS_STATS = {
  asof: ${JSON.stringify(stamp)},
  ageLabels: ${JSON.stringify(AGE_COLS)},
  regionLabels: ${JSON.stringify(REGION_COLS)},
  rows: [
${out.map(o => '    ' + JSON.stringify(o)).join(',\n')}
  ]
};
`;
fs.writeFileSync(OUT, body);
console.log('[access-stats] ' + out.length + '건 → ' + OUT);
