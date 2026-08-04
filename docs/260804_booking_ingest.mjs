#!/usr/bin/env node
// [260804] 2020~2025 예매 주문 원장 → 운영_예매 시트 반입 (운영자 「주문 원본도 전부」)
//
// 원천 = 운영자 제공 `2020~2025 공연 주문 정보.zip`(211파일 · 연도 폴더 + 희원수정본 폴더 병존).
//   전 파일 헤더 1종으로 동일. 파일 중 102개는 OLE2 StrongEncryption(열기암호), 109개는 무암호 — 둘 다 처리한다.
//   암호는 환경변수로만 받는다(KEYS.md 원칙 — 값 미저장).
//
// ⚠ 이 스크립트가 하는 일 = 「비싼 계산을 반입 때 한 번만」.
//   ① 겹침 제거: 파일을 고르지 않고 **주문키(대표티켓번호+판매순번)로 합친다**. 값 충돌 시 12.13수정본 우선
//      (실측 = 온전 휴대폰 5,024건 vs 평년도 폴더 1,639건 = 수정본이 더 완전).
//   ② 신용정보 계열 11열은 **아예 안 읽는다**(결제수단·결제상세정보·결제상태·판매자ID·아이디·전화번호 등).
//   ③ 공연 해석: 이용(관람)일시 → 대장 (년,월,일) 매칭 → 공연ID·장르1. 같은 날 2건 이상이면 상품명으로 가른다.
//      **회차 장르가 1순위**(축제형 혼합 공연은 대장이 회차 단위로 갖고 있다 · 260804 장르 정제 참조).
//   ④ 회원 조인: 휴대폰 온전이면 정확일치, 마스킹(010-****-5678)이면 (앞3,뒤4) 버킷 + 마스킹 이름으로 좁혀
//      **유일할 때만** 붙인다. 후보 2명 이상 = 안 붙인다(오연결보다 미연결이 낫다). 결과를 `회원키` 열에 박아둔다
//      → 화면·Worker는 이 열만 읽으면 되고 3만×4만 퍼지 매칭을 다시 안 돈다.
//
// ⚠ 반입 후에도 이 시트는 **완전한 모집단이 아니다**:
//   · 원본 휴대폰이 이미 마스킹 = 연결률 상한 57.1%(온전 17.4%뿐)
//   · 운영자 확인(260804): `회원여부=N`은 오연결이 아니라 **홈페이지 외 예매처 경로** — 제외하지 않는다
//   · 운영자 확인(260804): **유실된 예매 이력본이 꽤 있다** — 크기 미상이라 보정하지 않는다(추정 금지)
//
// 실행: XLS_PW=<열기암호> YM_PIN=<관리자PIN> [YM_PW=<앱비번>] node docs/260804_booking_ingest.mjs [--dry] [--limit=N]
//   --dry = 시트 무접촉, 계획·진단만. --limit=N = 앞 N행만(연습용).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const SHEET = '예매';
const LED_SHEET = '세부운영관리대장(정리)';
const ZIP = process.env.BOOKING_ZIP || '2020~2025 공연 주문 정보.zip';
const PW = process.env.YM_PW || '0510';
const PIN = process.env.YM_PIN || '';
const XLS_PW = process.env.XLS_PW || '';
const DRY = process.argv.includes('--dry');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);

// Graph 쓰기는 400행/2 PATCH라 40,429행을 한 POST에 넣으면 subrequest 한도를 넘는다 → 배치로 쪼갠다.
//   첫 배치 = 전체 교체(시트 재생성 = 멱등), 이후 = append.
// [260804 실측] 2000행 POST = Graph PATCH 503(UnknownError). opsWriteSheet가 내부에서 400행씩 끊는데
//   그 위에 또 5덩이를 얹으니 한 요청이 너무 길어진다. 500행이면 내부 2덩이 = 한 요청이 짧게 끝난다.
const BATCH = Number(process.env.BOOKING_BATCH || 500);
const RETRY = 4;   // Graph 503/429는 일시 장애가 잦다 — 지수 백오프로 흡수(실패를 실패로 남기되 성급히 포기하지 않는다)

const HDR = ['대표티켓번호', '판매순번', '주문상태', '판매일', '상품명', '이용일시', '장소명',
  '총매수', '최종정상매수', '주문자명', '휴대폰번호', '금액', '발권상태', '회원여부', '판매처',
  '주문일시', '공연ID', '장르1', '회원키'];

