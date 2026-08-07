#!/usr/bin/env node
/**
 * 연간 실적(_YR) **검산기 + 진행 연도 잠정치 갱신기**.
 *
 * 왜 만들었나 — 260804 실사고 2건이 전부 「손으로 고치다 빠뜨린 자리」였다:
 *   ① 2026 상반기 잠정치를 넣으면서 **누계(sum)·grand를 안 고쳤다** → 표엔 9,568이 있는데 누계는 ~2025 그대로.
 *      화면상 아무 에러도 없어 「집계가 반영됐다」로 읽혔다(운영자가 눈으로 잡아냄).
 *   ② 두 세션이 같은 2026을 **서로 다른 출처**로 채웠다(엑셀 1월분 4,266 ↔ 운영DB 상반기 9,568) → 리베이스 충돌.
 * 둘 다 사람이 매번 암산하던 자리라, 암산을 없애는 게 이 스크립트다.
 *
 * ⚠ 할 수 있는 것과 없는 것을 먼저 못박는다(실측 260804):
 *   · _YR 전체를 데이터 거울로 **재생성하는 건 불가능**하다. 기준이 다르다 —
 *     _YR 2025 공연 관람인원 83,455(연간 취합본·무료 포함) vs 운영대장 발권유료 합 63,444.
 *     전시도 _YR 2025 = 18건/258일/26,785(전체 취합) vs 전시DB = 9건/376일/20,217(기획전시만).
 *     즉 과거 연도는 **연간보고 취합본이 정본**이고, 거울에서 뽑으면 값이 조용히 바뀐다.
 *   · 재현되는 건 **진행 연도 잠정치**뿐이다. 실측 = 2026 전시 5건·203일·8,049 → 전시DB와 정확히 일치.
 *     공연 2026은 거울(ops_세부운영관리대장정리.csv)이 라이브보다 낡으면(실측 5행/4,210) 라이브 값(21/16/9,568)보다 **작게** 나온다.
 *     → 그 후퇴는 갱신이 아니라 **거울 낡음 신호**로 취급해 거부한다(--allow-shrink 없이는 안 쓴다).
 *
 * 그래서 기본 동작은 **검산**이고, 갱신은 명시적으로 시켜야 한다.
 *
 * 실행:
 *   node tools/build_annual_yr.mjs                  # 검산(쓰기 0) · 어긋나면 exit 1
 *   node tools/build_annual_yr.mjs --sync-partial   # 진행 연도 잠정치를 거울에서 계산해 _YR에 반영(+ 누계 자동 재계산)
 *   node tools/build_annual_yr.mjs --recalc         # 값은 그대로 두고 sum·total·grand만 재계산해 기록
 *   옵션: --allow-shrink(후퇴 허용 · 실제로 실적이 줄어든 정정일 때만) · --year=2026(진행 연도 지정)
 *        --from-live(공연 잠정치를 라이브 「운영_공연대장」에서 · 아래 참조 · 네트워크 필요 · 게이트에선 안 쓴다)
 *
 * [260807 신설] --from-live — 공연 잠정치의 **원천을 회차 원장 → 공연대장으로 바꾼다.**
 *   왜: ⓐ **기준이 취합본과 같다.** 공연대장의 `발권유료 + 발권초대`가 _YR 관람인원과 정확히 일치한다
 *        (전체 행 기준 9/15년 · 공연구분 {기획,대관}만 10/15년 · 2025 Δ8). 실은 공연대장의 월별 집계 셀
 *        `관람객`·`집계공연일수`가 _YR 2012~2022와 **전건 일치** = 취합본의 원천이 이 대장이었다(2023부터 그 셀이 비어 있다).
 *        회차 원장의 `발권유료`는 초대가 빠진 다른 자다 — 그래서 예상치에 ×1.315 무료 환산이 붙어 있었다.
 *      ⓑ **회차 원장의 진행 연도가 늦다.** 260807 실측 2026 = 회차 원장 21행/9,568 vs 공연대장 25건/**23,601**.
 *        운영자가 회차를 나중에 채우고, 공연대장은 공연이 끝나는 대로 채워진다.
 *   ⚠ 과거 연도를 이걸로 재생성하지 마라 — 2013~2015·2016~2018은 규칙 두 개가 서로 다른 해를 맞춘다
 *     (= 대장 자신의 집계 규칙이 해마다 바뀌었다). 이 경로는 **진행 연도 한 칸**만 만든다.
 *     그래서 실행할 때마다 과거 연도 일치 수를 같이 찍는다 — 그 수가 떨어지면 기준이 흔들린 것이다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const DATA = join(ROOT, '이관본', 'data');
const ARGV = process.argv.slice(2);
const has = f => ARGV.includes(f);
const SYNC = has('--sync-partial'), RECALC = has('--recalc'), SHRINK = has('--allow-shrink');
const FROM_LIVE = has('--from-live');   // [260807] 공연 잠정치를 라이브 공연대장에서(게이트 경로에선 미사용 = 네트워크 무의존 유지)
const YEAR_ARG = (ARGV.find(a => a.startsWith('--year=')) || '').split('=')[1];

// ── 최소 CSV 파서(BOM·따옴표 안 콤마/개행 허용) — build_annual.mjs 문법 계승 ──
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.replace(/^\uFEFF/, '').trim());
  return rows.filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? '').trim()])));
}
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

// ── _YR 상수 읽기 ────────────────────────────────────────────────────────────
// index.html 안의 `var _YR={…};` 한 덩이를 그대로 떼어 평가한다(렌더러 복제 금지 원칙과 같은 축 —
// 사본을 두면 사본이 낡는다). 파싱이 아니라 **원문 실행**이라 주석·서식이 어떻든 값은 항상 앱과 같다.
function readYR(src) {
  const i = src.indexOf('var _YR={');
  if (i < 0) throw new Error('_YR 상수를 못 찾음 (var _YR={ 마커)');
  let d = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) break; }
  }
  const body = src.slice(start, j + 1);
  return { start: i, end: j + 1, bodyStart: start, body, value: new Function('return ' + body)() };
}

const CATS = ['공연', '전시', '교육'];
const KEYS = ['횟수', '일수', '인원', '나눔'];
const rowOf = (rows, key) => rows.find(r => r.key === key);

// 기존 부채 면책표 — 이 게이트를 처음 돌린 260804에 **이미** 어긋나 있던 자리.
//   신규 회귀만 잡고 레포는 안 얼리려는 것(늘리려면 사유 1줄 · 해소되면 그 자리에서 지운다).
//   ⚠ 자동 --recalc으로 덮지 않는다: 어느 쪽이 정답인지 원천이 말을 안 한다 —
//     _YR 계 28,894 / 분야합 28,827(공연 1,258 + 전시 27,569) / 엑셀 「연도별 문화나눔」 2025 = 공연 354 + 전시 211 = 565.
//     셋이 전부 다르다. 연간보고 취합본을 다시 떠야 풀리는 자리라 사람 확인 전까지 값 무변경으로 둔다.
const AUDIT_BASE = new Set([
  '계·나눔인원 2025년: 28894 ≠ 분야합 28827',
]);

// ── 검산 ─────────────────────────────────────────────────────────────────────
// 손으로 고치면 반드시 빠뜨리는 4가지를 전부 기계가 본다.
function audit(YR) {
  const bad = [], n = YR.years.length;
  const chk = (cond, msg) => { if (!cond) bad.push(msg); };

  // ① 배열 길이 = 연도 수 (2026을 years에만 넣고 v에 안 넣는 사고)
  for (const c of CATS) for (const r of YR.cats[c].rows)
    chk(r.v.length === n, `${c}·${r.sub}: v 길이 ${r.v.length} ≠ 연도 ${n}`);
  for (const r of YR.total) chk(r.v.length === n, `계·${r.sub}: v 길이 ${r.v.length} ≠ 연도 ${n}`);
  chk(YR.jangdo.v.length === n, `장도: v 길이 ${YR.jangdo.v.length} ≠ 연도 ${n}`);

  // ② sum = v 합계 (오늘 사고 ①의 자리 — 열은 늘었는데 누계는 그대로)
  const sumOf = v => v.reduce((a, b) => a + (b || 0), 0);
  for (const c of CATS) for (const r of YR.cats[c].rows)
    chk(r.sum === sumOf(r.v), `${c}·${r.sub}: sum ${r.sum} ≠ v합 ${sumOf(r.v)}`);
  for (const r of YR.total) chk(r.sum === sumOf(r.v), `계·${r.sub}: sum ${r.sum} ≠ v합 ${sumOf(r.v)}`);
  chk(YR.jangdo.sum === sumOf(YR.jangdo.v), `장도: sum ${YR.jangdo.sum} ≠ v합 ${sumOf(YR.jangdo.v)}`);

  // ③ total = 공연+전시+교육 (분야만 고치고 계를 안 고치는 사고)
  for (const k of KEYS) {
    const t = YR.total.find(r => r.key === k); if (!t) continue;
    for (let i = 0; i < n; i++) {
      const s = CATS.reduce((a, c) => a + ((rowOf(YR.cats[c].rows, k)?.v[i]) || 0), 0);
      chk(t.v[i] === s, `계·${t.sub} ${YR.years[i]}년: ${t.v[i]} ≠ 분야합 ${s}`);
    }
  }

  // ④ grand = 계 인원 누계 + 장도 누계 (헤더 「누적 N명」의 원천)
  const want = (YR.total.find(r => r.key === '인원')?.sum || 0) + (YR.jangdo.sum || 0);
  chk(YR.grand === want, `grand ${YR.grand} ≠ 계 인원 누계+장도 누계 ${want}`);

  return bad;
}

// 값은 그대로 두고 파생값(sum·total·grand)만 다시 계산 — 검산 ②③④의 정답을 그대로 쓴다.
function recalc(YR) {
  const n = YR.years.length, sumOf = v => v.reduce((a, b) => a + (b || 0), 0);
  for (const c of CATS) for (const r of YR.cats[c].rows) r.sum = sumOf(r.v);
  for (const k of KEYS) {
    const t = YR.total.find(r => r.key === k); if (!t) continue;
    for (let i = 0; i < n; i++) {
      const s = CATS.reduce((a, c) => a + ((rowOf(YR.cats[c].rows, k)?.v[i]) || 0), 0);
      // ⚠ [260807] **면책 자리는 안 덮는다.** AUDIT_BASE에 든 어긋남은 「어느 쪽이 정답인지 원천이 말을 안 하는」
      //   자리라 사람 확인 전까지 값 무변경이 계약이다(위 AUDIT_BASE 주석). 구판 recalc은 그걸 모르고
      //   분야합으로 덮어, --sync-partial 한 번에 2025 문화나눔 계가 28,894 → 28,827로 조용히 바뀌었다
      //   (260807 실측 — 게이트가 「면책 해소됨」이라고 축하까지 했다).
      if (t.v[i] !== s && AUDIT_BASE.has(`계·${t.sub} ${YR.years[i]}년: ${t.v[i]} ≠ 분야합 ${s}`)) continue;
      t.v[i] = s;
    }
    t.sum = sumOf(t.v);
  }
  YR.jangdo.sum = sumOf(YR.jangdo.v);
  YR.grand = (YR.total.find(r => r.key === '인원')?.sum || 0) + YR.jangdo.sum;
  return YR;
}

// ── 진행 연도 잠정치 = 데이터 거울에서 계산 ──────────────────────────────────
// 공연 = 운영_세부운영관리대장(정리): 행 1개 = 1회차 · 공연일수 = 고유 (월,일) · 인원 = 발권유료 합(무료·초대 미포함).
// 전시 = 전시마스터: 그 해 등록 건수 · 운영일수 합 · 최종총인원 합(진행중 건 포함).
// 교육·장도·문화나눔 = 거울에 연도별 원천이 없다 → 손대지 않는다(0으로 덮어쓰면 실적을 지운다).
function partialFromMirror(year) {
  const ops = parseCsv(readFileSync(join(DATA, 'ops_세부운영관리대장정리.csv'), 'utf8'))
    .filter(r => r['년도'] === String(year));
  const perf = {
    횟수: ops.length,
    일수: new Set(ops.map(r => r['월'] + '/' + r['일'])).size,
    인원: ops.reduce((a, r) => a + num(r['발권유료']), 0),
  };
  const ex = parseCsv(readFileSync(join(DATA, 'exhib_master.csv'), 'utf8'))
    .filter(r => r['연도'] === String(year));
  const exhib = {
    횟수: ex.length,
    일수: ex.reduce((a, r) => a + num(r['운영일수']), 0),
    인원: ex.reduce((a, r) => a + num(r['최종총인원']), 0),
  };
  return { 공연: perf, 전시: exhib };
}

// ── 진행 연도 공연 잠정치 = 라이브 「운영_공연대장」(공연 단위 원장) ──────────────
//   집계 규칙(위 헤더 참조) — 공연구분 {기획, 대관}만(기타·취소·변경 제외):
//     인원 = Σ(발권유료 + 발권초대)   ← 무료·초대 포함 = 다른 해 막대와 같은 자
//     횟수 = Σ공연횟수
//     일수 = `일시`에서 뽑은 **고유 공연일** 수(같은 날 두 공연 = 1일)
//   ⚠ 일수만 근거가 약하다 — 대장의 집계 셀 `집계공연일수`가 2023부터 비어 있어 대조할 자가 없다.
//     `일시` 파싱은 표기가 해마다 흔들려 과거 연도 재현이 안 된다(실측 0/15). 진행 연도는
//     표기가 일정해 쓸 수 있지만, 값이 이상하면 이 줄을 먼저 의심할 것.
const OPS_API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PERF_KINDS = new Set(['기획', '대관']);

function gongyeonDays(row) {
  // '6/25(목) 19:30\n6/26(금)' · '5/1(수)~5/3(금)' — M/D를 전부 뽑고, 물결표 범위는 사이 날짜를 채운다.
  const y = parseInt(String(row['년도'] || '').replace(/[^0-9]/g, ''), 10);
  const s = String(row['일시'] || '');
  const out = new Set();
  const pairs = [...s.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)]
    .map(m => [+m[1], +m[2]]).filter(([a, b]) => a >= 1 && a <= 12 && b >= 1 && b <= 31);
  let rest = pairs;
  if (s.includes('~') && pairs.length >= 2 && y) {
    const a = new Date(y, pairs[0][0] - 1, pairs[0][1]), b = new Date(y, pairs[1][0] - 1, pairs[1][1]);
    const span = (b - a) / 86400000;
    if (span >= 0 && span <= 40) {
      for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.add(`${d.getMonth() + 1}/${d.getDate()}`);
      rest = pairs.slice(2);
    }
  }
  rest.forEach(([a, b]) => out.add(`${a}/${b}`));
  return out;
}

function perfFromLedger(rows, year) {
  const ys = rows.filter(r => String(r['년도']).trim() === String(year) && PERF_KINDS.has(String(r['공연구분']).trim()));
  const days = new Set();
  ys.forEach(r => gongyeonDays(r).forEach(d => days.add(d)));
  return {
    횟수: ys.reduce((a, r) => a + num(r['공연횟수']), 0),
    일수: days.size,
    인원: ys.reduce((a, r) => a + num(r['발권유료']) + num(r['발권초대']), 0),
  };
}

/** 과거 연도 대조 — 이 규칙이 아직 _YR을 재현하는가(기준이 흔들리면 여기서 먼저 보인다). */
function ledgerSelfCheck(rows, YR, skipYear) {
  const hit = { 인원: 0, 횟수: 0 }, n = { 인원: 0, 횟수: 0 };
  const rowOfKey = k => YR.cats['공연'].rows.find(r => r.key === k);
  YR.years.forEach((y, i) => {
    if (y === skipYear) return;
    const got = perfFromLedger(rows, y);
    for (const k of ['인원', '횟수']) { n[k]++; if (rowOfKey(k)?.v[i] === got[k]) hit[k]++; }
  });
  return { hit, n };
}

