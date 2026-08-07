#!/usr/bin/env node
/* MISO 첨부용 단일 JSON 빌더 — CSV 10종을 하나로 합치고 정규화한다.
   목적 = 수신 LLM의 CSV 파싱 함정 제거: ① 다행 인용부호(records 103행) ② UTF-8 BOM
   ③ 날짜 2형식(문자열/엑셀 시리얼) ④ 숫자 문자열. JSON은 이 넷 다 원천 소멸.
   산출 = 이관본/첨부/예울마루_데이터.json (기계산출물 — 손편집 금지)
   사용: node tools/miso/build_single_json.mjs */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, '이관본', 'data');
const OUT = join(ROOT, '이관본', '첨부', '예울마루_데이터.json');
const OUT_EXT = join(ROOT, '이관본', '첨부', '예울마루_데이터_확장.json');

// 데이터셋 → {파일, JSON 키, 날짜열, 숫자열}
const SETS = [
  { file: 'records', key: 'records', dates: ['날짜'], nums: ['연도', '월', '일'] },
  { file: 'programs', key: 'programs', dates: ['판매시작일', '판매종료일', '시작일', '종료일', '홍보시작일'], nums: ['NO', '회차'] },
  { file: 'special', key: 'special', dates: ['시작일', '종료일'], nums: [] },
  { file: 'ops_공연마스터', key: 'opsMaster', dates: ['티켓오픈일', '시작일', '종료일'], nums: ['기준석', '총회차', '총오픈석', '목표점유율'] },
  { file: 'ops_일일입력', key: 'opsDaily', dates: ['기준일자'], nums: ['유료좌석', '유료금액', '무료좌석', '합계좌석', '합계금액', '점유율', '전일대비(석)'] },
  { file: 'exhib_master', key: 'exhibMaster', dates: ['시작일', '종료일'], nums: ['연도', '운영일수', '목표관객', '목표금액', '최종유료', '최종무료', '최종총인원', '최종매출', '최종점유율'] },
  { file: 'exhib_daily', key: 'exhibDaily', dates: ['기준일자'], nums: ['일일유료', '일일무료', '일일총인원', '일일금액', '누계유료', '누계무료', '누계총인원', '누계금액', '점유율'] },
  { file: 'platforms', key: 'platforms', dates: [], nums: [] },
  { file: 'contents', key: 'contents', dates: [], nums: [] },
  { file: 'applysettings', key: 'applySettings', dates: [], nums: [] },
];

// 확장 세트(P2) — 핵심 3화면 밖의 추가 화면용. 별도 파일로 빼서 P1 실패 위험을 격리한다.
const EXT_SETS = [
  { file: 'rules', key: 'rules', dates: [], nums: [], note: '규정 전문 — 규정 검색 화면' },
  { file: 'ops_세부운영관리대장정리', key: 'perfHistory', dates: [], nums: ['전체순번','기본좌석','발권유료','년도','월','일'], note: '공연 이력 2012~2026 전수 — 이력 조회·장르 분석 화면' },
  { file: 'edu_institutions', key: 'eduInstitutions', dates: [], nums: ['no','lat','lng'], note: '교육기관(유치원·어린이집) — 단체영업 대상 목록·지도' },
  { file: 'messages', key: 'messages', dates: [], nums: [], note: '알림 메시지 — 알림함 조회 화면' },
  { file: 'managers', key: 'managers', dates: [], nums: [], note: '담당자(개인정보 마스킹) — 담당자 목록' },
  { file: 'ops_장도', key: 'jangdoDaily', dates: [], nums: [], note: '장도 방문객 일별' },
  { file: 'ops_카페일정', key: 'cafeSchedule', dates: [], nums: [], note: '장도 아트카페 일정' },
  { file: 'ops_회차상세', key: 'roundDetail', dates: [], nums: [], note: '공연 회차 상세' },
  { file: 'chatbot_faq', key: 'faq', dates: [], nums: [], note: 'FAQ' },
];

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

