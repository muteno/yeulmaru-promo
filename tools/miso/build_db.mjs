#!/usr/bin/env node
/* MISO 이식용 DB 통합 빌더 — 유관 DB를 하나로 합쳐 data/miso_db.json(단일 번들)과
   data/miso_kb/*.csv(MISO 지식베이스 업로드용)를 생성한다.

   입력(있는 것만 합침 — 전부 선택적):
     ① data/db_export/*.csv        — SharePoint 시트 내보내기 (파일명 규칙 = data/db_export/README.md)
     ② 레포 최상단 *.csv|*.json    — 운영자가 직접 올린 DB 파일 (시트명 규칙 동일 적용, 미인식명 = 파일명 그대로 반입)
     ③ docs/260620_전시*.json      — 전시 DB 스냅샷 (①②에 같은 데이터셋이 있으면 그쪽이 우선)
     ④ data/edu_institutions.js + data/유치원어린이집_명단_20260724 폴더의 전체통합.csv — 교육기관
   xlsx/xlsm은 먼저 python3 tools/miso/xlsx_to_csv.py <파일>로 CSV 변환 후 실행.

   사용: node tools/miso/build_db.mjs [--include-emails] [--include-secrets] [--include-members]
   ⚠️ 산출물 = 기계산출물(손편집 금지). 값 수정은 원본을 고치고 재실행.
   ⚠️ 회원(운영_회원) 데이터는 기본 미반입 — 구조(헤더·행수)만 meta.memberSchema로 설계 보고.
      --include-members로 반입해도 이름·연락처류 컬럼은 공개 레포 커밋 금지. */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPORT_DIR = join(ROOT, 'data', 'db_export');
const OUT_JSON = join(ROOT, 'data', 'miso_db.json');
const KB_DIR = join(ROOT, 'data', 'miso_kb');

const INCLUDE_EMAILS = process.argv.includes('--include-emails');
const INCLUDE_SECRETS = process.argv.includes('--include-secrets');
const INCLUDE_MEMBERS = process.argv.includes('--include-members');

// 파일명(slug/한글 시트명) → 데이터셋 이름. docs/앱지침.md SHEET_MAP + Worker(src/index.js) 시트 전수.
const SHEET_ALIASES = {
  applysettings: 'applysettings', '홍보접수설정': 'applysettings',
  records: 'records', '신청내역': 'records', '홍보기록': 'records',
  programs: 'programs', '프로그램': 'programs',
  platforms: 'platforms', '플랫폼': 'platforms',
  contents: 'contents', '콘텐츠형식': 'contents', '콘텐츠': 'contents',
  managers: 'managers', '담당자': 'managers',
  special: 'special', 'promospecial': 'special',
  logs: 'logs', '로그': 'logs',
  messages: 'messages', '메시지': 'messages',
  chatbot_faq: 'chatbot_faq', '챗봇faq': 'chatbot_faq', '챗봇FAQ': 'chatbot_faq',
  chatbot_log: 'chatbot_log', '챗봇로그': 'chatbot_log',
  qa_complaints: 'qa_complaints', '불편사항': 'qa_complaints',
  rules: 'rules', '규정': 'rules',
  diagrams: 'diagrams', '도표': 'diagrams',
  '운영_전시일일': 'exhib_daily', exhib_daily: 'exhib_daily',
  '운영_전시마스터': 'exhib_master', exhib_master: 'exhib_master',
};
const MEMBER_PAT = /회원/; // 운영_회원 등 — PII, 기본 미반입(구조 설계만)
const EXPECTED_SHEETS = ['applysettings','records','programs','platforms','contents','managers','special','logs'];

// positional SSOT (docs/앱지침.md §positional 시트 철칙) — 어긋나면 경고만(병합은 헤더 기준이라 안전).
const POSITIONAL_SSOT = {
  managers: ['담당부서','담당자','직위','휴직여부','홍보여부','기관여부','공연여부','전시여부','예술교육여부','대관여부','PIN','비밀번호','계정여부','관리자여부','이메일'],
  programs: ['NO','콘텐츠구분','풀네임','줄임말','판매시작일','판매종료일','시작일','종료일','담당자','장소','URL','프로그램ID','홍보시작일','구분','공동기획여부','지원사업여부','GS아트센터협업여부'],
};