async function call(method, p, body, retry = 0) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Password': PW };
  if (PIN) headers['X-Sub-Admin-PIN'] = PIN;
  const r = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 300);
    // Graph 503/429/500는 일시 장애가 잦다(실측: 2000행 배치에서 503 UnknownError). 백오프 후 재시도.
    if (retry < RETRY && (r.status >= 500 || r.status === 429)) {
      const wait = 2 ** (retry + 1) * 1000;
      console.log(`    ↻ ${r.status} — ${wait / 1000}s 뒤 재시도 (${retry + 1}/${RETRY})`);
      await new Promise((z) => setTimeout(z, wait));
      return call(method, p, body, retry + 1);
    }
    throw new Error(`${method} ${p} → ${r.status}: ${txt}`);
  }
  return r.json();
}
const getSheet = (s) => call('GET', `/api/ops?sheet=${encodeURIComponent(s)}&fresh=1`);

if (!fs.existsSync(ZIP)) { console.error(`✗ zip 없음: ${ZIP} (BOOKING_ZIP으로 경로 지정 가능)`); process.exit(1); }
if (!XLS_PW) { console.error('✗ XLS_PW(엑셀 열기암호) 환경변수가 필요합니다'); process.exit(1); }

// 파싱은 파이썬 쪽 라이브러리(msoffcrypto+openpyxl)가 정본이라 그대로 쓴다 — 여기서 재구현하지 않는다.
const PY = path.join(process.cwd(), 'tools', 'booking_extract.py');
if (!fs.existsSync(PY)) { console.error(`✗ 추출기 없음: ${PY}`); process.exit(1); }
// 추출은 211파일 복호화라 수 분 걸린다 — BOOKING_CACHE를 주면 결과를 재사용한다(반입 재시도·중단 복구용).
//   캐시는 PII라 리포 밖(스크래치패드 등)에 두고, 끝나면 지운다.
const CACHE = process.env.BOOKING_CACHE || '';
let orders;
if (CACHE && fs.existsSync(CACHE)) {
  console.log(`추출 캐시 사용: ${CACHE}`);
  orders = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
} else {
  console.log('주문 원장 추출 중… (211파일 복호화+병합, 수 분 걸립니다)');
  const raw = execFileSync('python3', [PY, ZIP], {
    env: { ...process.env, XLS_PW }, maxBuffer: 1024 * 1024 * 512, encoding: 'utf8',
  });
  orders = JSON.parse(raw);
  if (CACHE) { fs.writeFileSync(CACHE, JSON.stringify(orders)); console.log(`추출 캐시 저장: ${CACHE}`); }
}
console.log(`추출 완료: 고유 주문 ${orders.length.toLocaleString()}행`);

// ── 공연 해석 (대장 = 회차 단위 장르의 정본)
const led = await getSheet(LED_SHEET);
const byday = new Map();
for (const r of led.rows) {
  const y = parseInt(r['년도'], 10), m = parseInt(r['월'], 10), d = parseInt(r['일'], 10);
  if (!y || !m || !d) continue;
  const k = `${y}-${m}-${d}`;
  if (!byday.has(k)) byday.set(k, []);
  byday.get(k).push({ id: String(r['공연ID'] || '').trim(), nm: String(r['공연명'] || '').trim(), g: String(r['장르1'] || '').trim() });
}
const norm = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '');
let hit = 0, amb = 0, miss = 0;
for (const o of orders) {
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(String(o['이용일시'] || ''));
  if (!m) { miss++; continue; }
  const cand = byday.get(`${+m[1]}-${+m[2]}-${+m[3]}`) || [];
  if (!cand.length) { miss++; continue; }
  let pick = cand[0];
  if (new Set(cand.map((c) => c.id)).size > 1) {
    // 같은 날 공연이 2건 이상 = 상품명으로 가른다. 포함관계 → 글자겹침 0.7 순으로 본다.
    //   겹침 단계가 없으면 표기 흔들림(부제·괄호·띄어쓰기)에서 못 가르고 cand[0]로 떨어진다
    //   — 실측 차이가 컸다(추정 1,023 → 322). 여기서 갈라야 회차 장르가 정확해진다.
    const pn = norm(o['상품명']);
    const ps = new Set(pn);
    let f = cand.find((c) => { const cn = norm(c.nm); return cn && (pn.includes(cn) || cn.includes(pn)); });
    if (!f) f = cand.find((c) => {
      const cs = new Set(norm(c.nm));
      if (!cs.size) return false;
      let ov = 0; for (const ch of cs) if (ps.has(ch)) ov++;
      return ov / cs.size > 0.7;
    });
    if (f) { pick = f; hit++; } else { amb++; }
  } else hit++;
  o['공연ID'] = pick.id; o['장르1'] = pick.g;
}
console.log(`공연 매칭: 확정 ${hit.toLocaleString()} · 동일자추정 ${amb.toLocaleString()} · 미매칭 ${miss.toLocaleString()}`);

