#!/usr/bin/env node
/* 회원 DB → MISO 반입 패키지 생성기 — 산출 = 이관본/비공개/ (gitignore 차단, 커밋 불가)
   운영자 방침(Q.26): 회원 원본은 MISO(사내 DB 체계) 안으로 옮긴다(고객정보 활용) —
   "파일만 딱 주면 그냥 붙이면 딱 들어가게". 공개 레포에는 절대 커밋되지 않고,
   생성된 폴더를 통째로 MISO에 첨부/업로드하는 용도다.
   입력: data/db_export/회원_*.csv (xlsx는 먼저 tools/miso/xlsx_to_csv.py로 변환)
   사용: node tools/miso/build_members.mjs */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(ROOT, 'data', 'db_export');
const OUT = join(ROOT, '이관본', '비공개');

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}
const esc = v => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = grid => '﻿' + grid.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';

const LEDGER = join(SRC_DIR, '회원_운영_회원.csv');
if (!existsSync(LEDGER)) { console.error('입력 없음: data/db_export/회원_운영_회원.csv — 회원 xlsx를 xlsx_to_csv.py로 변환 후 실행'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// 1) 원장 — 전 컬럼 그대로(빈 헤더만 정리), MISO에 "그대로 붙이는" 파일
const grid = parseCsv(readFileSync(LEDGER, 'utf8'));
const hdr = grid[0].map(h => h.trim());
const keep = hdr.map((h, i) => h !== '' ? i : -1).filter(i => i >= 0);
const ledger = [keep.map(i => hdr[i]), ...grid.slice(1).map(r => keep.map(i => r[i] ?? ''))];
writeFileSync(join(OUT, '회원_원장.csv'), toCsv(ledger), 'utf8');

// 2) 집계 시트 2종 — 원본 그대로 복사(PII 무해)
for (const n of ['회원_지역집계', '회원_동별집계']) {
  const p = join(SRC_DIR, `${n}.csv`);
  if (existsSync(p)) writeFileSync(join(OUT, `${n}.csv`), readFileSync(p, 'utf8'), 'utf8');
}

// 3) 연령대 집계 생성 — 생년월일 → 10년 버킷 (파생본, PII 무해)
const bi = ledger[0].indexOf('생년월일');
const nowY = new Date().getFullYear();
const buckets = {};
if (bi >= 0) {
  for (const r of ledger.slice(1)) {
    let y = null; const v = String(r[bi] || '');
    const m = v.match(/(19|20)\d{2}/);
    if (m) y = +m[0];
    else if (/^\d{5}$/.test(v.trim())) y = new Date((+v.trim() - 25569) * 86400000).getUTCFullYear(); // 엑셀 시리얼
    let label = '미상';
    if (y && y > 1900 && y <= nowY) { const age = nowY - y; label = age < 10 ? '10세 미만' : age >= 80 ? '80대 이상' : `${Math.floor(age / 10) * 10}대`; }
    buckets[label] = (buckets[label] || 0) + 1;
  }
  const order = ['10세 미만','10대','20대','30대','40대','50대','60대','70대','80대 이상','미상'];
  writeFileSync(join(OUT, '회원_연령대집계.csv'),
    toCsv([['연령대','회원수'], ...order.filter(k => buckets[k]).map(k => [k, buckets[k]])]), 'utf8');
}

writeFileSync(join(OUT, 'README.md'), `# 이관본/비공개 — 회원 DB MISO 반입 패키지 (커밋 금지·gitignore 차단)

생성: tools/miso/build_members.mjs (기계산출물 — 손편집 금지) · ${new Date().toISOString()}

| 파일 | 내용 | MISO 반입 |
|---|---|---|
| 회원_원장.csv | 전 컬럼 원본 ${ledger.length - 1}행 (PII 포함) | 내부 DB/지식베이스에 직접 업로드 — 이 파일이 "그대로 붙이면 들어가는" 원장 |
| 회원_지역집계.csv · 회원_동별집계.csv | 주소 단위 회원수 (PII 없음) | 분석용 — 공개 번들 편입도 가능(운영자 승인 시) |
| 회원_연령대집계.csv | 생년월일 → 10년 버킷 (PII 없음) | 〃 |

⚠️ 이 폴더는 .gitignore로 차단된다 — 어떤 경우에도 공개 레포에 커밋하지 말 것.
`, 'utf8');
console.log(`✅ 이관본/비공개/ — 회원_원장 ${ledger.length - 1}행 + 집계 3종 (커밋 차단 폴더)`);
