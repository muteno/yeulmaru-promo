#!/usr/bin/env node
// 프로그램ID 색인 충돌 점검 (읽기 전용) — 프로그램 시트의 프로그램ID(구 '공연ID')가
// records·운영_공연색인·운영_공연마스터에서 '서로 다른 공연'에 이미 쓰이고 있는지 점검한다.
// 같은 YYMMDD_NN 값이 서로 다른 공연명에 붙어있으면 조인 충돌 후보로 리포트. 아무것도 바꾸지 않음.
// (2026-07-01, 적대적 검증 high 지적 대응)
//
// 사용:  DB_PW=<관리자비번> node docs/260701_program_id_collision_check.mjs
//   (서브admin PIN: DB_PIN=<핀>)

const BASE = process.env.BASE || 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const PIN = process.env.DB_PIN || '';
const AUTH = { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN };

// 공연명 정규화(동일 판정용) — 공백·꺾쇠·괄호·구두점 제거 + 소문자
function norm(s) {
  return String(s || '').replace(/[\s<>〈〉《》「」『』()\[\]{}·,.\-_'"!?:;]/g, '').toLowerCase();
}

async function getJson(path) {
  try { const r = await fetch(BASE + path, { headers: AUTH }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; }
}

async function main() {
  if (!PW && !PIN) { console.error('DB_PW 또는 DB_PIN 필요'); process.exit(1); }

  const byId = {};   // id -> [{src, name}]
  const add = (id, src, name) => {
    id = String(id || '').trim();
    if (!/^\d{6}_\d+$/.test(id)) return;
    (byId[id] = byId[id] || []).push({ src, name: String(name || '').trim() });
  };

  // 1) 프로그램 시트
  const prog = await getJson('/api/sheet/program');
  if (!prog || !prog.rows) { console.error('프로그램 시트 조회 실패 (인증/네트워크 확인)'); process.exit(1); }
  const idk = (prog.headers || []).includes('프로그램ID') ? '프로그램ID' : '공연ID';
  prog.rows.forEach(r => add(r[idk] || r['공연ID'], '프로그램', r['풀네임'] || r['줄임말']));

  // 2) records(홍보기록)
  const rec = await getJson('/api/records');
  if (rec && rec.records) rec.records.forEach(r => add(r['공연ID'], 'records', r['프로그램']));

  // 3) 운영_공연색인
  const idx = await getJson('/api/ops?sheet=' + encodeURIComponent('공연색인'));
  if (idx && idx.rows) idx.rows.forEach(r => add(r['공연ID'], '색인', r['대표공연명'] || r['공연명']));

  // 4) 운영_공연마스터
  const mst = await getJson('/api/ops?sheet=' + encodeURIComponent('공연마스터'));
  if (mst && mst.rows) mst.rows.forEach(r => add(r['ID'] || r['공연ID'], '마스터', r['사업명'] || r['공연명']));

  // 충돌 = 한 id에 서로 다른(정규화) 공연명이 2개 이상
  const conflicts = [];
  Object.keys(byId).sort().forEach(id => {
    const uniq = [...new Set(byId[id].map(n => norm(n.name)).filter(Boolean))];
    if (uniq.length >= 2) conflicts.push({ id, names: byId[id] });
  });

  console.log('점검한 고유 프로그램ID:', Object.keys(byId).length, '| 소스: 프로그램·records·색인·마스터');
  if (!conflicts.length) {
    console.log('\n✅ 충돌 없음 — 같은 ID가 서로 다른 공연에 붙은 경우 0건. 백필 안전.');
    return;
  }
  console.log('\n⚠️ 충돌', conflicts.length, '건 — 같은 프로그램ID가 서로 다른 공연에 붙어있음:');
  conflicts.forEach(c => {
    console.log('\n  · ' + c.id);
    c.names.forEach(n => console.log('      [' + n.src + '] ' + n.name));
  });
  console.log('\n→ 위 ID는 프로그램 시트에서 순번을 바꿔 재부여해야 조인이 정상화됩니다. 이 목록 캡처해 전달 주세요.');
}

main().catch(e => { console.error(e); process.exit(1); });
