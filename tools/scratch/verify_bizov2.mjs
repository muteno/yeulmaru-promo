// [scratch · 260813-2] 운영자 지시 4건 실측 — ①사업 결과 차액 열 제거 ②사업명=등록명(자리표 제거)
//   ③비고=자리표 ④기준일 라벨. 실클릭으로 분야를 갈아가며 표 내용을 통째로 읽는다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const YEAR = Number(process.argv[2] || 2025);
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  return route.abort();
});
await page.goto('https://app.local/index.html?qa=admin#bizov', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
// ⚠ 씨앗에 `built`가 아직 없다(레포의 `data/biz_finance.js`는 #806이 만든 판이고, 그 원천 xlsx가
//   레포에 없어 재빌드가 4행을 지운다 = 재생성 금지). 그래서 **런타임에만** 값을 넣어 라벨을 그리게 한다 —
//   레포 파일 무접촉. 실제 화면에서는 시트 `수정일시` 또는 다음 정상 재빌드의 `built`가 이 자리를 채운다.
await page.evaluate(`(()=>{ try{ if(!BIZ_FIN.built)BIZ_FIN.built='2026-08-13 11:00'; }catch(_e){} try{_bizDeckGo('ov');}catch(_e){} try{_bizOvSetYear(${YEAR});}catch(_e){} })()`);
await page.waitForTimeout(1500);

const snap = () => page.evaluate(`(()=>{
  // ⚠ 좌 열만 보면 안 된다 — #809가 「분야별」 표를 **우측 레일로 옮겼다**(운영자 「분야별 표 이거 우측으로 보내줘」).
  const cards=[...document.querySelectorAll('#biz-main .bizm-card, #sales-rail .bizm-card')];
  // ⚠ 자리(index)로 잡지 않는다 — #807이 차트 카드를 앞에 넣어 자리가 밀렸다. 제목 글자로 고른다.
  const byT=(re)=>cards.find(c=>{const t=c.querySelector('.ct'); return t&&re.test(t.textContent);});
  const c1=byT(/사업\\s*결과/)||cards[0], c2=byT(/분야별/)||cards[cards.length-1];
  const head=(c)=>[...c.querySelectorAll('thead td')].map(t=>t.textContent.replace(/\\(단위:.*?\\)/,'').replace(/\\s+/g,' ').trim());
  const body=(c)=>[...c.querySelectorAll('tbody tr')].map(t=>[...t.children].map(d=>d.textContent.trim()));
  const asof=c1.querySelector('.ry-hd-asof');
  const chips=[...c2.querySelectorAll('.ry-live-tg')].map(b=>b.textContent.trim()+(b.getAttribute('aria-checked')==='true'?'*':''));
  // 카드가 속한 **그 열의** 유리 박스와 견준다(좌·우가 이제 다른 박스다).
  const col=c2.closest('#sales-rail')||document.querySelector('#biz-main');
  const cr=c2.getBoundingClientRect(), br=(col.querySelector('[data-bizmbox]')||document.querySelector('#biz-main [data-bizmbox]')).getBoundingClientRect();
  return {kpi:[...document.querySelectorAll('#biz-main .bizm-kpi')].map(k=>(k.querySelector('.lab').textContent+' '+k.querySelector('.val').textContent).replace(/\\s+/g,' ').trim()),
          c1head:head(c1), c1body:body(c1), asof:asof?asof.textContent.trim():null,
          c2head:head(c2), c2body:body(c2), chips,
          fitBottom:+(cr.bottom-br.bottom).toFixed(1), fitRight:+(cr.right-br.right).toFixed(1)};
})()`);

const s0 = await snap();
console.log('══ KPI ══'); s0.kpi.forEach(k => console.log('  ' + k));
console.log('\n══ 사업 결과 카드 ══');
console.log('  기준일 라벨: ' + (s0.asof || '(없음)'));
console.log('  머리: ' + s0.c1head.join(' · '));
console.log('  차액 열 남아있나: ' + (s0.c1head.includes('차액') ? '❌ 있음' : '✅ 없음'));
s0.c1body.forEach(r => console.log('    ' + r.join(' | ')));
console.log('\n══ 분야별 카드 ══');
console.log('  머리: ' + s0.c2head.join(' · '));
console.log('  선택자: ' + s0.chips.join(' / '));
for (const lab of ['공연', '전시', '예술교육']) {
  const btn = await page.$(`#sales-rail .ry-live-tg:text-is("${lab}"), #biz-main .bizm-card .ry-live-tg:text-is("${lab}")`);
  if (!btn) { console.log('\n  [' + lab + '] 선택자 없음'); continue; }
  await btn.click(); await page.waitForTimeout(600);
  const s = await snap();
  console.log('\n  ── ' + lab + ' (' + s.c2body.length + '건) · 카드가 유리박스 안쪽: 하단 ' + s.fitBottom + 'px · 우 ' + s.fitRight + 'px');
  s.c2body.slice(0, 8).forEach(r => console.log('     ' + r.map((v, i) => i === 1 ? v.padEnd(24) : v).join(' | ')));
  if (s.c2body.length > 8) console.log('     … 외 ' + (s.c2body.length - 8) + '건');
}
console.log('\npageerror ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' / ') : ''));
await browser.close();
