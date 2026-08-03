// index.html의 전시 라인 로직을 떼어 검증 — 운영자 260803 「장소 고정 자리」
//   7층 전시실 = 윗 전시선 · 장도 전시실 = 아랫 전시선 · 그 장소 전시가 없으면 그 줄은 안 그린다(자리만 투명하게 유지).
//   (260731의 「먼저 시작한 순으로 채움」은 전시 1건일 때 줄이 아랫자리로 내려앉아 폐지 — 그 회차 테스트는 이 파일에서 뒤집혔다)
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const a = src.indexOf('var _EX_SPACE=');
const b = src.indexOf('// 시간 파싱:');
if (a < 0 || b < 0) throw new Error('블록 못 찾음');

let code = src.slice(a, b);
// 외부 의존(_exSpans 소스·dk·PERFS)만 스텁으로 치환 — 판정 로직은 원본 그대로 둔다
code = code.replace(/function _exSpans\(\)\{[\s\S]*?\n\}/, 'function _exSpans(){ return globalThis.__SPANS; }');
code = code.replace(/function _exLineRefresh\(\)\{[\s\S]*?\n\}/, 'function _exLineRefresh(){}');
// dk 스텁 — 날짜 문자열은 그대로, Date(= 오늘)는 앱과 같은 YYYY-MM-DD로. 문자열끼리 비교해야 live 판정이 산다
const mod = new Function('dk', code + '\nreturn {getExhibitStatus, renderExhibitBadge, _EX_SPACE};')(
  d => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : d));

const L = { '7층': 0, '장도': 1, '야외': 2 };
const G = '#006B3C', P = '#E84393', O = 'var(--accent)', T = 'transparent';
const run = (spans, day, past = false) => {
  globalThis.__SPANS = spans;
  const html = mod.renderExhibitBadge(day, false, past);
  // 위→아래 순서 그대로(플렉스 컬럼) — 마지막 원소가 맨 아랫줄
  return [...html.matchAll(/border-top:2px solid ([^"]+)"/g)].map(m => m[1]);   // 색 + (지난 칸이면) opacity까지
};
let fail = 0;
const ok = (n, c, got) => { c ? 0 : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (c ? '' : '   ← 실제 ' + JSON.stringify(got))); };
const eq = (got, want) => JSON.stringify(got) === JSON.stringify(want);

// ① 전시 0 = 바닥선 1줄만 (빈 레인 회색 3줄 = 여백 문제 재발 방지)
let r = run([], '2026-07-01');
ok('전시 0건 → 줄 1개(바닥선)', r.length === 1 && /rgba/.test(r[0]), r);

// ② 7층 1건만 = 윗자리 그대로, 아랫자리는 투명(운영자 260803 본안 — 구판은 여기서 초록이 아랫줄로 내려앉았다)
r = run([{ lane: L['7층'], s: '2026-07-21', e: '2026-11-01' }], '2026-08-10');
ok('7층만 → [7층, 투명] = 초록이 윗 전시선', eq(r, [G, T]), r);

// ③ 장도 1건만 = 아랫자리 그대로(위엔 아무것도 안 붙는다)
r = run([{ lane: L['장도'], s: '2026-08-07', e: '2026-08-13' }], '2026-08-10');
ok('장도만 → [장도] 1줄 = 아랫 전시선', eq(r, [P]), r);

// ④ 둘 다 = 7층 위·장도 아래
r = run([{ lane: L['장도'], s: '2026-08-07', e: '2026-08-13' }, { lane: L['7층'], s: '2026-07-21', e: '2026-11-01' }], '2026-08-10');
ok('2건 → [7층, 장도]', eq(r, [G, P]), r);

// ⑤ 시작일 순서가 자리를 못 바꾼다 — 장도가 훨씬 먼저 시작해도 7층이 위
r = run([{ lane: L['장도'], s: '2026-01-02', e: '2026-12-30' }, { lane: L['7층'], s: '2026-08-09', e: '2026-08-20' }], '2026-08-10');
ok('장도가 먼저 시작해도 자리 불변', eq(r, [G, P]), r);

// ⑥ 야외 = 있는 날만 맨 위 한 줄 추가(7층·장도 자리 무변)
r = run([
  { lane: L['야외'], s: '2026-08-01', e: '2026-10-25' },
  { lane: L['7층'], s: '2026-07-21', e: '2026-11-01' },
  { lane: L['장도'], s: '2026-08-05', e: '2026-08-23' },
], '2026-08-20');
ok('3건 → [야외, 7층, 장도]', eq(r, [O, G, P]), r);

// ⑦ 야외 + 장도(7층 공백) = 가운데만 투명
r = run([{ lane: L['야외'], s: '2026-08-01', e: '2026-10-25' }, { lane: L['장도'], s: '2026-08-05', e: '2026-08-23' }], '2026-08-20');
ok('야외+장도 → [야외, 투명, 장도]', eq(r, [O, T, P]), r);

// ⑧ 같은 공간 2건 겹침 → 1줄로 접힘(같은 색 두 줄 방지)
r = run([{ lane: L['7층'], s: '2026-07-21', e: '2026-11-01' }, { lane: L['7층'], s: '2026-08-01', e: '2026-08-31' }], '2026-08-10');
ok('같은 공간 2건 → 1줄로 접힘', eq(r, [G, T]), r);

// ⑨ 지난 날짜 + 진행중 = opacity로만 죽임(색은 유지)
r = run([{ lane: L['7층'], s: '2026-07-21', e: '2099-01-01' }], '2026-07-25', true);
ok('지난 칸 진행중 → 색 유지 + opacity', eq(r, [G + ';opacity:.38', T]), r);

// ⑩ 이미 끝난 전시 = 지난 칸이어도 진하게(예전 달 기록 보존)
r = run([{ lane: L['장도'], s: '2026-03-27', e: '2026-06-21' }], '2026-05-01', true);
ok('끝난 전시 → 지난 칸에도 진하게', eq(r, [P]), r);

console.log(fail ? `\n실패 ${fail}건` : '\n전항목 통과');
process.exit(fail ? 1 : 0);
