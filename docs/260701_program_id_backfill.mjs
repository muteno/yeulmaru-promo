#!/usr/bin/env node
// 프로그램ID 빈값 일괄 백필 — '프로그램' 시트에서 프로그램ID(구 '공연ID')가 비어있는 행에
// 시작일 기반 YYMMDD_NN 을 부여한다. (2026-07-01, 적대적 검증 반영판)
//
// 배경: saveProgram이 예전엔 새 프로그램에 ID를 안 넣어(빈칸 저장) 하반기 공연들 ID 부재.
//   프론트에 자동생성(_genProgramId)이 들어갔지만 '이미 있는' 빈 행은 이 스크립트로 일괄 백필.
//   형식은 기존 마이그레이션과 동일 YYMMDD_NN(시작일 + 그날 순번).
//   [검증반영] 순번은 프로그램 시트뿐 아니라 records·색인·마스터의 기존 ID까지 스캔한 전역 MAX+1로
//   부여해 과거 실적과 조인키가 겹치지 않게 한다. 헤더 빈칸/중복이면 손상 방지 위해 중단.
//
// 사용:
//   미리보기(권장):  DB_PW=<관리자비번> node docs/260701_program_id_backfill.mjs
//   실제 적용:       DB_PW=<관리자비번> node docs/260701_program_id_backfill.mjs --write
//   (서브admin PIN: DB_PIN=<핀>)
//
// ⚠️ Worker 변경 불필요. '프로그램ID'(구 '공연ID') · '시작일' 컬럼 필요.

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const WRITE = process.argv.includes('--write');
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// 시작일(Excel serial 또는 ISO/비표준 문자열) → 'YYMMDD'
function startToYYMMDD(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  let iso;
  if (/^\d+(\.\d+)?$/.test(s)) {
    iso = new Date((Number(s) - 25569) * 86400000).toISOString().slice(0, 10);
  } else {
    const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);   // '2026-7-1','2026년 7월 1일' 등 흡수(0-패딩)
    iso = m ? (m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')) : s.slice(0, 10);
  }
  const d = iso.replace(/[^0-9]/g, '');
  return d.length >= 8 ? d.slice(2, 8) : '';
}

async function getJson(path) {
  try { const r = await fetch(BASE + path, { headers: AUTH }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; }
}

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 필요'); process.exit(1); }

  const prog = await getJson('/api/sheet/program');
  if (!prog || !prog.rows) { console.error('GET /api/sheet/program 실패 (인증/네트워크 확인)'); process.exit(1); }
  const { headers, rows } = prog;
  console.log('현재 헤더:', headers.join(' | '));

  // [검증반영] 헤더 빈칸/중복 가드 — headers.map 왕복 시 컬럼 오염 위험 → 중단
  const hseen = {}, hdup = []; let hempty = false;
  headers.forEach(h => { if (h === '' || h == null) hempty = true; else if (hseen[h]) hdup.push(h); else hseen[h] = 1; });
  if (hempty || hdup.length) { console.error('헤더에 빈칸/중복 있음 — 손상 위험으로 중단.', hdup.length ? ('중복:' + hdup.join(',')) : '', hempty ? '(빈칸 포함)' : ''); process.exit(1); }

  const idKey = headers.includes('프로그램ID') ? '프로그램ID' : (headers.includes('공연ID') ? '공연ID' : null);
  const startKey = headers.includes('시작일') ? '시작일' : (headers.includes('시작') ? '시작' : null);
  if (!idKey) { console.error("헤더에 '프로그램ID'/'공연ID' 없음 — 중단"); process.exit(1); }
  if (!startKey) { console.error("헤더에 '시작일' 없음 — 중단"); process.exit(1); }
  console.log('ID 컬럼:', idKey, '| 시작일 컬럼:', startKey, '| 데이터 행:', rows.length);

  // [검증반영] 전역 MAX 순번 — 프로그램 + records + 색인 + 마스터의 기존 ID까지 스캔(조인키 전역 유일성)
  const maxSeq = {};
  const scan = (arr, keys) => (arr || []).forEach(r => keys.forEach(k => {
    const m = String(r[k] || '').trim().match(/^(\d{6})_(\d+)$/);
    if (m) { const kk = m[1], n = parseInt(m[2], 10); if (!maxSeq[kk] || n > maxSeq[kk]) maxSeq[kk] = n; }
  }));
  scan(rows, [idKey, '공연ID']);
  const rec = await getJson('/api/records'); if (rec && rec.records) scan(rec.records, ['공연ID']);
  const idx = await getJson('/api/ops?sheet=' + encodeURIComponent('공연색인')); if (idx && idx.rows) scan(idx.rows, ['공연ID']);
  const mst = await getJson('/api/ops?sheet=' + encodeURIComponent('공연마스터')); if (mst && mst.rows) scan(mst.rows, ['ID', '공연ID']);
  console.log('전역 순번 스캔 완료(프로그램+records+색인+마스터) — 같은 날짜는 최대 순번 다음부터 부여');

  const todo = [], skip = [];
  for (const r of rows) {
    if (r['NO'] === '' || r['NO'] == null) continue;
    const cur = String(r[idKey] || r['공연ID'] || '').trim();
    if (cur) continue;                                   // 이미 ID 있음 → 보존
    const name = r['풀네임'] || r['줄임말'] || '(무명)';
    const yy = startToYYMMDD(r[startKey]);
    if (!yy) { skip.push({ row: r._rowIndex, name }); continue; }
    const next = (maxSeq[yy] || 0) + 1; maxSeq[yy] = next;
    const newId = yy + '_' + String(next).padStart(2, '0');
    const values = headers.map(h => (h === idKey ? newId : (r[h] != null ? r[h] : '')));
    todo.push({ row: r._rowIndex, name, newId, values });
  }

  console.log('\n백필 대상:', todo.length, '건 / 시작일 없어 스킵:', skip.length, '건');
  todo.forEach(t => console.log('  · row', t.row, '→', t.newId, ' ', t.name));
  if (skip.length) { console.log('\n[시작일 없어 ID 부여 못함 — 수동 확인]'); skip.forEach(s => console.log('  · row', s.row, s.name)); }

  if (!WRITE) { console.log('\n[미리보기] 실제 적용하려면 --write 를 붙여 다시 실행하세요.'); return; }

  let ok = 0, fail = 0;
  for (const t of todo) {
    const r = await fetch(BASE + '/api/sheet/program/' + t.row, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ values: t.values }) });
    if (r.ok) { ok++; console.log('  ✓ row', t.row, t.newId); } else { fail++; console.error('  ✗ row', t.row, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log('\n백필 완료:', ok, '성공 /', fail, '실패');
}

main().catch(e => { console.error(e); process.exit(1); });
