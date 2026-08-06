#!/usr/bin/env node
// [260806] 전/후 실측 캡처 — 전역 에러 포착(관리자에게만 토스트).
//   같은 조작 = 관리자 화면에서 onclick 핸들러가 던지는 버튼을 누른다.
//   before = git HEAD:index.html(핸들러 없음) · after = 작업트리 · 덤으로 사용자(?qa=1) 화면도 같이 잰다.
//   산출 = docs/reports/260806_전역에러포착_전.png / _후.png / _후_사용자.png / _전후.html
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs/reports');
const BASE = '260806_전역에러포착';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const HEAD_HTML = execSync('git show HEAD:index.html', { cwd: ROOT, maxBuffer: 1 << 28 });

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}

async function run(chromium, label, useHead, role) {
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const con = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('[전역 ') === 0) con.push(t.slice(0, 120)); });
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (p === '/index.html' && useHead) return route.fulfill({ status: 200, body: HEAD_HTML, contentType: MIME['.html'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto(`https://app.local/index.html?qa=${role}#cal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.cell', { timeout: 20000 });
  await page.waitForTimeout(1200);
  // 실제 사고와 같은 모양 — onclick 핸들러가 던진다
  await page.evaluate(`(()=>{var b=document.createElement('button');b.onclick=function(){null.x=1;};b.style.cssText='position:fixed;left:-9999px';document.body.appendChild(b);b.click();})()`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${BASE}_${label}.png`) });
  const st = await page.evaluate(`(()=>{const t=document.getElementById('toast');
    return {토스트:!!(t&&t.classList.contains('show')), 문구:(t&&t.textContent||'').trim()};})()`);
  await browser.close();
  return { st, con };
}

const pw = await import('playwright-core');
const chromium = pw.chromium || pw.default.chromium;
const before = await run(chromium, '전', true, 'admin');
const after = await run(chromium, '후', false, 'admin');
const userAfter = await run(chromium, '후_사용자', false, '1');
console.log('전(관리자·핸들러 없음)', JSON.stringify(before));
console.log('후(관리자)           ', JSON.stringify(after));
console.log('후(일반 사용자)       ', JSON.stringify(userAfter));

const row = (t, r) => `<tr><th>${t}</th><td>${r.st.토스트 ? '✅ 뜸' : '❌ 안 뜸'}</td><td>${r.st.문구 || '<span class="x">(없음)</span>'}</td><td>${r.con.length ? r.con.length + '건' : '<span class="x">0건</span>'}</td></tr>`;
writeFileSync(join(OUT, `${BASE}_전후.html`), `<!doctype html><meta charset="utf-8"><title>전역 에러 포착 — 전/후 실측</title>
<style>body{font-family:'Malgun Gothic',sans-serif;background:#FDF6F3;color:#1A1A2E;margin:0;padding:28px}
h1{font-size:19px;margin:0 0 4px}p{font-size:13px;color:#666;line-height:1.7;margin:0 0 18px}
table{border-collapse:collapse;font-size:13px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);margin-bottom:22px}
th,td{padding:10px 14px;border-bottom:1px solid rgba(0,0,0,.07);text-align:left}thead th{background:#4A4DE7;color:#fff}
.x{color:#E24B4A;font-weight:700}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
figure{margin:0}figcaption{font-size:12px;font-weight:700;margin-bottom:6px}img{width:100%;border-radius:12px;border:1px solid rgba(0,0,0,.09)}</style>
<h1>전역 에러 포착 — 전/후 실측 (260806 · 운영자 선택 「관리자에게만 토스트」)</h1>
<p>같은 조작 = <b>onclick 핸들러가 예외를 던진다</b>(260806 위저드 사고와 같은 모양).
전 = 화면·콘솔 모두 우리 쪽 안내 0 → 「눌러도 아무 일도 안 일어남」이 사용자가 아는 전부였다.</p>
<table><thead><tr><th></th><th>화면 안내</th><th>문구</th><th>콘솔 기록</th></tr></thead>
<tbody>${row('전 — 관리자 (핸들러 없음)', before)}${row('후 — 관리자', after)}${row('후 — 일반 사용자', userAfter)}</tbody></table>
<div class="g"><figure><figcaption>전 — 관리자도 아무 안내 없음</figcaption><img src="${BASE}_전.png"></figure>
<figure><figcaption>후 — 관리자에게만 토스트</figcaption><img src="${BASE}_후.png"></figure>
<figure><figcaption>후 — 일반 사용자는 종전 그대로 조용</figcaption><img src="${BASE}_후_사용자.png"></figure></div>`);
console.log('산출 →', join(OUT, `${BASE}_전후.html`));
