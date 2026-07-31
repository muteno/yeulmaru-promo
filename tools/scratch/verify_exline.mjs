// index.html의 전시 라인 로직(순서대로 채우기)을 떼어 검증 — 운영자 260731 「장소 고정 인덱싱 폐지」
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const a = src.indexOf('var _EX_SPACE=');
const b = src.indexOf('// 시간 파싱:');
if (a < 0 || b < 0) throw new Error('블록 못 찾음');

let code = src.slice(a, b);
// 외부 의존(_exSpans 소스·dk·PERFS)만 스텁으로 치환 — 판정 로직은 원본 그대로 둔다
code = code.replace(/function _exSpans\(\)\{[\s\S]*?\n\}/, 'function _exSpans(){ return globalThis.__SPANS; }');
code = code.replace(/function _exLineRefresh\(\)\{[\s\S]*?\n\}/, 'function _exLineRefresh(){}');
const mod = new Function('dk', code + '\nreturn {getExhibitStatus, renderExhibitBadge, _EX_SPACE};')(d => d);

const L = { '7층': 0, '장도': 1, '야외': 2 };
const run = (spans, day, past = false) => {
  globalThis.__SPANS = spans;
  const st = mod.getExhibitStatus(day);
  const html = mod.renderExhibitBadge(day, false, past);
  const lines = [...html.matchAll(/border-top:2px solid ([^;"]+)/g)].map(m => m[1]);
  return { lanes: st.map(x => mod._EX_SPACE[x.lane].id), lines };
};
let fail = 0;
const ok = (n, c, got) => { c ? 0 : fail++; console.log((c ? '✅' : '❌') + ' ' + n + (c ? '' : '   ← 실제 ' + JSON.stringify(got))); };

// ① 전시 0 = 바닥선 1줄만 (빈 레인 3줄 = 여백 문제 해소)
let r = run([], '2026-07-01');
ok('전시 0건 → 줄 1개(바닥선)', r.lines.length === 1 && /rgba/.test(r.lines[0]), r.lines);

// ② 전시 1건 = 1줄만 (장소가 장도여도 첫 줄에)
r = run([{ lane: L['장도'], s: '2026-08-07', e: '2026-08-13' }], '2026-08-10');
ok('전시 1건 → 줄 1개·장도색', r.lines.length === 1 && r.lines[0] === '#E84393', r.lines);

// ③ 「먼저 시작한 전시가 위」 — 7층(7/21~) + 장도(8/7~) → 7층이 위
r = run([{ lane: L['장도'], s: '2026-08-07', e: '2026-08-13' }, { lane: L['7층'], s: '2026-07-21', e: '2026-11-22' }], '2026-08-10');
ok('2건 → 먼저 시작한 7층이 위', JSON.stringify(r.lanes) === JSON.stringify(['7층', '장도']), r.lanes);

// ④ 3건 동시 진행 = 3줄, 「시작일 순」으로 위에서부터 (장소 고정 인덱스가 아님을 보는 케이스)
//    7층 7/21 → 야외 8/01 → 장도 8/15 순으로 시작 = 그 순서 그대로 줄이 쌓여야 한다.
r = run([
  { lane: L['야외'], s: '2026-08-01', e: '2026-10-25' },
  { lane: L['7층'], s: '2026-07-21', e: '2026-11-22' },
  { lane: L['장도'], s: '2026-08-15', e: '2026-08-23' },
], '2026-08-20');
ok('3건 → 시작일 순(7층·야외·장도)', JSON.stringify(r.lanes) === JSON.stringify(['7층', '야외', '장도']), r.lanes);
ok('3건 → 야외가 2번째 줄 = var(--accent)', r.lines[1] === 'var(--accent)', r.lines);
// 장소 고정이었다면 야외는 항상 3번째였을 것 — 순서 채움이 실제로 동작함을 못박는다
ok('장소 고정 인덱스 아님(야외가 3번째가 아니다)', r.lanes[2] === '장도', r.lanes);

// ⑤ 같은 공간 2건 겹침 → 1줄로 접힘(같은 색 두 줄 방지)
r = run([{ lane: L['7층'], s: '2026-07-21', e: '2026-11-22' }, { lane: L['7층'], s: '2026-08-01', e: '2026-08-31' }], '2026-08-10');
ok('같은 공간 2건 → 1줄로 접힘', r.lines.length === 1, r.lines);

// ⑥ 4건 이상이어도 최대 3줄
r = run([
  { lane: L['7층'], s: '2026-07-21', e: '2026-11-22' }, { lane: L['장도'], s: '2026-08-15', e: '2026-08-23' },
  { lane: L['야외'], s: '2026-08-25', e: '2026-10-25' }, { lane: L['장도'], s: '2026-08-01', e: '2026-08-31' },
], '2026-08-20');
ok('최대 3줄 상한', r.lines.length <= 3, r.lines);

// ⑦ 지난 날짜 + 진행중 = opacity로만 죽임(색은 유지)
r = run([{ lane: L['7층'], s: '2026-07-21', e: '2099-01-01' }], '2026-07-25', true);
ok('지난 칸 진행중 → 색 유지 + opacity', /#006B3C/.test(r.lines[0]), r.lines);

console.log(fail ? `\n실패 ${fail}건` : '\n전항목 통과');
process.exit(fail ? 1 : 0);