function isSecretCol(h) { return /PIN|비밀번호|password/i.test(h); }
function isEmailCol(h) { return /이메일|e-?mail/i.test(h); }

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

function toCsv(headers, rows) {
  const esc = v => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n') + '\r\n';
}

const datasets = {}; const report = { missing: [], warnings: [], maskedColumns: {}, memberSchema: null };

function addDataset(name, headers, rawRows, source) {
  if (datasets[name]) { report.warnings.push(`${name}: 중복 원본(${source}) — 먼저 읽은 ${datasets[name].source} 유지`); return; }
  const objRows = rawRows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  const dropped = headers.filter(h => (isSecretCol(h) && !INCLUDE_SECRETS) || (isEmailCol(h) && !INCLUDE_EMAILS));
  const kept = headers.filter(h => !dropped.includes(h));
  if (dropped.length) report.maskedColumns[name] = dropped;
  if (POSITIONAL_SSOT[name]) {
    const exp = POSITIONAL_SSOT[name];
    if (headers.slice(0, exp.length).join('|') !== exp.join('|'))
      report.warnings.push(`${name}: 헤더가 positional SSOT(${exp.length}열)와 다름 — 열 밀림 여부 확인 필요 (실제: ${headers.join(', ')})`);
  }
  datasets[name] = { source, headers: kept, rows: objRows.map(r => Object.fromEntries(kept.map(h => [h, r[h]]))) };
}

function ingestCsvFile(path, source) {
  const base = basename(path).replace(/\.csv$/i, '');
  if (MEMBER_PAT.test(base) && !INCLUDE_MEMBERS) { // 회원 DB = 구조 설계만 (데이터 미반입)
    const grid = parseCsv(readFileSync(path, 'utf8'));
    report.memberSchema = { source, headers: grid[0]?.map(h => h.trim()) ?? [], dataRows: Math.max(0, grid.length - 1),
      note: '설계 전용 — 데이터 미반입(공개 레포 PII 차단). 반입은 --include-members(커밋 금지, MISO 직행만)' };
    return;
  }
  const name = SHEET_ALIASES[base] || SHEET_ALIASES[base.toLowerCase()]
    || (base.startsWith('운영_') ? 'ops_' + base.slice(3) : base.replace(/[^\w가-힣]/g, '_')); // 미인식명 = 그대로 반입
  const grid = parseCsv(readFileSync(path, 'utf8'));
  if (!grid.length) { report.warnings.push(`${source}: 빈 파일 (건너뜀)`); return; }
  addDataset(name, grid[0].map(h => h.trim()), grid.slice(1), source);
}

// ── ① data/db_export/*.csv
if (existsSync(EXPORT_DIR))
  for (const f of readdirSync(EXPORT_DIR).filter(f => f.toLowerCase().endsWith('.csv')))
    ingestCsvFile(join(EXPORT_DIR, f), `db_export/${f}`);

// ── ② 레포 최상단 운영자 직접 반입분 (*.csv / 미등록 *.json / xlsx는 변환 안내)
for (const f of readdirSync(ROOT)) {
  if (/\.(xlsx|xlsm)$/i.test(f)) { report.warnings.push(`루트 ${f}: 엑셀 원본 — python3 tools/miso/xlsx_to_csv.py "${f}" 로 CSV 변환 후 재실행`); continue; }
  if (/\.csv$/i.test(f)) { ingestCsvFile(join(ROOT, f), f); continue; }
  if (/\.json$/i.test(f) && !/^(package|package-lock|manifest)/.test(f)) {
    try {
      const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
      const base = basename(f).replace(/\.json$/i, '');
      if (MEMBER_PAT.test(base) && !INCLUDE_MEMBERS) {
        const rows = Array.isArray(j) ? j : (j.rows || []);
        report.memberSchema = { source: f, headers: j.headers || [...new Set(rows.flatMap(o => Object.keys(o)))], dataRows: rows.length,
          note: '설계 전용 — 데이터 미반입(공개 레포 PII 차단). 반입은 --include-members(커밋 금지, MISO 직행만)' };
        continue;
      }
      const name = SHEET_ALIASES[base] || SHEET_ALIASES[base.toLowerCase()] || base.replace(/[^\w가-힣]/g, '_');
      if (j.headers && j.rows) addDataset(name, j.headers, j.rows.map(r => j.headers.map(h => r[h] ?? '')), f);
      else if (Array.isArray(j) && j.length && typeof j[0] === 'object') {
        const headers = [...new Set(j.flatMap(o => Object.keys(o)))];
        addDataset(name, headers, j.map(r => headers.map(h => r[h] ?? '')), f);
      }
    } catch { report.warnings.push(`루트 ${f}: JSON 파싱 실패 (건너뜀)`); }
  }
}
for (const s of EXPECTED_SHEETS) if (!datasets[s]) report.missing.push(s);

