#!/usr/bin/env node
// ============================================================
// 헬로!오페라 줄임말 분리 (260806) — 세비야/마술피리 중복 해소
//
//   node docs/260806_헬로오페라_줄임말_분리.mjs                        # dry-run: 현재값 대조만
//   DB_PW=관리자비번 node docs/260806_헬로오페라_줄임말_분리.mjs --write   # 실행
//   DB_PW=관리자비번 node docs/260806_헬로오페라_줄임말_분리.mjs --write --revert  # 원복(둘 다 '헬로!오페라')
//
// 왜 (작업이력 260804-17 「라이브 버그 ②」):
//   프로그램 시트의 두 행이 줄임말을 똑같이 '헬로!오페라'로 쓰고 있어
//   _findPerfByName의 first-match가 항상 앞 행(세비야 · 홍보종료 2026-06-20)을 반환 →
//   11월 마술피리 홍보가 「홍보 종료 후」로 영구 차단. 줄임말을 가르면 해소된다.
//
// ⚠ 왜 A~D 4열만 쓰나 (이 스크립트의 핵심 안전장치):
//   Worker의 handleUpdateSheetRow(src/index.js:414)는 `A{행}:{colLetter(values.length)}{행}` 범위로
//   PATCH한다 = **보낸 배열 길이만큼만** 덮어쓴다. 그래서 4개만 보내면 A~D만 닿고 E~U는 물리적 무접촉.
//   앱의 saveProgram은 A~M 13열을 보내는데, 이 작업엔 D 한 칸만 필요하므로 13열을 왕복시킬 이유가 없다
//   (날짜 E~H는 엑셀 시리얼이라 왕복 자체가 사고면). 작업이력 2115의 「positional 배열 길이 사고로
//   브런치Ⅲ URL·공연ID 손상」 전례를 구조적으로 못 밟게 하는 선택.
//
// ⚠ 실측 주의 — 문서와 라이브가 다르다:
//   작업이력 2115는 프로그램 시트를 A~N 14열(M=홍보시작일·N=홍보종료일)로 적고 있으나
//   260806 라이브 실측 헤더는 21열이고 **N = '구분'**, '홍보종료일' 열은 존재하지 않는다.
//   구 문서를 믿고 14열 배열을 보내면 N('구분'=운영자 엑셀 수동관리열)을 덮어쓴다. 보내지 마라.
//
// 대상은 프로그램ID로 고정(행 번호·이름이 흔들려도 안전). 풀네임까지 대조해 하나라도 어긋나면 중단.
// ============================================================
const BASE = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '';
const WRITE = process.argv.includes('--write');
const REVERT = process.argv.includes('--revert');
const H = { headers: { 'X-App-Password': PW } };
const HJ = { ...H.headers, 'Content-Type': 'application/json' };

// 프로그램ID → [기대 풀네임(대조용), 새 줄임말]
const PLAN = {
  '260619_01': ['2026 헬로!오페라 <세비야의 이발사>', '헬로_세비야'],
  '261120_01': ['2026 헬로!오페라 <마술피리>', '헬로_마술'],
};
const OLD = '헬로!오페라';   // --revert 시 되돌릴 값(중복 상태로 복귀)

if (!PW) { console.error('✖ DB_PW 없음 — 관리자 비번을 넣어 실행하세요. (읽기만 해볼 거면 앱 비번도 됩니다)'); process.exit(1); }

const prog = await (await fetch(BASE + '/api/sheet/program', H)).json();
if (!prog || !prog.headers) { console.error('✖ 프로그램 시트 조회 실패:', JSON.stringify(prog).slice(0, 200)); process.exit(1); }
const pid = (r) => String(r['프로그램ID'] || r['공연ID'] || '').trim();

// ── 대상 확보 + 대조 ──
const targets = [];
for (const [id, [wantFull, newShort]] of Object.entries(PLAN)) {
  const hit = (prog.rows || []).filter((r) => pid(r) === id);
  if (hit.length !== 1) { console.error(`✖ 프로그램ID ${id} — 행 ${hit.length}개(1개여야 함). 중단.`); process.exit(1); }
  const r = hit[0];
  const full = String(r['풀네임'] || '').trim();
  if (full !== wantFull) { console.error(`✖ ${id} 풀네임 불일치 — 시트 "${full}" vs 기대 "${wantFull}". 중단.`); process.exit(1); }
  targets.push({ id, row: r, from: String(r['줄임말'] || '').trim(), to: REVERT ? OLD : newShort });
}