async function fetchLedger() {
  const pw = process.env.DB_PW || process.env.YM_PW || '0510';
  const pin = process.env.YM_PIN || '';
  const headers = { 'X-App-Password': pw };
  if (pin) headers['X-Sub-Admin-PIN'] = pin;
  const res = await fetch(`${OPS_API}/api/ops?sheet=${encodeURIComponent('공연대장')}&fresh=1`, { headers });
  if (!res.ok) throw new Error(`운영_공연대장 조회 실패 ${res.status}`);
  const d = await res.json();
  if (d.note || !d.rows?.length) throw new Error(`운영_공연대장이 비어 있다(${d.note || '행 0'}) — 먼저 docs/260807_공연대장_sync.mjs로 반입해라.`);
  return d.rows;
}

// ── _YR 상수 다시 찍기 ───────────────────────────────────────────────────────
// 값 줄만 갈아끼운다(주석·구조 보존 = 리뷰 diff가 「숫자만 바뀜」으로 읽힌다).
function renderRow(r) {
  const q = s => `'${s}'`;
  return `{sub:${q(r.sub)},key:${q(r.key)},v:[${r.v.join(',')}],sum:${r.sum}}`;
}
// ⚠ [260807 버그 수정] 행 치환은 **이름이 아니라 자리**로 한다.
//   구판은 `{sub:'<이름>',key:'<키>',…}` 정규식으로 찾아 `String.replace`(= 첫 일치 하나만) 했다.
//   그런데 `관람인원`·`문화나눔`은 **공연·전시·교육 세 분야에 같은 이름으로 있다** → 전시 행을 쓰라는 호출이
//   맨 앞의 **공연 행**을 덮었다. 실측(260807 --sync-partial 실행): 공연 관람인원이 전시 값
//   [26090,35537,…]으로, 공연 문화나눔이 전시 값으로 바뀌고 누계까지 따라갔다.
//   손편집 사고를 막으려고 만든 도구가 조용히 같은 사고를 내는 자리였다.
//   → 본문에 나타나는 행 리터럴을 **순서대로** 모아 YR 구조 순서(공연·전시·교육 rows → total rows)와 1:1로 맞춘다.
//     개수가 안 맞으면 즉시 중단(구조가 바뀌었다는 뜻 — 조용히 어긋난 자리에 쓰는 것보다 멈추는 게 낫다).
const ROW_LIT = /\{sub:'[^']*',key:'[^']*',v:\[[^\]]*\],(?:q:-?\d+,)?sum:\d+\}/g;

