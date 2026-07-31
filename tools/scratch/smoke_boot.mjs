// index.html 부팅 스모크 — 편집 후 스크립트 파싱·초기 렌더에 에러가 없는지(로그인 화면까지)
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
// 외부 자원(폰트·CDN)은 오프라인이라 응답이 없다 → 차단해야 로드가 끝난다
await p.route('**', r => (/^file:/.test(r.request().url()) ? r.continue() : r.abort()));
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.goto('file:///home/user/yeulmaru-promo/index.html', { waitUntil: 'commit', timeout: 60000 });
await p.waitForTimeout(2500);
// 새로 넣은 심볼이 실제로 정의됐는지
const syms = await p.evaluate(() => ['_gcParse','_gcDupSet','_EX_SPACE','getExhibitStatus','renderExhibitBadge','loadRentals','getRentals']
  .map(n => n + '=' + (typeof window[n])));
console.log(syms.join('  '));
const probe = await p.evaluate(() => {
  const r = _gcParse('[대][대관]송년음악회 14~15일 셋업 16일 19:00','2026-12-14','2026-12-16');
  return { name: r.name, kind: r.kind, t: r.t, setup: Object.keys(r.setup).sort() };
});
console.log('부팅 후 파서 실행:', JSON.stringify(probe));
console.log(errs.length ? '❌ 에러:\n' + errs.join('\n') : '✅ 부팅 에러 0');
await b.close();
process.exit(errs.length ? 1 : 0);