// ── ③ 전시 DB 스냅샷(docs) — ①②에 없을 때만 (SharePoint/운영자 반입분이 최신 정본)
for (const [name, file] of [['exhib_master', 'docs/260620_전시마스터.json'], ['exhib_daily', 'docs/260620_전시일일.json']]) {
  if (datasets[name]) continue;
  const p = join(ROOT, file);
  if (!existsSync(p)) { report.missing.push(name); continue; }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  datasets[name] = { source: file, headers: j.headers, rows: j.rows };
}

// ── ④ 교육기관 (지도 마커 + 원천 명단)
{
  const p = join(ROOT, 'data', 'edu_institutions.js');
  if (existsSync(p)) {
    const m = readFileSync(p, 'utf8').match(/EDU_INSTITUTIONS\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (m) {
      const arr = new Function('return ' + m[1])();
      const headers = [...new Set(arr.flatMap(o => Object.keys(o)))];
      datasets.edu_institutions = { source: 'data/edu_institutions.js', headers, rows: arr };
    } else report.warnings.push('edu_institutions.js: 배열 추출 실패');
  }
  const roster = join(ROOT, 'data', '유치원어린이집_명단_20260724', '전체통합.csv');
  if (existsSync(roster)) {
    const grid = parseCsv(readFileSync(roster, 'utf8'));
    addDataset('edu_roster', grid[0].map(h => h.trim()), grid.slice(1), 'data/유치원어린이집_명단_20260724/전체통합.csv');
  }
}

// ── 산출
const meta = {
  generator: 'tools/miso/build_db.mjs (기계산출물 — 손편집 금지)',
  generatedAt: new Date().toISOString(),
  maskPolicy: {
    secrets: INCLUDE_SECRETS ? '⚠️ 포함(커밋 금지)' : '제외(PIN·비밀번호)',
    emails: INCLUDE_EMAILS ? '포함' : '제외',
    members: INCLUDE_MEMBERS ? '⚠️ 반입(커밋 금지)' : '미반입(구조 설계만 → meta.memberSchema)',
  },
  counts: Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, v.rows.length])),
  ...report,
};
writeFileSync(OUT_JSON, JSON.stringify({ meta, datasets }, null, 1), 'utf8');
mkdirSync(KB_DIR, { recursive: true });
for (const stale of readdirSync(KB_DIR).filter(f => f.endsWith('.csv') && !datasets[f.replace(/\.csv$/, '')])) {
  rmSync(join(KB_DIR, stale)); console.log(`🧹 스테일 제거: miso_kb/${stale} (이번 병합에 없는 데이터셋)`);
}
for (const [name, d] of Object.entries(datasets)) writeFileSync(join(KB_DIR, `${name}.csv`), toCsv(d.headers, d.rows), 'utf8');

console.log(`✅ data/miso_db.json — 데이터셋 ${Object.keys(datasets).length}개, 행 ${Object.values(datasets).reduce((a, d) => a + d.rows.length, 0)}개`);
console.log(`✅ data/miso_kb/ — CSV ${Object.keys(datasets).length}개`);
if (report.memberSchema) console.log(`📐 회원 DB 구조 설계 등재(데이터 미반입): ${report.memberSchema.source} — ${report.memberSchema.headers.length}열 × ${report.memberSchema.dataRows}행`);
if (Object.keys(report.maskedColumns).length) console.log('🔒 마스킹:', JSON.stringify(report.maskedColumns));
if (report.missing.length) console.log('⬜ 미반입(원본 없음):', report.missing.join(', '));
for (const w of report.warnings) console.log('⚠️ ', w);
