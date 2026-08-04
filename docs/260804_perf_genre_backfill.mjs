#!/usr/bin/env node
// [260804] 운영_공연색인에 「장르1」 열 신설 + 백필 — 예매자↔회원 배선의 선행 정제(운영자 「그러려면 공연도 db정제가 되어야하고」)
//
// 왜 필요한가 = 색인(1,317건)에 장르 열이 **아예 없다**(공연ID·대표공연명·연도·첫공연일·회차수·출처).
//   장르는 운영_세부운영관리대장(정리)에만 회차 단위로 있어서, 「23~24년 클래식 2회 이상 관람」 같은
//   예매 질의가 공연ID→장르로 내려갈 길이 없다. 이 스크립트가 그 길을 놓는다.
//
// ⚠ 대장은 무접촉이다. 대장은 실적 원장(2,204행 · 발권유료의 SSOT)이라 전체 교체 위험을 지지 않는다.
//   장르 어휘 정규화(연극 → 발레/연극)도 **읽을 때** 하고 원장 값은 그대로 둔다 — 원장을 고쳐야 할
//   이유가 생기면 그건 별건으로 운영자 승인 후.
//
// 집계 규칙(창작 0 — 대장에 실제로 있는 값만 쓴다):
//   · 공연ID별로 대장 회차들의 장르1을 모은다. 공란은 후보에서 제외(= 값이 하나라도 있으면 그 값이 이긴다).
//   · 후보가 2종 이상 = 축제형 혼합(예 160921_01 뮤지컬/클래식). 최다 회차 장르를 대표로 쓰고 장르혼합=Y로 표시 —
//     회차별 정확한 장르는 대장이 계속 정본이고, 예매 조인은 「공연ID+날짜 → 회차 장르」를 1순위로 본다.
//   · 후보 0종(공란만) = 장르1 공란 + 장르출처 '미상'. **추정해서 채우지 않는다**(기틀 §3 임의 창작 금지).
//   · 대장에 아예 없는 색인 건(실적 미반입분)도 '미상'.
//
// 실행: YM_PIN=<관리자PIN> [YM_PW=<앱비번>] node docs/260804_perf_genre_backfill.mjs [--dry]
//   --dry(기본 권장) = 시트 무접촉, 계획·진단만 출력. PIN·비번은 환경변수로만(KEYS.md 원칙 — 값 미저장).

const API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const IDX_SHEET = '공연색인';
const LED_SHEET = '세부운영관리대장(정리)';
const PW = process.env.YM_PW || '0510';
const PIN = process.env.YM_PIN || '';
const DRY = process.argv.includes('--dry');

// 장르 어휘 정규화 — 대장에 1건뿐인 표기 흔들림을 읽을 때 흡수(원장 값은 안 고친다).
//   '연극'(191224_01 옹알스 1건) → '발레/연극'(237건인 정본 표기). 새 어휘를 만들지는 않는다.
const GENRE_ALIAS = { '연극': '발레/연극' };
const normGenre = (g) => GENRE_ALIAS[String(g == null ? '' : g).trim()] || String(g == null ? '' : g).trim();

// [운영자 260804 확정] 장르 결손 22건 중 19건 — 제목 목록을 보고 **운영자가 직접 정한 값**이다(세션 추정 아님 · 기틀 §3 묻고-편입).
//   나머지 3건(170120_01 국악관현악캠프 · 220913_01 프린지콘서트 · 220917_01 G콘서트)은 회신 대기 = 여기 없으므로 '미상'으로 남는다.
//   대장 원장은 여전히 공란이다 — 이 표는 색인(장르 SSOT)에만 반영된다.
const OPERATOR_GENRE = {
  '141009_01': '클래식',   // 음악이흐르는광장영화관 오프닝 축하연주회 (2014)
  '201229_02': '뮤지컬',   // 창작뮤지컬 <별이쏟아진다> (2020)
  // 「여성영화산책」 시리즈 17건 = 기타 (운영자 「여성영화 > 기타」 — 어휘 6종 유지 · '영화' 신설 안 함)
  '150826_01': '기타', '150930_01': '기타', '151028_01': '기타', '151125_01': '기타', '151230_01': '기타',
  '160224_01': '기타', '160427_01': '기타', '160629_01': '기타', '160831_01': '기타', '161026_01': '기타', '161228_02': '기타',
  '170222_01': '기타', '170426_01': '기타', '170628_01': '기타', '170830_01': '기타', '171025_01': '기타', '171227_01': '기타',
};

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Password': PW };
  if (PIN) headers['X-Sub-Admin-PIN'] = PIN;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}
const get = (sheet) => call('GET', `/api/ops?sheet=${encodeURIComponent(sheet)}&fresh=1`);

