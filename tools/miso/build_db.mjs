#!/usr/bin/env node
/* MISO 이식용 DB 통합 빌더 — 유관 DB를 하나로 합쳐 이관본/miso_db.json(단일 번들)과
   이관본/data/*.csv(MISO 첨부·지식베이스 업로드용)를 생성한다. (이관본/ = 운영자 전달물 단일 홈)

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

const INCLUDE_EMAILS = process.argv.includes('--include-emails');
const INCLUDE_SECRETS = process.argv.includes('--include-secrets');
const INCLUDE_MEMBERS = process.argv.includes('--include-members');
// [260812 배선] PII를 반입하면 **산출 폴더 자체가 바뀐다** — `이관본/비공개/`(.gitignore 차단).
//   `이관본/`은 커밋 대상이라(위 주석 = 「병합 산출물 이관본/miso_db.json·이관본/data/만 커밋」)
//   회원 원장이 실린 번들을 거기 두면 실수 한 번에 공개 레포로 명부가 나간다. 경로를 사람 손(플래그·복사)에
//   맡기지 않고 **반입 여부가 직접 정하게** 묶어 사고를 원천에서 없앤다.
const PII_MODE = INCLUDE_MEMBERS || INCLUDE_SECRETS;
const OUT_BASE = PII_MODE ? join(ROOT, '이관본', '비공개') : join(ROOT, '이관본');
const REL_BASE = PII_MODE ? '이관본/비공개' : '이관본';
const OUT_JSON = join(OUT_BASE, 'miso_db.json');
const KB_DIR = join(OUT_BASE, 'data');

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
  // [260812 배선] 회원 원장 — 앱은 `GET /api/ops?sheet=회원`으로 부르고 standalone shim은 그걸 `ops_회원`으로 찾는다.
  //   이 줄이 없으면 파일명 그대로 `회원_운영_회원`으로 실려 **이름이 어긋난 채 끝까지 빈 화면**이 된다
  //   (고객 분석 「시트가 비어 있거나 없어요」 — 데이터는 번들 안에 있는데 아무도 못 찾는 상태. 실사고 260812).
  '회원_운영_회원': 'ops_회원', '운영_회원': 'ops_회원',
};
// [260812] --include-members로 실제 반입할 파일 = 앱이 읽는 **원장 한 벌**뿐.
//   나머지 회원_*.csv(도로명혼재본 6.9MB · 주소요확인 6.0MB · 중복번호 · 집계 2종)는 주소 정제 중간산출물이라
//   같이 실으면 standalone이 20MB+로 부푸는데 앱은 참조조차 안 한다(index.html grep 0).
const MEMBER_ALLOW = new Set(['회원_운영_회원', '운영_회원']);
// [260812 실측] 회원 원장은 **Worker(memberSheetRead)와 같은 규격으로 변환해서** 싣는다.
//   앱은 생년월일 **원값을 쓰지 않는다** — index.html L29775 「연령대 필드는 Worker 파생값(생년월일 원값 미전송)」.
//   17열 원장을 그대로 실으면 지역 분포는 멀쩡히 그려지는데 **연령대만 전원 '미상'**으로 죽는다(MISO 프리뷰 실측).
//   Worker와 동형으로 맞추면 스키마 일치 + PII도 같이 줄어든다(전화·이메일·아이디·생년월일 원값이 아예 안 실린다).
const MEMBER_KEEP = 7;   // A~G = 휴대폰정규화·이름·주소1~4·우편번호 (v2 정제본 열 순서 고정 — Worker KEEP와 같은 값)
const _kstYear = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
function memberAgeBand(birth) {   // src/index.js ageBand와 **한 글자도 다르지 않게** 유지할 것
  const m = String(birth == null ? '' : birth).trim().match(/^(19|20)\d{2}/);
  if (!m) return '';
  const age = _kstYear - parseInt(m[0], 10);
  if (age < 0 || age > 110) return '';
  if (age < 10) return '10세 미만';
  return Math.min(Math.floor(age / 10), 8) * 10 + '대';   // 80대+ = 80대로 캡
}
const MEMBER_PAT = /회원/; // 운영_회원 등 — PII, 기본 미반입(구조 설계만)
const EXPECTED_SHEETS = ['applysettings','records','programs','platforms','contents','managers','special','logs'];

// positional SSOT (docs/앱지침.md §positional 시트 철칙) — 어긋나면 경고만(병합은 헤더 기준이라 안전).
const POSITIONAL_SSOT = {
  managers: ['담당부서','담당자','직위','휴직여부','홍보여부','기관여부','공연여부','전시여부','예술교육여부','대관여부','PIN','비밀번호','계정여부','관리자여부','이메일'],
  programs: ['NO','콘텐츠구분','풀네임','줄임말','판매시작일','판매종료일','시작일','종료일','담당자','장소','URL','프로그램ID','홍보시작일','구분','공동기획여부','지원사업여부','GS아트센터협업여부'],
};

function isSecretCol(h) { return /PIN|비밀번호|password/i.test(h); }
function isEmailCol(h) { return /이메일|e-?mail/i.test(h); }
// 연락처류 — 앱 표시에 미사용(index.html 참조 0)이라 공개 반입본에서 제거(PII). --include-contacts로 유지.
function isContactCol(h) { return /전화|휴대폰|내선|연락처|tel|phone|mobile/i.test(h); }
const INCLUDE_CONTACTS = process.argv.includes('--include-contacts');

// Worker(src/index.js) 빈 행 필터를 그대로 미러 — 안 하면 온라인(Worker)/오프라인(번들) 행수가 달라짐
// (실측: 홍보기록 998→137, PromoSpecial 999→34, 일일입력 2702→1477). name = 데이터셋 이름.
function isBlankRow(name, r) {
  const b = i => { const v = r[i]; return v === undefined || v === null || String(v).trim() === ''; };
  if (name === 'records') return b(0) && b(2) && b(11);          // 홍보기록: A·C·L (src/index.js:313)
  if (name === 'programs') return b(0);                           // 프로그램: A=NO (handleGetPrograms)
  return r.every((_, i) => b(i));                                 // 그 외: 전체 공백 (handleGetSheet:385)
}

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

const datasets = {}; const report = { missing: [], warnings: [], maskedColumns: {}, memberSchema: [] };

function addDataset(name, headers, rawRows, source) {
  if (datasets[name]) { report.warnings.push(`${name}: 중복 원본(${source}) — 먼저 읽은 ${datasets[name].source} 유지`); return; }
  const before = rawRows.length;
  rawRows = rawRows.filter(r => !isBlankRow(name, r));            // Worker 미러 빈 행 제거
  if (before - rawRows.length > 0) report.blankRowsDropped = { ...(report.blankRowsDropped || {}), [name]: before - rawRows.length };
  const objRows = rawRows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  headers = headers.filter(h => h !== ''); // 빈 헤더(시트 우측 여백 컬럼) 제거
  const dropped = headers.filter(h => (isSecretCol(h) && !INCLUDE_SECRETS) || (isEmailCol(h) && !INCLUDE_EMAILS) || (isContactCol(h) && !INCLUDE_CONTACTS));
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
  if (MEMBER_PAT.test(base) && !(INCLUDE_MEMBERS && MEMBER_ALLOW.has(base))) { // 회원 DB = 구조 설계만 (반입해도 원장만)
    const grid = parseCsv(readFileSync(path, 'utf8'));
    report.memberSchema.push({ source, headers: grid[0]?.map(h => h.trim()) ?? [], dataRows: Math.max(0, grid.length - 1),
      note: '설계 전용 — 데이터 미반입(공개 레포 PII 차단). 반입은 --include-members(커밋 금지, MISO 직행만)' });
    return;
  }
  const name = SHEET_ALIASES[base] || SHEET_ALIASES[base.toLowerCase()]
    || (base.startsWith('운영_') ? 'ops_' + base.slice(3) : base.replace(/[^\w가-힣]/g, '_')); // 미인식명 = 그대로 반입
  const grid = parseCsv(readFileSync(path, 'utf8'));
  if (!grid.length) { report.warnings.push(`${source}: 빈 파일 (건너뜀)`); return; }
  if (MEMBER_ALLOW.has(base)) {   // 회원 원장 = Worker 응답과 동형(A~G + 연령대)으로 좁혀 싣는다
    const hdr0 = grid[0].map(h => h.trim());
    const bi = hdr0.indexOf('생년월일') >= 0 ? hdr0.indexOf('생년월일') : 11;   // Worker와 같은 폴백(L열)
    const kept = hdr0.slice(0, MEMBER_KEEP).concat(['연령대']);
    const rows = grid.slice(1).map(r => kept.map((h, i) => i < MEMBER_KEEP ? (r[i] ?? '') : memberAgeBand(r[bi])));
    const band = {}; for (const r of rows) { const b = r[MEMBER_KEEP] || '미상'; band[b] = (band[b] || 0) + 1; }
    report.memberAgeBands = band;
    addDataset(name, kept, rows, source + ' (Worker 동형 8열 · 연령대 파생)');
    return;
  }
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
      if (MEMBER_PAT.test(base) && !(INCLUDE_MEMBERS && MEMBER_ALLOW.has(base))) {
        const rows = Array.isArray(j) ? j : (j.rows || []);
        report.memberSchema.push({ source: f, headers: j.headers || [...new Set(rows.flatMap(o => Object.keys(o)))], dataRows: rows.length,
          note: '설계 전용 — 데이터 미반입(공개 레포 PII 차단). 반입은 --include-members(커밋 금지, MISO 직행만)' });
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

// ── ③ 전시 DB 스냅샷(docs) — ①②에 없을 때만. 운영자 확정(260730): 전시는 "최근 것만" =
//     정본 반입분이 있으면 그것만 쓴다(스냅샷 병존·유실 경고 폐지 — 과거 이력 불필요 판정).
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
    contacts: INCLUDE_CONTACTS ? '⚠️ 포함' : '제외(전화·내선·휴대폰 — 앱 미표시 PII)',
    members: INCLUDE_MEMBERS ? '⚠️ 반입(커밋 금지)' : '미반입(구조 설계만 → meta.memberSchema)',
  },
  // [260812] 이 번들이 스스로 「나는 PII를 싣고 있다」고 말한다 — build_standalone이 이 값만 보고 산출 경로를
  //   비공개/로 고정한다. 빌더 사이에 플래그를 다시 넘길 필요가 없어 **플래그 망각이 무해**해진다.
  pii: PII_MODE,
  note_names: '담당자·신청자 등 실명 컬럼은 앱 표시에 필수라 유지됨 — 공개 서빙 시 노출 주의(운영자 판단)',
  counts: Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, v.rows.length])),
  ...report,
};
mkdirSync(OUT_BASE, { recursive: true });   // [260812] PII_MODE면 이관본/비공개/ — .gitignore 폴더라 새 클론엔 존재하지 않는다(재클론 실사고 ENOENT).
writeFileSync(OUT_JSON, JSON.stringify({ meta, datasets }, null, 1), 'utf8');
mkdirSync(KB_DIR, { recursive: true });
for (const stale of readdirSync(KB_DIR).filter(f => f.endsWith('.csv') && !datasets[f.replace(/\.csv$/, '')])) {
  rmSync(join(KB_DIR, stale)); console.log(`🧹 스테일 제거: miso_kb/${stale} (이번 병합에 없는 데이터셋)`);
}
for (const [name, d] of Object.entries(datasets)) writeFileSync(join(KB_DIR, `${name}.csv`), toCsv(d.headers, d.rows), 'utf8');

console.log(`✅ ${REL_BASE}/miso_db.json — 데이터셋 ${Object.keys(datasets).length}개, 행 ${Object.values(datasets).reduce((a, d) => a + d.rows.length, 0)}개`);
console.log(`✅ ${REL_BASE}/data/ — CSV ${Object.keys(datasets).length}개`);
if (PII_MODE) console.log('🔐 PII 모드 — 산출물 전량이 이관본/비공개/(gitignore 차단)로 나갔다. 공개 레포 커밋 불가.');
for (const ms of report.memberSchema) console.log(`📐 회원 구조 설계 등재(데이터 미반입): ${ms.source} — ${ms.headers.length}열 × ${ms.dataRows}행`);
if (Object.keys(report.maskedColumns).length) console.log('🔒 마스킹:', JSON.stringify(report.maskedColumns));
if (report.blankRowsDropped) console.log('🧹 빈 행 제거(Worker 미러):', JSON.stringify(report.blankRowsDropped));
if (report.missing.length) console.log('⬜ 미반입(원본 없음):', report.missing.join(', '));
for (const w of report.warnings) console.log('⚠️ ', w);