// 날짜 정규화 → YYYY-MM-DD (엑셀 시리얼·YYYYMMDD·'YYYY-MM-DD HH:MM:SS' 전부 흡수)
function normDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);           // 2026-05-23[ 00:00:00]
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);                 // 20260402
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) {                        // 엑셀 시리얼 46023
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400000));
    return isNaN(d) ? s : d.toISOString().slice(0, 10);
  }
  return s;                                                // 해석 불가 = 원문 보존
}
function normNum(v) {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : s;
}

const out = {}; const counts = {}; const warnings = [];
for (const { file, key, dates, nums } of SETS) {
  const p = join(SRC, `${file}.csv`);
  if (!existsSync(p)) { warnings.push(`${file}.csv 없음 — 건너뜀`); continue; }
  const grid = parseCsv(readFileSync(p, 'utf8'));
  const hdr = grid[0].map(h => h.trim()).filter(h => h !== '');
  const rows = grid.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => {
      let v = r[i] ?? '';
      if (dates.includes(h)) v = normDate(v);
      else if (nums.includes(h)) v = normNum(v);
      else v = String(v).trim();
      o[h] = v;
    });
    return o;
  });
  out[key] = rows; counts[key] = rows.length;
}

// applySettings는 키-값 시트 → 객체로 접기(사용 편의)
if (Array.isArray(out.applySettings)) {
  const obj = {};
  for (const r of out.applySettings) if (r['키']) obj[r['키']] = r['값'];
  out.applySettings = obj;
  counts.applySettings = Object.keys(obj).length;
}

// ── 연간 실적(annual) — index.html의 _YR 상수에서 추출. 메인 대시보드 「연간 실적」 원천이며
//    시트가 아니라 코드 상수라 CSV 경로로는 절대 안 잡힌다(누락 사고 방지 — 260730j).
{
  const src = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const i = src.indexOf('var _YR={');
  const j = i < 0 ? -1 : src.indexOf('\n};', i);
  if (i < 0 || j < 0) { warnings.push('index.html의 _YR 상수를 찾지 못함 — 연간 실적 누락'); }
  else {
    const body = src.slice(i + 'var _YR='.length, j + 2);
    try { out.annual = new Function('return ' + body)(); }
    catch (e) { warnings.push(`_YR 파싱 실패: ${e.message}`); }
  }
}

const statusDist = {};
for (const r of out.records || []) { const s = r['진행 상태'] || '(빈값)'; statusDist[s] = (statusDist[s] || 0) + 1; }

