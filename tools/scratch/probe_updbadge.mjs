#!/usr/bin/env node
// [260806-8] 업데이트 알림 배지 실측 — ① 자리(하단·간격) ② 유리 계승값 ③ 색 두 갈래(데이터 파랑 · 디자인 빨강)
//   + ④ 연간 일정(캘린더)의 유지보수 달 = 차트와 같은 밀림이 있는지 대조.
//   실행: node tools/scratch/probe_updbadge.mjs <출력접두어> [폭 높이]   · IDX=<다른 index.html>로 전/후 비교
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || '/tmp/ubadge';
const W = parseInt(process.argv[3] || '1440', 10), H = parseInt(process.argv[4] || '900', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

const MEASURE = `(()=>{
  const el=document.getElementById('update-badge'); if(!el)return {err:'no badge'};
  const b=el.getBoundingClientRect(), cs=getComputedStyle(el);
  return {cls:el.className, txt:el.textContent.trim(),
    자리:{bottom:+(innerHeight-b.bottom).toFixed(1), 중앙Δ:+((b.x+b.width/2)-innerWidth/2).toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1)},
    유리:{bg:cs.backgroundColor, blur:cs.backdropFilter||cs.webkitBackdropFilter, bd:cs.borderColor, bw:cs.borderWidth, r:cs.borderRadius, sh:cs.boxShadow.slice(0,44)},
    잉크:cs.color, 클릭:cs.pointerEvents, z:cs.zIndex};
})()`;

// 연간 일정(캘린더) 유지보수 = 어느 달 머리 아래 붙어 있나(차트와 같은 밀림이 있는지)
const CAL = `(()=>{
  const out=[];
  document.querySelectorAll('#yc-wrap .yc-mt, .yc-mt').forEach(function(mt){
    let p=mt.previousElementSibling, head=null;
    while(p){ if(p.classList&&p.classList.contains('yc-mo')){ head=p; break; } p=p.previousElementSibling; }
    out.push({유지보수:mt.textContent.replace(/\\s+/g,' ').trim(),
      달머리:head?head.querySelector('.yc-mo-n').textContent.trim():'(없음)',
      영문:head?head.querySelector('.yc-mo-l').textContent.trim():'', id:head?head.id:''});
  });
  return {블록:out.length, 목록:out, 상수:(typeof _YC_MAINT!=='undefined')?_YC_MAINT.map(function(z){return z.ms.join('~');}):null};
})()`;

async function main() {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        const f = (p === '/index.html' && process.env.IDX) ? process.env.IDX : join(ROOT, p);
        try { return route.fulfill({ status: 200, body: readFileSync(f), contentType: MIME[extname(p)] || 'application/octet-stream', headers: { etag: process.env.ETAG || '"base-1"' } }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      if (u.hostname === 'cdn.plot.ly') {
        const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
        if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
      }
      return route.abort();
    });
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#app', { timeout: 20000 });
    await page.waitForTimeout(1800);

    for (const kind of ['data', 'design']) {
      await page.evaluate(`_showUpdateBadge('${kind}')`);
      await page.waitForTimeout(400);
      console.log(kind.toUpperCase() + ' ' + JSON.stringify(await page.evaluate(MEASURE), null, 1));
      const bb = await (await page.$('#update-badge')).boundingBox();
      await page.screenshot({ path: OUT + '_' + kind + '.png',
        clip: { x: Math.max(0, bb.x - 150), y: Math.max(0, bb.y - 60), width: Math.min(W, bb.width + 300), height: Math.min(H - bb.y + 60, bb.height + 120) } });
      await page.screenshot({ path: OUT + '_' + kind + '_full.png' });   // 화면 전체 = 「위에 뜨나 아래에 뜨나」가 보이는 컷
      await page.evaluate('_hideUpdateBadge()');
    }
    // 배지 없는 상태의 화면 하단(간격 눈으로 보기) + 배지 띄운 전체 화면
    await page.evaluate(`_showUpdateBadge('design')`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '_full.png' });

    console.log('CAL ' + JSON.stringify(await page.evaluate(CAL), null, 1));
    // 감지 배선 단위 확인 — ETag가 바뀌면 빨강이 뜨는가(첫 샘플 baseline → 바뀐 값 주입)
    console.log('DETECT ' + JSON.stringify(await page.evaluate(`(async()=>{
      _hideUpdateBadge(); _designSeenTag=null;
      await _checkForDesign();                       // 첫 샘플 = baseline
      const base=_designSeenTag;
      _designSeenTag='"changed-deploy"';             // 배포가 바뀐 상황 재현
      await _checkForDesign();
      const el=document.getElementById('update-badge');
      return {baseline:base, 배지:_updateBadgeShown, 클래스:el?el.className:null};
    })()`)));
    if (errs.length) console.log('PAGE ERRORS: ' + errs.slice(0, 4).join(' | '));
    console.log('shots → ' + OUT + '_{data,design,full}.png');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
