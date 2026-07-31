#!/usr/bin/env node
// [260801] 「처음부터 화면이 확대돼 뜬다」 전후 실측 샷 — QA경로(?qa=1#biz)에 대표데이터를 심어 조건별 1장씩.
// 실행: node tools/scratch/shot_bizzoom.mjs <파일명(index.html|_bizzoom_before.html)> <viewportW> <outerW override|0> <out.png>
// outerW override = 브라우저 페이지 줌 시늉(헤드리스는 창 크롬이 없어 outerWidth=innerWidth라 100%로만 보인다).
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/home/user/yeulmaru-promo';
const FILE = process.argv[2] || 'index.html';
const VW = +(process.argv[3] || 2560);
const OUTER = +(process.argv[4] || 0);
const OUT = process.argv[5] || '/tmp/shot.png';

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const ymd = d => d.getFullYear() + '' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
const off = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const SEED = {
  master: [
    { ID: 'P001', 사업명: '뮤지컬 〈그날들〉', 기준석: 3704, 총회차: 4, 총오픈석: 3704, 목표점유율: 65, 수익성: '상업', 티켓오픈일: iso(off(-30)), 시작일: iso(off(-2)), 종료일: iso(off(6)), 상태: '판매중' },
    { ID: 'P002', 사업명: '조재혁 피아노 리사이틀', 기준석: 926, 총회차: 1, 총오픈석: 926, 목표점유율: 50, 수익성: '공공', 티켓오픈일: iso(off(-20)), 시작일: iso(off(3)), 종료일: iso(off(3)), 상태: '판매중' },
    { ID: 'P003', 사업명: '뮤지컬 〈달 샤베트〉', 기준석: 926, 총회차: 6, 총오픈석: 5556, 목표점유율: 40, 수익성: '공공', 티켓오픈일: iso(off(-10)), 시작일: iso(off(1)), 종료일: iso(off(2)), 상태: '판매중' },
    { ID: 'P004', 사업명: '국립현대무용단 〈트리플 빌〉', 기준석: 926, 총회차: 1, 총오픈석: 926, 목표점유율: 50, 수익성: '상업', 티켓오픈일: iso(off(-1)), 시작일: iso(off(20)), 종료일: iso(off(24)), 상태: '판매중' },
    { ID: 'P005', 사업명: '브런치 콘서트 Ⅲ 〈현 위로 흐르는 클래식〉', 기준석: 926, 총회차: 1, 총오픈석: 926, 목표점유율: 70, 수익성: '상업', 티켓오픈일: iso(off(-40)), 시작일: iso(off(-3)), 종료일: iso(off(9)), 상태: '판매중' },
  ],
  rounds: [
    { ID: 'P001', 공연일: iso(off(-2)), 오픈좌석: null }, { ID: 'P001', 공연일: iso(off(-1)), 오픈좌석: null },
    { ID: 'P001', 공연일: iso(off(0)), 오픈좌석: null }, { ID: 'P001', 공연일: iso(off(6)), 오픈좌석: null },
    { ID: 'P002', 공연일: iso(off(3)), 오픈좌석: 926 },
    { ID: 'P003', 공연일: iso(off(1)), 오픈좌석: 926 }, { ID: 'P003', 공연일: iso(off(2)), 오픈좌석: 926 },
    { ID: 'P004', 공연일: iso(off(20)), 오픈좌석: 926 },
    { ID: 'P005', 공연일: iso(off(-3)), 오픈좌석: 926 },
  ],
  daily: [], ops: [], group: [],
};
[['뮤지컬 〈그날들〉', 'P001', [520, 610, 700, 812, 903, 964, 990]],
 ['조재혁 피아노 리사이틀', 'P002', [40, 55, 66, 78, 88, 94, 97]],
 ['뮤지컬 〈달 샤베트〉', 'P003', [380, 460, 540, 680, 800, 900, 950]],
 ['브런치 콘서트 Ⅲ 〈현 위로 흐르는 클래식〉', 'P005', [120, 160, 190, 220, 255, 277, 295]]].forEach(([nm, id, arr]) => {
  arr.forEach((v, i) => {
    SEED.daily.push({ 기준일자: ymd(off(i - 7)), 공연명: nm, 공연ID: id, 합계좌석: v, 합계금액: v * 42000, '전일대비(석)': i ? v - arr[i - 1] : v });
  });
});

