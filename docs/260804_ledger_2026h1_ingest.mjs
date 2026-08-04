#!/usr/bin/env node
// [260804] 2026 상반기 공연 실적 → 운영_세부운영관리대장(정리) 반입 (운영자 지시 「db로 모달통해서 넣어서 통합」)
//
// 데이터 출처 = 인터파크(NOL) 공연별 최종 정산 원장 8개 파일(운영자 제공 zip · 암호 해제 후 회차별 집계).
//   집계 공식 = 정상 주문의 최종정상매수 중 금액>0 합(= 발권유료). 검증: 신년음악회 908 = 기존 원장 908 정확 일치 ·
//   브런치Ⅱ 합계 325 = 일일입력 최종 누계 325 일치. 무료(초대) 발권은 원장에 열이 없어 미반입(각 회차 참고값은
//   docs/reports/20260804_연간실적_2026잠정_전후.html 및 작업이력 260804 참조).
// 반입 경로 = 앱 모달과 동일한 Worker API(POST /api/ops mode=append) — SharePoint 마스터 직접 편집 금지 원칙 준수.
// 멱등 가드 = 반입 전 라이브를 fresh 조회해 대상 공연ID의 2026년 행이 이미 있으면 그 공연은 건너뛴다(중복 반입 방지).
//
// 실행: YM_PIN=<관리자PIN> [YM_PW=<앱비번>] node docs/260804_ledger_2026h1_ingest.mjs [--dry]
//   --dry = 반입 없이 계획만 출력(시트 무접촉). PIN·비번은 인자/파일이 아닌 환경변수로만 받는다(KEYS.md 원칙 — 값 미저장).

const API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const SHEET = '세부운영관리대장(정리)';
const PW = process.env.YM_PW || '0510';
const PIN = process.env.YM_PIN || '';
const DRY = process.argv.includes('--dry');

// 회차별 확정 실적(인터파크 최종 정산 기준 · 8 Seasons(5/7)·노인의 꿈(6/13)은 자료 미수집으로 제외 — 자료 도착 시 후속 반입)
const SHOWS = {
  '260409_01': { nm: '2026 브런치 콘서트 Ⅰ <클래식과 함께 하는 미술관 여행 Ⅰ>', g: '클래식', seats: 926 },
  '260416_01': { nm: '2026 실내악페스티벌 <실내악, 그 이상의 세계>', g: '클래식', seats: 926 },
  '260514_01': { nm: '어린이 뮤지컬 <100층짜리 집>', g: '어린이·가족', seats: 926 },
  '260523_01': { nm: '한국페스티발앙상블 <세상에서 가장 편한 음악>', g: '클래식', seats: 926 },
  '260530_01': { nm: '국립심포니오케스트라 <피터와 늑대 & 어미 거위>', g: '클래식', seats: 926 },
  '260604_01': { nm: '2026 브런치 콘서트 Ⅱ <클래식과 함께 하는 미술관 여행 Ⅱ>', g: '클래식', seats: 926 },
  '260619_01': { nm: '2026 헬로!오페라 <세비야의 이발사>', g: '클래식', seats: 926 },
};
const PERF = [   // [공연ID, 월, 일, 발권유료] — 회차 순
  ['260409_01', 4,  9, 270],
  ['260416_01', 4, 16, 110], ['260416_01', 4, 17,  82], ['260416_01', 4, 18, 145], ['260416_01', 4, 19, 165],
  ['260514_01', 5, 14, 895], ['260514_01', 5, 15, 888], ['260514_01', 5, 15, 360],
  ['260514_01', 5, 16, 347], ['260514_01', 5, 16, 375], ['260514_01', 5, 16, 320],
  ['260523_01', 5, 23, 176],
  ['260530_01', 5, 30, 277],
  ['260604_01', 6,  4, 311],
  ['260619_01', 6, 19, 263], ['260619_01', 6, 20, 374],
];

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Password': PW };
  if (PIN) headers['X-Sub-Admin-PIN'] = PIN;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

const live = await call('GET', `/api/ops?sheet=${encodeURIComponent(SHEET)}&fresh=1`);
const H = live.headers;
const NEED = ['전체순번','공연명','사업구분','공연구분','장르1','티켓구분','기본좌석','발권유료','년도','월','일','상태','공연ID'];
const missing = NEED.filter(h => !H.includes(h));
if (missing.length) { console.error('✗ 라이브 헤더에 없는 컬럼:', missing, '— 중단'); process.exit(1); }

const live26 = live.rows.filter(r => String(r['년도']).trim() === '2026');
const existIds = new Set(live26.map(r => String(r['공연ID']).trim()));
let seq = Math.max(...live.rows.map(r => parseInt(r['전체순번'], 10) || 0));
console.log(`라이브: 총 ${live.count}행 · 2026년 ${live26.length}행(${[...existIds].join(', ')}) · 전체순번 최대 ${seq}`);

const skip = new Set([...new Set(PERF.map(p => p[0]))].filter(id => existIds.has(id)));
if (skip.size) console.log(`⚠ 이미 라이브에 있는 공연 → 건너뜀: ${[...skip].join(', ')}`);

const rows = PERF.filter(p => !skip.has(p[0])).map(([id, m, d, paid]) => {
  const s = SHOWS[id];
  return { '전체순번': String(++seq), '공연명': s.nm, '사업구분': '공연', '공연구분': '기획', '장르1': s.g,
           '티켓구분': '유료', '기본좌석': String(s.seats), '발권유료': String(paid),
           '년도': '2026', '월': String(m), '일': String(d), '상태': '정상', '공연ID': id };
});
console.log(`반입 대상 ${rows.length}행 (전체순번 ${rows.length ? rows[0]['전체순번'] + '~' + rows[rows.length-1]['전체순번'] : '-'})`);
rows.forEach(r => console.log(`  ${r['전체순번']} ${r['공연ID']} ${r['년도']}-${String(r['월']).padStart(2,'0')}-${String(r['일']).padStart(2,'0')} 발권유료 ${r['발권유료']} · ${r['공연명']}`));
if (DRY) { console.log('--dry: 시트 무접촉 종료'); process.exit(0); }
if (!rows.length) { console.log('반입할 신규 행 없음 — 종료'); process.exit(0); }
if (!PIN) { console.error('✗ YM_PIN(관리자 PIN) 환경변수가 필요합니다'); process.exit(1); }

const res = await call('POST', '/api/ops', { sheet: SHEET, mode: 'append', rows });
console.log('append 응답:', JSON.stringify(res));

const after = await call('GET', `/api/ops?sheet=${encodeURIComponent(SHEET)}&fresh=1`);
const after26 = after.rows.filter(r => String(r['년도']).trim() === '2026');
const paidSum = after26.reduce((a, r) => a + (parseInt(r['발권유료'], 10) || 0), 0);
console.log(`검증: 총 ${after.count}행(+${after.count - live.count}) · 2026년 ${after26.length}행 · 2026 발권유료 합 ${paidSum.toLocaleString()}`);
const expect26 = live26.length + rows.length;
if (after.count !== live.count + rows.length || after26.length !== expect26) {
  console.error(`✗ 검증 불일치 — 기대 2026 ${expect26}행/증가 ${rows.length}행. 라이브를 직접 확인하라.`); process.exit(1);
}
console.log('✓ 반입 + 검증 완료');