function rewrite(src, YR, loc) {
  let out = loc.body;
  const put = (re, txt) => { if (!re.test(out)) throw new Error('치환 실패: ' + re); out = out.replace(re, txt); };
  put(/years:\[[^\]]*\]/, `years:[${YR.years.join(',')}]`);

  const want = [...CATS.flatMap(c => YR.cats[c].rows), ...YR.total];
  const lits = out.match(ROW_LIT) || [];
  if (lits.length !== want.length)
    throw new Error(`행 리터럴 ${lits.length}개 ≠ _YR 행 ${want.length}개 — 구조가 바뀌었다. 치환 중단.`);
  let k = 0;
  out = out.replace(ROW_LIT, () => renderRow(want[k++]));
  // 자리 대응이 맞았는지 되읽어 확인(sub·key가 어긋나면 다른 행에 쓴 것)
  const back = (out.match(ROW_LIT) || []).map(s => s.match(/sub:'([^']*)',key:'([^']*)'/).slice(1).join('/'));
  want.forEach((r, i) => { if (back[i] !== `${r.sub}/${r.key}`) throw new Error(`행 자리 어긋남 #${i}: ${back[i]} ≠ ${r.sub}/${r.key}`); });

  put(/jangdo:\{v:\[[^\]]*\],sum:\d+\}/, `jangdo:{v:[${YR.jangdo.v.map(x => x === null ? 'null' : x).join(',')}],sum:${YR.jangdo.sum}}`);
  put(/grand:\d+/, `grand:${YR.grand}`);
  return src.slice(0, loc.bodyStart) + out + src.slice(loc.end);
}

