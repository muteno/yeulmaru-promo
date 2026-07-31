// 날짜 패널 헤더 「그날 일정」 표기 전/후 캡처 — node tools/scratch/shot_panel_hdr.mjs <html> <out.png>
import { chromium } from 'playwright-core';
const [file, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
await p.route('**', r => (/^file:/.test(r.request().url()) ? r.continue() : r.abort()));
await p.goto('file://' + file, { waitUntil: 'commit', timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(() => {
  // 실데이터 대신 9/10 화면과 같은 표본 + 대관/셋업 1건씩(원형 배지 「대」·「셋」 확인용)
  PERFS.length = 0;
  PERFS.push(
    { s: '2026-09-10', e: '2026-09-10', n: '섬박람회콘서트', f: '여수세계섬박람회 기념 음악회', t: 'p', l: '대극장' },
    { s: '2026-09-10', e: '2026-09-10', n: '예술교육', f: '토요 예술학교', t: 'a', l: '다목적홀' });
  window.getRentals = () => [
    { s: '2026-09-10', e: '2026-09-10', n: '대관', f: '전남교육청 학예발표회', t: 'r', l: '대극장', _gc: 1, dday: 0 },
    { s: '2026-09-10', e: '2026-09-10', n: '대관', f: '9월 정기연주회', t: 'r', l: '소극장', _gc: 1, _setup: 1, dday: 0 },
  ];
  window._holidays = window._holidays || {};
  window._jangdoHours = { '2026-09-10': '6:00~7:08, 10:14~19:06' };
  window._cafeHours = {};
  openPanel(new Date(2026, 8, 10), []);
  const el = document.getElementById('panel');
  el.classList.remove('pn-in');
  el.style.cssText += ';position:static;width:360px;height:auto;box-shadow:none';
  document.body.style.cssText = 'margin:0;padding:24px;background:#F0EBF5';
  document.body.innerHTML = '';
  document.body.appendChild(el);
  // 변경 구간(헤더 + 바로 아래 운영시간)만 남기고 잘라 비교를 또렷하게
  const bd = el.querySelector('.panel-body');
  const svc = bd && bd.querySelector('.panel-svc');
  if (bd) { bd.innerHTML = ''; if (svc) bd.appendChild(svc); }
});
await p.waitForTimeout(300);
const el = await p.$('#panel');
await el.screenshot({ path: out });
await b.close();
console.log('saved', out);
