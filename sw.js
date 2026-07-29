/* 예울마루 대시보드 — 접속 안정용 서비스워커
 *
 * 왜 있나: 서빙이 GitHub Pages라 배포 순간·회선 흔들림·일시 장애 때
 *          "오류 페이지"가 그대로 사용자에게 노출된다. 이 워커가 마지막에
 *          성공한 화면을 캐시로 들고 있다가 그때 대신 내준다.
 *
 * 원칙
 *  1) HTML = 네트워크 우선. 항상 최신을 먼저 시도하고, 실패하거나 서버가
 *     5xx를 주면 그때만 캐시본을 내준다 → "업데이트가 안 된다" 사고 없음.
 *  2) 정적 자산 = 캐시 우선 + 백그라운드 갱신(stale-while-revalidate).
 *  3) API·외부 출처(workers.dev, MS Graph 등) = 손대지 않는다. 실데이터는
 *     절대 캐시하지 않는다.
 *
 * ▶ 롤백(회수) 방법: 이 파일 전체를 아래 킬스위치로 교체해 push 하면,
 *   다음 방문 때 각 기기에서 워커가 스스로 등록 해제되고 캐시를 지운다.
 *     self.addEventListener('install', () => self.skipWaiting());
 *     self.addEventListener('activate', e => e.waitUntil((async () => {
 *       for (const k of await caches.keys()) await caches.delete(k);
 *       await self.registration.unregister();
 *       for (const c of await self.clients.matchAll()) c.navigate(c.url);
 *     })()));
 */

const V = 'ym-v1';
const SHELL = V + '-shell';   // 문서(HTML)
const ASSET = V + '-asset';   // 정적 자산
const KEEP = [SHELL, ASSET];

const NET_TIMEOUT = 6000;     // HTML 응답을 이만큼 기다린 뒤엔 캐시본으로 먼저 그린다

// 캐시해도 되는 확장자(화이트리스트) — 목록 밖은 그냥 통과시킨다
const CACHEABLE = /\.(?:html|js|mjs|css|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf)$/i;
// 대용량·기계 자산은 캐시 금지(스토리지 폭발 방지: ort-wasm 13MB, u2netp 4.5MB 등)
const NEVER = /^\/(?:cutout|reference|drafts|_versions|docs)\//i;
// 신선도가 생명인 데이터 — 네트워크 우선
const FRESH = /^\/(?:data\/|signage\/manifest\.json)/i;

self.addEventListener('install', event => {
  self.skipWaiting();
  // 방금 받아온 문서를 곧바로 캐시에 심어 둔다(첫 방문 직후 장애도 커버).
  // cache:'default' — 브라우저 HTTP 캐시를 재사용하므로 2MB를 다시 받지 않는다.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL);
      const root = new URL('./', self.location).pathname;
      const res = await fetch(root, { cache: 'default' });
      if (res && res.ok) await cache.put(root, res);
    } catch (e) { /* 첫 설치 실패는 치명적이지 않다 — 다음 방문에 다시 채운다 */ }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (!KEEP.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // POST/DELETE = API, 통과
  if (req.headers.has('range')) return;                   // 부분 요청(미디어) 통과

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;        // 외부 API·CDN 전부 통과
  if (NEVER.test(url.pathname)) return;

  if (req.mode === 'navigate') { event.respondWith(documentFirst(req)); return; }
  if (FRESH.test(url.pathname)) { event.respondWith(freshFirst(req)); return; }
  if (CACHEABLE.test(url.pathname)) { event.respondWith(staleWhileRevalidate(req)); return; }
});

/* 문서: 네트워크 우선 → 타임아웃·통신실패·서버오류(5xx)면 캐시본 */
async function documentFirst(req) {
  const cache = await caches.open(SHELL);
  const key = new URL(req.url).pathname;                  // ?qa=1 등 쿼리는 키에서 뺀다
  const net = fetch(req).then(res => {
    if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  });

  let res = null;
  try {
    res = await Promise.race([net, sleep(NET_TIMEOUT).then(() => null)]);
  } catch (e) { res = null; }

  // 타임아웃 — 캐시본이 있으면 먼저 그려준다(네트워크는 계속 돌아 캐시를 갱신한다)
  if (res === null) {
    const hit = await cache.match(key);
    if (hit) return hit;
    try { res = await net; } catch (e) { res = null; }
  }

  if (res) {
    if (res.ok) return res;
    if (res.status !== 404) {                             // 404는 진짜 없는 경로 → 그대로
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    return res;
  }

  const hit = await cache.match(key);
  if (hit) return hit;
  return offlineResponse();
}

/* 데이터: 네트워크 우선, 실패 시에만 캐시 */
async function freshFirst(req) {
  const cache = await caches.open(ASSET);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    if (res && res.ok) return res;
    const hit = await cache.match(req);
    return hit || res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

/* 정적 자산: 캐시 즉시 반환 + 뒤에서 갱신 */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSET);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  throw new Error('offline: ' + req.url);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 캐시도 네트워크도 없을 때만 나오는 최후 화면 */
function offlineResponse() {
  const html = '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>연결이 끊겼어요</title>'
    + '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:22rem;margin:20vh auto;padding:0 1.5rem;text-align:center;line-height:1.7">'
    + '<p style="font-size:1.1rem;font-weight:600">지금 인터넷에 연결할 수 없어요</p>'
    + '<p style="opacity:.7;font-size:.9rem">연결이 돌아오면 마지막 화면이 그대로 다시 열립니다.</p>'
    + '<button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.4rem;border:0;border-radius:10px;background:#1A1A2E;color:#fff;font-size:.95rem;cursor:pointer">다시 시도</button>'
    + '</div>';
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
