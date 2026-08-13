// [scratch · 260813-2] 「사업 결과」 제목 ↔ 우측 기준일 라벨의 **광학 잉크 수평** 실측.
//   운영자 지시: 「사업 결과라는 말하고 광학 잉크 단위로 수평이게 픽셀 측정」
//   방법 = 260804 2차(`.ry-hd-tools` 7.38px 어긋남을 잡은 그 자)와 같은 자:
//     ① DPR 4로 `.ct` 줄을 캡처 → ② 그 PNG를 페이지 안 canvas에 도로 그려 화소를 읽고
//     ③ 제목 x범위·라벨 x범위 각각에서 **칠해진 화소만** 스캔해 잉크 상·하단과 중심을 낸다 → ④ Δ 보고.
//   레이아웃 상자(getBoundingClientRect)로는 못 잡는다 — 글자 크기가 다르면 상자 중심과 잉크 중심이 어긋난다.
//   실행: node tools/scratch/ink_asof.mjs [연도]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const YEAR = Number(process.argv[2] || 2025);
const DPR = 4;

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

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: DPR });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
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
await page.evaluate(`(()=>{ try{ if(!BIZ_FIN.built)BIZ_FIN.built='2026-08-13 11:00'; }catch(_e){} try{ _bizDeckGo('ov'); }catch(_e){} try{ _bizOvSetYear(${YEAR}); }catch(_e){} })()`);
await page.waitForTimeout(1800);

// ── ① 두 잉크의 x범위와 캡처할 줄(.ct)의 CSS 좌표 ────────────────────────────────
const geo = await page.evaluate(`(()=>{
  // ⚠ 첫 카드로 잡으면 안 된다 — #807이 **차트 카드를 앞에** 넣었다. 제목 글자로 고른다.
  const card=[...document.querySelectorAll('#biz-main .bizm-card')].find(c=>{
    const t=c.querySelector('.ct'); return t && /사업\\s*결과/.test(t.textContent); });
  if(!card) return {err:'카드 없음'};
  const ct=card.querySelector('.ct'); const as=ct&&ct.querySelector('.ry-hd-asof');
  if(!ct) return {err:'.ct 없음'};
  if(!as) return {err:'.ry-hd-asof 없음 — 기준일 라벨이 안 그려졌다'};
  // 제목 글자만의 상자 = .ct의 **텍스트 노드**에 Range를 걸어 잰다(불릿 .ct-bul·라벨 제외).
  let tnode=null;
  for(const n of ct.childNodes){ if(n.nodeType===3 && n.textContent.trim()){ tnode=n; break; } }
  if(!tnode) return {err:'제목 텍스트 노드 없음'};
  const rg=document.createRange(); rg.selectNodeContents(tnode);
  const tr=rg.getBoundingClientRect(), ar=as.getBoundingClientRect(), cr=ct.getBoundingClientRect();
  const cs=getComputedStyle(as), ts=getComputedStyle(ct);
  return {ct:{x:cr.x,y:cr.y,w:cr.width,h:cr.height},
          title:{x:tr.x,y:tr.y,w:tr.width,h:tr.height,text:tnode.textContent.trim(),font:ts.fontSize+'/'+ts.fontWeight},
          asof:{x:ar.x,y:ar.y,w:ar.width,h:ar.height,text:as.textContent.trim(),font:cs.fontSize+'/'+cs.fontWeight}};
})()`);
if (geo.err) { console.log('MEASURE FAIL:', geo.err); await browser.close(); process.exit(1); }

// ── ② .ct 줄을 DPR 4로 캡처 ───────────────────────────────────────────────────
const pad = 6;
const clip = { x: geo.ct.x - pad, y: geo.ct.y - pad, width: geo.ct.w + pad * 2, height: geo.ct.h + pad * 2 };
const png = await page.screenshot({ clip });
const b64 = png.toString('base64');

