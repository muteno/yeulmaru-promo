#!/usr/bin/env node
// X 아이콘 버튼 일괄 정본화 전후 촬영 — 글자가 바뀐 7곳.
//   버튼 마크업은 **index.html 실코드에서 onclick 서명으로 뽑아** 쓴다(재타이핑 0 = 260805-16 규약).
//   실앱 페이지 안에 심어 렌더하므로 CSS·토큰이 실제 그대로 적용된다.
//   후 = 실코드 그대로(`✕`) · 전 = 그 마크업의 글자만 구 `×`로 되돌린 것(그 커밋의 diff가 정확히 그것뿐).
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = process.argv[2] || join(ROOT, 'docs', 'reports', '260805_X아이콘_일괄정본화_전후');
mkdirSync(OUTDIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const chrome = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();

const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');
// 글자가 바뀐 7곳 — onclick 서명으로 실코드에서 추출
const SITES = [
  ['closeSpecialView()', '담당자 특별일정 · 닫기'],
  ['closeMsgBox()', '쪽지함 · 닫기'],
  ["pwRemoveFolder('+i+')", '홍보 위저드 폴더 · 삭제'],
  ['closeFolderTreeModal()', '폴더 트리 · 닫기'],
  ['closeProgramView()', '프로그램 보기 · 닫기'],
  ['closeBookingProcess()', '예약 프로세스(.bp-x) · 닫기'],
  ['closeEnneagram()', '에니어그램(.bp-x) · 닫기'],
];
const picked = SITES.map(([sig, name]) => {
  // ⚠ 서명만으로 찾으면 **함수 정의부·다른 호출부**가 먼저 걸린다(실측으로 물림) — `onclick="..."` 속성으로 못박는다.
  const anchor = 'onclick="' + sig + '"';
  const i = SRC.indexOf(anchor);
  if (i < 0) throw new Error('실코드에서 버튼을 못 찾음: ' + anchor);
  const s = SRC.lastIndexOf('<button', i), e = SRC.indexOf('</button>', i) + 9;
  if (s < 0 || e < s) throw new Error('버튼 경계 추출 실패: ' + anchor);
  // onclick은 떼어낸다(이 페이지엔 닫을 대상이 없다) — 나머지 속성·글자·스타일은 실코드 그대로
  return { name, html: SRC.slice(s, e).replace(/\sonclick="[^"]*"/, '') };
});

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 4 });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => { const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); } }
  return route.abort(); });
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

for (const [tag, glyph] of [['before', '×'], ['after', '✕']]) {
  const cells = picked.map(p => {
    const html = p.html.replace(/>[\s]*[×✕][\s]*</, '>' + glyph + '<');
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:9px;min-width:118px">
      <div style="display:flex;align-items:center;justify-content:center;height:44px">${html}</div>
      <div style="font-size:10px;color:var(--neutral-text);text-align:center;line-height:1.35;max-width:110px">${p.name}</div></div>`;
  }).join('');
  await page.evaluate(`(()=>{ var old=document.getElementById('__xstrip'); if(old)old.remove();
    document.body.insertAdjacentHTML('beforeend','<div id="__xstrip" style="position:fixed;left:0;top:0;z-index:999999;background:var(--surface-solid);padding:18px 16px;display:flex;gap:10px;align-items:flex-start">' + ${JSON.stringify(cells)} + '</div>'); })()`);
  await page.waitForTimeout(250);
  const box = await page.evaluate(`(()=>{const b=document.getElementById('__xstrip').getBoundingClientRect();
    return {x:0,y:0,width:Math.ceil(b.width),height:Math.ceil(b.height)};})()`);
  await page.screenshot({ path: join(OUTDIR, `xstrip-${tag}.png`), clip: box });
}
const measured = await page.evaluate(`(()=>[].map.call(document.querySelectorAll('#__xstrip button'),function(b){
  var r=document.createRange(); r.selectNodeContents(b); var g=r.getBoundingClientRect();
  var t=b.textContent||'';
  return {code:'U+'+t.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'), inkW:+g.width.toFixed(2),
          title:b.getAttribute('title'), aria:b.getAttribute('aria-label')};}))()`);
console.log(JSON.stringify({ sites: picked.length, after: measured, pageerror: errs.slice(0, 3) }, null, 1));
await browser.close();