// ── main ─────────────────────────────────────────────────────────────────────
const src = readFileSync(INDEX, 'utf8');
const loc = readYR(src);
const YR = loc.value;
const partialYear = YEAR_ARG ? parseInt(YEAR_ARG, 10) : YR.years[YR.years.length - 1];
let changed = false, notes = [];

if (SYNC) {
  const yi = YR.years.indexOf(partialYear);
  if (yi < 0) { console.error(`[yr] FAIL — ${partialYear}년이 _YR.years에 없다. 먼저 연도 열을 추가해라.`); process.exit(1); }
  const got = partialFromMirror(partialYear);
  if (FROM_LIVE) {
    const rows = await fetchLedger();
    const chk = ledgerSelfCheck(rows, YR, partialYear);
    console.log(`[yr] 공연대장 규칙 자기검사 — 과거 연도 재현 인원 ${chk.hit.인원}/${chk.n.인원} · 횟수 ${chk.hit.횟수}/${chk.n.횟수}`);
    console.log('  ※ 이 수가 눈에 띄게 떨어지면 대장의 집계 규칙이 바뀐 것 — 진행 연도 값을 쓰기 전에 확인할 것.');
    const live = perfFromLedger(rows, partialYear);
    console.log(`[yr] 공연 ${partialYear} 잠정치 출처 = 운영_공연대장(기획·대관 · 유료+초대): 횟수 ${live.횟수} · 일수 ${live.일수} · 인원 ${live.인원.toLocaleString()}`);
    console.log(`  (회차 원장 거울 기준이면 횟수 ${got.공연.횟수} · 일수 ${got.공연.일수} · 인원 ${got.공연.인원.toLocaleString()} — 초대 미포함이라 자가 다르다)`);
    got.공연 = live;
  }
  const shrunk = [];
  for (const c of ['공연', '전시']) for (const k of ['횟수', '일수', '인원']) {
    const row = rowOf(YR.cats[c].rows, k); if (!row) continue;
    const cur = row.v[yi] || 0, next = got[c][k];
    if (next === cur) continue;
    if (next < cur && !SHRINK) { shrunk.push(`${c}·${row.sub} ${cur} → ${next}`); continue; }
    notes.push(`${c}·${row.sub} ${partialYear}: ${cur} → ${next}`);
    row.v[yi] = next; changed = true;
  }
  if (shrunk.length) {
    console.error(`[yr] FAIL — 거울 값이 현행보다 작다(= 거울이 라이브보다 낡았다는 신호). 덮어쓰지 않았다:`);
    shrunk.forEach(s => console.error('  · ' + s));
    console.error('  거울(이관본/data/*.csv)을 먼저 갱신해라. 실제로 실적이 줄어든 정정이면 --allow-shrink.');
    process.exit(1);
  }
  console.log(`[yr] 진행 연도 ${partialYear} 잠정치 — 거울 반영 ${notes.length}건` + (notes.length ? ':' : ' (변화 없음)'));
  notes.forEach(s => console.log('  · ' + s));
  console.log('  ※ 교육·장도·문화나눔은 거울에 연도별 원천이 없어 손대지 않았다(0 덮어쓰기 = 실적 삭제).');
}

