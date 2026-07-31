// 날짜 패널 「그날 일정」 3열 — 광학 잉크 실측(글자 박스가 아니라 글리프 잉크 기준)
// 각 열 텍스트의 baseline(Range 상단 + fontBoundingBoxAscent)을 잡고, canvas TextMetrics의
// actualBoundingBoxAscent/Descent로 실제 잉크 상·하단을 구해 열 사이 편차를 잰다.
// 사용: node tools/scratch/probe_panel_ink.mjs <index.html> [align-items 값 ...]
import { chromium } from 'playwright-core';
const [file, ...modes] = process.argv.slice(2);
const MODES = modes.length ? modes : ['center', 'baseline'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => (/^file:/.test(r.request().url()) ? r.continue() : r.abort()));
await p.goto('file://' + file, { waitUntil: 'commit', timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(() => {
  PERFS.length = 0;
  PERFS.push(
    { s: '2026-09-10', e: '2026-09-10', n: '섬박람회콘서트', f: '여수세계섬박람회 기념 음악회', t: 'p', l: '대극장' },
    { s: '2026-09-10', e: '2026-09-10', n: '피아노&피아노', f: '다비드 바뱅 & 아드리앙 몽도 〈피아노 & 피아노〉', t: 'p', l: '대극장' },
    { s: '2026-09-10', e: '2026-09-10', n: '예술교육', f: '토요 예술학교', t: 'a', l: '소극장' });
  window.getRentals = () => [
    { s: '2026-09-10', e: '2026-09-10', n: '대관', f: '전남교육청 학예발표회', t: 'r', l: '대극장', _gc: 1, dday: 0 },
    { s: '2026-09-10', e: '2026-09-10', n: '대관', f: '9월 정기연주회', t: 'r', l: '소극장', _gc: 1, _setup: 1, dday: 0 },
  ];
  window._jangdoHours = { '2026-09-10': '6:00~7:08, 10:14~19:06' };
  window._cafeHours = {};
  openPanel(new Date(2026, 8, 10), []);
  const el = document.getElementById('panel');
  el.classList.remove('pn-in');
  el.style.cssText += ';position:static;width:360px;height:auto';
  document.body.innerHTML = '';
  document.body.appendChild(el);
});
const rows = [];
for (const mode of MODES) {
  const r = await p.evaluate((m) => {
    const wrap = document.querySelector('.panel-hdr-labels');
    wrap.style.alignItems = m;
    const ctx = document.createElement('canvas').getContext('2d');
    const inkOf = (el) => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const t = el.textContent;
      const mt = ctx.measureText(t);
      const rg = document.createRange(); rg.selectNodeContents(el);
      const box = rg.getBoundingClientRect();
      const base = box.top + mt.fontBoundingBoxAscent;      // Range 상단 = baseline − 폰트 ascent
      const top = base - mt.actualBoundingBoxAscent;        // 실제 잉크 상단
      const bot = base + mt.actualBoundingBoxDescent;       // 실제 잉크 하단
      return { base, top, bot, mid: (top + bot) / 2, boxMid: box.top + box.height / 2, fs: parseFloat(cs.fontSize) };
    };
    const out = [];
    document.querySelectorAll('.panel-hdr-kind').forEach((k) => {
      const nm = k.nextElementSibling, pl = nm.nextElementSibling;
      const K = inkOf(k), N = inkOf(nm), P = inkOf(pl);
      out.push({ label: k.textContent + ' / ' + nm.textContent.slice(0, 10) + ' / ' + pl.textContent,
        baseD: [+(K.base - N.base).toFixed(3), +(P.base - N.base).toFixed(3)],
        midD: [+(K.mid - N.mid).toFixed(3), +(P.mid - N.mid).toFixed(3)],
        topD: [+(K.top - N.top).toFixed(3), +(P.top - N.top).toFixed(3)],
        botD: [+(K.bot - N.bot).toFixed(3), +(P.bot - N.bot).toFixed(3)] });
    });
    return out;
  }, mode);
  rows.push([mode, r]);
}
for (const [mode, r] of rows) {
  console.log('\n== align-items: ' + mode + '  (기준 = 2열 제목 · 단위 px · [구분, 장소])');
  r.forEach(x => console.log(`  ${x.label}\n     baseline Δ ${x.baseD}   잉크중심 Δ ${x.midD}   잉크상단 Δ ${x.topD}   잉크하단 Δ ${x.botD}`));
  const worst = (k) => Math.max(...r.flatMap(x => x[k].map(Math.abs)));
  console.log(`  최대편차 — baseline ${worst('baseD').toFixed(3)} · 잉크중심 ${worst('midD').toFixed(3)} · 잉크하단 ${worst('botD').toFixed(3)}`);
}
await b.close();
