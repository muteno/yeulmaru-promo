#!/usr/bin/env node
// 카페 공감 7월 운영시간 반영 — '운영_카페일정' 시트에 2026-07-01~31 append
//
// 원본: 사용자 제공 "카페 공감 7월 운영시간" 표 (2026-07-03)
//   - 평일/토 기본 11:00~15:00, 월요일 휴무
//   - 7/2(목) 11:00~19:30 [대관] 여수시립국악단 19:00
//   - 7/4(토)·7/5(일) 09:30~17:00 [대관] 베베핀뮤지컬 11:00/14:00/16:30
//   - 7/11(토) 11:00~17:30 [대관] 류가연 가야금독주회 17:00
//   - 7/12(일) 11:30~15:30 [대관] 현의떨림 관의숨결 15:00
//   - 7/17(금) 휴무(제헌절), 7/19·7/26(일) 휴무
//   ※ 시트 헤더 = [날짜, 운영시간] 두 컬럼뿐 → 비고(대관 정보)는 반영 대상 아님.
//   ※ 시간 표기는 기존 6월 데이터와 동일하게 zero-padded (예: 09:30~17:00).
//
// 사용:
//   미리보기(권장):  DB_PW=<관리자비번> node docs/260703_cafe_july_ingest.mjs
//   실제 적용:       DB_PW=<관리자비번> node docs/260703_cafe_july_ingest.mjs --write
//   (서브admin PIN 사용 시: DB_PW=0510 DB_PIN=<핀> — 미리보기는 DB_PW=0510만으로도 가능)
//
// 멱등: 이미 시트에 있는 날짜는 스킵(값이 다르면 경고만 출력, 덮어쓰지 않음) → 재실행 안전.
// Worker 변경 불필요 (POST /api/ops mode=append 기존 경로, 텍스트 서식 자동).

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// [일자, 요일, 운영시간] — 요일은 전사 오류 방지용 자기검증(실제 달력과 대조)
const JULY = [
  ['2026-07-01', '수', '11:00~15:00'],
  ['2026-07-02', '목', '11:00~19:30'],
  ['2026-07-03', '금', '11:00~15:00'],
  ['2026-07-04', '토', '09:30~17:00'],
  ['2026-07-05', '일', '09:30~17:00'],
  ['2026-07-06', '월', '휴무'],
  ['2026-07-07', '화', '11:00~15:00'],
  ['2026-07-08', '수', '11:00~15:00'],
  ['2026-07-09', '목', '11:00~15:00'],
  ['2026-07-10', '금', '11:00~15:00'],
  ['2026-07-11', '토', '11:00~17:30'],
  ['2026-07-12', '일', '11:30~15:30'],
  ['2026-07-13', '월', '휴무'],
  ['2026-07-14', '화', '11:00~15:00'],
  ['2026-07-15', '수', '11:00~15:00'],
  ['2026-07-16', '목', '11:00~15:00'],
  ['2026-07-17', '금', '휴무'],   // 제헌절
  ['2026-07-18', '토', '11:00~15:00'],
  ['2026-07-19', '일', '휴무'],
  ['2026-07-20', '월', '휴무'],
  ['2026-07-21', '화', '11:00~15:00'],
  ['2026-07-22', '수', '11:00~15:00'],
  ['2026-07-23', '목', '11:00~15:00'],
  ['2026-07-24', '금', '11:00~15:00'],
  ['2026-07-25', '토', '11:00~15:00'],
  ['2026-07-26', '일', '휴무'],
  ['2026-07-27', '월', '휴무'],
  ['2026-07-28', '화', '11:00~15:00'],
  ['2026-07-29', '수', '11:00~15:00'],
  ['2026-07-30', '목', '11:00~15:00'],
  ['2026-07-31', '금', '11:00~15:00'],
];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 환경변수가 필요합니다.'); process.exit(1); }

  // 0) 데이터 자기검증 — 요일 불일치·개수·형식 이상이면 즉시 중단
  if (JULY.length !== 31) { console.error('데이터 행 수가 31이 아닙니다:', JULY.length); process.exit(1); }
  for (const [d, dow, hours] of JULY) {
    const real = DOW[new Date(d + 'T00:00:00Z').getUTCDay()];
    if (real !== dow) { console.error('요일 불일치:', d, '표기=' + dow, '실제=' + real, '— 전사 오류 가능, 중단'); process.exit(1); }
    if (hours !== '휴무' && !/^\d{2}:\d{2}~\d{2}:\d{2}$/.test(hours)) { console.error('운영시간 형식 이상:', d, hours); process.exit(1); }
  }
  console.log('자기검증 OK (31행, 요일·형식 일치)');

  // 1) 현재 카페일정 시트 읽기 (중복 방지)
  const res = await fetch(BASE + '/api/ops?sheet=' + encodeURIComponent('카페일정'), { headers: AUTH });
  if (!res.ok) { console.error('GET /api/ops?sheet=카페일정 실패', res.status, await res.text()); process.exit(1); }
  const { headers, rows } = await res.json();
  console.log('시트 헤더:', (headers || []).join(' | '), '/ 기존 행:', (rows || []).length);
  if (!headers || headers.indexOf('날짜') < 0 || headers.indexOf('운영시간') < 0) {
    console.error('예상 헤더(날짜/운영시간)가 없습니다 — 시트 구조 확인 필요, 중단'); process.exit(1);
  }

  const existing = {};
  for (const r of rows || []) { const d = String(r['날짜'] || '').trim(); if (d) existing[d] = String(r['운영시간'] || '').trim(); }

  // 2) append 대상 선별 (이미 있는 날짜는 스킵)
  const toAdd = [];
  for (const [d, , hours] of JULY) {
    if (d in existing) {
      if (existing[d] !== hours) console.warn('⚠️ 이미 존재하는데 값이 다름 (보존, 수동 확인 필요):', d, '시트=' + existing[d], '표=' + hours);
      continue;
    }
    toAdd.push({ '날짜': d, '운영시간': hours });
  }
  console.log('append 대상:', toAdd.length, '/ 31 (스킵', 31 - toAdd.length + ')');
  toAdd.forEach((r) => console.log('  ·', r['날짜'], r['운영시간']));

  if (!toAdd.length) { console.log('추가할 행이 없습니다 — 이미 반영됨.'); return; }
  if (!WRITE) { console.log('\n[미리보기] 실제 적용하려면 --write 플래그를 붙여 다시 실행하세요.'); return; }

  // 3) append 실행 (한 번의 POST)
  const wr = await fetch(BASE + '/api/ops', {
    method: 'POST', headers: AUTH,
    body: JSON.stringify({ sheet: '카페일정', mode: 'append', rows: toAdd }),
  });
  const body = await wr.text();
  if (!wr.ok) { console.error('append 실패', wr.status, body.slice(0, 300)); process.exit(1); }
  console.log('append 완료:', body.slice(0, 200));

  // 4) 라이브 재검증 — Graph 쓰기 직후 read-lag 대비 15초 대기 후 재조회
  console.log('15초 후 재검증...');
  await new Promise((r) => setTimeout(r, 15000));
  const vr = await fetch(BASE + '/api/ops?sheet=' + encodeURIComponent('카페일정'), { headers: AUTH });
  const vd = await vr.json();
  const back = {};
  for (const r of vd.rows || []) { const d = String(r['날짜'] || '').trim(); if (d) back[d] = String(r['운영시간'] || '').trim(); }
  let ok = 0, bad = 0;
  for (const [d, , hours] of JULY) {
    if (back[d] === hours) ok++;
    else { bad++; console.error('  검증 불일치:', d, '기대=' + hours, '실제=' + (back[d] || '(없음)')); }
  }
  console.log('재검증:', ok, '일치 /', bad, '불일치', bad === 0 ? '— 전부 정상 ✅' : '(read-lag이면 잠시 후 재조회)');
}

main().catch((e) => { console.error(e); process.exit(1); });
