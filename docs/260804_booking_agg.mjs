#!/usr/bin/env node
// [260804] 운영_예매(주문 4만 행) → 운영_예매집계(회원 1만 행) 파생 — 화면이 읽을 작은 표
//
// 왜 따로 두는가 = 화면이 주문 원본 40,429행(약 15MB)을 받으면 안 되기 때문이다.
//   회원 시트만도 이미 29,752행/6.7MB를 받는데 그 위에 주문 원본을 얹으면 모달이 못 뜬다.
//   그래서 「비싼 계산은 반입 때 한 번만」 원칙을 여기서도 지킨다 — 회원키 단위로 접어 1만 행으로 만든다.
//   원본은 운영_예매에 그대로 남는다(운영자 「주문 원본도 전부」) — 이 시트는 그 파생일 뿐 대체가 아니다.
//
// 분포 인코딩 = `연월|장르:횟수` 를 `;`로 이었다(예 `202312|클래식:2`). 「23~24년 클래식 2회 이상」 같은 질의가
//   기간·장르 교차로 떨어지므로 둘을 따로 저장하면 답을 못 만든다(기간별 합과 장르별 합으로는
//   「그 때 그 장르를」이 안 나온다). 교차표를 통째로 들고 있어야 한다.
//
// [260808 운영자 「가능한 범위 최대한 3년이 아니라 5년이면 5년으로」] 시간 축 = **연(YYYY) → 연월(YYYYMM)**.
//   구판은 달력연도만 들고 있어 「3년 이내」가 원리적으로 불가능했다(연 단위로는 근사밖에 안 된다).
//   ⚠ 행이 늘지 않는다 — 한 회원의 분포 쌍 수는 그 사람 **주문 수**로 상한이 잡히고(같은 달·같은 장르는 접힌다),
//     연결 주문이 23,070건이라 1만 행에 흩어지면 평균 2.3쌍이다. 실측 최대 길이는 아래 로그가 찍는다.
//   ⚠ 화면은 **구·신 포맷을 둘 다 읽는다**(`_bkLoad`가 키 길이 4/6으로 가른다) — 이 스크립트를 아직 안 돌렸어도
//     연 단위 근사로 답이 나오고, 돌리는 순간 자동으로 월 정밀로 올라간다. 재반입 순서에 화면이 안 묶인다.
//
// 실행: YM_PIN=<관리자PIN> [YM_PW=<앱비번>] node docs/260804_booking_agg.mjs [--dry]

const API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const SRC = '예매', DST = '예매집계';
const PW = process.env.YM_PW || '0510';
const PIN = process.env.YM_PIN || '';
const DRY = process.argv.includes('--dry');
const BATCH = Number(process.env.BOOKING_BATCH || 500);
const RETRY = 4;

const HDR = ['회원키', '총구매', '총매수', '총금액', '첫구매일', '최근구매일', '분포'];

async function call(method, p, body, retry = 0) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Password': PW };
  if (PIN) headers['X-Sub-Admin-PIN'] = PIN;
  const r = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    if (retry < RETRY && (r.status >= 500 || r.status === 429)) {
      const w = 2 ** (retry + 1) * 1000;
      console.log(`    ↻ ${r.status} — ${w / 1000}s 뒤 재시도 (${retry + 1}/${RETRY})`);
      await new Promise((z) => setTimeout(z, w));
      return call(method, p, body, retry + 1);
    }
    throw new Error(`${method} ${p} → ${r.status}: ${t}`);
  }
  return r.json();
}
const getSheet = (s) => call('GET', `/api/ops?sheet=${encodeURIComponent(s)}&fresh=1`);

const src = await getSheet(SRC);
console.log(`운영_${SRC} ${src.count.toLocaleString()}행 · ${src.headers.length}열`);
for (const h of ['회원키', '이용일시', '장르1', '최종정상매수', '금액', '주문상태']) {
  if (!src.headers.includes(h)) { console.error(`✗ 원본에 없는 컬럼: ${h} — 중단`); process.exit(1); }
}

// ── 주문상태 감시선 ────────────────────────────────────────────────────────
// 이 스크립트는 주문상태로 행을 **거르지 않는다**. 260805 실측이 근거다:
//   상태값 = 정상 39,588 · 부분취소 840 · 공란 1 뿐(전체취소 없음)이고,
//   회원 연결분의 부분취소 516행은 **전부 최종정상매수>0**이다.
//   즉 최종정상매수가 이미 취소분을 뺀 순액이라, 부분취소 행도 실제 관람이 맞다.
//   (연결분 중 최종정상매수<=0 행 = 0건으로 재확인)
// 그래서 「거르지 않는 게 맞다」는 결론은 **상태값 집합이 그대로일 때만** 참이다.
// 원천에 전체취소류가 새로 생기면 취소 주문이 조용히 관람으로 집계되므로, 여기서 멈춘다.
const KNOWN_STATES = new Set(['정상', '부분취소', '']);
const unknown = new Map();
for (const r of src.rows) {
  const s = String(r['주문상태'] || '').trim();
  if (!KNOWN_STATES.has(s)) unknown.set(s, (unknown.get(s) || 0) + 1);
}
if (unknown.size) {
  console.error('✗ 처음 보는 주문상태 — 관람으로 셀지 판단이 필요하다. 중단:');
  for (const [s, n] of [...unknown].sort((a, b) => b[1] - a[1])) console.error(`    ${s} ${n.toLocaleString()}행`);
  console.error('  → 취소류면 아래 루프에 제외 조건을 넣고, 아니면 KNOWN_STATES에 추가할 것.');
  process.exit(1);
}