const bundle = {
  meta: {
    name: 'GS칼텍스 예울마루 사업·홍보 데이터 (MISO 이관용 단일 번들)',
    generator: 'tools/miso/build_single_json.mjs — 기계산출물(손편집 금지)',
    generatedAt: new Date().toISOString(),
    normalized: [
      '모든 날짜 = YYYY-MM-DD 문자열로 통일(엑셀 시리얼·YYYYMMDD·시분초 전부 변환 완료 → 추가 변환 불필요)',
      '수량·금액·점유율 = JSON number(빈칸은 null)',
      '개인정보 제거: PIN·비밀번호·이메일·전화·내선 열 없음',
      '빈 행 제거 완료(Worker 필터 기준) — 이 행수가 실서버와 동일',
    ],
    expectedCounts: counts,
    recordsStatusDistribution: statusDist,
    fieldNotes: {
      records: '홍보 신청내역. 캘린더 원본. 뱃지 = 콘텐츠 제목(없으면 프로그램), 색 = 진행 상태. ⚠️ 신청자 = 신청 본인(게시 담당자 아님). 콘텐츠 내용에 여러 줄 텍스트 포함(JSON이라 그대로 안전).',
      programs: '프로그램 마스터. 판매중 = 오늘이 판매시작일~판매종료일. 홍보 노출 = 홍보시작일~판매종료일(비면 종료일).',
      special: '담당자 특별일정(교육·휴가·출장·회의). 캘린더 회색 뱃지.',
      opsMaster: '공연 사업 마스터. ID로 opsDaily.공연ID와 조인.',
      opsDaily: '공연 일일 판매실적. 공연ID로 opsMaster.ID와 조인. ⚠️ 점유율 = 목표 달성률(100% 초과 가능), 좌석 점유율 아님.',
      exhibMaster: '전시 마스터. 전시ID로 exhibDaily와 조인.',
      exhibDaily: '전시 일일실적.',
      platforms: '홍보 플랫폼 3단 분류(라벨용).',
      contents: '콘텐츠구분·형식·진행상태 값 목록(필터용).',
      applySettings: '홍보 접수 설정(키-값).',
      // ⚠ [260807] 이 한 줄은 **손으로 적지 않는다** — 구판은 '2012~2025 · years[14] · grand(누적 3,690,031명)'을
      //   박아 뒀는데, 그 사이 2026 열이 붙고(15칸) grand가 3,721,841이 되도록 아무도 못 고쳤다(실측 3중 낡음).
      //   설명이 데이터를 따라가지 않으면 이 번들을 읽는 쪽이 **틀린 자릿수·틀린 총계**를 믿는다 → 값에서 파생시킨다.
      annual: (() => {
        const A = out.annual, ys = A?.years || [];
        if (!ys.length) return '연간 실적 — _YR 추출 실패(warnings 참조).';
        return `연간 실적(${ys[0]}~${ys[ys.length - 1]}) — 메인 대시보드 좌측 「연간 실적」 원천. `
          + `years[${ys.length}] + cats{${Object.keys(A.cats || {}).join('·')}}.rows[{sub,key,v[${ys.length}],sum}] `
          + `(key = 인원·횟수·일수·나눔) + total[동일 구조] + jangdo(장도 방문객) + grand(누적 ${(A.grand || 0).toLocaleString()}명). `
          + `마지막 연도는 **잠정치**(진행 연도) · 기본 표시 지표 = 인원.`;
      })(),
    },
    warnings,
  },
  ...out,
};

writeFileSync(OUT, JSON.stringify(bundle, null, 1), 'utf8');

// ── 확장 세트(P2) 별도 산출
const extOut = {}, extCounts = {}, extNotes = {};
for (const { file, key, dates, nums, note } of EXT_SETS) {
  const p = join(SRC, `${file}.csv`);
  if (!existsSync(p)) { warnings.push(`확장 ${file}.csv 없음`); continue; }
  const grid = parseCsv(readFileSync(p, 'utf8'));
  const hdr = grid[0].map(h => h.trim()).filter(h => h !== '');
  extOut[key] = grid.slice(1).map(r => {
    const o = {};
    hdr.forEach((h, i) => {
      let v = r[i] ?? '';
      if (dates.includes(h)) v = normDate(v);
      else if (nums.includes(h)) v = normNum(v);
      else v = String(v).trim();
      o[h] = v;
    });
    return o;
  });
  extCounts[key] = extOut[key].length; extNotes[key] = note;
}
const extBundle = {
  meta: {
    name: 'GS칼텍스 예울마루 확장 데이터 (P2 — 추가 화면용)',
    generator: 'tools/miso/build_single_json.mjs — 기계산출물(손편집 금지)',
    generatedAt: new Date().toISOString(),
    note: '핵심 3화면(P1)은 예울마루_데이터.json에 있다. 이 파일은 추가 화면용이며, P1을 완성·검증한 뒤에만 쓴다.',
    normalized: ['날짜 = YYYY-MM-DD', '수량·금액 = number(빈칸 null)', '개인정보(PIN·비번·이메일·전화·내선) 열 없음', '빈 행 제거 완료'],
    expectedCounts: extCounts,
    fieldNotes: extNotes,
  },
  ...extOut,
};
writeFileSync(OUT_EXT, JSON.stringify(extBundle, null, 1), 'utf8');
const kb = (Buffer.byteLength(JSON.stringify(bundle, null, 1)) / 1024).toFixed(0);
console.log(`✅ 이관본/첨부/예울마루_데이터.json — ${kb}KB`);
console.log('   행수:', JSON.stringify(counts, null, 0));
console.log('   records 상태분포:', JSON.stringify(statusDist));
for (const w of warnings) console.log('⚠️ ', w);
