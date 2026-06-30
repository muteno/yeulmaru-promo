#!/usr/bin/env node
// 홍보기간 컬럼 마이그레이션 — '프로그램' 시트에 홍보시작일·홍보종료일(K·L) 헤더 추가 + 기존 행 백필
//
// 배경: 홍보 신청 가능 게이트를 '판매기간'에서 '홍보기간'으로 분리(2026-06-30).
//   프론트(programToPerf/updatePerfOpen)는 홍보기간 미설정 시 '오늘~프로그램 종료일'로 폴백하므로
//   마이그레이션 전에도 앱은 정상 동작하지만, 이 스크립트로 헤더를 만들어야 폼에서 저장한 홍보기간이 보존/조회됨.
//
// 기본값(사용자 스펙): 홍보시작일 = 오늘, 홍보종료일 = 프로그램 종료일
//
// 사용:
//   미리보기(권장):  DB_PW=<관리자비번> node docs/260630_promo_period_ingest.mjs
//   실제 적용:       DB_PW=<관리자비번> node docs/260630_promo_period_ingest.mjs --write
//   (서브admin PIN 사용 시: DB_PIN=<핀> 추가)
//
// ⚠️ Worker는 그대로 둬도 됨(프로그램 시트 slug는 이미 매핑됨). 컬럼은 끝에 append라 A~J 기존 데이터 안 밀림.

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// ISO(YYYY-MM-DD) → Excel serial (프론트 isoToExcelSerial과 동일 규칙)
function isoToSerial(iso) {
  if (!iso) return '';
  return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000) + 25569;
}
function kstToday() {
  return new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
}

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 환경변수가 필요합니다.'); process.exit(1); }

  // 1) 현재 프로그램 시트 읽기
  const res = await fetch(BASE + '/api/sheet/program', { headers: AUTH });
  if (!res.ok) { console.error('GET /api/sheet/program 실패', res.status, await res.text()); process.exit(1); }
  const { headers, rows } = await res.json();
  console.log('현재 헤더:', headers.join(' | '));
  console.log('데이터 행 수:', rows.length);

  // 2) 새 헤더 = 기존 + 홍보시작일/홍보종료일 (없을 때만 append → K, L열)
  const H = headers.slice();
  if (!H.includes('홍보시작일')) H.push('홍보시작일');
  if (!H.includes('홍보종료일')) H.push('홍보종료일');
  const headerChanged = H.length !== headers.length;
  console.log('새 헤더:', H.join(' | '), headerChanged ? '(홍보 컬럼 추가)' : '(이미 존재)');

  const todaySerial = isoToSerial(kstToday());

  // 3) 백필 대상 = 홍보시작일/홍보종료일이 비어있는 행
  const todo = [];
  for (const r of rows) {
    if (r['NO'] === '' || r['NO'] == null) continue;
    const hasStart = r['홍보시작일'] !== '' && r['홍보시작일'] != null;
    const hasEnd = r['홍보종료일'] !== '' && r['홍보종료일'] != null;
    if (hasStart && hasEnd) continue; // 이미 설정됨 → 보존
    const promoStart = hasStart ? r['홍보시작일'] : todaySerial;
    const promoEnd = hasEnd ? r['홍보종료일'] : (r['종료일'] != null && r['종료일'] !== '' ? r['종료일'] : todaySerial);
    const values = H.map((h) => {
      if (h === '홍보시작일') return promoStart;
      if (h === '홍보종료일') return promoEnd;
      return (r[h] != null ? r[h] : '');
    });
    todo.push({ row: r._rowIndex, name: r['풀네임'] || r['줄임말'] || '(무명)', values });
  }
  console.log('백필 대상 행:', todo.length, '/', rows.length);
  todo.slice(0, 8).forEach((t) => console.log('  · row', t.row, t.name, '→ 홍보', t.values[H.indexOf('홍보시작일')], '~', t.values[H.indexOf('홍보종료일')]));
  if (todo.length > 8) console.log('  · ... 외', todo.length - 8, '건');

  if (!WRITE) {
    console.log('\n[미리보기] 실제 적용하려면 --write 플래그를 붙여 다시 실행하세요.');
    return;
  }

  // 4) 헤더 먼저 기록 (row 1) — K1/L1 헤더가 있어야 향후 저장/조회에서 홍보기간이 키로 잡힘
  if (headerChanged) {
    const hr = await fetch(BASE + '/api/sheet/program/1', { method: 'PATCH', headers: AUTH, body: JSON.stringify({ values: H }) });
    console.log('헤더 기록:', hr.status, hr.ok ? 'OK' : await hr.text());
    if (!hr.ok) { console.error('헤더 기록 실패 — 중단'); process.exit(1); }
  }

  // 5) 데이터 행 백필
  let ok = 0, fail = 0;
  for (const t of todo) {
    const r = await fetch(BASE + '/api/sheet/program/' + t.row, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ values: t.values }) });
    if (r.ok) { ok++; } else { fail++; console.error('  실패 row', t.row, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log('\n백필 완료:', ok, '성공 /', fail, '실패');
}

main().catch((e) => { console.error(e); process.exit(1); });