// ── 회원 조인 (반입 때 한 번만 — 결과를 회원키 열에 박는다)
const mem = await getSheet('회원');
const dg = (s) => String(s || '').replace(/\D/g, '');
const byFull = new Map(), byPart = new Map();
for (const r of mem.rows) {
  const p = dg(r['휴대폰정규화']);
  if (p.length !== 11) continue;
  byFull.set(p, r);
  const k = p.slice(0, 3) + '|' + p.slice(-4);
  if (!byPart.has(k)) byPart.set(k, []);
  byPart.get(k).push(r);
}
const nmOk = (mask, real) => {
  mask = String(mask || '').trim(); real = String(real || '').trim();
  if (!mask) return false;
  if (!mask.includes('*')) return mask === real;
  return mask.length === real.length && [...mask].every((c, i) => c === '*' || c === real[i]);
};
const stat = { 연결: 0, DB에없음: 0, 후보다수: 0, 번호가림: 0 };
const seen = new Set();
for (const o of orders) {
  const ph = String(o['휴대폰번호'] || ''), d = dg(ph);
  let key = '';
  if (!ph.includes('*') && d.length === 11) { if (byFull.has(d)) key = d; else stat.DB에없음++; }
  else if (d.length >= 7) {
    const c = (byPart.get(d.slice(0, 3) + '|' + d.slice(-4)) || []).filter((m) => nmOk(o['주문자명'], m['이름']));
    if (c.length === 1) key = dg(c[0]['휴대폰정규화']);
    else if (c.length === 0) stat.DB에없음++; else stat.후보다수++;
  } else stat.번호가림++;
  o['회원키'] = key;
  if (key) { stat.연결++; seen.add(key); }
}
console.log(`회원 조인: 연결 ${stat.연결.toLocaleString()} (${(stat.연결 / orders.length * 100).toFixed(1)}%) · 식별 회원 ${seen.size.toLocaleString()}명`);
console.log(`  미연결 — DB에없음 ${stat.DB에없음.toLocaleString()} · 후보다수 ${stat.후보다수.toLocaleString()} · 번호가림 ${stat.번호가림.toLocaleString()}`);

const rows = (LIMIT ? orders.slice(0, LIMIT) : orders).map((o) => {
  const r = {};
  for (const h of HDR) r[h] = String(o[h] == null ? '' : o[h]);
  return r;
});
console.log(`\n반입 대상 ${rows.length.toLocaleString()}행 · ${HDR.length}열 · 배치 ${Math.ceil(rows.length / BATCH)}회(${BATCH}행씩)`);
if (DRY) { console.log('--dry: 시트 무접촉 종료'); process.exit(0); }
if (!PIN) { console.error('✗ YM_PIN(관리자 PIN) 환경변수가 필요합니다'); process.exit(1); }

// ⚠ [260804 실측 · 데이터 유실 사고를 여기서 잡았다] append를 연달아 쏘면 **앞 배치를 덮어쓴다**.
//   opsAppendRows는 usedRange를 읽어 붙일 자리를 정하는데, Graph 쓰기가 eventual consistency라
//   직전 배치가 아직 안 보이면 **같은 fromRow를 다시 계산**한다(실측: 배치2·배치3이 둘 다 fromRow 502
//   → 1,500행을 넣었는데 시트엔 1,000행). 그래서 배치마다 「실제로 안착했는가」를 확인하고 넘어간다.
const total = Math.ceil(rows.length / BATCH);
async function settled(expect) {
  for (let t = 0; t < 30; t++) {
    await new Promise((z) => setTimeout(z, 3000));
    try { const s = await getSheet(SHEET); if (s.count >= expect) return s.count; } catch (e) {}
  }
  return -1;
}
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const first = i === 0;
  const n = Math.floor(i / BATCH) + 1;
  await call('POST', '/api/ops', first
    ? { sheet: SHEET, headers: HDR, rows: slice }              // 첫 배치 = 전체 교체(= 재실행 멱등)
    : { sheet: SHEET, mode: 'append', rows: slice });
  const want = i + slice.length;
  const got = await settled(want);
  if (got < 0) { console.error(`✗ 배치 ${n}/${total} 안착 확인 실패(기대 ${want}행) — 중단. 라이브 확인 후 재실행하라(첫 배치가 전체 교체라 안전).`); process.exit(1); }
  console.log(`  배치 ${n}/${total} (${first ? '교체' : 'append'}) → ${got.toLocaleString()}행 안착`);
}

// [260804 실측 · ledger_2026h1_ingest 전례] Graph 쓰기는 eventual consistency — 즉시 조회가 옛 값을 줄 수 있다.
await new Promise((r) => setTimeout(r, 20000));
const after = await getSheet(SHEET);
console.log(`검증: ${after.count.toLocaleString()}행 (기대 ${rows.length.toLocaleString()}) · 헤더 ${after.headers.length}열`);
if (after.count !== rows.length) { console.error('✗ 행수 불일치 — 20초 뒤 fresh 재조회로 다시 확인하라(중복 append 금지).'); process.exit(1); }
console.log('✓ 반입 + 검증 완료');
