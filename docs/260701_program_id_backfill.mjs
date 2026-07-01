#!/usr/bin/env node
// 프로그램ID 빈값 일괄 백필 — '프로그램' 시트에서 프로그램ID(구 '공연ID')가 비어있는 행에
// 시작일 기반 YYMMDD_NN 을 부여한다. (2026-07-01)
//
// 배경: saveProgram이 예전엔 새 프로그램에 ID를 안 넣어(빈칸 저장) 하반기 공연들 ID 부재.
//   프론트에 자동생성(_genProgramId)이 들어갔지만 '이미 있는' 빈 행은 이 스크립트로 일괄 백필.
//   형식은 기존 마이그레이션과 동일 YYMMDD_NN(시작일 + 그날 순번) — records/색인 조인키와 값이 맞음.
//   기존 ID가 있는 행은 건드리지 않고, 같은 날짜의 최대 순번 다음부터 새 번호를 매긴다.
//
// 사용:
//   미리보기(권장):  DB_PW=<관리자비번> node docs/260701_program_id_backfill.mjs
//   실제 적용:       DB_PW=<관리자비번> node docs/260701_program_id_backfill.mjs --write
//   (서브admin PIN 사용 시: DB_PIN=<핀> 추가)
//
// ⚠️ Worker 변경 불필요('program' slug 이미 매핑). '프로그램ID'(구 '공연ID') · '시작일' 컬럼 필요.

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// 시작일(Excel serial 또는 ISO 문자열) → 'YYMMDD'. serial은 isoToSerial 역변환(UTC 기준 일치).
function startToYYMMDD(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  let iso;
  if (/^\d+(\.\d+)?$/.test(s)) iso = new Date((Number(s) - 25569) * 86400000).toISOString().slice(0, 10);
  else iso = s.slice(0, 10);
  const d = iso.replace(/[^0-9]/g, '');
  return d.length >= 8 ? d.slice(2, 8) : '';
}

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 환경변수가 필요합니다.'); process.exit(1); }

  // 1) 프로그램 시트 읽기
  const res = await fetch(BASE + '/api/sheet/program', { headers: AUTH });
  if (!res.ok) { console.error('GET /api/sheet/program 실패', res.status, await res.text()); process.exit(1); }
  const { headers, rows } = await res.json();
  console.log('현재 헤더:', headers.join(' | '));

  // 2) 컬럼 키 결정 — 프로그램ID(변경 후) 우선, 공연ID(구) 폴백
  const idKey = headers.includes('프로그램ID') ? '프로그램ID' : (headers.includes('공연ID') ? '공연ID' : null);
  const startKey = headers.includes('시작일') ? '시작일' : (headers.includes('시작') ? '시작' : null);
  if (!idKey) { console.error("헤더에 '프로그램ID'도 '공연ID'도 없음 — 중단"); process.exit(1); }
  if (!startKey) { console.error("헤더에 '시작일' 없음 — 중단"); process.exit(1); }
  console.log('ID 컬럼:', idKey, '| 시작일 컬럼:', startKey, '| 데이터 행:', rows.length);

  // 3) 기존 ID들의 날짜별 최대 순번 (새 번호는 이 다음부터 → 충돌 방지)
  const maxSeq = {};
  for (const r of rows) {
    const id = String(r[idKey] || r['공연ID'] || '').trim();
    const m = id.match(/^(\d{6})_(\d+)$/);
    if (m) { const k = m[1], n = parseInt(m[2], 10); if (!maxSeq[k] || n > maxSeq[k]) maxSeq[k] = n; }
  }

  // 4) 백필 대상 = NO 있는 실데이터 중 ID 빈 행
  const todo = [], skip = [];
  for (const r of rows) {
    if (r['NO'] === '' || r['NO'] == null) continue;
    const cur = String(r[idKey] || r['공연ID'] || '').trim();
    if (cur) continue;                                   // 이미 ID 있음 → 보존
    const name = r['풀네임'] || r['줄임말'] || '(무명)';
    const yy = startToYYMMDD(r[startKey]);
    if (!yy) { skip.push({ row: r._rowIndex, name }); continue; }   // 시작일 없어 생성 불가
    const next = (maxSeq[yy] || 0) + 1; maxSeq[yy] = next;
    const newId = yy + '_' + String(next).padStart(2, '0');
    const values = headers.map((h) => (h === idKey ? newId : (r[h] != null ? r[h] : '')));
    todo.push({ row: r._rowIndex, name, newId, values });
  }

  console.log('\n백필 대상:', todo.length, '건 / 시작일 없어 스킵:', skip.length, '건');
  todo.forEach((t) => console.log('  · row', t.row, '→', t.newId, ' ', t.name));
  if (skip.length) { console.log('\n[시작일 없어 ID 부여 못함 — 수동 확인 필요]'); skip.forEach((s) => console.log('  · row', s.row, s.name)); }

  if (!WRITE) { console.log('\n[미리보기] 실제 적용하려면 --write 를 붙여 다시 실행하세요.'); return; }

  // 5) 데이터 행 백필 (전체 values 재기록, idKey만 교체)
  let ok = 0, fail = 0;
  for (const t of todo) {
    const r = await fetch(BASE + '/api/sheet/program/' + t.row, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ values: t.values }) });
    if (r.ok) { ok++; console.log('  ✓ row', t.row, t.newId); }
    else { fail++; console.error('  ✗ row', t.row, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log('\n백필 완료:', ok, '성공 /', fail, '실패');
}

main().catch((e) => { console.error(e); process.exit(1); });