const before = JSON.stringify(YR);
if (SYNC || RECALC) recalc(YR);
if (JSON.stringify(YR) !== before) changed = true;

const all = audit(YR);
const bad = all.filter(b => !AUDIT_BASE.has(b));
const held = all.filter(b => AUDIT_BASE.has(b));
if (held.length) { console.log(`[yr] 면책 ${held.length}건(기존 부채 · 해소되면 AUDIT_BASE에서 지운다):`); held.forEach(b => console.log('  · ' + b)); }
for (const b of AUDIT_BASE) if (!all.includes(b)) console.log(`[yr] 면책 해소됨 — AUDIT_BASE에서 지워라: ${b}`);
if (bad.length) {
  console.error(`[yr] FAIL — _YR 정합성 ${bad.length}건 어긋남:`);
  bad.slice(0, 20).forEach(b => console.error('  · ' + b));
  if (bad.length > 20) console.error(`  … 외 ${bad.length - 20}건`);
  console.error('  고치는 법: 값이 맞다면 `node tools/build_annual_yr.mjs --recalc`(sum·계·grand 자동 재계산).');
  process.exit(1);
}

if (changed) {
  writeFileSync(INDEX, rewrite(src, YR, loc));
  const tot = YR.total.find(r => r.key === '인원');
  console.log(`[yr] 기록 — index.html _YR 갱신 · 누계 ${tot.sum.toLocaleString()} · 누적(grand) ${YR.grand.toLocaleString()}`);
  console.log('  ⚠ 미러도 같이: node tools/miso/build_single_json.mjs');
} else {
  const tot = YR.total.find(r => r.key === '인원');
  console.log(`[yr] PASS — _YR 정합(길이·sum·계·grand) · 연도 ${YR.years[0]}~${YR.years[YR.years.length - 1]} · 누계 ${tot.sum.toLocaleString()} · 누적 ${YR.grand.toLocaleString()}`);
}
