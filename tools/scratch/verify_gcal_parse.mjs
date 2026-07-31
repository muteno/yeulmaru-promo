// index.html에 실제로 들어간 대관 파서를 그대로 떼어 60건 실측 (플레이그라운드가 아니라 「앱 코드」 검증)
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

// ① 전시 레인 판정 + ② 파서 블록을 index.html에서 추출
const laneA = src.indexOf('var _EX_SPACE=');
const laneB = src.indexOf('// 전시 기간 목록');
const parseA = src.indexOf('var _GC_PLACE=');
const parseB = src.indexOf('// 정본(PERFS)에 이미 있는 프로그램은');
if (laneA < 0 || laneB < 0 || parseA < 0 || parseB < 0) throw new Error('블록 못 찾음 — index.html 구조 변경?');
const code = src.slice(laneA, laneB) + '\n' + src.slice(parseA, parseB);
const mod = new Function(code + '\nreturn {_gcParse, _exLaneOf, _EX_SPACE};')();

const rows = JSON.parse(readFileSync(new URL('./gcal_titles.json', import.meta.url), 'utf8'));
const dkAdd = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// 손으로 대조한 정답 — 셋업이 있어야 하는 일정과 그 패턴(●=본일정, 셋=셋업)
const EXPECT = {
  '베베핀뮤지컬 두근두근새친구': '셋●●',
  '뮤지컬그날들': '셋셋셋셋●●●셋',
  '뮤지컬 달샤베트': '셋●●●●',
  '여순사건창작오페라 침묵': '셋셋셋●●',
  '여수학생오케스트라': '셋●●',
  '전남학생교육페스티벌_오케스트라': '셋셋●●●',
  '가족뮤지컬 인싸가족': '셋●●',
  '여수시립합창단 정기연주회': '셋●',
  '송년음악회': '셋셋●',
  '발레 호두까기인형': '셋셋셋●●',
};

let pass = 0, fail = 0;
const exLanes = {};
for (const [t, s, e] of rows) {
  const p = mod._gcParse(t, s, e);
  const days = []; for (let k = s; k <= e; k = dkAdd(k, 1)) days.push(k);
  const mark = days.map(k => (p.setup[k] ? '셋' : '●')).join('');
  if (p.isEx) exLanes[p.name] = mod._EX_SPACE[p.lane].id;
  const want = EXPECT[p.name];
  if (want !== undefined) {
    const ok = mark === want;
    ok ? pass++ : fail++;
    console.log((ok ? '✅' : '❌') + ' ' + p.name.padEnd(24) + mark + (ok ? '' : '   ← 기대 ' + want));
  }
  // 태그가 이름에 남아 있으면 실패
  if (/^\s*\[/.test(p.name)) { console.log('❌ 태그 잔존: ' + p.name); fail++; }
}
console.log('\n— 이름 정제 표본 —');
for (const [t, s, e] of rows.slice(0, 3).concat([rows[59]])) {
  const p = mod._gcParse(t, s, e);
  console.log('  ' + JSON.stringify(t.slice(0, 46)) + '\n   → ' + JSON.stringify(p.name)
    + ' | ' + p.kind + ' | ' + (p.place || '-') + ' | ' + (p.isEx ? '전시라인' : '배지 t=' + p.t) + (p.drop ? ' | 제외' : ''));
}
console.log('\n— 전시 공간 귀속 —');
for (const n in exLanes) console.log('  ' + n.padEnd(22) + '→ ' + exLanes[n]);

// 공사 제외 확인
const gongsa = mod._gcParse('[대]공사', '2026-07-06', '2026-08-28');
console.log('\n' + (gongsa.drop ? '✅' : '❌') + ' [대]공사 → 제외 판정 ' + gongsa.drop);
if (!gongsa.drop) fail++;

console.log(`\n셋업 판정 ${pass}건 일치 / 실패 ${fail}건`);
process.exit(fail ? 1 : 0);
