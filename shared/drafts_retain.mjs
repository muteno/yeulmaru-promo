#!/usr/bin/env node
/**
 * drafts_retain.mjs — `drafts/` 산출물을 **기능별 최근 N개(기본 3)** 만 남기고 회수한다.
 *
 * 운영자 260805 지시: 「문서 최근 3개까지만 쌓이게 하고 안 쌓이게 해줘」.
 *
 * ⚠️ 왜 시간(TTL)이 아니라 **개수**인가 — 시간 기준이 두 가지 이유로 실패해 왔다:
 *   ① `nb-blog.yml` 은 블로그 초안(`nb*.json`)을 **아예 안 지운다**(코드 주석 「블로그 초안(nb*)은 무접촉」).
 *      260805 실측 = `drafts/` 에 nb 18건 + yc 1건 누적.
 *   ② `hwp-edit.yml`·`office-edit.yml` 의 TTL 검사는 `f.match(/^of(\d+)\./)` 로 **id 전체(16자리)** 를 잡는다.
 *      id = 접두 + `Date.now()`(13자리) + 난수(최대 3자리)라 ≈1.75e15 가 나오고 `now - 그것`이 늘 음수 →
 *      `> ttl` 이 **영영 참이 안 된다** = 회수가 한 번도 안 돌았다.
 *   개수 기준은 이 두 함정을 원천적으로 안 밟는다 — 시각은 **정렬에만** 쓰고 임계 비교를 안 한다.
 *
 * ⚠️ 이 레포는 **공개 레포**다(실측: `raw.githubusercontent.com` 비인증 GET 200). `drafts/` 에 남은 파일은
 *   누구나 받을 수 있다 → 남겨 두는 개수가 곧 노출 면적이다. 3개는 「직전 작업 재확인」용 최소치다.
 *
 * id 규약: `<2글자 접두><13자리 ms>[난수/기타]` — nb·yc(블로그·채팅) · hw(한글) · of(오피스) · sl(용량 줄이기).
 *   **13자리만** 시각으로 읽는다(위 ②의 재발 방지).
 *
 * 사용: node shared/drafts_retain.mjs [--keep 3] [--root .] [--json]
 *   워크플로에서는 커밋 직전에 호출한다(정기 크론 금지 — 이 레포는 정기 봇 커밋 축이 없다).
 */
import fs from 'fs';
import path from 'path';

export const DEFAULT_KEEP = 3;

// `drafts/` 바로 아래 = 폴링용 결과 JSON · `drafts/<sub>/` = 원본(.in)·결과(.out) 바이트
const SUBDIRS = ['hwp', 'office', 'slim'];
const ID_RE = /^([a-z]{2})(\d{13})/;   // 접두 + ms 13자리(그 뒤 난수는 안 읽는다)

function idOf(name) {
  const m = name.match(ID_RE);
  return m ? { prefix: m[1], ts: Number(m[2]) } : null;
}

/**
 * @param {object} opt
 * @param {string} opt.root   레포 루트
 * @param {number} opt.keep   기능(접두)별로 남길 개수
 * @param {string} [opt.protect] 이번 런의 id — 개수와 무관하게 절대 안 지운다
 * @param {boolean} [opt.dry]
 */
export function retainDrafts({ root = '.', keep = DEFAULT_KEEP, protect = '', dry = false } = {}) {
  const drafts = path.join(root, 'drafts');
  const removed = [], kept = [];
  if (!fs.existsSync(drafts)) return { removed, kept, keep };

  // ── 1) 접두별로 「남길 id 집합」을 먼저 정한다 (JSON 과 바이트가 따로 놀지 않게 한 번에 결정) ──
  const seen = new Map();   // prefix -> Map(idStr -> ts)
  const note = (name) => {
    const got = idOf(name);
    if (!got) return;
    const idStr = name.split('.')[0];
    if (!seen.has(got.prefix)) seen.set(got.prefix, new Map());
    seen.get(got.prefix).set(idStr, got.ts);
  };
  for (const f of fs.readdirSync(drafts)) {
    if (fs.statSync(path.join(drafts, f)).isDirectory()) continue;
    note(f);
  }
  for (const sub of SUBDIRS) {
    const d = path.join(drafts, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) note(f);
  }

  const survivors = new Set();
  for (const [prefix, ids] of seen) {
    const sorted = [...ids.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
    sorted.slice(0, keep).forEach(([idStr]) => survivors.add(idStr));
    kept.push({ prefix, total: sorted.length, kept: Math.min(keep, sorted.length) });
  }
  if (protect) survivors.add(protect);

  // ── 2) 살아남은 id 밖의 것은 전부 회수 ──
  const sweep = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) continue;
      const got = idOf(f);
      if (!got) continue;                       // 규약 밖 파일(사람이 둔 것)은 손대지 않는다
      const idStr = f.split('.')[0];
      // 원본(.in)은 결과가 나온 뒤 쓸모가 없다 — 살아남은 id 라도 이번 런 것이 아니면 회수(남의 문서 노출 최소화)
      const isInput = /\.in\.[A-Za-z0-9]+$/.test(f);
      const alive = survivors.has(idStr) && !(isInput && idStr !== protect);
      if (alive) continue;
      removed.push(path.relative(root, p));
      if (!dry) { try { fs.unlinkSync(p); } catch (e) {} }
    }
  };
  sweep(drafts);
  for (const sub of SUBDIRS) {
    const d = path.join(drafts, sub);
    if (fs.existsSync(d)) sweep(d);
  }
  return { removed, kept, keep };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const r = retainDrafts({
    root: arg('root', '.'),
    keep: Number(arg('keep', DEFAULT_KEEP)) || DEFAULT_KEEP,
    protect: arg('protect', ''),
    dry: process.argv.includes('--dry'),
  });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r));
  else {
    for (const k of r.kept) console.log(`  ${k.prefix}: ${k.total}건 중 최근 ${k.kept}건 유지`);
    console.log(`  회수 ${r.removed.length}건${r.removed.length ? ' — ' + r.removed.slice(0, 8).join(', ') + (r.removed.length > 8 ? ' …' : '') : ''}`);
  }
}