const agg = new Map();
let skipped = 0;
for (const r of src.rows) {
  const key = String(r['회원키'] || '').trim();
  if (!key) { skipped++; continue; }                     // 회원 미연결 주문 = 집계 대상 아님(누구 것인지 모른다)
  const day = String(r['이용일시'] || '').slice(0, 10);
  // 연월 = booking_ingest의 공연 매칭과 **같은 정규식**으로 뽑는다 — 이용일시 표기가 `2023-05-14`·`20230514`·
  //   `2023.05.14`로 섞여 있어 slice로 자르면 구분자 있는 쪽에서 달이 밀린다(`2023-05` → `2023`+`-0`).
  const ym = /^(\d{4})[-./]?(\d{2})/.exec(String(r['이용일시'] || ''));
  const g = String(r['장르1'] || '').trim() || '미상';
  const a = agg.get(key) || { n: 0, tix: 0, amt: 0, first: '', last: '', d: new Map() };
  a.n++;
  a.tix += parseInt(r['최종정상매수'], 10) || 0;
  a.amt += Math.round(parseFloat(String(r['금액'] || '').replace(/,/g, '')) || 0);
  if (day && (!a.first || day < a.first)) a.first = day;
  if (day && day > a.last) a.last = day;
  if (ym) { const k = `${ym[1]}${ym[2]}|${g}`; a.d.set(k, (a.d.get(k) || 0) + 1); }
  agg.set(key, a);
}
console.log(`집계: 회원 ${agg.size.toLocaleString()}명 · 회원 미연결 주문 ${skipped.toLocaleString()}행 제외`);

const rows = [...agg.entries()].map(([key, a]) => ({
  '회원키': key, '총구매': String(a.n), '총매수': String(a.tix), '총금액': String(a.amt),
  '첫구매일': a.first, '최근구매일': a.last,
  '분포': [...a.d.entries()].map(([k, v]) => `${k}:${v}`).join(';'),
}));
const rep = rows.filter((r) => +r['총구매'] >= 2).length;
console.log(`  재구매(2회+) ${rep.toLocaleString()}명 (${(rep / rows.length * 100).toFixed(1)}%) · 총 매수 ${rows.reduce((s, r) => s + +r['총매수'], 0).toLocaleString()}`);
console.log(`  분포 문자열 최대 길이 ${Math.max(...rows.map((r) => r['분포'].length))}자`);
// 시간 축 실측 — 화면의 「최근 N년」은 이 범위 끝을 기준점으로 센다(오늘이 아니라 **데이터 마지막 달**).
//   범위를 안 찍으면 「3년 이내인데 왜 2년치만 나오지」를 화면에서만 의심하게 된다.
{
  const ms = [];
  for (const r of rows) for (const p of r['분포'].split(';')) { const t = p.split('|')[0]; if (/^\d{6}$/.test(t)) ms.push(+t); }
  if (ms.length) console.log(`  시간 축 = 연월(YYYYMM) · 범위 ${Math.min(...ms)}~${Math.max(...ms)} · 분포 쌍 ${ms.length.toLocaleString()}개`);
  else console.log('  ⚠ 시간 축이 연월이 아니다 — 이용일시 표기를 확인하라(화면은 연 단위 근사로 떨어진다)');
}
console.log(`\n반입 대상 ${rows.length.toLocaleString()}행 · ${HDR.length}열 · 배치 ${Math.ceil(rows.length / BATCH)}회`);
if (DRY) { console.log('--dry: 시트 무접촉 종료'); process.exit(0); }
if (!PIN) { console.error('✗ YM_PIN 환경변수가 필요합니다'); process.exit(1); }

// ⚠ append 연타 = 앞 배치 덮어쓰기(booking_ingest 주석 참조) — 배치마다 안착 확인 후 진행.
async function settled(expect) {
  for (let t = 0; t < 30; t++) {
    await new Promise((z) => setTimeout(z, 3000));
    try { const s = await getSheet(DST); if (s.count >= expect) return s.count; } catch (e) {}
  }
  return -1;
}
const total = Math.ceil(rows.length / BATCH);
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH), first = i === 0, n = Math.floor(i / BATCH) + 1;
  await call('POST', '/api/ops', first ? { sheet: DST, headers: HDR, rows: slice } : { sheet: DST, mode: 'append', rows: slice });
  const got = await settled(i + slice.length);
  if (got < 0) { console.error(`✗ 배치 ${n}/${total} 안착 확인 실패 — 중단(첫 배치가 전체 교체라 재실행 안전).`); process.exit(1); }
  console.log(`  배치 ${n}/${total} → ${got.toLocaleString()}행 안착`);
}
const after = await getSheet(DST);
console.log(`검증: ${after.count.toLocaleString()}행 (기대 ${rows.length.toLocaleString()})`);
if (after.count !== rows.length) { console.error('✗ 행수 불일치 — 라이브 확인 후 재실행하라.'); process.exit(1); }
console.log('✓ 집계 반입 + 검증 완료');
