#!/usr/bin/env node
// [260805] 플레이그라운드 시안 검증 — 포터블 §4: pageerror 0 + 프리셋 실클릭 + 프리셋별 스크린샷 + DOM 실측.
// 실행: node tools/scratch/probe_playground.mjs <html> <출력디렉터리>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = process.argv[2] || join(ROOT, 'docs/reports/260805_전시_직각누적_플레이그라운드.html');
const OUTDIR = process.argv[3] || join(ROOT, 'docs/reports');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push('pageerror: ' + String(e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    // 외부 요청 0 검증 — file:// 밖으로 나가는 요청이 있으면 잡는다
    const external = [];
    await page.route('**/*', r => { const u = r.request().url(); if (!u.startsWith('file:')) { external.push(u); return r.abort(); } return r.continue(); });
    await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load', timeout: 45000 });
    await page.waitForSelector('#chart .main-svg', { timeout: 20000 });
    await page.waitForTimeout(600);

    const pills = await page.$$('#presets .pill');
    const shots = [];
    for (let i = 0; i < pills.length; i++) {
      const nm = (await pills[i].textContent()).trim();
      await pills[i].click();
      await page.waitForTimeout(500);
      const probe = await page.evaluate(`(()=>{
        const d=document.getElementById('chart');
        const tr=[...d.querySelectorAll('.scatterlayer .trace')];
        return {traces:tr.length,
          fills:d.querySelectorAll('.scatterlayer .js-fill').length,
          lines:d.querySelectorAll('.scatterlayer .js-line').length,
          pts:d.querySelectorAll('.scatterlayer .points path').length,
          annos:[...d.querySelectorAll('.infolayer .annotation text')].map(t=>t.textContent),
          yTop:(document.querySelectorAll('#chart .yaxislayer-above text')||[]).length,
          warn:document.getElementById('wcount').textContent};
      })()`);
      const clip = await page.evaluate(`(()=>{const f=document.querySelector('.frame').getBoundingClientRect();
        return {x:Math.max(0,f.left-4),y:Math.max(0,f.top-4),width:f.width+8,height:f.height+8};})()`);
      const path = join(OUTDIR, `260805_직각누적_시안_${i}.png`);
      await page.screenshot({ path, clip });
      shots.push({ nm, ...probe, shot: path.split('/').pop() });
    }
    // 슬라이더 조작 + 색 셀렉트(⚠ 경로) + 복사 알림창 동작 확인
    await page.evaluate(`(()=>{const r=document.querySelector('#row-aFill input');r.value=.72;r.dispatchEvent(new Event('input'));
      const s=document.querySelector('#row-colKid select');s.value=3;s.dispatchEvent(new Event('input'));})()`);
    await page.waitForTimeout(350);
    const afterTune = await page.evaluate(`(()=>({warn:document.getElementById('wcount').textContent,out:document.getElementById('out').textContent.slice(0,240)}))()`);
    await page.click('#copy');
    await page.waitForTimeout(250);
    const modalOn = await page.evaluate(`document.getElementById('modal').classList.contains('on')`);
    await page.click('#mCancel');

    console.log(JSON.stringify({ external: external.slice(0, 5), externalCount: external.length, shots, afterTune, modalOn, errors: errs.slice(0, 6) }, null, 1));
    if (errs.length) { console.log('FAIL — JS 오류 ' + errs.length); process.exitCode = 1; }
    else console.log('PASS — pageerror 0 · 외부요청 ' + external.length + ' · 프리셋 ' + shots.length + '컷');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