const idx = await get(IDX_SHEET);
const led = await get(LED_SHEET);
console.log(`색인 ${idx.count}건 · 대장 ${led.count}행`);
for (const [nm, d, need] of [[IDX_SHEET, idx, ['공연ID', '대표공연명', '연도']], [LED_SHEET, led, ['공연ID', '장르1']]]) {
  const miss = need.filter((h) => !d.headers.includes(h));
  if (miss.length) { console.error(`✗ ${nm} 헤더에 없는 컬럼:`, miss, '— 중단'); process.exit(1); }
}

// 공연ID → { 장르: 회차수 }
const byId = new Map();
for (const r of led.rows) {
  const pid = String(r['공연ID'] || '').trim();
  if (!pid) continue;
  const g = normGenre(r['장르1']);
  const m = byId.get(pid) || new Map();
  if (g) m.set(g, (m.get(g) || 0) + 1);
  byId.set(pid, m);
}

const resolve = (pid) => {
  const m = byId.get(pid);
  if (!m || !m.size) {
    // 대장이 공란 = 원장에서는 못 얻는다. 운영자 확정표에 있으면 그 값, 없으면 '미상'(추정 금지).
    return OPERATOR_GENRE[pid] ? { g: OPERATOR_GENRE[pid], src: '운영자확정', mixed: '' } : { g: '', src: '미상', mixed: '' };
  }
  const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { g: ranked[0][0], src: ranked.length > 1 ? '대장최빈' : '대장', mixed: ranked.length > 1 ? 'Y' : '' };
};

const HDR = [...idx.headers.filter((h) => h !== '장르1' && h !== '장르혼합' && h !== '장르출처'), '장르1', '장르혼합', '장르출처'];
const rows = idx.rows.map((r) => {
  const pid = String(r['공연ID'] || '').trim();
  const { g, src, mixed } = resolve(pid);
  const o = {};
  for (const h of HDR) o[h] = h === '장르1' ? g : h === '장르혼합' ? mixed : h === '장르출처' ? src : String(r[h] == null ? '' : r[h]);
  return o;
});

const stat = rows.reduce((a, r) => { a[r['장르출처']] = (a[r['장르출처']] || 0) + 1; return a; }, {});
const mixedRows = rows.filter((r) => r['장르혼합'] === 'Y');
const unknown = rows.filter((r) => r['장르출처'] === '미상');
const dist = rows.reduce((a, r) => { const k = r['장르1'] || '(공란)'; a[k] = (a[k] || 0) + 1; return a; }, {});

console.log(`\n장르출처: ${JSON.stringify(stat)}`);
console.log(`장르 분포: ${JSON.stringify(dist, null, 0)}`);
console.log(`\n혼합(축제형) ${mixedRows.length}건 — 회차별 장르는 대장이 계속 정본:`);
for (const r of mixedRows) console.log(`  ${r['공연ID']} ${r['연도']} ${r['대표공연명']} → 대표 ${r['장르1']} (${[...byId.get(String(r['공연ID']).trim()).entries()].map(([g, n]) => g + ' ' + n).join(' · ')})`);
console.log(`\n미상 ${unknown.length}건 — 추정 채움 없음(운영자 결정 대기):`);
const byYear = unknown.reduce((a, r) => { (a[r['연도']] = a[r['연도']] || []).push(r); return a; }, {});
for (const y of Object.keys(byYear).sort()) console.log(`  ${y}: ${byYear[y].length}건`);
console.log(`\n※ 대장 무접촉 — 이 스크립트는 ${IDX_SHEET}만 쓴다(대장은 실적 원장이라 전체 교체 위험을 안 진다).`);

if (DRY) { console.log('\n--dry: 시트 무접촉 종료'); process.exit(0); }
if (!PIN) { console.error('✗ YM_PIN(관리자 PIN) 환경변수가 필요합니다'); process.exit(1); }

const res = await call('POST', '/api/ops', { sheet: IDX_SHEET, headers: HDR, rows });
console.log('write 응답:', JSON.stringify(res));

// [260804 실측 · ledger_2026h1_ingest 전례] Graph 워크북 쓰기는 즉시 조회에 안 잡힐 수 있다(eventual consistency).
await new Promise((r) => setTimeout(r, 15000));
const after = await get(IDX_SHEET);
const okHdr = ['장르1', '장르혼합', '장르출처'].every((h) => after.headers.includes(h));
const okCnt = after.count === idx.count;
const filled = after.rows.filter((r) => String(r['장르1'] || '').trim()).length;
console.log(`검증: ${after.count}건(기대 ${idx.count}) · 장르 열 ${okHdr ? '있음' : '없음'} · 장르 채워진 건 ${filled}`);
if (!okHdr || !okCnt) { console.error('✗ 검증 불일치 — 라이브를 직접 확인하라.'); process.exit(1); }
console.log('✓ 백필 + 검증 완료');