console.log('── 대상 2건 (프로그램ID 기준)');
targets.forEach((t) => {
  const same = t.from === t.to;
  console.log(`   ${t.id}  ${t.row['풀네임']}`);
  console.log(`      줄임말  "${t.from}" → "${t.to}"${same ? '   (이미 같음 — 건너뜀)' : ''}`);
});

// ── 중복 재발 검사: 바꾼 뒤 시트 전체에서 줄임말이 유일한가 ──
//   두 축을 다 본다 — ① 원문 그대로(=_findPerfByName의 first-match 조건, index.html:21136)
//   ② _uName 정규화(=_salesBuild·_dailyMasters·_bizEduNameSet의 dedup 조건, index.html:5693).
//   ②는 `_`·`!`·괄호·공백을 지우므로 '헬로_세비야'와 '헬로!세비야'가 같은 키가 된다 → 원문만 보면 놓친다.
const _uName = (s) => String(s || '').replace(/\s*[-–—]\s*여수\s*$/, '').replace(/[〈〉<>「」『』\[\]（）()]/g, '')
  .replace(/[_\-–—·.,’'"~!:：]/g, '').replace(/\s+/g, '').toLowerCase();
const axis = (keyFn) => {
  const m = {};
  (prog.rows || []).forEach((r) => {
    const t = targets.find((x) => x.row._rowIndex === r._rowIndex);
    const s = (t ? t.to : String(r['줄임말'] || '')).trim();
    if (!s) return;
    const k = keyFn(s); (m[k] = m[k] || []).push(String(r['풀네임'] || ''));
  });
  return Object.entries(m).filter(([, v]) => v.length > 1);
};
let clean = true;
for (const [label, keyFn] of [['원문', (s) => s], ['_uName 정규화', _uName]]) {
  const dup = axis(keyFn);
  if (dup.length) { clean = false; console.log(`\n⚠ 적용 후에도 ${label} 축 중복 ${dup.length}건: ${dup.map(([k, v]) => `「${k}」×${v.length}`).join(' · ')}`); }
}
if (clean) console.log('\n✓ 적용 후 시트 전체 줄임말 중복 0건 (원문·_uName 두 축 모두)');

const todo = targets.filter((t) => t.from !== t.to);
if (!todo.length) { console.log('\n바꿀 것 없음(이미 반영됨).'); process.exit(0); }
if (!WRITE) { console.log(`\n(dry-run — 실제로 바꾸려면 --write · 대상 ${todo.length}건)`); process.exit(0); }

// ── 쓰기: A~D 4열만 (E~U 무접촉) ──
for (const t of todo) {
  const r = t.row;
  const values = [r['NO'] ?? '', r['콘텐츠구분'] ?? '', r['풀네임'] ?? '', t.to];   // A B C D — 길이 4 = A~D 범위
  const res = await fetch(`${BASE}/api/sheet/program/${r._rowIndex}`, { method: 'PATCH', headers: HJ, body: JSON.stringify({ values }) });
  const body = await res.text();
  console.log(`   → ${t.id} 행${r._rowIndex} PATCH ${res.status}${res.ok ? '' : ' ' + body.slice(0, 200)}`);
  if (!res.ok) { console.error('✖ 실패 — 중단(앞 건이 이미 반영됐다면 --revert로 원복 가능).'); process.exit(1); }
}

// ── 사후 검증: 다시 읽어 실제 반영 확인 ──
const re = await (await fetch(BASE + '/api/sheet/program', H)).json();
let ok = true;
for (const t of targets) {
  const r = (re.rows || []).find((x) => pid(x) === t.id);
  const now = String((r && r['줄임말']) || '').trim();
  const good = now === t.to;
  if (!good) ok = false;
  console.log(`   검증 ${t.id}: 줄임말 = "${now}" ${good ? '✓' : '✖ 기대 "' + t.to + '"'}`);
  // E~U 무접촉 확인 — 안 건드렸어야 하는 열이 그대로인가
  const keep = ['판매시작일', '판매종료일', '시작일', '종료일', '담당자', '장소', 'URL', '프로그램ID', '홍보시작일', '구분', '회차', '수익성', '홍보노출'];
  const before = t.row, moved = keep.filter((k) => String(before[k] ?? '') !== String((r && r[k]) ?? ''));
  if (moved.length) { ok = false; console.log(`      ✖ E~U 변동 감지: ${moved.join(', ')}`); }
  else console.log('      ✓ E~U(판매·홍보·구분·수익성 등) 무변동');
}
console.log(ok ? '\n✅ 완료 — 줄임말 분리 반영됨.' : '\n✖ 검증 실패 — 위 항목 확인 필요.');
process.exit(ok ? 0 : 1);