// ── ③ 화소 스캔 — 칠해진 것만 ──────────────────────────────────────────────────
const ink = await page.evaluate(async (a) => {
  try{
  const {b64,clip,geo,DPR}=a;
  const img=new Image();
  await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej(new Error('PNG 로드 실패')); img.src='data:image/png;base64,'+b64; });
  const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
  const cx=cv.getContext('2d'); cx.drawImage(img,0,0);
  const D=cx.getImageData(0,0,cv.width,cv.height).data;
  const lum=(i)=>0.2126*D[i]+0.7152*D[i+1]+0.0722*D[i+2];
  // 배경 광도 = 최빈값(카드 흰 바닥). 잉크 = 배경보다 thr 이상 어두운 화소.
  const hist=new Array(256).fill(0);
  for(let i=0;i<D.length;i+=4) hist[Math.round(lum(i))]++;
  let bg=0,bc=-1; for(let v=0;v<256;v++) if(hist[v]>bc){bc=hist[v];bg=v;}
  // CSS 좌표 → 캡처 이미지 화소 좌표
  const toPx=(cssX)=>Math.round((cssX-clip.x)*DPR);
  // ⚠ 세로 스캔은 **`.ct` 상자 안으로 못 박는다** — #807이 위에 차트 카드를 넣은 뒤로 캡처 여백에
  //   그 카드의 잉크(테두리·글자)가 딸려 들어와 두 잉크가 모두 y=0에서 시작하는 것으로 잡혔다.
  const toPxY=(cssY)=>Math.round((cssY-clip.y)*DPR);
  const yLo=Math.max(0,toPxY(geo.ct.y)), yHi=Math.min(cv.height,toPxY(geo.ct.y+geo.ct.h));
  function scan(box,thr){
    const x0=Math.max(0,toPx(box.x)), x1=Math.min(cv.width,toPx(box.x+box.w));
    let top=-1,bot=-1,n=0;
    for(let y=yLo;y<yHi;y++){
      let hit=false;
      for(let x=x0;x<x1;x++){ const i=(y*cv.width+x)*4; if(D[i+3]>8 && lum(i)<bg-thr){hit=true;n++;} }
      if(hit){ if(top<0)top=y; bot=y; }
    }
    if(top<0) return null;
    return {top:top/DPR,bot:(bot+1)/DPR,center:((top+bot+1)/2)/DPR,px:n,x0:x0/DPR,x1:x1/DPR};
  }
  const out={bg};
  for(const thr of [30,60,90]){
    const t=scan(geo.title,thr), s=scan(geo.asof,thr);
    out['thr'+thr]={title:t,asof:s,delta:(t&&s)?+(s.center-t.center).toFixed(3):null};
  }
  return out;
  }catch(e){ return {err:String(e&&e.message||e)}; }
}, { b64, clip, geo, DPR });
if (ink.err) { console.log('SCAN FAIL:', ink.err); await browser.close(); process.exit(1); }

console.log('── 기하(CSS px) ──');
console.log('  제목 「' + geo.title.text + '」 ' + geo.title.font + '  box y ' + geo.title.y.toFixed(2) + '~' + (geo.title.y + geo.title.h).toFixed(2) + ' (중심 ' + (geo.title.y + geo.title.h / 2).toFixed(2) + ')');
console.log('  라벨 「' + geo.asof.text + '」 ' + geo.asof.font + '  box y ' + geo.asof.y.toFixed(2) + '~' + (geo.asof.y + geo.asof.h).toFixed(2) + ' (중심 ' + (geo.asof.y + geo.asof.h / 2).toFixed(2) + ')');
console.log('── 잉크 실측(DPR ' + DPR + ' · 캡처 원점 기준 CSS px · 배경광도 ' + ink.bg + ') ──');
for (const thr of [30, 60, 90]) {
  const o = ink['thr' + thr];
  if (!o.title || !o.asof) { console.log('  thr' + thr + ': 잉크 못 찾음'); continue; }
  console.log('  thr' + String(thr).padStart(2) + '  제목 잉크 ' + o.title.top.toFixed(2) + '~' + o.title.bot.toFixed(2) + ' 중심 ' + o.title.center.toFixed(3)
    + '  |  라벨 잉크 ' + o.asof.top.toFixed(2) + '~' + o.asof.bot.toFixed(2) + ' 중심 ' + o.asof.center.toFixed(3)
    + '  |  Δ ' + (o.delta > 0 ? '+' : '') + o.delta.toFixed(3) + 'px');
}
const d = ink.thr60 && ink.thr60.delta;
console.log('── 판정 ──');
console.log(d == null ? '  측정 실패' : (Math.abs(d) <= 0.5 ? '  ✅ 광학 수평 (|Δ| ' + Math.abs(d).toFixed(3) + ' ≤ 0.5px)' : '  ❌ 어긋남 Δ ' + d.toFixed(3) + 'px — 라벨을 ' + (d > 0 ? '위로' : '아래로') + ' ' + Math.abs(d).toFixed(3) + 'px 올려야 한다'));
if (errs.length) console.log('PAGEERROR:', errs.slice(0, 5));
await browser.close();
