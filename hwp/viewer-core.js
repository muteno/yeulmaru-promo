// hwp/viewer-core.js — 한글문서(.hwp/.hwpx) 페이지 렌더 코어 (앱 임베드용)
//
// 출처: claw-hwp(https://github.com/DoHyun468/claw-hwp, MIT) 의
//   plugins/claw-hwp/skills/hwp/scripts/preview-viewer.js 렌더 파이프라인을
//   「툴바 DOM 결합 제거 + 임의 컨테이너에 그리기」 형태로만 재배치한 것.
//   렌더 로직·불변식은 원본 그대로 계승한다(창작 0). 상세 = hwp/NOTICE.md
//
// 원본이 명시한 불변식 — 고치지 말 것:
//   ① rhwp WASM 초기화 「전에」 globalThis.measureTextWidth 등록(텍스트 레이아웃이 호출).
//   ② 페이지 픽셀 총량을 MAX_CANVAS_PIXELS로 상한(대형 문서 GPU 메모리 보호).
//   ③ 렌더 루프 전에 getPageInfo 기하 스윕을 「전부 먼저」 — 섞으면 rhwp 내부 borrow가 샌다.
//   ④ renderPageToCanvas 직후 매번 getPageTextLayout(i) 호출(결과는 버림) —
//      이게 페이지 borrow를 푸는 부수효과다. 빼면 다음 렌더가 panic.
//   ⑤ 캔버스는 네이티브 페이지 픽셀로 1회 래스터, 리사이즈는 CSS 크기만 갱신(재래스터 없음).

// ── 1. measureTextWidth (rhwp init 전에 등록) ──────────────────────────────
{
  let ctx = null, lastFont = '';
  globalThis.measureTextWidth = (font, text) => {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    if (font !== lastFont) { ctx.font = font; lastFont = font; }
    return ctx.measureText(text).width;
  };
}

// ── 2. rhwp WASM (이 모듈 기준 상대경로 — GitHub Pages 서브패스에서도 동작) ──
const rhwpJsUrl = new URL('vendor/rhwp/rhwp.js', import.meta.url).href;
const rhwpWasmUrl = new URL('vendor/rhwp/rhwp_bg.wasm', import.meta.url).href;
const rhwp = await import(rhwpJsUrl);
await rhwp.default({ module_or_path: rhwpWasmUrl });

const MAX_CANVAS_PIXELS = 67_108_864;   // ≈ 8192 × 8192
function pickEffectiveDpr(pageW, pageH, rawDpr) {
  const phys = pageW * rawDpr * pageH * rawDpr;
  if (phys <= MAX_CANVAS_PIXELS) return rawDpr;
  const limited = Math.sqrt(MAX_CANVAS_PIXELS / (pageW * pageH));
  return Math.max(1, Math.floor(limited));
}

// 컨테이너 폭에 맞춰 CSS 크기만 갱신(재래스터 없음 — 불변식 ⑤).
export function fitPages(container, zoom) {
  const wraps = container.querySelectorAll('.hwp-page');
  if (!wraps.length) return;
  let maxPageW = 0;
  wraps.forEach((w) => {
    const c = w.querySelector('canvas');
    if (!c) return;
    const pw = parseFloat(c.dataset.pageWidth || '0');
    if (pw > maxPageW) maxPageW = pw;
  });
  const containerW = Math.max(0, container.clientWidth - 24);
  const natural = maxPageW > 0 ? maxPageW : 1100;
  const base = Math.max(240, Math.min(natural, containerW || natural, 1100));
  const avail = base * (zoom || 1);
  wraps.forEach((w) => {
    const c = w.querySelector('canvas');
    if (!c) return;
    const pageW = parseFloat(c.dataset.pageWidth || '0');
    const pageH = parseFloat(c.dataset.pageHeight || '0');
    if (pageW <= 0 || pageH <= 0) return;
    const ratio = avail / pageW;
    w.style.width = c.style.width = avail + 'px';
    w.style.height = c.style.height = (pageH * ratio) + 'px';
  });
}

/**
 * 문서 바이트를 container 안에 페이지 캔버스로 그린다.
 * @param {HTMLElement} container 렌더 대상(비워진다)
 * @param {Uint8Array} bytes .hwp/.hwpx 원본 바이트
 * @param {{zoom?:number, autoFix?:boolean}} [opt] autoFix = 원본 기본값 ON(reflowLinesegs)
 * @returns {{pageCount:number}}
 */
export function renderHwp(container, bytes, opt) {
  opt = opt || {};
  container.querySelectorAll('.hwp-page').forEach((n) => n.remove());
  const doc = new rhwp.HwpDocument(bytes);   // 파싱 실패 = throw (호출부가 안내)
  try {
    if (opt.autoFix !== false) {
      try { doc.reflowLinesegs(); } catch (e) { console.warn('[hwp] reflowLinesegs 실패:', e); }
    }
    const pageCount = doc.pageCount();

    // 불변식 ③ — 기하 스윕을 먼저 전부.
    const geoms = [];
    for (let i = 0; i < pageCount; i++) {
      try {
        const info = JSON.parse(doc.getPageInfo(i));
        geoms.push({ width: Number(info.width) || 0, height: Number(info.height) || 0 });
      } catch (e) { geoms.push({ width: 0, height: 0 }); }
    }

    const rawDpr = window.devicePixelRatio || 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < pageCount; i++) {
      const { width: pageW, height: pageH } = geoms[i];
      if (pageW <= 0 || pageH <= 0) continue;
      const scale = pickEffectiveDpr(pageW, pageH, rawDpr);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(pageW * scale);
      canvas.height = Math.round(pageH * scale);
      canvas.dataset.pageWidth = String(pageW);
      canvas.dataset.pageHeight = String(pageH);
      canvas.style.cssText = 'display:block;position:absolute;top:0;left:0;width:' + pageW + 'px;height:' + pageH + 'px;background:var(--surface-solid)';
      try { doc.renderPageToCanvas(i, canvas, scale); }
      catch (e) { console.error('[hwp] renderPageToCanvas(' + i + ') 실패:', e); continue; }
      try { JSON.parse(doc.getPageTextLayout(i)); } catch (e) {}   // 불변식 ④ — borrow 해제(값은 버림)

      const wrap = document.createElement('div');
      wrap.className = 'hwp-page';
      wrap.dataset.pageNum = String(i + 1);
      // flex:none — 부모가 flex 컬럼이면 기본 flex-shrink 가 페이지를 세로로 찌그러뜨린다(실측: 1122px → 1000px).
      wrap.style.cssText = 'position:relative;flex:none;background:var(--surface-solid);box-shadow:var(--glass-shadow);width:' + pageW + 'px;height:' + pageH + 'px';
      wrap.appendChild(canvas);
      frag.appendChild(wrap);
    }
    container.appendChild(frag);
    fitPages(container, opt.zoom);
    return { pageCount };
  } finally {
    if (typeof doc.free === 'function') doc.free();
  }
}
