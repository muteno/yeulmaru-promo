#!/usr/bin/env node
// [260806] 전역 에러 포착 실측 — 관리자만 토스트 / 사용자 무음 / 크로스오리진·리소스 실패 무음 / 도배 상한.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const pw = await import('playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });

// 토스트를 실제로 띄우는 경로만 본다 — showToast는 #toast 한 칸을 재사용하므로 호출을 세서 함께 비교한다.
const TAP = `(()=>{ window.__toasts=[]; var _o=window.showToast;
  window.showToast=function(m,t,h){ window.__toasts.push({m:m,t:t}); return _o.apply(this,arguments); }; })()`;
const READ = `(()=>({toasts:window.__toasts||[], visible:(document.getElementById('toast')||{}).className||''}))()`;

async function probe(role) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto(`https://app.local/index.html?qa=${role}#cal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cell', { timeout: 20000 });
  await page.evaluate(TAP);

  const out = {};
  // ① 진짜 스크립트 예외(onclick 핸들러가 던지는 상황과 같은 축)
  await page.evaluate(`(()=>{var b=document.createElement('button');b.id='__boom';b.onclick=function(){null.x=1;};document.body.appendChild(b);})()`);
  await page.click('#__boom').catch(() => {});
  await page.waitForTimeout(300);
  out.실예외 = await page.evaluate(READ);

  // ② 리소스 로드 실패(<img> 404) — 스크립트 예외가 아니므로 무음이어야 한다
  await page.evaluate(`(()=>{window.__toasts=[];var i=new Image();i.src='/__none__.png?'+1;document.body.appendChild(i);})()`);
  await page.waitForTimeout(500);
  out.리소스404 = await page.evaluate(READ);

  // ③ 처리 안 된 Promise 거절
  await page.evaluate(`(()=>{window.__toasts=[];Promise.reject(new Error('테스트 거절'));})()`);
  await page.waitForTimeout(300);
  out.거절 = await page.evaluate(READ);

  // ④ 도배 상한 — 서로 다른 예외 12번
  await page.evaluate(`(()=>{window.__toasts=[];for(var i=0;i<12;i++){(function(n){setTimeout(function(){var o=null;o['k'+n]();},0);})(i);}})()`);
  await page.waitForTimeout(600);
  out.도배 = await page.evaluate(READ);

  await page.close();
  return out;
}

const admin = await probe('admin');
const user = await probe('1');
await browser.close();
const fmt = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toasts.length + '건 ' + JSON.stringify(v.toasts.map(t => t.m + '/' + t.t))]));
console.log('관리자(?qa=admin) :', JSON.stringify(fmt(admin), null, 1));
console.log('사용자(?qa=1)     :', JSON.stringify(fmt(user), null, 1));