const EX_MASTER = [
  { 전시ID: 'E001', 전시명: 'GS칼텍스 예울마루 기획전시 〈여수, 빛의 기억〉', 연도: TODAY.getFullYear(), 시작일: iso(off(-40)), 종료일: iso(off(30)), 운영일수: 104, 목표관객: 3573, 목표금액: 30000000, 수익성: '상업', 상태: '진행중' },
];
const EX_DAILY = [];
[['E001', [65, 78, 95, 110, 128, 142, 155], 3573]].forEach(([id, arr, goal]) => {
  arr.forEach((v, i) => EX_DAILY.push({ 기준일자: ymd(off(i - 7)), 전시ID: id, 일일유료: i ? v - arr[i - 1] : v, 일일총인원: i ? v - arr[i - 1] : v, 누계유료: v, 누계무료: Math.round(v * 0.05), 누계총인원: Math.round(v * 1.05), 점유율: +(v / goal * 100).toFixed(1) }));
});

const PGS = [
  { id: 'P001', f: '뮤지컬 〈그날들〉', n: '그날들', l: '대극장', t: 'c', g: '뮤지컬', s: iso(off(-2)), e: iso(off(6)), ss: iso(off(-30)), se: iso(off(6)) },
  { id: 'P002', f: '조재혁 피아노 리사이틀', n: '조재혁', l: '대극장', t: 'c', g: '클래식', s: iso(off(3)), e: iso(off(3)), ss: iso(off(-20)), se: iso(off(3)) },
  { id: 'P003', f: '뮤지컬 〈달 샤베트〉', n: '달 샤베트', l: '대극장', t: 'c', g: '어린이', s: iso(off(1)), e: iso(off(2)), ss: iso(off(-10)), se: iso(off(2)) },
  { id: 'P004', f: '국립현대무용단 〈트리플 빌〉', n: '트리플 빌', l: '대극장', t: 'c', g: '무용', s: iso(off(20)), e: iso(off(24)), ss: iso(off(-1)), se: iso(off(24)) },
  { id: 'P005', f: '브런치 콘서트 Ⅲ 〈현 위로 흐르는 클래식〉', n: '브런치', l: '대극장', t: 'c', g: '클래식', s: iso(off(-3)), e: iso(off(9)), ss: iso(off(-40)), se: iso(off(9)) },
  { id: 'E001', f: 'GS칼텍스 예울마루 기획전시 〈여수, 빛의 기억〉', n: '기획전시', l: '7층 전시실', t: 'e', g: '시즌', s: iso(off(-40)), e: iso(off(30)), ss: iso(off(-40)), se: iso(off(30)) },
];

const errs = [];
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: Math.round(VW * 1080 / 1920) }, deviceScaleFactor: 1 });
await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
if (OUTER) await ctx.addInitScript(`Object.defineProperty(window,'outerWidth',{value:${OUTER},configurable:true});`);
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('file://' + ROOT + '/' + FILE + '?qa=1#biz', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const info = await page.evaluate(({ SEED, EX_MASTER, EX_DAILY, PGS }) => {
  const mk = (sheet, rows) => ({ sheet, headers: rows.length ? Object.keys(rows[0]) : [], rows, count: rows.length });
  _salesState.master = mk('공연마스터', SEED.master);
  _salesState.rounds = mk('회차상세', SEED.rounds);
  _salesState.daily = mk('일일입력', SEED.daily);
  _salesState.ops = mk('운영대장', SEED.ops);
  _salesState.group = mk('운영_단체', SEED.group);
  _salesState._opsIdx = null;
  _anaState._exMaster = mk('전시마스터', EX_MASTER);
  _anaState._exDaily = mk('전시일일', EX_DAILY);
  PERFS = PGS;
  _perfReady = true;
  try { _srailRender(); } catch (e) {}
  try { _bizZoomApply(); } catch (e) {}
  return null;
}, { SEED, EX_MASTER, EX_DAILY, PGS });

await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const bw = document.getElementById('body-wrap');
  const q = s => document.querySelector(s);
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const nav = q('#main-nav .mv-btn, #main-nav button, nav button');
  return {
    innerW: window.innerWidth, outerW: window.outerWidth,
    zoom: bw ? (bw.style.zoom || '(없음)') : '(no body-wrap)',
    navFs: nav ? getComputedStyle(nav).fontSize : null,
    bizMain: r(q('#biz-main')), chart: r(q('#yrm-chart')), rail: r(q('#sales-rail')),
    over: Math.round(document.documentElement.scrollHeight - window.innerHeight),
  };
});
await page.screenshot({ path: OUT, fullPage: false });
console.log(FILE, 'vw=' + VW, 'outerOverride=' + (OUTER || '-'), JSON.stringify(m));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3));
await browser.close();
