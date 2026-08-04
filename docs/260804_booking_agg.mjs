#!/usr/bin/env node
// [260804] 운영_예매(주문 4만 행) → 운영_예매집계(회원 1만 행) 파생 — 화면이 읽을 작은 표
//
// 왜 따로 두는가 = 화면이 주문 원본 40,429행(약 15MB)을 받으면 안 되기 때문이다.
//   회원 시트만도 이미 29,752행/6.7MB를 받는데 그 위에 주문 원본을 얹으면 모달이 못 뜬다.
//   그래서 「비싼 계산은 반입 때 한 번만」 원칙을 여기서도 지킨다 — 회원키 단위로 접어 1만 행으로 만든다.
//   원본은 운영_예매에 그대로 남는다(운영자 「주문 원본도 전부」) — 이 시트는 그 파생일 뿐 대체가 아니다.
//
// 분포 인코딩 = `연도|장르:횟수` 를 `;`로 이었다. 「23~24년 클래식 2회 이상」 같은 질의가
//   연도·장르 교차로 떨어지므로 둘을 따로 저장하면 답을 못 만든다(연도별 합과 장르별 합으로는
//   「그 해에 그 장르를」이 안 나온다). 교차표를 통째로 들고 있어야 한다.
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

const agg = new Map();
let skipped = 0;
for (const r of src.rows) {
  const key = String(r['회원키'] || '').trim();
  if (!key) { skipped++; continue; }                     // 회원 미연결 주문 = 집계 대상 아님(누구 것인지 모른다)
  const day = String(r['이용일시'] || '').slice(0, 10);
  const y = day.slice(0, 4);
  const g = String(r['장르1'] || '').trim() || '미상';
  const a = agg.get(key) || { n: 0, tix: 0, amt: 0, first: '', last: '', d: new Map() };
  a.n++;
  a.tix += parseInt(r['최종정상매수'], 10) || 0;
  a.amt += Math.round(parseFloat(String(r['금액'] || '').replace(/,/g, '')) || 0);
  if (day && (!a.first || day < a.first)) a.first = day;
  if (day && day > a.last) a.last = day;
  if (y.length === 4) { const k = `${y}|${g}`; a.d.set(k, (a.d.get(k) || 0) + 1); }
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
