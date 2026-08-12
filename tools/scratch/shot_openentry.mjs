#!/usr/bin/env node
// [260812] 전면 개방 진입 실측 — 로그인 화면을 안 거치고 바로 앱(사업 개요)으로 들어오는지 + 잠금이 안 걸리는지.
//   전/후를 같은 코드 경로에서 뽑는다: `후` = 정본 그대로 · `전` = 페이지 안에서 OPEN_ENTRY만 끈 채 재기동.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const serve = (page) => page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  return route.abort();
});

const probe = `(()=>{
  const lg=document.getElementById('login'), ap=document.getElementById('app');
  const cs=lg?getComputedStyle(lg):null;
  const nav=[].slice.call(document.querySelectorAll('.nav-btn')).map(b=>b.dataset.mid+(b.classList.contains('on')?'*':'')).join(' ');   // 활성 표시 = .on(_mvSync 동기)
  return {
    loginShown: !!(lg && cs && cs.display!=='none'),
    appShown:   !!(ap && getComputedStyle(ap).display!=='none'),
    role: (typeof userRole!=='undefined'?userRole:'?'),
    pw:   (function(){try{return sessionStorage.getItem('pw')||'';}catch(e){return '';}})(),
    deck: (typeof _bizDeck!=='undefined'?_bizDeck:'?'),
    idleOff: !!window._idleLockDisabled,
    nav: nav,
    lockedStamp: (function(){try{return sessionStorage.getItem('_lockedAt')||'';}catch(e){return '';}})()
  };
})()`;

const main = async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  const shots = {};

  // ── 후: 정본 그대로 ──────────────────────────────────────────
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
  p2.on('pageerror', e => errs.push(String(e && e.message || e)));
  await serve(p2);
  await p2.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p2.waitForTimeout(2500);
  const after = await p2.evaluate(probe);
  shots.after = (await p2.screenshot()).toString('base64');

  // 잠금 시도 — 개방 진입이면 잠기면 안 된다
  await p2.evaluate('try{lockScreen();}catch(e){}');
  await p2.waitForTimeout(300);
  const afterLock = await p2.evaluate(probe);
  await p2.close();

  // ── 전: OPEN_ENTRY를 끈 판(같은 파일, 상수만 false) ─────────
  const src = readFileSync(join(ROOT, 'index.html'), 'utf8').replace('var OPEN_ENTRY=true;', 'var OPEN_ENTRY=false;');
  const p1 = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
  await p1.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (p === '/index.html') return route.fulfill({ status: 200, body: src, contentType: MIME['.html'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await p1.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p1.waitForTimeout(2500);
  const before = await p1.evaluate(probe);
  shots.before = (await p1.screenshot()).toString('base64');
  await p1.close();
  await browser.close();

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, '_openentry_shots.json'), JSON.stringify({ shots, before, after, afterLock, errs }, null, 0));

  const ok = [];
  ok.push(['전(스위치 off) = 로그인 화면 노출', before.loginShown === true]);
  ok.push(['후(정본) = 로그인 화면 없음', after.loginShown === false]);
  ok.push(['후 = 앱 노출', after.appShown === true]);
  ok.push(['후 = 권한 0510 (pw)', after.pw === '0510']);
  ok.push(['후 = role admin', after.role === 'admin']);
  ok.push(['후 = 첫 화면 사업 개요(bizov)', /bizov\*/.test(after.nav)]);
  ok.push(['후 = 유휴 잠금 off', after.idleOff === true]);
  ok.push(['후 = lockScreen() 불러도 안 잠김', afterLock.appShown === true && afterLock.loginShown === false && !afterLock.lockedStamp]);
  ok.push(['pageerror 0', errs.length === 0]);
  let fail = 0;
  ok.forEach(([n, v]) => { if (!v) fail++; console.log((v ? '  ✔ ' : '  ✘ ') + n); });
  console.log('nav(후)=', after.nav, '· deck=', after.deck, '· errs=', errs.slice(0, 3));
  console.log(fail ? `[openentry] FAIL ${fail}건` : '[openentry] PASS — 로그인·잠금 없이 사업 개요 직행');
  process.exit(fail ? 1 : 0);
};
main().catch(e => { console.error(e); process.exit(1); });
