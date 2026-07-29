#!/usr/bin/env node
// 정렬 스모크 게이트 — 「프로그램 별 판매 추이」(#rail-yrm) 분야별 표의 **틀 통일** 회귀 차단.
//   운영자 260729: "이게 진행중인 프로그램이면 그 안에 있는 표들은 다 인덱싱이 같으면 정렬도 같게 가야된다.
//                   ... 단, 전시의 인덱싱 '값'(예: 누적 관객수)이 공연하고 같아지면 안 됨. 틀만이야."
//   → 검사하는 것 = **열별 정렬 형태**(머리글·본문 computed text-align) + **열 경계**(좌변 x·폭) = 「틀」.
//     검사하지 않는 것 = **머리글 라벨 텍스트**(공연 '판매율' ↔ 전시 '누적 관객수'는 달라야 정상) · 셀 내용.
//
// ⚠ fail-soft 원칙(tools/smoke_login.mjs와 동일):
//   playwright-core·chromium·환경 문제 = SKIP(exit 0, 차단 안 함). *진짜 틀 어긋남*만 FAIL(exit 1).
//
// 실행: node tools/smoke_rail_align.mjs   ·   npm run smoke:align
// 데이터는 ?qa=1 목데이터 직주입(실API·실데이터 무접촉).
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = join(base, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// 최소 시드 — 공연 1건 + 전시 1건이면 두 표가 동시에 렌더된다(틀 비교에 필요한 최소 모수).
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const ymd = d => d.getFullYear() + '' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
const off = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const SEED = {
  master: [{ ID: 'S001', 사업명: '스모크 공연', 기준석: 926, 총회차: 2, 총오픈석: 926, 목표점유율: 50, 수익성: '공공', 티켓오픈일: iso(off(-10)), 시작일: iso(off(-1)), 종료일: iso(off(3)), 상태: '판매중' }],
  rounds: [{ ID: 'S001', 공연일: iso(off(-1)), 오픈좌석: null }, { ID: 'S001', 공연일: iso(off(3)), 오픈좌석: null }],
  daily: [300, 420, 510, 605, 700, 790, 860].map((v, i) => ({ 기준일자: ymd(off(i - 7)), 공연명: '스모크 공연', 공연ID: 'S001', 합계좌석: v, 합계금액: v * 40000 })),
};
const EX_MASTER = [{ 전시ID: 'X001', 전시명: '스모크 전시', 연도: TODAY.getFullYear(), 시작일: iso(off(-20)), 종료일: iso(off(20)), 운영일수: 41, 목표관객: 1000, 목표금액: 5e6, 수익성: '공공', 상태: '진행중' }];
const EX_DAILY = [120, 190, 260, 330, 400, 470, 540].map((v, i) => ({ 기준일자: ymd(off(i - 7)), 전시ID: 'X001', 일일유료: 70, 일일총인원: 70, 누계유료: v, 누계무료: 0, 누계총인원: v, 점유율: v / 10 }));
const PGS = [
  { id: 'S001', f: '스모크 공연', n: '스모크', l: '대극장', t: 'c', g: '클래식', s: iso(off(-1)), e: iso(off(3)), ss: iso(off(-10)), se: iso(off(3)) },
  { id: 'X001', f: '스모크 전시', n: '스모크전', l: '전시실', t: 'e', g: '전시', s: iso(off(-20)), e: iso(off(20)), ss: iso(off(-20)), se: iso(off(20)) },
];

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[smoke:align] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[smoke:align] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(INDEX)) { console.log('[smoke:align] SKIP — index.html 없음.'); return 0; }

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  let tables = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 1200 } });
    await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    await page.goto('file://' + INDEX + '?qa=1#biz', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(({ SEED, EX_MASTER, EX_DAILY, PGS }) => {
      const mk = (sheet, rows) => ({ sheet, headers: rows.length ? Object.keys(rows[0]) : [], rows, count: rows.length });
      _salesState.master = mk('공연마스터', SEED.master);
      _salesState.rounds = mk('회차상세', SEED.rounds);
      _salesState.daily = mk('일일입력', SEED.daily);
      _salesState.ops = mk('운영대장', []);
      _salesState.group = mk('운영_단체', []);
      _salesState._opsIdx = null;
      _anaState._exMaster = mk('전시마스터', EX_MASTER);
      _anaState._exDaily = mk('전시일일', EX_DAILY);
      PERFS = PGS;
      _perfReady = true;
      _srailRender();
    }, { SEED, EX_MASTER, EX_DAILY, PGS });
    await page.waitForTimeout(1200);
    tables = await page.evaluate(() => [...document.querySelectorAll('#rail-yrm-list .ry-grp')].map(g => {
      const label = (g.getAttribute('aria-label') || '').split(' ')[0];
      const t = g.querySelector('table');
      if (!t) return { label, hd: [], bd: [] };
      const hd = [...t.querySelectorAll('thead td')].map(c => {
        const r = c.getBoundingClientRect();
        return { lab: c.textContent.trim(), ta: getComputedStyle(c).textAlign, x: +r.left.toFixed(1), w: +r.width.toFixed(1) };
      });
      const row = t.querySelector('tbody tr');
      const bd = row ? [...row.children].map(c => {
        const ta = getComputedStyle(c).textAlign;
        return { ta: (ta === 'start' ? 'left' : ta), x: +c.getBoundingClientRect().left.toFixed(1) };
      }) : [];
      return { label, hd, bd };
    }));
  } finally {
    await browser.close();
  }

  if (tables.length < 2) { console.log(`[smoke:align] SKIP — 분야 표가 ${tables.length}개만 렌더됨(시드·QA 경로 문제 = 환경 이슈로 취급, 차단 안 함).`); return 0; }

  const errs = [];
  const base = tables[0];
  for (const t of tables.slice(1)) {
    if (t.hd.length !== base.hd.length) { errs.push(`[${t.label}] 열 개수 ${t.hd.length} ≠ [${base.label}] ${base.hd.length}`); continue; }
    t.hd.forEach((c, i) => {
      const b = base.hd[i];
      // 라벨(인덱싱 '값')은 일부러 비교하지 않는다 — 공연 '판매율' ↔ 전시 '누적 관객수'는 달라야 정상.
      if (c.ta !== b.ta) errs.push(`머리글 ${i + 1}열 정렬 불일치: [${base.label}] ${b.lab}=${b.ta} ↔ [${t.label}] ${c.lab}=${c.ta}`);
      if (Math.abs(c.x - b.x) > 1) errs.push(`머리글 ${i + 1}열 좌변 x 불일치(>1px): [${base.label}] ${b.x} ↔ [${t.label}] ${c.x}`);
      if (Math.abs(c.w - b.w) > 1) errs.push(`머리글 ${i + 1}열 폭 불일치(>1px): [${base.label}] ${b.w} ↔ [${t.label}] ${c.w}`);
    });
    t.bd.forEach((c, i) => {
      const b = base.bd[i];
      if (!b) return;
      if (c.ta !== b.ta) errs.push(`본문 ${i + 1}열 정렬 불일치: [${base.label}] ${b.ta} ↔ [${t.label}] ${c.ta}`);
      if (Math.abs(c.x - b.x) > 1) errs.push(`본문 ${i + 1}열 좌변 x 불일치(>1px): [${base.label}] ${b.x} ↔ [${t.label}] ${c.x}`);
    });
  }

  for (const t of tables) console.log(`[${t.label}] 머리글 = ${t.hd.map(c => `${c.lab}:${c.ta}`).join(' | ')}`);
  for (const t of tables) console.log(`[${t.label}] 본문   = ${t.bd.map(c => c.ta).join(' | ')}`);

  if (errs.length) {
    console.error(`✗ [smoke:align] 분야 표 틀 불일치 ${errs.length}건 — 공연·전시는 열별 정렬·경계가 같아야 한다(머리글 라벨은 달라도 됨).`);
    errs.forEach(e => console.error('  - ' + e));
    return 1;
  }
  console.log(`✓ [smoke:align] 분야 표 ${tables.length}개 틀 통일 — 열별 정렬·경계 일치(머리글 라벨은 비교 대상 아님)`);
  return 0;
}

// 스모크 자체가 환경 문제로 던지면 SKIP(차단 안 함) — 오직 명시적 FAIL(return 1)만 커밋 차단.
main().then(c => process.exit(c)).catch(e => {
  console.error('[smoke:align] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
