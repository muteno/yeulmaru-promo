var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var tokenCache = { token: null, expires: 0 };
var SP = {
  siteHost: "gscaltexyeulmaru.sharepoint.com",
  sitePath: "/sites/daxteam",
  fileName: "\uD1B5\uD569 \uBB38\uC11C1.xlsm",
  sheetName: "\uD64D\uBCF4\uAE30\uB85D",
  programSheetName: "\uD504\uB85C\uADF8\uB7A8",
  logSheetName: "\uB85C\uADF8"
};
// 시트 slug ↔ 한글 시트 이름 매핑
var SHEET_MAP = {
  "platform": "\uD50C\uB7AB\uD3FC",
  "content": "\uCF58\uD150\uCE20",
  "manager": "\uB2F4\uB2F9\uC790",
  "program": "\uD504\uB85C\uADF8\uB7A8",
  "log": "\uB85C\uADF8",
  "special": "PromoSpecial",
  "applysettings": "\uD64D\uBCF4\uC811\uC218\uC124\uC815"
};
var fileCache = { driveId: null, itemId: null, expires: 0 };

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Password, X-Sub-Admin-PIN",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) }
  });
}
__name(json, "json");

function roleOf(pw, env) {
  if (pw === env.APP_PASSWORD) return "user";
  if (pw === env.ADMIN_PASSWORD) return "admin";
  return null;
}
__name(roleOf, "roleOf");

function isAdmin(pw, env) {
  return pw === env.ADMIN_PASSWORD;
}
__name(isAdmin, "isAdmin");

// === Boolean flag 인식 (시트 값 → true/false) ===
function isFlagOn(v) {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return /^(true|1|y|yes|o|on|active|\u2713|\u2714|\uD65C\uC131|\uC608|\uC0AC\uC6A9|\uAC00\uB2A5|t)$/.test(s);
  }
  return false;
}
__name(isFlagOn, "isFlagOn");

// [260613] 앞자리 0이 숫자 서식으로 소실된 PIN(예: 시트 923 ← 실제 0923) 보정 — 4자리 zero-pad 정규화
function _pin4(v) {
  const s = String(v == null ? "" : v).trim();
  return /^\d{1,4}$/.test(s) ? s.padStart(4, "0") : s;
}
__name(_pin4, "_pin4");

// === 담당자 시트 캐시 (서브 admin 인증용, 5분 TTL) ===
var managerCache = { rows: null, expires: 0 };
async function getManagersCached(token) {
  if (managerCache.rows && Date.now() < managerCache.expires) return managerCache.rows;
  const { rows } = await handleGetSheet(token, "\uB2F4\uB2F9\uC790");
  managerCache = { rows, expires: Date.now() + 5 * 60 * 1000 };
  return rows;
}
__name(getManagersCached, "getManagersCached");

// === 시트 GET 캐시 (읽기 전용 라우팅 전용 — 성능) ===
// ⚠️ handleAddSheetRow/handleAddRecord 등이 내부에서 handleGetSheet/handleGetRecords를 직접 호출해
//    다음 행 번호(nextRow)를 계산한다 → 그 경로는 절대 캐시를 타면 안 됨(stale → 남의 행 덮어쓰기).
//    그래서 캐시는 GET 응답 라우팅에서만 사용하고, 쓰기 핸들러 내부 조회는 캐시를 우회한다.
// ⚠️ records는 신청/변경이 잦고 즉시 반영돼야 해 캐시하지 않음(/api/records는 handleGetRecords 그대로).
// ⚠️ Cloudflare Worker는 isolate별 in-memory라 무효화가 100% 즉시 전파되진 않음(최악 TTL 만큼 지연).
//    → 거의 안 바뀌는 마스터는 5분, 변동성 있는 special/applysettings는 30초로 차등.
var TTL_MASTER = 5 * 60 * 1000, TTL_SHORT = 30 * 1000;
var TTL_BY_SLUG = { platform: TTL_MASTER, content: TTL_MASTER, manager: TTL_MASTER, program: TTL_MASTER, special: TTL_SHORT, applysettings: TTL_SHORT };
var sheetCache = {};       // slug -> { data, expires }
var programsCache = { data: null, expires: 0 };
var opsCache = {};         // opsSheetName -> { data, expires }
async function getSheetCached(token, sheetName, slug) {
  const c = sheetCache[slug];
  if (c && Date.now() < c.expires) return c.data;
  const data = await handleGetSheet(token, sheetName);
  sheetCache[slug] = { data, expires: Date.now() + (TTL_BY_SLUG[slug] || TTL_SHORT) };
  return data;
}
__name(getSheetCached, "getSheetCached");
async function getProgramsCached(token) {
  if (programsCache.data && Date.now() < programsCache.expires) return programsCache.data;
  const data = await handleGetPrograms(token);
  programsCache = { data, expires: Date.now() + TTL_MASTER };
  return data;
}
__name(getProgramsCached, "getProgramsCached");
async function getOpsCached(token, opsName) {
  const c = opsCache[opsName];
  if (c && Date.now() < c.expires) return c.data;
  const data = await handleGetSheet(token, opsName);
  opsCache[opsName] = { data, expires: Date.now() + TTL_MASTER };
  return data;
}
__name(getOpsCached, "getOpsCached");
function invalidateSheetCache(slug) {
  if (slug) delete sheetCache[slug];
  if (slug === "program") programsCache = { data: null, expires: 0 };
  if (slug === "manager") managerCache = { rows: null, expires: 0 };  // checkAdmin 즉시 반영
}
__name(invalidateSheetCache, "invalidateSheetCache");

// === Admin 권한 통합 검증 (슈퍼 admin OR 서브 admin) ===
// 슈퍼: X-App-Password = ADMIN_PASSWORD
// 서브: X-App-Password = APP_PASSWORD AND X-Sub-Admin-PIN 매칭 + 관리자여부=true + 휴직 아님
async function checkAdmin(request, env, token) {
  const pw = request.headers.get("X-App-Password");
  if (pw === env.ADMIN_PASSWORD) return { admin: true, super: true, userName: null };
  if (pw !== env.APP_PASSWORD) return { admin: false };
  const pin = request.headers.get("X-Sub-Admin-PIN");
  if (!pin) return { admin: false };
  const rows = await getManagersCached(token);
  const user = rows.find((r) =>
    _pin4(r["PIN"]) === _pin4(pin) &&
    isFlagOn(r["\uAD00\uB9AC\uC790\uC5EC\uBD80"]) &&
    !isFlagOn(r["\uD734\uC9C1\uC5EC\uBD80"])
  );
  if (user) return { admin: true, super: false, userName: user["\uB2F4\uB2F9\uC790"] };
  return { admin: false };
}
__name(checkAdmin, "checkAdmin");

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
__name(colLetter, "colLetter");

// KST 시각 → "YYYY-MM-DD HH:MM:SS" 텍스트
function kstNowText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const Y = kst.getUTCFullYear();
  const M = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const D = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const m = String(kst.getUTCMinutes()).padStart(2, "0");
  const s = String(kst.getUTCSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
__name(kstNowText, "kstNowText");

async function getToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;
  const resp = await fetch(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.AZURE_CLIENT_ID, client_secret: env.AZURE_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
  });
  if (!resp.ok) throw new Error(`Token error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1e3 };
  return data.access_token;
}
__name(getToken, "getToken");

async function graphGet(token, path) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((res) => setTimeout(res, 200 * attempt));
    let r;
    try {
      r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      lastErr = e;
      continue;
    }
    if (r.ok) return r.json();
    const text = await r.text();
    const err = new Error(`Graph GET ${r.status}: ${text}`);
    if (r.status === 429 || r.status === 423 || r.status >= 500) { lastErr = err; continue; }
    throw err;
  }
  throw lastErr;
}
__name(graphGet, "graphGet");

async function graphPatch(token, path, body) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Graph PATCH ${r.status}: ${await r.text()}`);
  return r.json();
}
__name(graphPatch, "graphPatch");

// [260724] graphPatch + transient(429/423/5xx) 재시도(graphGet과 동일 백오프). 홍보노출 플래그 single-cell write 견고화용.
async function graphPatchRetry(token, path, body) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((res) => setTimeout(res, 200 * attempt));
    try { return await graphPatch(token, path, body); }
    catch (e) {
      lastErr = e;
      const m = String((e && e.message) || "").match(/PATCH (\d+)/);
      const st = m ? parseInt(m[1]) : 0;
      if (st === 429 || st === 423 || st >= 500) continue;   // transient만 재시도, 4xx 등은 즉시 throw
      throw e;
    }
  }
  throw lastErr;
}
__name(graphPatchRetry, "graphPatchRetry");

async function findFile(token) {
  if (fileCache.driveId && Date.now() < fileCache.expires) return { driveId: fileCache.driveId, itemId: fileCache.itemId };
  const site = await graphGet(token, `/sites/${SP.siteHost}:${SP.sitePath}`);
  const drives = await graphGet(token, `/sites/${site.id}/drives`);
  for (const drive of drives.value) {
    try {
      const search = await graphGet(token, `/drives/${drive.id}/root/search(q='${encodeURIComponent(SP.fileName)}')`);
      const file = search.value.find((f) => f.name === SP.fileName);
      if (file) {
        fileCache = { driveId: drive.id, itemId: file.id, expires: Date.now() + 18e5 };
        return { driveId: drive.id, itemId: file.id };
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error("File not found: " + SP.fileName);
}
__name(findFile, "findFile");

function sheetPath(driveId, itemId) {
  return `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(SP.sheetName)}')`;
}
__name(sheetPath, "sheetPath");

function sheetPathFor(driveId, itemId, sheetName) {
  return `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')`;
}
__name(sheetPathFor, "sheetPathFor");

// === 로그 기록 헬퍼 (실패 시 본 작업 막지 않음) ===
async function logToSheet(token, role, action, targetSheet, targetRow, summary) {
  try {
    const { driveId, itemId } = await findFile(token);
    const data = await graphGet(token, `${sheetPathFor(driveId, itemId, SP.logSheetName)}/usedRange`);
    const existingRows = (data.values && data.values.length) ? data.values.length : 1;
    const nextRow = existingRows + 1;
    // 마지막 NO + 1
    let nextNo = 1;
    if (data.values && data.values.length > 1) {
      for (let i = data.values.length - 1; i >= 1; i--) {
        const n = Number(data.values[i][0]);
        if (!isNaN(n) && n > 0) { nextNo = n + 1; break; }
      }
    }
    const values = [
      nextNo,
      kstNowText(),
      role || "",
      action || "",
      targetSheet || "",
      targetRow || "",
      summary || "",
      ""
    ];
    const lastCol = colLetter(values.length);
    await graphPatch(token, `${sheetPathFor(driveId, itemId, SP.logSheetName)}/range(address='A${nextRow}:${lastCol}${nextRow}')`, { values: [values] });
  } catch (e) {
    console.error("[logToSheet]", e.message);
  }
}
__name(logToSheet, "logToSheet");

// 값 배열 → 요약 텍스트 (첫 의미있는 값 2개 정도)
function summarize(values) {
  if (!Array.isArray(values)) return "";
  const meaningful = values.filter(v => v !== "" && v !== null && v !== undefined);
  if (!meaningful.length) return "";
  return meaningful.slice(0, 3).map(v => String(v).slice(0, 40)).join(" | ");
}
__name(summarize, "summarize");

// === 홍보기록 (PlanData) ===
async function handleGetRecords(token) {
  const { driveId, itemId } = await findFile(token);
  // [로딩 성능] $select — usedRange가 기본으로 values 외 text·formulas·numberFormat·valueTypes까지 동일 크기 배열로 5~7겹 실어보냄. 코드는 data.values만 쓰므로 값·크기만 선택해 페이로드 다이어트(홍보기록 누적분 전송량↓, 운영자 260709). ⚠️ Cloudflare 재배포 필요.
  const data = await graphGet(token, `${sheetPath(driveId, itemId)}/usedRange?$select=values,rowCount,columnCount`);
  const records = [];
  if (data.values && data.values.length > 1) {
    const headers = data.values[0];
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i];
      if (!row[0] && !row[2] && !row[11]) continue;
      const rec = {};
      headers.forEach((h, j) => { rec[h] = row[j]; });
      rec._rowIndex = i + 1;
      records.push(rec);
    }
  }
  return records;
}
__name(handleGetRecords, "handleGetRecords");

async function handleAddRecord(token, body, role) {
  const { driveId, itemId } = await findFile(token);
  const records = await handleGetRecords(token);
  const nextRow = records.length > 0 ? Math.max(...records.map((r) => r._rowIndex)) + 1 : 2;
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPath(driveId, itemId)}/range(address='A${nextRow}:${lastCol}${nextRow}')`, { values: [body.values] });
  await logToSheet(token, role, "CREATE", "\uD64D\uBCF4\uAE30\uB85D", nextRow, summarize(body.values));
  return { ok: true, row: nextRow };
}
__name(handleAddRecord, "handleAddRecord");

async function handleUpdateRecord(token, row, body, role) {
  const { driveId, itemId } = await findFile(token);
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPath(driveId, itemId)}/range(address='A${row}:${lastCol}${row}')`, { values: [body.values] });
  await logToSheet(token, role, "UPDATE", "\uD64D\uBCF4\uAE30\uB85D", row, summarize(body.values));
  return { ok: true };
}
__name(handleUpdateRecord, "handleUpdateRecord");

async function handleDeleteRecord(token, row, role) {
  const { driveId, itemId } = await findFile(token);
  const data = await graphGet(token, `${sheetPath(driveId, itemId)}/usedRange`);
  const numCols = (data.values && data.values[0]) ? data.values[0].length : 17;
  const lastCol = colLetter(numCols);
  await graphPatch(token, `${sheetPath(driveId, itemId)}/range(address='A${row}:${lastCol}${row}')`, { values: [Array(numCols).fill("")] });
  await logToSheet(token, role, "DELETE", "\uD64D\uBCF4\uAE30\uB85D", row, "");
  return { ok: true };
}
__name(handleDeleteRecord, "handleDeleteRecord");

// === 프로그램 시트 - PERFS 로드용 ===
async function handleGetPrograms(token) {
  const { driveId, itemId } = await findFile(token);
  // [로딩 성능] $select — usedRange 페이로드 다이어트(코드는 data.values만 사용, 260709)
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, SP.programSheetName)}/usedRange?$select=values,rowCount,columnCount`);
  const programs = [];
  if (data.values && data.values.length > 1) {
    const headers = data.values[0];
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i];
      if (row[0] === "" || row[0] === null || row[0] === undefined) continue;
      const prog = {};
      headers.forEach((h, j) => { prog[h] = row[j]; });
      programs.push(prog);
    }
  }
  return programs;
}
__name(handleGetPrograms, "handleGetPrograms");

// === 일반화된 시트 CRUD (마스터 관리용) ===
async function handleGetSheet(token, sheetName) {
  const { driveId, itemId } = await findFile(token);
  // [로딩 성능] $select — usedRange 페이로드 다이어트(코드는 data.values만 사용 · 판매현황 6시트에 ×6 효과, 260709)
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, sheetName)}/usedRange?$select=values,rowCount,columnCount`);
  const rows = [];
  const headers = (data.values && data.values[0]) ? data.values[0] : [];
  if (data.values && data.values.length > 1) {
    for (let i = 1; i < data.values.length; i++) {
      const row = data.values[i];
      if (row.every((c) => c === "" || c === null || c === undefined)) continue;
      const obj = {};
      headers.forEach((h, j) => { obj[h] = row[j]; });
      obj._rowIndex = i + 1;
      rows.push(obj);
    }
  }
  return { headers, rows };
}
__name(handleGetSheet, "handleGetSheet");

async function handleAddSheetRow(token, sheetName, body, role, slug) {
  const { driveId, itemId } = await findFile(token);
  const { headers, rows } = await handleGetSheet(token, sheetName);
  const nextRow = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${nextRow}:${lastCol}${nextRow}')`, { values: [body.values] });
  // [260724] 프로그램 홍보 ON/OFF 플래그 = '홍보노출' 열 단일 셀로 별도 기록(본 A~M 저장과 분리 → N~Q 운영자 수동열 무접촉). best-effort: 실패해도 본 저장 유지.
  //   [260729] sideCells(회차·장르)도 같은 라인 — 프로그램 폼이 보낸 부가열을 한 번에 기록. ([260803] 구 수익성 부가열 = 축 폐지)
  if (slug === "program" && (body.promoFlag != null || body.sideCells)) {
    try { await writeProgramSideCells(token, driveId, itemId, sheetName, nextRow, Object.assign({}, body.sideCells || {}, body.promoFlag != null ? { "홍보노출": body.promoFlag } : {}), headers); }
    catch (e) { console.error("program side cells write (add)", e); }
  }
  if (slug !== "log") await logToSheet(token, role, "CREATE", sheetName, nextRow, summarize(body.values));
  invalidateSheetCache(slug);
  return { ok: true, row: nextRow };
}
__name(handleAddSheetRow, "handleAddSheetRow");

async function handleUpdateSheetRow(token, sheetName, row, body, role, slug) {
  const { driveId, itemId } = await findFile(token);
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${row}:${lastCol}${row}')`, { values: [body.values] });
  // [260724] 홍보 ON/OFF 플래그 = '홍보노출' 열 단일 셀 별도 기록(N~Q 무접촉). best-effort: 실패해도 본 A~M 저장은 이미 성공.
  //   [260729] sideCells(회차·장르)도 동승 — add 경로와 쌍둥이(동시 수정 의무). ([260803] 구 수익성 부가열 = 축 폐지)
  if (slug === "program" && (body.promoFlag != null || body.sideCells)) {
    try { await writeProgramSideCells(token, driveId, itemId, sheetName, row, Object.assign({}, body.sideCells || {}, body.promoFlag != null ? { "홍보노출": body.promoFlag } : {})); }
    catch (e) { console.error("program side cells write (update)", e); }
  }
  if (slug !== "log") await logToSheet(token, role, "UPDATE", sheetName, row, summarize(body.values));
  invalidateSheetCache(slug);
  return { ok: true };
}
__name(handleUpdateSheetRow, "handleUpdateSheetRow");

// [260724] 프로그램 부가열(홍보노출·회차·장르)을 그 열 단일 셀에만 기록 — 본 A~M 위치 저장과 분리해 N~Q(구분=장르 등 운영자 수동열)를 어떤 write 범위에도 넣지 않음(물리적 무접촉).
//   헤더가 없으면 맨 끝(1행)에 자동 보강(예측제외·임시저장과 동일 이행 → 배포만으로 활성, 운영자 수동 스텝 0). 호출부가 try/catch(best-effort).
//   [260729] 구 writeProgramPromoFlag를 열 이름 목록으로 범용화 — '회차'(프로그램별 공연 횟수)·'장르'가 같은 라인을 그대로 탄다. ([260803] 구 '수익성' 부가열 = 예술성/사업성 축 폐지로 은퇴)
//   pairs = { 홍보노출:'Y', 회차:'3', 장르:'클래식' } — 값이 undefined/null인 키는 건너뛴다(빈 문자열은 '지움'이라 기록한다).
async function writeProgramSideCells(token, driveId, itemId, sheetName, row, pairs, knownHeaders) {
  const names = Object.keys(pairs || {}).filter((k) => pairs[k] !== undefined && pairs[k] !== null);
  if (!names.length) return;
  let headers = knownHeaders;
  if (!headers) {
    const hdr = await graphGet(token, `${sheetPathFor(driveId, itemId, sheetName)}/usedRange?$select=values`);
    headers = (hdr.values && hdr.values[0]) ? hdr.values[0] : [];
  }
  headers = headers.slice();   // 헤더 보강분을 지역 사본에만 반영(호출부 배열 오염 방지)
  for (const name of names) {
    let idx = headers.indexOf(name);   // 0-based col index
    if (idx < 0) {
      // [평의회] 보강 위치를 usedRange 폭이 아니라 '스키마 예약 블록 뒤'로 하드 고정 — A~M(폼 13) + N~Q(운영자 수동 4) = A~Q(1~17) 예약.
      //   맨 오른쪽 수동열(N~Q)이 비어 usedRange가 M~P에서 끊겨도 새 열이 N~Q(14~17) 안으로 절대 안 들어가게 하한 17(→ colLetter(18)=R열) 적용 = N~Q 무접촉 불변식 보장.
      idx = Math.max(headers.length, 17);
      const hc = colLetter(idx + 1);
      await graphPatchRetry(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='${hc}1:${hc}1')`, { values: [[name]] });
      while (headers.length < idx) headers.push("");   // 사본 폭 맞추기 — 같은 호출에서 2개째 열이 같은 자리에 겹쳐 쓰이는 것 차단
      headers[idx] = name;
    }
    const fc = colLetter(idx + 1);
    await graphPatchRetry(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='${fc}${row}:${fc}${row}')`, { values: [[pairs[name]]] });
  }
}
__name(writeProgramSideCells, "writeProgramSideCells");

async function handleDeleteSheetRow(token, sheetName, row, role, slug) {
  const { driveId, itemId } = await findFile(token);
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, sheetName)}/usedRange`);
  const numCols = (data.values && data.values[0]) ? data.values[0].length : 10;
  const lastCol = colLetter(numCols);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${row}:${lastCol}${row}')`, { values: [Array(numCols).fill("")] });
  if (slug !== "log") await logToSheet(token, role, "DELETE", sheetName, row, "");
  invalidateSheetCache(slug);
  return { ok: true };
}
__name(handleDeleteSheetRow, "handleDeleteSheetRow");


// === [260710] 회원 시트 전용 로더 — A~L 청크 읽기 → 7열(A~G) + 연령대(생년월일 L 파생)만 응답 ===
// usedRange 전체(17열×30k=505k셀) 단일 호출은 Graph 504·재시도 증폭·isolate 메모리 압박(분신술 성능 감사 HIGH)
// → 크기만 먼저 조회($select=rowCount) 후 A{s}:L{e} 청크(3,000행×12열=3.6만 셀/콜 — 기존 안전선 유지)로 분할.
// 개인정보 최소화: 생년월일 원값·아이디(K)·중간 플래그(H~J)는 응답에 싣지 않고 연령대("40대")만 파생 전송(개요 통계용).
async function memberSheetRead(token, sheetName) {
  const { driveId, itemId } = await findFile(token);
  const base = sheetPathFor(driveId, itemId, sheetName);
  const ur = await graphGet(token, `${base}/usedRange?$select=rowCount`);
  const totalRows = ur.rowCount || 0;
  if (totalRows < 2) return { headers: [], rows: [] };
  const CHUNK = 3000;
  const kstYear = new Date(Date.now() + 9 * 3600 * 1e3).getUTCFullYear();
  const ageBand = (birth) => {
    const m = String(birth == null ? "" : birth).trim().match(/^(19|20)\d{2}/);
    if (!m) return "";
    const age = kstYear - parseInt(m[0], 10);
    if (age < 0 || age > 110) return "";
    if (age < 10) return "10세 미만";
    return Math.min(Math.floor(age / 10), 8) * 10 + "대";   // 80대+는 80대로 캡
  };
  let srcHeaders = [];
  const KEEP = 7;   // A~G = 휴대폰정규화·이름·주소1~4·우편번호 (v2 정제본 열 순서 고정)
  const rows = [];
  // [성능 260711] 순차 청크 → 4개씩 병렬 배치(왕복 시간 ~1/4) — graphGet 자체 재시도가 429를 흡수.
  const ranges = [];
  for (let s = 1; s <= totalRows; s += CHUNK) ranges.push([s, Math.min(s + CHUNK - 1, totalRows)]);
  const parts = new Array(ranges.length);
  const BATCH = 4;
  for (let b = 0; b < ranges.length; b += BATCH) {
    const batch = ranges.slice(b, b + BATCH).map((r, i) =>
      graphGet(token, `${base}/range(address='A${r[0]}:L${r[1]}')?$select=values`).then((p) => { parts[b + i] = p; })
    );
    await Promise.all(batch);
  }
  for (let pi = 0; pi < parts.length; pi++) {
    const vals = (parts[pi] && parts[pi].values) || [];
    for (let i = 0; i < vals.length; i++) {
      if (pi === 0 && i === 0) { srcHeaders = vals[0].map((h) => String(h == null ? "" : h)); continue; }
      const row = vals[i];
      if (row.every((cv) => cv === "" || cv === null || cv === undefined)) continue;
      const obj = {};
      for (let j = 0; j < KEEP; j++) obj[srcHeaders[j]] = row[j];
      const bi = srcHeaders.indexOf("생년월일");   // 생년월일(L) — 헤더 탐색이라 열 이동에도 내성
      obj["연령대"] = ageBand(bi >= 0 ? row[bi] : row[11]);
      rows.push(obj);
    }
  }
  const headers = srcHeaders.slice(0, KEEP).concat(["연령대"]);
  return { headers, rows };
}
__name(memberSheetRead, "memberSheetRead");

// === 자동 취소: 보류 3일 경과 → 취소 (cron 매일 KST 10:00 실행) ===
async function autoCancelStalePending(env) {
  const token = await getToken(env);
  const { headers, rows } = await handleGetSheet(token, "\uD64D\uBCF4\uAE30\uB85D"); // 홍보기록
  const now = Date.now();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const STATUS_KEY = "\uC9C4\uD589 \uC0C1\uD0DC";  // 진행 상태
  const PREV_KEY = "\uC9C1\uC804 \uC0C1\uD0DC";    // 직전 상태
  const CHG_KEY = "\uC0C1\uD0DC \uBCC0\uACBD KST"; // 상태 변경 KST
  const HOLD_VAL = "\uBCF4\uB958";                  // 보류
  const CANCEL_VAL = "\uCDE8\uC18C";                // 취소
  const NEWREQ_VAL = "\uC2E0\uCCAD \uC911";         // 신청 중
  let cancelled = 0;
  for (const row of rows) {
    if (String(row[STATUS_KEY] || "").trim() !== HOLD_VAL) continue;
    const chgStr = String(row[CHG_KEY] || "").trim();
    if (!chgStr) continue;
    let chgTime = NaN;
    try {
      const parsed = new Date(chgStr.replace(" ", "T") + "+09:00").getTime();
      if (!isNaN(parsed)) chgTime = parsed;
    } catch (e) {}
    if (isNaN(chgTime)) continue;
    if (now - chgTime < THREE_DAYS_MS) continue;
    const nowKstIso = new Date(now + KST_OFFSET_MS).toISOString();
    const nowKstStr = nowKstIso.slice(0, 19).replace("T", " ");
    const values = headers.map((h) => {
      if (h === STATUS_KEY) return CANCEL_VAL;
      if (h === PREV_KEY) return NEWREQ_VAL; // 보류는 신청 중에서 온 것
      if (h === CHG_KEY) return nowKstStr;
      return row[h] !== undefined && row[h] !== null ? row[h] : "";
    });
    try {
      await handleUpdateSheetRow(token, "\uD64D\uBCF4\uAE30\uB85D", row._rowIndex, { values }, "admin", "records");
      cancelled++;
      // \uC2E0\uCCAD\uC790\uC5D0\uAC8C \uC790\uB3D9\uCDE8\uC18C \uC54C\uB9BC (\uC218\uB3D9 \uCDE8\uC18C \uACBD\uB85C\uC758 pushMessage\uC640 \uB3D9\uC77C \uD3EC\uB9F7) \u2014 \uC2E4\uD328\uD574\uB3C4 cron\uC740 \uACC4\uC18D
      try {
        const recipient = String(row["\uC2E0\uCCAD\uC790"] || "").trim();
        if (recipient) {
          const dateKey = [row["\uC5F0\uB3C4"], String(row["\uC6D4"] || "").padStart(2, "0"), String(row["\uC77C"] || "").padStart(2, "0")].join("-");
          const refSummary = (dateKey + " " + (row["\uD50C\uB7AB\uD3FC 1"] || "") + " " + (row["\uCF58\uD150\uCE20 \uC81C\uBAA9"] || "")).trim();
          await handleAddMessage(token, {
            id: "m" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            recipient,
            type: "\uC911\uC694",
            trigger: "\uC790\uB3D9\uCDE8\uC18C",
            before: HOLD_VAL,
            after: CANCEL_VAL,
            reason: "\uBCF4\uB958 3\uC77C \uACBD\uACFC\uB85C \uC790\uB3D9 \uCDE8\uC18C\uB418\uC5C8\uC5B4\uC694",
            refNo: row["No"] || row["NO"] || "",
            refSummary,
            kst: nowKstStr.slice(0, 16),
            read: false
          });
        }
      } catch (e2) {
        console.error("autoCancel notify", row._rowIndex, e2);
      }
    } catch (e) {
      console.error("autoCancel row", row._rowIndex, e);
    }
  }
  console.log("autoCancel: " + cancelled + " row(s) processed");
  return cancelled;
}
__name(autoCancelStalePending, "autoCancelStalePending");

// === 홍보 담당자 알림 (요청1~3) — 문안 SSOT + cron 스캔 (운영자 [선택값] 회신 배선 260710) ===
// 채널 = 앱 내 '메시지' 시트(프론트가 폴링→토스트/메시지함). 외부 발송 없음. 중복 = 결정론적 id 멱등.
var PROMO_NOTIFY = {
  morning:    { type: "일반", trigger: "홍보-당일",   title: "📣 오늘 홍보 일정이 있어요",     body: "{수신자}님, 오늘 예정된 {시간} {플랫폼} 「{제목}」를 확인해주세요." },
  lead1h:     { type: "일반", trigger: "홍보-1시간전", title: "⏰ 1시간 뒤 홍보 예정",         body: "{수신자}님, {시간}에 {플랫폼} 「{제목}」 홍보가 예정되어 있습니다." },
  overdue:    { type: "중요", trigger: "홍보-미완료",  title: "🔔 홍보 완료됐나요?",            body: "{수신자}님, {시간}에 {플랫폼} 「{제목}」 완료하셨나요? 확인해주세요." },
  unassigned: { type: "일반", trigger: "홍보-미지정",  title: "📣 담당자 미지정 홍보가 있어요", body: "오늘 {시간} {플랫폼} 「{제목}」 홍보에 지정된 담당자가 없으니 확인해주세요." }
};
// 발송 규칙(운영자 선택값). morningAt=아침 알림 시각, leadMin=사전 리드, overdueMin=미완료 지연, scanMin=cron 주기.
// [260731 운영자] "홍보 알림 뜨는거 당분간 없애줘" → enabled:false = 스캔 자체를 건너뛴다(메시지 시트에 새 홍보 알림이 안 쌓인다).
//   scanMin은 그대로 둔다 — scheduled()의 하루 1회 보류 자동취소·공휴일 갱신이 이 값을 창(window) 폭으로 쓰기 때문(끄면 그쪽이 같이 죽는다).
//   되돌리기 = enabled:true 한 줄. ⚠ 반영은 Cloudflare Worker 재배포 후(프론트 소거 스위치 _PROMO_NOTIFY_MUTED는 배포 즉시 적용).
var PROMO_NOTIFY_CFG = { enabled: false, morningAt: "09:30", leadMin: 60, overdueMin: 15, scanMin: 15, quietStartH: 22, quietEndH: 8, unassignedVal: "상관 없음", copyApplicant: false, overdueRepeat: true, overdueMaxRep: 4 };

function _pnFill(tpl, v) {
  return String(tpl || "").replace(/\{수신자\}/g, v["수신자"] || "").replace(/\{시간\}/g, v["시간"] || "").replace(/\{플랫폼\}/g, v["플랫폼"] || "").replace(/\{제목\}/g, v["제목"] || "");
}
__name(_pnFill, "_pnFill");
function _pnFlagOn(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return ["true", "1", "y", "yes", "o", "on", "active", "✓", "✔", "활성", "예", "사용", "가능", "t"].indexOf(s) >= 0;
}
__name(_pnFlagOn, "_pnFlagOn");
function _pnHash(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
__name(_pnHash, "_pnHash");

// 홍보기록을 스캔해 요청1~3 알림을 '메시지' 시트에 적재. cron(매 scanMin분)에서 호출.
async function promoNotifyScan(env) {
  if (!PROMO_NOTIFY_CFG.enabled) { console.log("promoNotifyScan: disabled (운영자 260731 — 홍보 알림 당분간 중지)"); return 0; }
  const token = await getToken(env);
  const { rows } = await handleGetSheet(token, "홍보기록");
  const managers = await getManagersCached(token);
  const cfg = PROMO_NOTIFY_CFG;
  const nowMs = Date.now();
  const kst = new Date(nowMs + 9 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const kstHM = pad(kst.getUTCHours()) + ":" + pad(kst.getUTCMinutes());
  const todayKey = kst.getUTCFullYear() + "-" + pad(kst.getUTCMonth() + 1) + "-" + pad(kst.getUTCDate());
  const kstStamp = kstNowText().slice(0, 16);
  // PR_MANAGERS = 홍보여부 ON · 휴직 아님 · 이름 있음
  const prNames = managers.filter((m) => _pnFlagOn(m["홍보여부"]) && !_pnFlagOn(m["휴직여부"]) && String(m["담당자"] || "").trim()).map((m) => String(m["담당자"]).trim());
  const PLAN = "예정";
  // 감사4 MED-1: 메시지 시트 기존 id를 스캔당 1회만 읽어 Set — 이미 보낸 알림은 fire 전 skip(Graph 재읽기 폭증 방지)
  const existing = new Set();
  try { (await handleGetMessages(token)).forEach((m) => { const id = m.ID || m.id; if (id) existing.add(String(id)); }); } catch (e) {}
  let sent = 0;
  const fire = async (kind, seq, recipList, ctx) => {
    const tpl = PROMO_NOTIFY[kind];
    if (!tpl) return;
    const uniq = Array.from(new Set(recipList.filter(Boolean)));
    for (const rn of uniq) {
      const id = "pn-" + kind + "-" + ctx.no + "-" + seq + "-" + rn; // 이름 무손실(해시 충돌 제거 · 감사2 L3)
      if (existing.has(id)) continue; // 이미 발송 — Graph 왕복 없이 skip (감사4 MED-1)
      try {
        await handleAddMessage(token, {
          id, recipient: rn, type: tpl.type, trigger: tpl.trigger, title: tpl.title, before: "", after: "",
          reason: _pnFill(tpl.body, { "수신자": rn, "시간": ctx.hm, "플랫폼": ctx.platform, "제목": ctx.title }),
          refNo: ctx.no, refSummary: ctx.refSummary, kst: kstStamp, read: false
        });
        existing.add(id); sent++;
      } catch (e) { console.error("promoNotify " + kind + " " + ctx.no, e); }
    }
  };
  for (const row of rows) {
    // 알림 대상 = '예정'(승인)만 (감사1 MED-5: 신청 중·보류·취소·임시·완료 제외 → 오발송 차단)
    if (String(row["진행 상태"] || "").trim() !== PLAN) continue;
    // 날짜 = 연/월/일 정수 열 (입력시간(KST)의 Excel serial 자동변환을 우회 · 감사1 HIGH-1 · index.html _recDate 계승)
    const y = parseInt(row["연도"], 10), mo = parseInt(row["월"], 10), d = parseInt(row["일"], 10);
    if (!y || !mo || !d) continue;
    // 시각 = 입력시간(KST): 문자열 "YYYY-MM-DD HH:MM(:SS)" 또는 Excel serial 숫자(소수부=하루 중 분) 양쪽 (_recTime 계승)
    const ts = row["입력시간(KST)"];
    let hm = "";
    if (typeof ts === "number") {
      const tmin = Math.round((ts % 1) * 1440); hm = pad(Math.floor(tmin / 60)) + ":" + pad(tmin % 60);
    } else {
      const tstr = String(ts == null ? "" : ts).trim();
      if (tstr.indexOf(" ") > -1) hm = tstr.split(" ")[1].substr(0, 5);
      else if (tstr !== "" && !isNaN(tstr)) { const tmin = Math.round((Number(tstr) % 1) * 1440); hm = pad(Math.floor(tmin / 60)) + ":" + pad(tmin % 60); }
      else if (tstr.indexOf(":") > -1) hm = tstr.substr(0, 5);
    }
    if (hm.indexOf(":") < 0) continue;
    const promoDateKey = y + "-" + pad(mo) + "-" + pad(d);
    const promoMs = new Date(promoDateKey + "T" + hm + ":00+09:00").getTime();
    if (isNaN(promoMs)) continue;
    const ctx = {
      no: row["No"] || row["NO"] || ("r" + row._rowIndex), // No 빈값/재사용 폴백 (감사2 L4)
      hm,
      platform: row["플랫폼 1"] || "",
      title: row["콘텐츠 제목"] || "",
      refSummary: (promoDateKey + " " + (row["플랫폼 1"] || "") + " " + (row["콘텐츠 제목"] || "")).trim()
    };
    const assignee = String(row["게시 담당자"] || "").trim();
    const assigned = assignee && assignee !== cfg.unassignedVal;
    const applicant = String(row["신청자"] || "").trim();
    // 수신자: 지정 → 그 담당자(+옵션 신청자 사본) / 미지정 → PR_MANAGERS 전원
    const baseRecips = assigned ? [assignee].concat(cfg.copyApplicant && applicant ? [applicant] : []) : prNames.slice();
    if (!baseRecips.length) continue;
    const toPromo = promoMs - nowMs;
    // 요청1a 당일 아침 (오늘 · 아침시각 지남 · 홍보까지 leadMin 초과 = 1시간전과 안 겹침)
    if (promoDateKey === todayKey && kstHM >= cfg.morningAt && toPromo > cfg.leadMin * 60000) {
      await fire(assigned ? "morning" : "unassigned", "AM" + todayKey, baseRecips, ctx);
    }
    // 요청1b 1시간 전 (홍보 前 0~leadMin 넓게 — cron 지연/스킵에도 안 놓침 · 감사1 HIGH-2 · dedup "L"로 1회)
    if (toPromo > 0 && toPromo <= cfg.leadMin * 60000) {
      await fire(assigned ? "lead1h" : "unassigned", "L", baseRecips, ctx);
    }
    // 요청3 +15분 미완료 (반복: scanMin 간격 회차 · 무음 제거로 저녁 홍보도 정상 · 감사1 HIGH-3)
    if (nowMs >= promoMs + cfg.overdueMin * 60000) {
      let rep = 0;
      if (cfg.overdueRepeat) { rep = Math.floor((nowMs - (promoMs + cfg.overdueMin * 60000)) / (cfg.scanMin * 60000)); if (rep > cfg.overdueMaxRep) rep = -1; }
      if (rep >= 0) await fire("overdue", "O" + rep, baseRecips, ctx);
    }
  }
  console.log("promoNotify: " + sent + " message(s)");
  return sent;
}
__name(promoNotifyScan, "promoNotifyScan");

// === 메시지(알림) 시트 — 자동 생성 + CRUD ===
var MSG_SHEET = "메시지";
var MSG_HEADERS = ["ID", "수신자", "종류", "트리거", "이전", "이후", "사유", "참조번호", "참조요약", "KST", "읽음", "제목"];

async function graphPost(token, path, body) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Graph POST ${r.status}: ${await r.text()}`);
  return r.json();
}
__name(graphPost, "graphPost");

// 메시지 시트 없으면 생성 + 헤더 기록 (최초 1회). 기존 시트엔 신규 열 헤더 보강(마이그레이션).
var _msgHdrSynced = false;
async function ensureMessagesSheet(token) {
  const { driveId, itemId } = await findFile(token);
  const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
  const exists = (ws.value || []).some((w) => w.name === MSG_SHEET);
  const lastCol = colLetter(MSG_HEADERS.length);
  if (!exists) {
    await graphPost(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets/add`, { name: MSG_SHEET });
    await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='A1:${lastCol}1')`, { values: [MSG_HEADERS] });
    _msgHdrSynced = true;
  } else if (!_msgHdrSynced) {
    // 헤더 마이그레이션(isolate당 1회): '제목' 등 신규 열이 없으면 헤더만 보강.
    // A~K 기존값은 동일하면 건드리지 않고, 어긋난 칸(주로 끝 신규 열)만 write → 데이터 열 밀림 없음.
    try {
      const hdr = await graphGet(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='A1:${lastCol}1')`);
      const cur = (hdr.values && hdr.values[0]) || [];
      for (let i = 0; i < MSG_HEADERS.length; i++) {
        if (String(cur[i] || "") !== MSG_HEADERS[i]) {
          await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='${colLetter(i + 1)}1')`, { values: [[MSG_HEADERS[i]]] });
        }
      }
    } catch (e) { console.error("msg header migrate", e); }
    _msgHdrSynced = true;
  }
  return { driveId, itemId };
}
__name(ensureMessagesSheet, "ensureMessagesSheet");

async function handleGetMessages(token) {
  await ensureMessagesSheet(token);
  const { rows } = await handleGetSheet(token, MSG_SHEET);
  return rows;
}
__name(handleGetMessages, "handleGetMessages");

async function handleAddMessage(token, msg) {
  const { driveId, itemId } = await ensureMessagesSheet(token);
  const sheetPath = sheetPathFor(driveId, itemId, MSG_SHEET);
  const values = [
    msg.id || "", msg.recipient || "", msg.type || "일반", msg.trigger || "",
    msg.before || "", msg.after || "", msg.reason || "", msg.refNo || "",
    msg.refSummary || "", msg.kst || kstNowText(), msg.read ? "TRUE" : "FALSE",
    msg.title || ""
  ];
  const lastCol = colLetter(values.length);
  // ⚠️ 비원자 append 경합 방어(분신술 H2): nextRow를 계산해 쓴 뒤 그 행 A열을 read-back 검증한다.
  //   내 id가 아니면(동시/근접 POST가 read-lag 틈에 같은 행 선점) 재계산 후 재시도 → 다중 관리자
  //   팬아웃·교차세션에서 같은 행을 겹쳐써 알림이 유실되던 것 차단. 성공 시엔 write가 read로 전파
  //   확정된 상태라 프론트 순차 await의 다음 수신자 GET이 이 행을 반드시 보게 돼 lag 유실도 줄인다.
  let row = 2;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { rows } = await handleGetSheet(token, MSG_SHEET);
    // 멱등: 같은 id가 이미 있으면(재시도·중복 POST) 재기록 없이 성공 반환 — 중복 알림 방지
    if (msg.id) { const dup = rows.find((r) => String(r["ID"] || "") === String(msg.id)); if (dup) return { ok: true, row: dup._rowIndex, dedup: true }; }
    row = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
    const addr = `A${row}:${lastCol}${row}`;
    // 셀을 텍스트 서식으로 먼저 지정 — KST/번호가 Excel 날짜·숫자로 자동변환되는 것 방지
    await graphPatch(token, `${sheetPath}/range(address='${addr}')`, { numberFormat: [values.map(() => "@")] });
    await graphPatch(token, `${sheetPath}/range(address='${addr}')`, { values: [values] });
    if (!msg.id) break;  // 검증할 키 없음 — 기존 동작 유지
    try {
      const chk = await graphGet(token, `${sheetPath}/range(address='A${row}')`);
      const got = chk && chk.values && chk.values[0] ? String(chk.values[0][0]) : "";
      if (got === String(msg.id)) break;  // 내 것 확정 — 성공
    } catch (e) { break; }  // 검증 조회 실패 시 무한 재시도 방지 — 일단 성공 간주
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));  // 짧은 backoff 후 재계산
  }
  return { ok: true, row };
}
__name(handleAddMessage, "handleAddMessage");

// === 챗봇 — FAQ 시트(운영자 편집) + 질의 로그 누적 ===
var FAQ_SHEET = "챗봇FAQ";
var FAQ_HEADERS = ["카테고리", "질문", "답변", "키워드", "사용"];
var FAQ_SEED = [
  ["회사", "예울마루 위치 / 오시는 길", "(여기에 답변을 입력한 뒤 '사용'을 TRUE로 바꾸면 챗봇에 표시돼요)", "위치,주소,오시는길,찾아오", "FALSE"],
  ["회사", "주차 안내", "(여기에 답변을 입력한 뒤 '사용'을 TRUE로 바꾸면 챗봇에 표시돼요)", "주차,주차장,차", "FALSE"],
  ["회사", "운영 시간 / 휴관일", "(여기에 답변을 입력한 뒤 '사용'을 TRUE로 바꾸면 챗봇에 표시돼요)", "시간,운영,휴관,오픈,마감", "FALSE"],
  ["회사", "대관 문의", "(여기에 답변을 입력한 뒤 '사용'을 TRUE로 바꾸면 챗봇에 표시돼요)", "대관,대여,빌리", "FALSE"]
];
var CHATLOG_SHEET = "챗봇로그";
var CHATLOG_HEADERS = ["ID", "KST", "사용자", "부서", "종류", "질의", "응답", "매칭"];

// 시트 없으면 생성 + 헤더(+시드) 기록 — ensureMessagesSheet 일반화 버전
async function ensureNamedSheet(token, name, headerRow, seedRows) {
  const { driveId, itemId } = await findFile(token);
  const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
  const exists = (ws.value || []).some((w) => w.name === name);
  if (!exists) {
    await graphPost(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets/add`, { name });
    const lastCol = colLetter(headerRow.length);
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A1:${lastCol}1')`, { values: [headerRow] });
    if (seedRows && seedRows.length) {
      const addr = `A2:${lastCol}${1 + seedRows.length}`;
      await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { numberFormat: seedRows.map((r) => r.map(() => "@")) });
      await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { values: seedRows });
    }
  }
  return { driveId, itemId };
}
__name(ensureNamedSheet, "ensureNamedSheet");

async function handleGetFaq(token) {
  await ensureNamedSheet(token, FAQ_SHEET, FAQ_HEADERS, FAQ_SEED);
  const { rows } = await handleGetSheet(token, FAQ_SHEET);
  return rows;
}
__name(handleGetFaq, "handleGetFaq");

async function handleAddChatLog(token, log) {
  const { driveId, itemId } = await ensureNamedSheet(token, CHATLOG_SHEET, CHATLOG_HEADERS, null);
  const { rows } = await handleGetSheet(token, CHATLOG_SHEET);
  const nextRow = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  const values = [
    log.id || "", log.kst || kstNowText(), log.user || "", log.dept || "",
    log.kind || "", log.query || "", log.answer || "", log.match || ""
  ];
  const lastCol = colLetter(values.length);
  const addr = `A${nextRow}:${lastCol}${nextRow}`;
  await graphPatch(token, `${sheetPathFor(driveId, itemId, CHATLOG_SHEET)}/range(address='${addr}')`, { numberFormat: [values.map(() => "@")] });
  await graphPatch(token, `${sheetPathFor(driveId, itemId, CHATLOG_SHEET)}/range(address='${addr}')`, { values: [values] });
  return { ok: true, row: nextRow };
}
__name(handleAddChatLog, "handleAddChatLog");

// === 불편사항(QA) 접수 — 시트 자동생성 + 적재. 로그인 사용자 POST / admin GET ===
var QA_SHEET = "불편사항";
var QA_HEADERS = ["ID", "KST", "사용자", "부서", "분류", "내용", "상태", "처리메모"];
async function handleAddQa(token, q) {
  const { driveId, itemId } = await ensureNamedSheet(token, QA_SHEET, QA_HEADERS, null);
  const { rows } = await handleGetSheet(token, QA_SHEET);
  const nextRow = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  const values = [
    q.id || "", q.kst || kstNowText(), q.user || "", q.dept || "",
    q.category || "기타", q.content || "", "접수", ""
  ];
  const lastCol = colLetter(values.length);
  const addr = `A${nextRow}:${lastCol}${nextRow}`;
  // 셀을 텍스트 서식으로 먼저 지정 — KST/번호가 Excel 날짜·숫자로 자동변환되는 것 방지
  await graphPatch(token, `${sheetPathFor(driveId, itemId, QA_SHEET)}/range(address='${addr}')`, { numberFormat: [values.map(() => "@")] });
  await graphPatch(token, `${sheetPathFor(driveId, itemId, QA_SHEET)}/range(address='${addr}')`, { values: [values] });
  return { ok: true, row: nextRow };
}
__name(handleAddQa, "handleAddQa");

// 불편사항 상태/처리메모 업데이트 (admin) — 상태=G열, 처리메모=H열 (QA_HEADERS 기준)
async function handleUpdateQa(token, q) {
  const rowIndex = Number(q.rowIndex);
  if (!rowIndex || rowIndex < 2) throw new Error("bad rowIndex");
  const { driveId, itemId } = await ensureNamedSheet(token, QA_SHEET, QA_HEADERS, null);
  const addr = `G${rowIndex}:H${rowIndex}`;
  await graphPatch(token, `${sheetPathFor(driveId, itemId, QA_SHEET)}/range(address='${addr}')`, { numberFormat: [["@", "@"]] });
  await graphPatch(token, `${sheetPathFor(driveId, itemId, QA_SHEET)}/range(address='${addr}')`, { values: [[q.status || "접수", q.memo || ""]] });
  return { ok: true, row: rowIndex };
}
__name(handleUpdateQa, "handleUpdateQa");

// === 규정 시트 — 사무처리규정 PDF 조항 인제스트 (docs/260610_rules_ingest.mjs) ===
var RULES_SHEET = "규정";
var RULES_HEADERS = ["규정명", "조항", "제목", "본문", "키워드"];

async function writeNamedSheetRows(token, name, headers, rows) {
  const { driveId, itemId } = await ensureNamedSheet(token, name, headers, null);
  const lastCol = colLetter(headers.length);
  let oldRows = 0;
  try { const ur = await graphGet(token, `${sheetPathFor(driveId, itemId, name)}/usedRange?$select=rowCount`); oldRows = ur.rowCount || 0; } catch (e) {}
  await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A1:${lastCol}1')`, { values: [headers] });
  for (let b = 0; b < rows.length; b += 200) {
    const slice = rows.slice(b, b + 200).map((r) => headers.map((h) => { const v = r[h]; return (v === null || v === undefined) ? "" : String(v); }));
    const sr = 2 + b, er = sr + slice.length - 1;
    const addr = `A${sr}:${lastCol}${er}`;
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { numberFormat: slice.map(() => headers.map(() => "@")) });
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { values: slice });
  }
  if (oldRows > rows.length + 1) {
    await graphPost(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A${rows.length + 2}:${lastCol}${oldRows}')/clear`, { applyTo: "Contents" });
  }
  return { ok: true, sheet: name, rows: rows.length };
}
__name(writeNamedSheetRows, "writeNamedSheetRows");

async function handleGetRules(token) {
  await ensureNamedSheet(token, RULES_SHEET, RULES_HEADERS, null);
  const { rows } = await handleGetSheet(token, RULES_SHEET);
  return rows;
}
__name(handleGetRules, "handleGetRules");

async function handleMarkMessageRead(token, id) {
  const { driveId, itemId } = await ensureMessagesSheet(token);
  const { headers, rows } = await handleGetSheet(token, MSG_SHEET);
  const target = rows.find((r) => String(r["ID"] || "").trim() === String(id).trim());
  if (!target) return { ok: false, error: "not found" };
  const readIdx = headers.indexOf("읽음");
  if (readIdx < 0) return { ok: false, error: "no read column" };
  const col = colLetter(readIdx + 1);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='${col}${target._rowIndex}:${col}${target._rowIndex}')`, { values: [["TRUE"]] });
  return { ok: true };
}
__name(handleMarkMessageRead, "handleMarkMessageRead");

// 유령 메시지 삭제 — 참조 대상(신청)이 사라진 '대상 없는 알림' 정리용. 행 클리어(ID 빈 행은 목록 GET에서 걸러짐, handleDeleteSheetRow 방식).
//   권한 = 메시지 API 공통 위상(로그인 게이트, 개인 신원은 클라 전달 신뢰 — 기존 GET/PATCH와 동일). 내부 직원 툴(앱지침 권한 FULL).
//   멱등 — 이미 없는 id도 ok 반환(자동 정리가 매번 재시도해도 무해). 감사로그 남김(파괴 연산 추적, 분신술 감사2·4).
async function handleDeleteMessage(token, id, role) {
  if (!String(id || "").trim()) return { ok: true, dedup: true };  // 빈/공백 id = 무동작(ID 빈 행 오클리어 방지, 감사2)
  const { driveId, itemId } = await ensureMessagesSheet(token);
  const { headers, rows } = await handleGetSheet(token, MSG_SHEET);
  const target = rows.find((r) => String(r["ID"] || "").trim() === String(id).trim());
  if (!target) return { ok: true, dedup: true };
  // TOCTOU 방어(분신술 감사4): read→clear 사이 다른 세션 append가 이 _rowIndex를 재사용했을 수 있다.
  //   클리어 직전 A열(ID)을 재조회해 여전히 그 id일 때만 삭제 — 재사용된 신규 메시지 오소거 방지(handleAddMessage read-back 미러).
  try {
    const chk = await graphGet(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='A${target._rowIndex}')`);
    const cur = (chk && chk.values && chk.values[0]) ? String(chk.values[0][0]).trim() : "";
    if (cur !== String(id).trim()) return { ok: true, stale: true };  // 행이 바뀜 = 경합 = 삭제 안 함
  } catch (e) { return { ok: false, error: "verify failed" }; }  // 재확인 실패 = 안전하게 삭제 보류
  const numCols = (headers && headers.length) ? headers.length : MSG_HEADERS.length;
  const lastCol = colLetter(numCols);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='A${target._rowIndex}:${lastCol}${target._rowIndex}')`, { values: [Array(numCols).fill("")] });
  try { await logToSheet(token, role, "DELETE", MSG_SHEET, target._rowIndex, "ghost:" + String(id)); } catch (e) {}
  return { ok: true };
}
__name(handleDeleteMessage, "handleDeleteMessage");

// === 예매 프로세스 도표 공유 — '도표' 시트 (공유범위: 비공개/팀/전체 · 소유자 = 로그인 담당자명) ===
// 본문 JSON은 셀 32,767자 제한 때문에 청크 10개(28,000자 단위)로 분할 — 문서당 최대 ~280KB.
// 삭제 = 행 클리어(handleDeleteSheetRow 방식) — ID 빈 행은 목록 필터에서 걸러진다.
// 신원은 기존 앱 신뢰 모델 계승(클라이언트가 user/dept 전달 — 신청·메시지와 동일 위상). 갱신·삭제 = 소유자 또는 admin.
var DGM_SHEET = "도표";
var DGM_CHUNKS = 24;   // 도표 1개당 본문 청크 수 — 사진 base64 임베드 여유 확보(운영자 260710). 총 상한 = DGM_CHUNKS×DGM_CHUNK_SIZE = 672KB. 10→24는 하위호환(기존 ≤10청크 도표 그대로 읽힘 · 청크수 min-clamp) · 기존 '도표' 시트 헤더는 handleDgmSave의 확장 마이그레이션으로 본문11~24 열 추가.
var DGM_CHUNK_SIZE = 28000;
var DGM_HEADERS = ["ID", "이름", "소유자", "부서", "공유범위", "저장시각", "청크수", "본문1", "본문2", "본문3", "본문4", "본문5", "본문6", "본문7", "본문8", "본문9", "본문10", "본문11", "본문12", "본문13", "본문14", "본문15", "본문16", "본문17", "본문18", "본문19", "본문20", "본문21", "본문22", "본문23", "본문24"];
function dgmScopeOk(s) { return s === "비공개" || s === "팀" || s === "전체"; }
__name(dgmScopeOk, "dgmScopeOk");
function dgmCanSee(r, user, dept) {
  if (String(user || "") && String(r["소유자"] || "") === String(user || "")) return true;
  const scope = String(r["공유범위"] || "비공개");
  if (scope === "전체") return true;
  if (scope === "팀") return !!String(dept || "") && String(r["부서"] || "") === String(dept || "");
  return false;
}
__name(dgmCanSee, "dgmCanSee");
function dgmMeta(r) {
  return { id: String(r["ID"] || ""), name: String(r["이름"] || ""), owner: String(r["소유자"] || ""), dept: String(r["부서"] || ""), scope: dgmScopeOk(r["공유범위"]) ? String(r["공유범위"]) : "비공개", ts: String(r["저장시각"] || "") };
}
__name(dgmMeta, "dgmMeta");
async function handleDgmList(token, user, dept) {
  await ensureNamedSheet(token, DGM_SHEET, DGM_HEADERS, null);
  const { rows } = await handleGetSheet(token, DGM_SHEET);
  return rows.filter((r) => String(r["ID"] || "").trim() && dgmCanSee(r, user, dept)).map(dgmMeta);
}
__name(handleDgmList, "handleDgmList");
async function handleDgmGet(token, id, user, dept) {
  await ensureNamedSheet(token, DGM_SHEET, DGM_HEADERS, null);
  const { rows } = await handleGetSheet(token, DGM_SHEET);
  const r = rows.find((x) => String(x["ID"] || "").trim() === String(id).trim());
  if (!r) return { ok: false, error: "not found", status: 404 };
  if (!dgmCanSee(r, user, dept)) return { ok: false, error: "forbidden", status: 403 };
  let body = "";
  const n = Math.min(parseInt(r["청크수"] || "0") || 0, DGM_CHUNKS);
  for (let i = 1; i <= n; i++) body += String(r["본문" + i] || "");
  let doc = null;
  try { doc = JSON.parse(body); } catch (e) { return { ok: false, error: "corrupt", status: 500 }; }
  return { ok: true, meta: dgmMeta(r), doc };
}
__name(handleDgmGet, "handleDgmGet");
async function handleDgmSave(token, body, isAdm) {
  const id = String((body && body.id) || "").trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return { ok: false, error: "bad id", status: 400 };
  const owner = String(body.owner || "").slice(0, 40).trim();
  if (!owner) return { ok: false, error: "no owner", status: 400 };
  const name = (String(body.name || "").trim() || "제목 없음").slice(0, 80);
  const dept = String(body.dept || "").slice(0, 40);
  const scope = dgmScopeOk(body.scope) ? body.scope : "비공개";
  const jsonBody = JSON.stringify(body.doc || {});
  if (jsonBody.length > DGM_CHUNKS * DGM_CHUNK_SIZE) return { ok: false, error: "too large", status: 413 };
  const chunks = [];
  for (let i = 0; i < DGM_CHUNKS; i++) chunks.push(jsonBody.slice(i * DGM_CHUNK_SIZE, (i + 1) * DGM_CHUNK_SIZE));
  const values = [id, name, owner, dept, scope, kstNowText(), String(Math.max(1, Math.ceil(jsonBody.length / DGM_CHUNK_SIZE)))].concat(chunks);
  const { driveId, itemId } = await ensureNamedSheet(token, DGM_SHEET, DGM_HEADERS, null);
  const sheetPath = sheetPathFor(driveId, itemId, DGM_SHEET);
  // 헤더 확장 마이그레이션 — 기존 '도표' 시트가 본문1~10만 있는데 이 저장이 11청크 이상을 쓰면, 헤더 없는 열은 handleGetSheet(헤더행 매핑)에서 유실됨. DGM_CHUNKS 10→24 확장분 헤더를 데이터보다 먼저 채운다(큰 도표 저장 시에만·멱등).
  //   ⚠️ 실패를 삼키지 않는다 — 헤더 없는 열에 본문11~24를 쓰면 GET에서 잘려 «ok 보고+복원 불가(특히 공유 뷰어)»가 된다. 확장 실패는 위로 전파 → 라우트 500 → 프론트 srvFail(로컬 보존) → 다음 큐에서 재시도. 읽을 수 없는 데이터를 쓰고 성공이라 보고하는 것보다 낫다(분신술 서버 감사 HIGH).
  if (jsonBody.length > 10 * DGM_CHUNK_SIZE) {
    const hc = colLetter(DGM_HEADERS.length);
    const cur = await graphGet(token, `${sheetPath}/range(address='A1:${hc}1')?$select=values`);
    const row1 = (cur && cur.values && cur.values[0]) ? cur.values[0] : [];
    let curLen = 0;
    for (let j = 0; j < row1.length; j++) if (String(row1[j] == null ? "" : row1[j]).trim() !== "") curLen = j + 1;
    if (curLen < DGM_HEADERS.length) await graphPatch(token, `${sheetPath}/range(address='A1:${hc}1')`, { values: [DGM_HEADERS] });
  }
  const lastCol = colLetter(values.length);
  async function writeRow(row) {
    const addr = `A${row}:${lastCol}${row}`;
    await graphPatch(token, `${sheetPath}/range(address='${addr}')`, { numberFormat: [values.map(() => "@")] });
    await graphPatch(token, `${sheetPath}/range(address='${addr}')`, { values: [values] });
  }
  __name(writeRow, "writeRow");
  let row = 2;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { rows } = await handleGetSheet(token, DGM_SHEET);
    const ex = rows.find((x) => String(x["ID"] || "").trim() === id);
    if (ex) {
      // upsert 갱신 — 소유자(또는 admin)만
      if (String(ex["소유자"] || "") !== owner && !isAdm) return { ok: false, error: "forbidden", status: 403 };
      await writeRow(ex._rowIndex);
      return { ok: true, row: ex._rowIndex, ts: values[5], updated: true };
    }
    row = rows.length > 0 ? Math.max(...rows.map((x) => x._rowIndex)) + 1 : 2;
    await writeRow(row);
    // 비원자 append 경합 방어(handleAddMessage 패턴 계승) — 그 행 A열 read-back으로 내 id 확인
    try {
      const chk = await graphGet(token, `${sheetPath}/range(address='A${row}')`);
      const got = chk && chk.values && chk.values[0] ? String(chk.values[0][0]) : "";
      if (got === id) return { ok: true, row, ts: values[5] };
    } catch (e) { return { ok: true, row, ts: values[5] }; }
    await new Promise((r2) => setTimeout(r2, 250 * (attempt + 1)));
  }
  return { ok: true, row, ts: values[5] };
}
__name(handleDgmSave, "handleDgmSave");
async function handleDgmDelete(token, id, user, isAdm) {
  await ensureNamedSheet(token, DGM_SHEET, DGM_HEADERS, null);
  const { driveId, itemId } = await findFile(token);
  const { rows } = await handleGetSheet(token, DGM_SHEET);
  const r = rows.find((x) => String(x["ID"] || "").trim() === String(id).trim());
  if (!r) return { ok: false, error: "not found", status: 404 };
  if (String(r["소유자"] || "") !== String(user || "") && !isAdm) return { ok: false, error: "forbidden", status: 403 };
  const lastCol = colLetter(DGM_HEADERS.length);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, DGM_SHEET)}/range(address='A${r._rowIndex}:${lastCol}${r._rowIndex}')`, { values: [Array(DGM_HEADERS.length).fill("")] });
  return { ok: true };
}
__name(handleDgmDelete, "handleDgmDelete");


// === [DB통합/이관] 운영 데이터를 프로모 엑셀(통합 문서1.xlsm)의 "운영_*" 시트에 저장 (source of truth, Workbook API 읽기·쓰기 OK 검증됨). dash 파일은 501이라 dash가 push만 함. ===
function opsSheetName(s){ return "운영_" + String(s).replace(/[()（）]/g, ""); }

// === [260805 장도 위젯] 공개 조회 공용부 — /api/public/jangdo(JSON)·/api/public/jangdo.svg(이미지)가 함께 쓴다 ===
// 왜 SVG까지 내주나: 홈페이지(yeulmaru.org) 글 저장 필터가 **iframe을 삭제**한다(260805 실측 — 저장 후 본문에 태그·도메인 문자열 0).
//  살아남는 건 `<img>`·`<a>`·인라인 style뿐이라, 서버가 오늘 시간을 그려 이미지로 내주면 새 창 없이 글 안에서 바로 보인다.
async function jangdoPublicRows(env, fresh) {
  const KV_KEY = "jangdo-public:v1";
  if (!fresh) { try { const kv = await env.ops_kv.get(KV_KEY); if (kv) return JSON.parse(kv).rows || []; } catch (e) {} }
  const token = await getToken(env);
  const opsName = opsSheetName("장도");
  if (fresh) delete opsCache[opsName];
  const { rows } = await getOpsCached(token, opsName);
  const list = [];
  for (const r of rows) {
    let d = String(r["날짜"] || "").trim();
    if (!d) continue;
    const a = d.split("-");                                   // 시트가 2026-8-5로 와도 키를 맞춘다(제로패딩 정규화)
    if (a.length === 3) d = a[0] + "-" + ("0" + a[1]).slice(-2) + "-" + ("0" + a[2]).slice(-2);
    list.push({ d, t: String(r["입도가능시간"] || "").trim() });
  }
  try { await env.ops_kv.put(KV_KEY, JSON.stringify({ rows: list }), { expirationTtl: 3600 }); } catch (e) {}
  return list;
}
__name(jangdoPublicRows, "jangdoPublicRows");

// "6:00~8:32, 10:32~20:31" → [[360,512],[632,1231]] · 형식 밖 텍스트(통제 공지 등)는 null = 원문 그대로 표시
function jangdoRanges(t) {
  if (!t) return null;
  const out = [];
  for (const seg of String(t).split(/[,·]/)) {
    const m = seg.trim().match(/^(\d{1,2})\s*:\s*(\d{2})\s*[~∼–-]\s*(\d{1,2})\s*:\s*(\d{2})$/);
    if (!m) return null;
    out.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
  }
  return out.length ? out : null;
}
__name(jangdoRanges, "jangdoRanges");

// 홈페이지 본문 인라인용 카드 이미지. 값 = docs/디자인기틀.md §1 팔레트 그대로(신규 색 0 · jangdo.html과 같은 매핑):
//  #4A4DE7=--accent · #1A1A2E=--text · #888=--dim · #bbb=--muted · #fff=--surface-solid · #1A6B3C=--green · #E24B4A=--danger-btn.
//  ⚠ `<img>`로 실리므로 SVG 내부 스크립트는 브라우저가 실행하지 않는다 = 상태 계산·조판 전부 서버(여기)에서 끝낸다.
//  rgba()는 SVG 1.1 미지원 → fill-opacity로 표현(같은 토큰 alpha 변주 = 기틀 §3.5②).
export function buildJangdoSvg(rows, nowKst) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (m) => Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2);
  const map = {};
  for (const r of rows) map[r.d] = r.t;
  const addDay = (ymd, n) => {
    const a = ymd.split("-");
    return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + n)).toISOString().slice(0, 10);
  };
  const label = (ymd) => {
    const a = ymd.split("-");
    const d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]));
    return +a[1] + "월 " + +a[2] + "일 (" + "일월화수목금토"[d.getUTCDay()] + ")";
  };
  const today = nowKst.ymd, tmrw = addDay(today, 1);
  const rawT = map[today], ranges = jangdoRanges(rawT);

  // 세로는 **내용만큼만** 자란다(줄 커서 y) — 시간이 없는 날 고정 높이로 그리면 카드 아래가 빈 채로 남는다.
  const W = 760;
  let y = 40, body = "";
  body += '<text x="30" y="' + y + '" font-size="17" font-weight="800" fill="#1A1A2E">장도 입도 가능 시간</text>';
  y += 26;
  body += '<text x="30" y="' + y + '" font-size="13.5" fill="#888">' + esc(label(today)) +
          ' <tspan fill="#4A4DE7" font-weight="700">오늘</tspan></text>';

  if (ranges) {
    y += 46;
    body += '<text x="30" y="' + y + '" font-size="31" font-weight="800" fill="#1A1A2E">';
    ranges.forEach((r, i) => {
      if (i) body += '<tspan fill="#bbb" font-weight="400"> · </tspan>';
      body += "<tspan>" + fmt(r[0]) + " ~ " + fmt(r[1]) + "</tspan>";
    });
    body += "</text>";
    let dot = "#bbb", txt = "오늘 입도 시간이 종료됐어요", col = "#888";
    for (const r of ranges) {
      if (nowKst.min >= r[0] && nowKst.min < r[1]) { dot = col = "#1A6B3C"; txt = "지금 입도 가능 · " + fmt(r[1]) + "까지"; break; }
      if (nowKst.min < r[0]) { dot = col = "#E24B4A"; txt = "지금은 입도 불가 · " + fmt(r[0]) + "부터 입도 가능"; break; }
    }
    y += 32;
    body += '<circle cx="35" cy="' + (y - 5) + '" r="5" fill="' + dot + '"/>';
    body += '<text x="48" y="' + y + '" font-size="14.5" font-weight="700" fill="' + col + '">' + esc(txt) + "</text>";
  } else {
    y += 44;
    body += '<text x="30" y="' + y + '" font-size="' + (rawT ? 20 : 16) + '" font-weight="' + (rawT ? 700 : 600) + '" fill="' +
            (rawT ? "#1A1A2E" : "#888") + '">' + esc(rawT || "오늘 입도 시간이 아직 등록되지 않았어요") + "</text>";
  }

  const tR = jangdoRanges(map[tmrw]);
  if (tR) {
    y += 33;
    body += '<text x="30" y="' + y + '" font-size="13" fill="#888">내일 ' + esc(label(tmrw)) + "  " +
            esc(tR.map((r) => fmt(r[0]) + " ~ " + fmt(r[1])).join(" · ")) + "</text>";
  }
  y += 23;
  body += '<text x="30" y="' + y + '" font-size="11.5" fill="#bbb">위 시간 외에는 진섬다리가 물에 잠겨 출입이 불가합니다. 아래 월별 캘린더도 함께 확인해 주세요.</text>';

  const H = y + 16;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
    '" role="img" aria-label="장도 입도 가능 시간" font-family="\'Noto Sans KR\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif">' +
    '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="16" fill="#fff" stroke="#000" stroke-opacity="0.09"/>' +
    body + "</svg>";
}
__name(buildJangdoSvg, "buildJangdoSvg");

// 방문자 기기 시간대와 무관하게 Asia/Seoul 고정(Worker 런타임 = UTC)
function jangdoNowKst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    ymd: d.toISOString().slice(0, 10),
    min: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}
__name(jangdoNowKst, "jangdoNowKst");
async function ensureSheet(token, sheetName, headers){
  const { driveId, itemId } = await findFile(token);
  const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
  if (!(ws.value || []).some((w) => w.name === sheetName)){
    await graphPost(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets/add`, { name: sheetName });
    if (headers && headers.length){ const lc = colLetter(headers.length); await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A1:${lc}1')`, { values: [headers] }); }
  }
  return { driveId, itemId };
}
__name(ensureSheet, "ensureSheet");
// 운영 시트 전체 교체 기록 (텍스트 서식 → 날짜/번호 그대로 보존)
async function opsWriteSheet(token, slug, headers, rows){
  const name = opsSheetName(slug);
  const { driveId, itemId } = await ensureSheet(token, name, headers);
  let oldRows = 0;
  try { const ur = await graphGet(token, `${sheetPathFor(driveId, itemId, name)}/usedRange?$select=rowCount`); oldRows = ur.rowCount || 0; } catch (e) {}
  const cols = (headers && headers.length) ? headers.length : 1;
  const lastCol = colLetter(cols);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A1:${lastCol}1')`, { values: [headers || []] });
  const order = headers || [];
  for (let b = 0; b < rows.length; b += 400){
    const slice = rows.slice(b, b + 400).map((r) => order.map((h) => { const v = r[h]; return (v === null || v === undefined) ? "" : String(v); }));
    const sr = 2 + b, er = sr + slice.length - 1;
    const addr = `A${sr}:${lastCol}${er}`;
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { numberFormat: slice.map(() => order.map(() => "@")) });
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { values: slice });
  }
  if (oldRows > rows.length + 1){
    await graphPost(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A${rows.length + 2}:${lastCol}${oldRows}')/clear`, { applyTo: "Contents" });
  }
  return { ok: true, sheet: name, count: rows.length };
}
__name(opsWriteSheet, "opsWriteSheet");
// 운영 시트에 행 추가 (기존 헤더 순서로, 텍스트 보존) — 일일입력 폼용
async function opsAppendRows(token, slug, rows){
  const name = opsSheetName(slug);
  const { driveId, itemId } = await findFile(token);
  // [260804 성능·확장] 이 함수가 usedRange에서 실제로 쓰는 건 **헤더 한 줄과 행수** 둘뿐인데
  //   예전엔 시트 **전량**(values)을 받아왔다. 시트가 커질수록 append 한 번이 비싸져
  //   운영_예매(4만 행) 반입이 **9,000행쯤에서 Worker 503**으로 죽었다(260804 실측 · 재시도 4회 소진).
  //   → rowCount/columnCount 메타 + 1행 헤더만 읽는다. 이제 append 비용이 시트 크기와 무관하다.
  let headerRow = [], usedRows = 0;
  try {
    const meta = await graphGet(token, `${sheetPathFor(driveId, itemId, name)}/usedRange?$select=rowCount,columnCount`);
    usedRows = meta.rowCount || 0;
    const nCol = meta.columnCount || 0;
    if (usedRows > 0 && nCol > 0) {
      const hr = await graphGet(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A1:${colLetter(nCol)}1')?$select=values`);
      headerRow = (hr.values && hr.values[0]) ? hr.values[0] : [];
    }
  } catch (e) {
    // [260724] 시트 자체가 없으면(ItemNotFound/404) 아래에서 신규 생성. 그 외 오류는 전파.
    if (!/ItemNotFound|Graph GET 404/.test(String((e && e.message) || e))) throw e;
    usedRows = 0; headerRow = [];
  }
  // [260724] 미동기화(없거나 빈) 시트 → 넘어온 행들의 키로 시트를 만들고 헤더를 심은 뒤 이어붙인다.
  //   전시일일 등 최초 저장 시 append 전에 시트가 없어 Graph 404로 저장이 통째로 실패하던 문제 방지.
  //   (기계산출물 손편집 금지 원칙 유지 — 데이터가 아니라 '생성 코드'가 시트를 만들게 함.)
  if (!usedRows || !headerRow.length) {
    if (!rows.length) return { ok: true, sheet: name, appended: 0, fromRow: 0, created: true };
    const newHeaders = [];
    const seenH = {};
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!seenH[k]) { seenH[k] = 1; newHeaders.push(k); } }));
    await ensureSheet(token, name, newHeaders);   // 워크시트 없으면 생성(+A1 헤더)
    const lc = colLetter(newHeaders.length);
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='A1:${lc}1')`, { values: [newHeaders] });   // 기존-빈 시트 대비 헤더 확정
    const nData = rows.map((r) => newHeaders.map((h) => { const v = r[h]; return (v === null || v === undefined) ? "" : String(v); }));
    const nSr = 2, nEr = nSr + nData.length - 1;
    const nAddr = `A${nSr}:${lc}${nEr}`;
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${nAddr}')`, { numberFormat: nData.map(() => newHeaders.map(() => "@")) });
    await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${nAddr}')`, { values: nData });
    return { ok: true, sheet: name, appended: nData.length, fromRow: nSr, created: true };
  }
  const headers = headerRow.map((h) => String(h == null ? "" : h));
  const nextRow = usedRows + 1;
  const lastCol = colLetter(headers.length);
  const data = rows.map((r) => headers.map((h) => { const v = r[h]; return (v === null || v === undefined) ? "" : String(v); }));
  const sr = nextRow, er = sr + data.length - 1;
  const addr = `A${sr}:${lastCol}${er}`;
  await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { numberFormat: data.map(() => headers.map(() => "@")) });
  await graphPatch(token, `${sheetPathFor(driveId, itemId, name)}/range(address='${addr}')`, { values: data });
  return { ok: true, sheet: name, appended: data.length, fromRow: sr };
}
__name(opsAppendRows, "opsAppendRows");

// === 동시 접속자 presence (KV ops_kv, expirationTtl 자동정리) ===
async function handlePresencePost(request, env) {
  let b = {};
  try { b = await request.json(); } catch (e) {}
  const sid = String(b.sid || "").slice(0, 64);
  if (!sid) return { ok: false, error: "no sid" };
  const v = { sid, name: String(b.name || "").slice(0, 40), dept: String(b.dept || "").slice(0, 40), role: String(b.role || "").slice(0, 12), ts: Date.now() };
  try { await env.ops_kv.put("presence:" + sid, JSON.stringify(v), { expirationTtl: 900 }); } catch (e) { return { ok: false, error: String(e) }; }
  return { ok: true };
}
__name(handlePresencePost, "handlePresencePost");
async function handlePresenceGet(env) {
  const users = [];
  try {
    const list = await env.ops_kv.list({ prefix: "presence:" });
    for (const k of (list.keys || [])) {
      try { const raw = await env.ops_kv.get(k.name); if (raw) users.push(JSON.parse(raw)); } catch (e) {}
    }
  } catch (e) {}
  return { now: Date.now(), users };
}
__name(handlePresenceGet, "handlePresenceGet");

// === 공휴일 (KASI 한국천문연구원 특일정보) — KV 캐시 + cron 갱신. 임시·대체공휴일 포함 ===
async function fetchHolidaysFromKasi(env, year) {
  if (!env.KASI_KEY) throw new Error("KASI_KEY 미설정");
  const sk = env.KASI_KEY.includes("%") ? env.KASI_KEY : encodeURIComponent(env.KASI_KEY);
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${sk}&solYear=${year}&solMonth=${mm}&numOfRows=100&_type=json`;
    let r;
    try { r = await fetch(url); } catch (e) { continue; }
    if (!r.ok) continue;
    let j;
    try { j = await r.json(); } catch (e) { continue; }
    let items = j && j.response && j.response.body && j.response.body.items && j.response.body.items.item;
    if (!items) continue;
    if (!Array.isArray(items)) items = [items];
    for (const it of items) {
      if (String(it.isHoliday).trim() !== "Y") continue;
      const loc = String(it.locdate);
      if (loc.length !== 8) continue;
      out.push({ date: `${loc.slice(0, 4)}-${loc.slice(4, 6)}-${loc.slice(6, 8)}`, name: String(it.dateName || "").trim() });
    }
  }
  return out;
}
__name(fetchHolidaysFromKasi, "fetchHolidaysFromKasi");

// 재단 기념일 (매년 고정) — 공휴일 응답에 병합되어 접수 제외·달력 표기에 동일 적용된다.
//   운영자 260801: 개관 기념일 5/10 · 재단 창립 기념일 8/1
var FOUNDATION_ANNIVERSARIES = [
  { md: "05-10", name: "개관 기념일" },
  { md: "08-01", name: "재단 창립 기념일" }
];
function mergeAnniversaries(payload, year) {
  const days = (payload && Array.isArray(payload.days) ? payload.days : []).slice();
  for (const a of FOUNDATION_ANNIVERSARIES) {
    const date = `${year}-${a.md}`;
    if (!days.some((d) => d && d.date === date)) days.push({ date, name: a.name });
  }
  days.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return Object.assign({}, payload, { days });
}
__name(mergeAnniversaries, "mergeAnniversaries");

async function getHolidays(env, year, forceRefresh) {
  const key = `holidays:${year}`;
  if (!forceRefresh) {
    const cached = await env.ops_kv.get(key);
    if (cached) return mergeAnniversaries(JSON.parse(cached), year);
  }
  let days = [];
  try { days = await fetchHolidaysFromKasi(env, year); } catch (e) {}
  if (days.length) {
    const payload = { year, days, cachedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await env.ops_kv.put(key, JSON.stringify(payload));
    return mergeAnniversaries(payload, year);
  }
  const cached = await env.ops_kv.get(key);
  if (cached) return mergeAnniversaries(JSON.parse(cached), year);
  return mergeAnniversaries({ year, days: [], cachedAt: null }, year);
}
__name(getHolidays, "getHolidays");

// ═══════════════════════════════════════════════════════════════════════════
// === 대관 일정 (구글 캘린더 비공개 iCal 피드) — KV 캐시 + 요청 시 창(window) 전개 ===
//   운영자 260731: 「구글 스케줄 하나 붙이고 싶다 · 받아오면 대관 공연이 들어온다 · [대]로 캘린더에 명시」
//   · 캘린더 자체가 대관 전용(운영자 확인) → 이 피드에서 온 일정은 전부 대관(t='r')으로 취급한다.
//   · 자격증명 = env.GCAL_ICS_URL(Cloudflare 시크릿) 하나. 구글 캘린더 설정 ▸ 「비공개 주소(iCal 형식)」 링크.
//     ⚠ 이 URL 자체가 비밀번호다 — 레포·프론트에 절대 안 실린다. Worker만 들고 있고 응답엔 안 담긴다.
//   · 원문 .ics는 KV에 10분 캐시(구글 rate limit 보호) · 전개(반복일정 풀기)는 매 요청마다 요청 창에서만.
// ═══════════════════════════════════════════════════════════════════════════
var GCAL_TTL = 600;   // .ics 원문 캐시 10분

// RFC5545 줄 접힘(folding) 해제 — 다음 줄이 공백/탭으로 시작하면 앞줄에 이어붙인다.
function icsUnfold(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}
__name(icsUnfold, "icsUnfold");

// 값 이스케이프 해제 (\, \; \n \N)
function icsText(v) {
  return String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}
__name(icsText, "icsText");

// VEVENT 블록만 뽑아 { NAME: [{v, p}] } 형태로. p = TZID·VALUE 등 파라미터.
function icsEvents(text) {
  const out = [];
  let cur = null;
  for (const line of icsUnfold(text).split("\n")) {
    const t = line.trim();
    if (t === "BEGIN:VEVENT") { cur = {}; continue; }
    if (t === "END:VEVENT") { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const parts = line.slice(0, i).split(";");
    const name = parts[0].trim().toUpperCase();
    const p = {};
    for (const seg of parts.slice(1)) {
      const j = seg.indexOf("=");
      if (j > 0) p[seg.slice(0, j).trim().toUpperCase()] = seg.slice(j + 1).trim();
    }
    (cur[name] = cur[name] || []).push({ v: line.slice(i + 1), p });
  }
  return out;
}
__name(icsEvents, "icsEvents");

const _KST = 9 * 3600 * 1e3;
function _kstKey(ms) {                       // epoch ms → KST 'YYYY-MM-DD'
  return new Date(ms + _KST).toISOString().slice(0, 10);
}
__name(_kstKey, "_kstKey");
function _kstHM(ms) {                        // epoch ms → KST 'HH:MM'
  return new Date(ms + _KST).toISOString().slice(11, 16);
}
__name(_kstHM, "_kstHM");

// iCal 날짜값 → {ms, allday}. 구글은 VALUE=DATE(종일) · TZID=Asia/Seoul(현지) · ...Z(UTC) 셋만 낸다.
//   종일·현지시각은 KST 벽시계로 해석(= UTC로는 -9h)하여 epoch ms로 통일한다.
function icsDate(f) {
  if (!f) return null;
  const raw = String(f.v || "").trim();
  const allday = (f.p && f.p.VALUE === "DATE") || /^\d{8}$/.test(raw);
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  const base = Date.UTC(+y, +mo - 1, +d, +(hh || 0), +(mi || 0), +(ss || 0));
  // Z = 이미 UTC. 그 외(종일·TZID=Asia/Seoul·floating)는 KST 벽시각 → UTC로 9시간 되돌린다.
  return { ms: z ? base : base - _KST, allday };
}
__name(icsDate, "icsDate");

const _ICS_DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// RRULE 전개 — 요청 창 안의 시작시각들만 돌려준다.
//   지원: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY · INTERVAL · COUNT · UNTIL · BYDAY(주간) · EXDATE.
//   미지원(BYMONTHDAY·BYSETPOS 등)은 기본 규칙으로 떨어진다 — 대관 일정은 대부분 단발이라 실사용 영향 없음.
//   무한 루프 차단 = 최대 800회(≈2년치 일간 반복).
function icsExpand(startMs, rrule, exSet, fromMs, toMs) {
  if (!rrule) return (startMs >= fromMs && startMs <= toMs) ? [startMs] : [];
  const R = {};
  for (const seg of String(rrule).split(";")) {
    const j = seg.indexOf("=");
    if (j > 0) R[seg.slice(0, j).trim().toUpperCase()] = seg.slice(j + 1).trim();
  }
  const freq = (R.FREQ || "").toUpperCase();
  const step = Math.max(1, parseInt(R.INTERVAL || "1", 10) || 1);
  const count = R.COUNT ? parseInt(R.COUNT, 10) : 0;
  const untilD = R.UNTIL ? icsDate({ v: R.UNTIL, p: {} }) : null;
  const until = untilD ? untilD.ms : 0;
  const byday = R.BYDAY ? R.BYDAY.split(",").map((s) => _ICS_DOW[s.trim().slice(-2).toUpperCase()]).filter((n) => n !== void 0) : [];
  const out = [];
  const s0 = new Date(startMs);
  let n = 0, emitted = 0;
  for (let i = 0; i < 800; i++) {
    let occ;
    if (freq === "DAILY") occ = startMs + n * step * 864e5;
    else if (freq === "WEEKLY") occ = startMs + n * step * 7 * 864e5;
    else if (freq === "MONTHLY") { const d = new Date(startMs); d.setUTCMonth(d.getUTCMonth() + n * step); occ = d.getTime(); }
    else if (freq === "YEARLY") { const d = new Date(startMs); d.setUTCFullYear(d.getUTCFullYear() + n * step); occ = d.getTime(); }
    else return (startMs >= fromMs && startMs <= toMs) ? [startMs] : [];
    n++;
    if (until && occ > until) break;
    if (occ > toMs + 7 * 864e5) break;
    // 주간 BYDAY = 그 주(간격 적용된 주)의 지정 요일들로 확장
    const cands = (freq === "WEEKLY" && byday.length)
      ? byday.map((w) => {
          const d = new Date(occ);
          const cur = new Date(d.getTime() + _KST).getUTCDay();   // KST 기준 요일
          return d.getTime() + (w - cur) * 864e5;
        })
      : [occ];
    for (const c of cands) {
      if (c < startMs) continue;
      if (until && c > until) continue;
      if (exSet.has(_kstKey(c))) continue;
      emitted++;
      if (count && emitted > count) return out;
      if (c >= fromMs && c <= toMs) out.push(c);
    }
    if (count && emitted >= count) break;
  }
  void s0;
  return out;
}
__name(icsExpand, "icsExpand");

// 구글 .ics 재다운로드 + KV 갱신 — 성공분만 캐시에 쓴다. 반환 = 원문(실패 시 "").
async function gcalRefresh(env) {
  let txt = "";
  try {
    const r = await fetch(env.GCAL_ICS_URL, { headers: { "User-Agent": "yeulmaru-promo-worker" } });
    if (r.ok) txt = await r.text();
  } catch (e) {}
  if (txt && txt.indexOf("BEGIN:VCALENDAR") >= 0) {
    try { await env.ops_kv.put("gcal:ics", txt, { expirationTtl: GCAL_TTL }); } catch (e) {}
    try { await env.ops_kv.put("gcal:ics:last", txt); } catch (e) {}
    return txt;
  }
  return "";
}
__name(gcalRefresh, "gcalRefresh");

// .ics 원문 — KV 10분 캐시. 실패 시 마지막 성공본으로 폴백(구글 장애에도 화면 안 비게).
// [260801 운영자] stale-while-revalidate — 10분 캐시가 식었어도 「마지막 성공본」이 있으면 그걸 즉시 돌려주고
//   구글 재다운로드는 ctx.waitUntil로 응답 뒤에 돌린다. 10분마다 한 명이 구글 왕복을 통째로 뒤집어쓰던 몫 제거
//   (= 「대관만 늦게 뜬다」의 서버측 지분). refresh=1(force)은 종전대로 동기 갱신.
async function gcalRaw(env, force, ctx) {
  const url = env.GCAL_ICS_URL;
  if (!url) throw new Error("GCAL_ICS_URL 미설정");
  if (!force) {
    try { const c = await env.ops_kv.get("gcal:ics"); if (c) return c; } catch (e) {}
    try {
      const stale = await env.ops_kv.get("gcal:ics:last");
      if (stale && ctx && typeof ctx.waitUntil === "function") { ctx.waitUntil(gcalRefresh(env)); return stale; }
    } catch (e) {}
  }
  const txt = await gcalRefresh(env);
  if (txt) return txt;
  const last = await env.ops_kv.get("gcal:ics:last");
  if (last) return last;
  throw new Error("구글 캘린더 응답 없음");
}
__name(gcalRaw, "gcalRaw");

// [from, to] (KST 날짜키) 창의 대관 일정을 날짜별로 펼쳐 돌려준다.
async function gcalDays(env, from, to, force, ctx) {
  const txt = await gcalRaw(env, force, ctx);
  const fromMs = Date.parse(from + "T00:00:00Z") - _KST;
  const toMs = Date.parse(to + "T23:59:59Z") - _KST;
  const days = [];
  for (const ev of icsEvents(txt)) {
    const st = icsDate(ev.DTSTART && ev.DTSTART[0]);
    if (!st) continue;
    if (String((ev.STATUS && ev.STATUS[0] && ev.STATUS[0].v) || "").toUpperCase() === "CANCELLED") continue;
    const en = icsDate(ev.DTEND && ev.DTEND[0]);
    const durMs = en ? Math.max(0, en.ms - st.ms) : 0;
    const title = icsText(ev.SUMMARY && ev.SUMMARY[0] && ev.SUMMARY[0].v) || "대관";
    const place = icsText(ev.LOCATION && ev.LOCATION[0] && ev.LOCATION[0].v);
    const uid = icsText(ev.UID && ev.UID[0] && ev.UID[0].v) || (title + st.ms);
    const exSet = /* @__PURE__ */ new Set();
    for (const x of (ev.EXDATE || [])) {
      for (const one of String(x.v).split(",")) {
        const d = icsDate({ v: one.trim(), p: x.p });
        if (d) exSet.add(_kstKey(d.ms));
      }
    }
    const rrule = ev.RRULE && ev.RRULE[0] && ev.RRULE[0].v;
    for (const occ of icsExpand(st.ms, rrule, exSet, fromMs, toMs)) {
      // 여러 날 걸친 일정 = 걸친 날짜 전부에 찍는다. 종일 일정의 DTEND는 배타(exclusive)라 하루 뺀다.
      const lastMs = st.allday ? occ + Math.max(0, durMs - 864e5) : occ + durMs;
      let dk = _kstKey(occ);
      const endKey = _kstKey(lastMs);
      for (let guard = 0; guard < 400; guard++) {
        if (dk >= from && dk <= to) {
          days.push({
            id: "gc:" + uid + ":" + dk,
            d: dk,
            title,
            place,
            allday: !!st.allday,
            st: st.allday ? "" : _kstHM(occ),
            et: (st.allday || !durMs) ? "" : _kstHM(occ + durMs)
          });
        }
        if (dk >= endKey) break;
        dk = _kstKey(Date.parse(dk + "T00:00:00Z") + 864e5);
      }
    }
  }
  days.sort((a, b) => (a.d === b.d ? String(a.st).localeCompare(String(b.st)) : a.d.localeCompare(b.d)));
  return { ok: true, from, to, days, count: days.length };
}
__name(gcalDays, "gcalDays");

// ═══ [260801 운영자] 대관 DB 통합 — 구글 캘린더 대관 일정을 SharePoint 「프로그램」 시트에 편입 ═══
//   운영자 결정 = ① 시트에 실제 기록(그전엔 구글 피드가 어느 시트에도 안 남고 브라우저 메모리에서만 살았다)
//                ② 표시 전용 = 홍보 신청·판매 집계 대상에서 제외.
//   · 소유 표식 = 프로그램ID `R<yymmdd>_<해시4>` — 사람 채번(YYMMDD_NN)과 패턴이 갈려 서로 순번을 잠식하지 않는다.
//     **이 접두를 가진 행만** 이 동기화가 건드린다(다른 행 물리적 무접촉 불변식).
//   · 홍보노출='N' + 홍보시작일·판매기간 공백 = 홍보 게이트·판매 집계 밖.
//   · 앱 화면은 종전대로 구글 라이브 오버레이가 그린다(셋업 「셋」 표기가 제목 파싱에만 있어 시트 열로 못 옮긴다)
//     → 프런트는 이 행들을 PERFS에 안 싣는다(index.html loadPrograms의 GCAL_SYNC_RE 분리). 화면 회귀 0.
//   · 창 = 오늘 −30일 ~ +180일. 그 창 안에서만 추가·수정·삭제하고 창 밖(지난 기록)은 보존한다.
//   · 안전장치: cron 자동 실행은 env.GCAL_SYNC === '1'일 때만. 수동 = POST /api/gcal/sync (admin · ?dry=1 = 미리보기).
var GCAL_SYNC_RE = /^R\d{6}_[0-9a-z]{4}$/;
var GCAL_SYNC_BACK = 30, GCAL_SYNC_FWD = 180;
var GCAL_PLACE = { "대": "대극장", "소": "소극장", "장": "장도", "7층": "7층", "야외": "야외", "리1": "리허설실1", "리1,2": "리허설실1·2" };
var GCAL_DROP = /^(공사|점검|휴관|휴무)$/;

function gcalHash4(s) {   // UID → 4자리 base36 안정 키(같은 일정 = 같은 행)
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(-4).padStart(4, "0");
}
__name(gcalHash4, "gcalHash4");

function isoToSerial(iso) {   // 'YYYY-MM-DD' → 엑셀 날짜 일련번호(1899-12-30 기준) · 프런트 isoToExcelSerial과 동일 규격
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  return Math.round(Date.parse(iso + "T00:00:00Z") / 864e5) + 25569;
}
__name(isoToSerial, "isoToSerial");

// ═══ [260804 운영자] 「여수음악제 원래 하나로 합쳐놨는데. 이게 캘린더에만 반영이되었나봐.
//     db단에도 하나로 대관 공연이 합쳐져야되거든?」 ═══
//   진단: 병합·보정이 **프런트에만** 있었다. 시트 쓰기 경로는 원본 제목을 그대로 써서 같은 일정이 시트엔 2행으로 남았다.
//   아래 2층을 이식해 캘린더와 시트를 같은 결과로 맞춘다.
//   ⚠ 쌍둥이 계약 — 표·규칙은 index.html의 _GC_TITLE_FIX/_gcTitleFix/_gcNorm/_gcSubsumeDay와 같은 규격이다.
//     한쪽만 고치면 시트 이름과 캘린더 이름이 갈린다(중복 판정 실패) → 고칠 땐 반드시 양쪽 같이.
//   ※ index.html의 _GC_FIX(날짜 **하루 단위** drop/rename)는 이식하지 않았다 — 시트 한 행 = 일정 전체(시작~종료)라
//     「그 날 하루만 지우기」가 행 모델에 안 맞는다(기간을 쪼개야 함). 접기만으로도 여수음악제는 1행이 된다.
var GCAL_TITLE_FIX = [
  { raw: "[대][기획]LG피아노", title: "[대][기획]LG피아노 26일 셋업 27일 공연" },
  { raw: "[대][대관]여수음악제 특별공연 19:30", title: "[대][대관]여수예총 여수음악제 특별공연 19:30" },
  { raw: "[대][대관]에코국제음악제 영재원오케스트라 공연 19:30", title: "[대][대관]여수 에코국제음악제 19:30" },
  { raw: "[대][대관]여수영재원오케스트라 정기연주회 17:00", title: "[대][대관]여수영재오케스트라 정기연주회 17:00" },
  { raw: "[리1][대관]영재오케스트라 연습 13:00~17:00", title: "[리1][대관]여수영재오케스트라" },
  { raw: "[리1,2][대관] 전남학생예술교육페스티벌 대기실", title: "[리1,2][대관]전남학생교육페스티벌 대기실" },
  { raw: "'[야외][기획]입주작가전 '안민환'", title: "[야외][기획]창작스튜디오 입주작가전 안민환" }
];

function gcalNorm(s) { return String(s || "").replace(/[\s·\-_~,.'"()\[\]:<>〈〉《》「」『』【】]/g, "").toLowerCase(); }
__name(gcalNorm, "gcalNorm");

function gcalTitleFix(title) {
  const k = gcalNorm(title);
  for (let i = 0; i < GCAL_TITLE_FIX.length; i++) if (gcalNorm(GCAL_TITLE_FIX[i].raw) === k) return GCAL_TITLE_FIX[i].title;
  return title;
}
__name(gcalTitleFix, "gcalTitleFix");

// 「본 일정 + 그 하위 일정」이 겹치는 기간에 함께 오면 본 일정만 남긴다(프런트 _gcSubsumeDay의 시트판).
//   프런트는 「같은 날」이 단위지만 시트 한 행은 일정 전체(s~e)라 여기선 **기간이 겹치는지**로 본다.
//   판정 = 정규화 이름이 다른 항목의 이름을 통째로 품을 때만(더 짧은 쪽 = 본 일정). 조금이라도 어긋나면 남남 = 둘 다 남긴다(오제거 0).
//   3자 미만 이름은 포함 판정이 위험해 제외 — 프런트의 「3자 미만 제외」 계약 계승.
//   실데이터: 「여수음악제」(대극장 8/29~30) ⊂ 「여수음악제 임산부를위한음악회」(소극장 8/30) → 뒤엣것이 접힌다 = 1행.
function gcalSubsume(want) {
  const ids = Object.keys(want);
  if (ids.length < 2) return want;
  const out = {};
  for (const id of ids) {
    const a = want[id], ka = gcalNorm(a.name);
    let covered = false;
    if (ka.length >= 3) {
      for (const other of ids) {
        if (other === id) continue;
        const b = want[other], kb = gcalNorm(b.name);
        if (kb.length < 3 || kb.length >= ka.length) continue;   // 더 짧은 쪽만 「본 일정」 후보
        if (ka.indexOf(kb) < 0) continue;                        // 이름을 통째로 품지 않으면 남남
        if (a.s > b.e || b.s > a.e) continue;                    // 기간이 안 겹치면 남남
        covered = true; break;
      }
    }
    if (!covered) out[id] = a;
  }
  return out;
}
__name(gcalSubsume, "gcalSubsume");

// 제목 → {name, kind, place, drop} — 프런트 _gcParse의 '행 정보'용 축약본.
// ⚠ 쌍둥이: 태그 규격([공간][구분])·공간 표기·제외 규칙·이름 절단 경계는 index.html의 _gcParse/_GC_PLACE/_GC_DROP과 같은 규격이다
//   (한쪽만 고치면 시트 이름과 캘린더 이름이 갈린다 = 중복 판정 실패). 셋업 판정은 담을 열이 없어 여기선 안 한다.
//   [260804] 제목 보정(gcalTitleFix)을 파싱 **앞**에 태운다 — 캘린더와 같은 순서(보정 → 파싱 → 접기).
function gcalParseRow(title) {
  let raw = String(gcalTitleFix(title) || "").replace(/^['"\s]+/, ""), tags = [], rest = raw, m;
  while ((m = rest.match(/^\s*\[([^\]]*)\]/))) { tags.push(m[1].trim()); rest = rest.slice(m[0].length); }
  rest = rest.trim();
  let kindTag = "", placeTag = "";
  tags.forEach((t) => { if (t === "대관" || t === "기획") { if (!kindTag) kindTag = t; } else if (!placeTag) placeTag = t; });
  const masked = rest.replace(/\d{1,2}:\d{2}/g, (x) => "§".repeat(x.length));   // 시간은 같은 길이로 덮는다(문자 위치 보존)
  let cut = masked.length;
  const marks = [/\d{1,2}\/\d{1,2}/, /\d{1,2}(?:\s*[~,]\s*\d{1,2})*\s*일/, /§/];
  marks.forEach((re) => { const g = masked.match(re); if (g && g.index >= 0 && g.index < cut) cut = g.index; });
  // 키워드 경계 = 프런트 _gcParse의 KWRE 그대로: 셋업·철수·공연은 앞 경계 요구(한글 뒤 「송년공연」은 키워드 아님) ·
  //   연습·리허설은 이름에 그대로 붙어 오는 실데이터(「오케스트라더여수연습 9/11」)가 있어 경계를 요구하지 않는다([260731 4차]).
  const kw = masked.match(/(?:^|[\s\]0-9일])(셋업|철수|공연)|(연습|리허설)/);
  if (kw) { const w = kw[1] || kw[2]; const at = kw.index + kw[0].length - w.length; if (at < cut) cut = at; }
  const name = (rest.slice(0, cut).replace(/[\s,·\-~]+$/, "").replace(/^[\s,·\-~]+/, "") || rest).trim();
  return { name, kind: kindTag || "대관", place: GCAL_PLACE[placeTag] || placeTag || "", drop: GCAL_DROP.test(name) };
}
__name(gcalParseRow, "gcalParseRow");

// 구글 대관 일정 ↔ 「프로그램」 시트 대조 후 추가·수정·삭제. dry=true면 계획만 돌려주고 시트는 안 건드린다.
async function gcalSyncPrograms(env, token, opts) {
  const dry = !!(opts && opts.dry);
  const nowKst = new Date(Date.now() + 9 * 3600 * 1e3);
  const day = (n) => { const d = new Date(nowKst); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const from = day(-GCAL_SYNC_BACK), to = day(GCAL_SYNC_FWD);
  const feed = await gcalDays(env, from, to, false, null);
  // 날짜별로 펼쳐 온 것을 일정(uid) 단위로 다시 묶는다 — 시트 한 행 = 일정 하나(시작~종료)
  const grp = {}, order = [];
  ((feed && feed.days) || []).forEach((x) => {
    if (!x || !x.d) return;
    const uid = String(x.id || "").replace(/^gc:/, "").replace(/:[^:]*$/, "") || String(x.title || "");
    if (!grp[uid]) { grp[uid] = { title: x.title || "", place: x.place || "", days: [] }; order.push(uid); }
    grp[uid].days.push(x.d);
  });
  let want = {};   // [260804] 아래에서 gcalSubsume로 갈아끼운다(하위 일정 접기) → const 불가
  for (const uid of order) {
    const g = grp[uid];
    g.days.sort();
    const s = g.days[0], e = g.days[g.days.length - 1];
    const p = gcalParseRow(g.title);
    if (p.drop || !p.name) continue;          // 공사·점검류 = 공연 아님
    if (p.kind !== "대관") continue;          // [기획] = 사람이 정본에 등록하는 몫(운영자 「기획은 이미 등록된 게 우선」)
    want["R" + s.slice(2).replace(/-/g, "") + "_" + gcalHash4(uid)] = { name: p.name, place: p.place || g.place || "", s, e };
  }
  // [260804 운영자 「db단에도 하나로 대관 공연이 합쳐져야되거든?」] 본 일정에 흡수되는 하위 일정을 여기서 접는다.
  //   순서 = 캘린더와 같다(제목 보정 → 파싱 → 접기). 접힌 건은 want에서 빠지므로, 이미 시트에 있던 그 행은
  //   아래 「want에 없는 우리 행 = removed」 규칙에 걸려 지워진다 = 2행 → 1행.
  want = gcalSubsume(want);
  // 시트 현황 — 우리 소유(R 접두) 행만 집계
  const { headers, rows } = await handleGetSheet(token, SP.programSheetName);
  const idOf = (r) => String(r["프로그램ID"] != null ? r["프로그램ID"] : (r["공연ID"] || "")).trim();
  const have = {};
  let maxNo = 0;
  rows.forEach((r) => {
    const n = parseInt(String(r["NO"] || "").replace(/[^0-9]/g, ""), 10); if (n > maxNo) maxNo = n;
    const id = idOf(r); if (GCAL_SYNC_RE.test(id)) have[id] = r;
  });
  const serialToIso = (v) => {
    if (v === "" || v == null) return "";
    if (typeof v === "number") return new Date((v - 25569) * 864e5).toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  };
  const rowValues = (no, id, w) => [no, "대관", w.name, w.name, "", "", isoToSerial(w.s), isoToSerial(w.e), "", w.place || "", "", id, ""];
  const plan = { added: [], updated: [], removed: [], kept: 0, window: [from, to], dry };
  for (const id of Object.keys(want)) {
    const w = want[id], cur = have[id];
    if (!cur) { plan.added.push({ id, name: w.name, s: w.s, e: w.e, place: w.place }); continue; }
    const same = String(cur["풀네임"] || "") === w.name && String(cur["장소"] || "") === (w.place || "")
      && serialToIso(cur["시작일"]) === w.s && serialToIso(cur["종료일"]) === w.e;
    if (same) plan.kept++; else plan.updated.push({ id, row: cur._rowIndex, name: w.name, s: w.s, e: w.e, place: w.place });
  }
  for (const id of Object.keys(have)) {
    if (want[id]) continue;
    const st = serialToIso(have[id]["시작일"]);
    if (!st || st < from || st > to) continue;   // 창 밖(지난 기록) = 보존
    plan.removed.push({ id, row: have[id]._rowIndex, name: String(have[id]["풀네임"] || "") });
  }
  if (dry || (!plan.added.length && !plan.updated.length && !plan.removed.length)) return plan;
  const { driveId, itemId } = await findFile(token);
  const sheet = sheetPathFor(driveId, itemId, SP.programSheetName);
  let nextRow = rows.length ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  let no = maxNo;
  for (const a of plan.added) {
    const vals = rowValues(++no, a.id, want[a.id]);
    await graphPatchRetry(token, `${sheet}/range(address='A${nextRow}:${colLetter(vals.length)}${nextRow}')`, { values: [vals] });
    try { await writeProgramSideCells(token, driveId, itemId, SP.programSheetName, nextRow, { "홍보노출": "N" }, headers); } catch (e) { console.error("gcal sync side cells", e); }
    a.row = nextRow++;
  }
  for (const u of plan.updated) {
    const cur = have[u.id];
    const vals = rowValues(cur["NO"] || "", u.id, want[u.id]);
    await graphPatchRetry(token, `${sheet}/range(address='A${u.row}:${colLetter(vals.length)}${u.row}')`, { values: [vals] });
  }
  for (const rm of plan.removed) {
    const width = Math.max(13, (headers && headers.length) || 13);
    await graphPatchRetry(token, `${sheet}/range(address='A${rm.row}:${colLetter(width)}${rm.row}')`, { values: [Array(width).fill("")] });
  }
  invalidateSheetCache("program");
  try { await logToSheet(token, "system", "SYNC", SP.programSheetName, 0, `대관 동기화 +${plan.added.length} ~${plan.updated.length} -${plan.removed.length}`); } catch (e) {}
  return plan;
}
__name(gcalSyncPrograms, "gcalSyncPrograms");


// === LLM 공용 호출 — Gemini(무료, 우선) 또는 Claude(API키/OAuth) ===
// GEMINI_API_KEY 있으면 Gemini, 없으면 Claude. (구독 OAuth는 앱 백엔드에서 403이라 사실상 Claude는 API키 필요)
async function geminiText(env, system, userText, maxTokens) {
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
  const body = {
    systemInstruction: { parts: [{ text: String(system || "") }] },
    contents: [{ role: "user", parts: [{ text: String(userText || "") }] }],
    generationConfig: { maxOutputTokens: maxTokens || 4000, temperature: 0.7 }
  };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error("Gemini " + resp.status + ": " + (await resp.text()).slice(0, 300));
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  const text = (((cand.content || {}).parts) || []).map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini 빈 응답");
  return text;
}
__name(geminiText, "geminiText");

async function claudeText(env, system, userText, maxTokens) {
  const model = env.BLOG_MODEL || "claude-opus-5";
  const headers = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
  if (env.ANTHROPIC_API_KEY) {
    headers["x-api-key"] = env.ANTHROPIC_API_KEY;
  } else {
    headers["authorization"] = "Bearer " + env.ANTHROPIC_AUTH_TOKEN;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  }
  const sysParam = (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_AUTH_TOKEN)
    ? [{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." }, { type: "text", text: system }]
    : system;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers,
    body: JSON.stringify({ model, max_tokens: maxTokens || 4000, system: sysParam, messages: [{ role: "user", content: userText }] })
  });
  if (!resp.ok) throw new Error("Anthropic " + resp.status + ": " + (await resp.text()).slice(0, 300));
  const data = await resp.json();
  const text = (data.content || []).filter((x) => x.type === "text").map((x) => x.text).join("").trim();
  if (!text) throw new Error("빈 응답");
  return text;
}
__name(claudeText, "claudeText");

async function llmText(env, system, userText, maxTokens) {
  if (env.GEMINI_API_KEY) return geminiText(env, system, userText, maxTokens);
  return claudeText(env, system, userText, maxTokens);
}
__name(llmText, "llmText");

// === 콘텐츠 제작 — 네이버 블로그 초안 AI 생성 ===
// b = {tpl,topic,content,length,voice,tags,emoji,refs:[{text}]}. LLM = GEMINI_API_KEY 또는 ANTHROPIC_*.
async function generateBlogDraft(env, b) {
  const lenMap = {
    "짧게": "600~900자 내외로 짧고 간결하게",
    "보통": "1,200~1,800자 분량으로",
    "길게": "2,500자 이상 충분히 길고 풍성하게"
  };
  const lengthGuide = lenMap[b.length] || lenMap["보통"];
  const voice = String(b.voice || "정중하고 따뜻한");
  const wantEmoji = b.emoji !== false;
  const topic = String(b.topic || "").slice(0, 2000).trim();
  // 의도(why) — 사용자가 직접 고르는 ★1번(AIDA 기반). 사실(OCR)과 분리. 글의 방향을 잡아 모호함을 없앤다.
  const intent = String(b.intent || b.purpose || "").slice(0, 1500).trim();
  // 타겟 관점 = 디자인 싱킹(공감지도) — 독자가 했으면 하는 '생각(Think)'과 '느낌(Feel)'. 칩 선택값이 넘어온다.
  const audThink = String(b.audThink || b.wantKnow || "").slice(0, 800).trim();
  const audFeel = String(b.audFeel || "").slice(0, 800).trim();
  const target = String(b.target || "").slice(0, 500).trim();
  const extra = String(b.extra || "").slice(0, 4000).trim();
  // 4️⃣ 기본 틀(글 구성) — 있으면 이 순서·구성을 따른다. 없으면 톤 참조(레퍼토리) 기반.
  const template = String(b.template || "").slice(0, 1500).trim();
  // 수정 요청 — 1차 초안(prevDraft) + 의견(revise)이 오면 재생성(다듬기) 모드.
  const prevDraft = String(b.prevDraft || "").slice(0, 12000).trim();
  const revise = String(b.revise || "").slice(0, 1000).trim();
  // 홍보물 OCR로 추출한 '사실'(육하원칙) — 사람이 검증한 값이 넘어온다.
  const facts = (b.facts && typeof b.facts === "object") ? b.facts : {};
  const FLABEL = { overview: "개요(무엇을·왜)", when: "일시(언제)", where: "장소(어디서)", who: "출연·주최(누가)", price: "가격·예매·문의(어떻게)", detail: "상세 내용" };
  const factLines = [];
  ["overview", "when", "where", "who", "price", "detail"].forEach((k) => {
    const v = String(facts[k] || "").trim();
    if (v) factLines.push("- " + FLABEL[k] + ": " + v);
  });
  const keys = (Array.isArray(b.keys) ? b.keys : [])
    .map((k) => String(k || "").trim()).filter(Boolean).slice(0, 5);
  const refs = Array.isArray(b.refs)
    ? b.refs.map((r) => String((r && r.text) || "").trim()).filter(Boolean).slice(0, 5)
    : [];

  let toneBlock = "";
  if (refs.length) {
    toneBlock = "\n\n# 톤 참조 — 이전에 작성한 글들\n" +
      "아래 글들의 말투, 문장 길이, 어휘 선택, 문단 구성, 이모지 사용 습관을 최대한 비슷하게 따라 써 주세요.\n" +
      refs.map((t, i) => "[예시 " + (i + 1) + "]\n" + t.slice(0, 4000)).join("\n\n");
  }

  // [BW-1·6·7·8] 문체 계약 = nb-blog.yml(실사용 경로)과 동기 유지 — 이 엔드포인트는 현재 프론트 미사용(예비)이지만 프롬프트 드리프트 방지.
  //  ⚠️ 이 파일은 git 반영 ≠ 배포 — Cloudflare 재배포해야 실반영(앱지침 §시스템 설계).
  const system = "당신은 GS칼텍스 예울마루(전남 여수에 있는 복합문화예술공간)에서 일하는 홍보 담당 직원입니다. " +
    "회사 공식 네이버 블로그에 올릴 한국어 포스팅 초안을, AI가 아니라 사람 직원이 쓴 글로 읽히게 작성합니다. 가장 중요한 것은 글쓴이가 밝힌 '의도·목적'을 분명히 달성하는 것입니다 — " +
    "글 전체가 그 의도를 향하도록 구성하고, 의도가 흐려져 모호한 글이 되지 않게 하세요. 지시가 상충하면 ①사실 정확성 ②의도 달성 ③자연스러운 말투 순으로 따르세요. " +
    "[문체 계약 — AI 냄새 금지, BW-1] 기사·보도자료 문어체(「이 뜻깊은 해를 기념해」 「~가 무대에 오릅니다」 「~를 선사합니다」 「~의 향연」 「잊지 못할 감동」류), 과장 수식어 연발, " +
    "모든 문단이 비슷한 길이·구조, 문단마다 기계적인 이모지, 「~인데요」 「~죠」 어미의 단조 반복은 금지. AI 티는 편차 없는 균일함에서 납니다 — " +
    "문단마다 온도(차분한 사실/귀띔하는 사담/힘 있는 강조/담백한 마무리)를 다르게, 한 문장 단독 문단은 글 전체 1~2번, 입말(「근데」 「솔직히」)은 2~3번만. 단 변주를 순번 돌려막기로 하면 그것도 AI 티 — 내용상 필요할 때만. " +
    "대신 옆자리 동료에게 소개하듯 존댓말로, 문장 길이에 리듬을 주고, 형용사 대신 구체적 사실 하나로 설득하며, 담당자 시점의 목소리를 한두 스푼(실제가 아닌 경험담·가짜 후기 창작은 금지). " +
    "[서사 — 기승전결, BW-7] 도입은 공지형(「~을 소개합니다」·공연명·날짜 시작) 금지 — 장면·질문·검증된 의외의 사실 중 하나로 열고, " +
    "「봐야 하는 이유」는 첫 문단에 다 말하지 말고 글 40~70% 지점에서 검증된 사실 하나로 짧은 독립 문단에 착지(「과연 그 이유는?」식 낚시 금지). " +
    "결말은 실용 정보 → 근거 있는 행동 유도 한 줄 → 도입과 연결되는 여운 한 문장. " +
    "[전문지식, BW-8] 주어진 자료에서 확인되는 디테일만 1~2개, 감상 포인트로 기능하게 녹이고 전문용어는 같은 문장에서 반 문장으로 풀기(백과사전식 나열 금지). " +
    "[사진 자리, BW-6] 사진이 이해를 돕는 지점 3~5곳에 「[사진: 무엇을 찍은 사진인지 — 캡션: 20자 안팎 한 줄]」 형식의 단독 줄을 넣으세요(포스터/출연진/공연 장면/공연장/좌석 배치도/오시는 길 등 실제 보유 가능한 것만 — 글만으로 이해되게 쓰고 사진은 보조). " +
    "다 쓴 뒤 금지 패턴·같은 종결어미 3연속·근거 없는 사실이 남았는지 스스로 검토하고 고친 최종본만 내보내세요. " +
    "공연·행사의 사실 정보(일시·장소·출연·가격 등)는 아래 '공연 정보'와 '추가 참고'에 주어진 범위 안에서만 사용하고, 없는 사실을 임의로 지어내지 마세요. " +
    "유명하지 않은 공연일 수 있으니 주어진 정보만으로도 충실하고 매력적인 글이 되도록 쓰세요. " +
    "결과는 곧바로 붙여넣을 수 있도록 '제목 한 줄 + 본문'만, 설명·머리말·코드블록 없이 글 본문 텍스트만 내보내세요.";

  let user = "다음 정보로 네이버 블로그 글 초안을 작성해 주세요.\n\n";
  user += "# 글의 주제(공연·행사명)\n" + topic + "\n\n";
  if (intent) user += "# 이 글을 쓰는 의도·목적 ★가장 중요 — 글 전체가 이 의도를 이루는 방향으로 쓰일 것\n" + intent + "\n\n";
  if (target) user += "# 주요 타겟 독자\n" + target + "\n\n";
  if (audThink) user += "# 독자가 이 글을 읽고 했으면 하는 생각 (이 인상이 남도록 구성)\n" + audThink + "\n\n";
  if (audFeel) user += "# 독자가 이 글에서 느꼈으면 하는 감정 (이 분위기로 톤을 잡을 것)\n" + audFeel + "\n\n";
  if (factLines.length) user += "# 공연·행사 정보 (홍보물에서 추출·검증한 사실 — 이 범위 안에서만 사용)\n" + factLines.join("\n") + "\n\n";
  if (keys.length) user += "# 꼭 전해야 할 핵심 메시지 (모두 본문에 자연스럽게 녹일 것)\n" + keys.map((k, i) => (i + 1) + ". " + k).join("\n") + "\n\n";
  if (extra) user += "# 추가 참고 자료 (보도·리뷰·메모 등 — 사실 확인용)\n" + extra + "\n\n";
  if (template) user += "# 글의 구성 틀 (아래 순서·구성을 따라 단락을 배치할 것)\n" + template + "\n\n";
  user += "# 작성 지침\n" +
    "- 분량: " + lengthGuide + "\n" +
    "- 말투/톤: " + voice + " 느낌\n" +
    "- 글의 '의도·목적'을 분명히 달성하도록, 타겟 독자의 눈높이에서 구성\n" +
    (template ? "- 위 '글의 구성 틀'의 순서·흐름을 따르되, 단락은 자연스럽게 이어 쓸 것\n" : "- 글의 구성은 톤 참조(이전 글)의 흐름을 자연스럽게 따를 것\n") +
    "- 이모지: " + (wantEmoji ? "문단 사이에 어울리는 이모지를 적당히 사용" : "이모지는 사용하지 않음") + "\n" +
    "- 해시태그는 넣지 않음\n" +
    "- 위에 주어진 사실(공연 정보·추가 참고) 범위 안에서만 작성하고, 없는 구체 사실(가격·날짜·출연진 등)은 임의로 만들지 말 것" +
    toneBlock;

  // 수정 요청 모드 — 기존 초안을 사용자의 의견대로 다시 다듬는다(사실·의도는 유지).
  if (prevDraft && revise) {
    user = "방금 작성한 아래 블로그 초안을, 사용자의 수정 요청대로 고쳐 전체 글을 다시 완성해 주세요. " +
      "요청과 무관한 부분은 기존 톤과 사실을 유지하고, 결과는 '제목 한 줄 + 본문'만 출력하세요.\n\n" +
      "# 기존 초안\n" + prevDraft + "\n\n" +
      "# 수정 요청\n" + revise + "\n\n" +
      "---\n아래는 이 글의 원래 입력 정보입니다(사실·의도 유지에 참고하세요):\n\n" + user;
  }

  return await llmText(env, system, user, (b.length === "길게" ? 8000 : 4000));
}
__name(generateBlogDraft, "generateBlogDraft");

// === 홍보물 이미지 OCR — Claude 비전으로 포스터/리플릿의 '사실'을 육하원칙 JSON으로 추출 ===
// img = { mime, data(base64, dataURL 접두사 제거) }. 이미지에 적힌 내용만 추출(추측 금지) → 사람이 검증.
async function extractPromoInfo(env, img) {
  const model = env.OCR_MODEL || env.BLOG_MODEL || "claude-opus-5";
  const headers = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
  if (env.ANTHROPIC_AUTH_TOKEN) {
    headers["authorization"] = "Bearer " + env.ANTHROPIC_AUTH_TOKEN;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  } else {
    headers["x-api-key"] = env.ANTHROPIC_API_KEY;
  }
  const system = "당신은 공연·전시 홍보물(포스터·리플릿) 이미지를 읽어 사실 정보를 정확히 추출하는 도우미입니다. " +
    "이미지에 실제로 적혀 있는 내용만 추출하세요. 보이지 않거나 확실하지 않은 항목은 빈 문자열로 두고, 절대 추측하거나 지어내지 마세요. " +
    "한국어로, 적힌 표현을 최대한 그대로 옮기세요.";
  // 구독 OAuth 토큰은 system 첫 블록이 Claude Code 신원이어야 호출 허용(아니면 403 Request not allowed).
  const sysParam = env.ANTHROPIC_AUTH_TOKEN
    ? [{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." }, { type: "text", text: system }]
    : system;
  const ask = "이 홍보물에서 정보를 읽어 아래 JSON 형식으로만 출력하세요. 설명·코드블록·머리말 없이 JSON 객체만 출력합니다.\n\n" +
    "{\n" +
    '  "title": "공연·행사명(부제 포함)",\n' +
    '  "overview": "무엇을·왜를 한두 문장으로 요약한 개요",\n' +
    '  "when": "일시 — 날짜·요일·시간(여러 회차면 모두)",\n' +
    '  "where": "장소(공연장·홀 이름)",\n' +
    '  "who": "출연·연주·지휘·주최·주관·기획 등 사람/기관",\n' +
    '  "price": "티켓 가격(등급별)·할인·예매처·문의 연락처",\n' +
    '  "detail": "프로그램·곡목·출연진·줄거리·관람등급·러닝타임 등 본문에 쓸 상세 내용을 이미지 문구 위주로 길게"\n' +
    "}";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model, max_tokens: 2000,
      system: sysParam,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: img.mime || "image/jpeg", data: img.data } },
        { type: "text", text: ask }
      ] }]
    })
  });
  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error("Anthropic " + resp.status + ": " + errTxt.slice(0, 300));
  }
  const data = await resp.json();
  let txt = (data.content || []).filter((x) => x.type === "text").map((x) => x.text).join("").trim();
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let obj = {};
  try { obj = JSON.parse(txt); } catch (e) {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = { detail: txt }; } }
    else obj = { detail: txt };
  }
  const out = {};
  ["title", "overview", "when", "where", "who", "price", "detail"].forEach((k) => { out[k] = String(obj[k] || "").trim(); });
  return out;
}
__name(extractPromoInfo, "extractPromoInfo");

// === 외부 OCR 엔진 (비전 차단된 OAuth 대신 — CLOVA / Google Vision으로 텍스트 추출) ===
// Naver CLOVA OCR (NCP) — 한국어 최강. env: CLOVA_OCR_INVOKE_URL, CLOVA_OCR_SECRET.
async function ocrClova(env, b64, mime) {
  const url = env.CLOVA_OCR_INVOKE_URL, secret = env.CLOVA_OCR_SECRET;
  if (!url || !secret) throw new Error("CLOVA 미설정");
  const fmt = (String(mime || "").indexOf("png") > -1) ? "png" : "jpg";
  const body = { version: "V2", requestId: "promo-" + Date.now(), timestamp: Date.now(), images: [{ format: fmt, name: "promo", data: b64 }] };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error("CLOVA " + resp.status + ": " + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  const fields = (((data.images || [])[0] || {}).fields) || [];
  let txt = "";
  fields.forEach((f) => { txt += (f.inferText || ""); txt += f.lineBreak ? "\n" : " "; });
  return txt.trim();
}
__name(ocrClova, "ocrClova");

// Google 서비스 계정(OAuth2) — 조직 정책으로 API 키가 막힌 경우(401 "API keys are not supported").
// env: GOOGLE_SA_EMAIL(client_email), GOOGLE_SA_PRIVATE_KEY(private_key PEM). JWT(RS256)→access token 교환.
var _gSaTok = null, _gSaExp = 0;
function _b64url(buf) {
  const bytes = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(_b64url, "_b64url");
function _b64urlStr(str) { return _b64url(new TextEncoder().encode(str)); }
__name(_b64urlStr, "_b64urlStr");
async function gSaAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_gSaTok && _gSaExp > now + 60) return _gSaTok;
  const email = env.GOOGLE_SA_EMAIL;
  const pem = String(env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !pem) throw new Error("Google 서비스계정 미설정");
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = _b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = _b64urlStr(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/cloud-vision", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signingInput = head + "." + claim;
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(signingInput));
  const jwt = signingInput + "." + _b64url(sig);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + encodeURIComponent(jwt)
  });
  if (!resp.ok) throw new Error("Google token " + resp.status + ": " + (await resp.text()).slice(0, 200));
  const d = await resp.json();
  _gSaTok = d.access_token; _gSaExp = now + (d.expires_in || 3600);
  return _gSaTok;
}
__name(gSaAccessToken, "gSaAccessToken");

// Google Cloud Vision — DOCUMENT_TEXT_DETECTION. 서비스계정(Bearer) 우선, 없으면 API 키(?key=).
async function ocrGoogleVision(env, b64) {
  const hasSa = !!(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);
  const key = env.GOOGLE_VISION_KEY;
  if (!hasSa && !key) throw new Error("Google Vision 미설정");
  const headers = { "Content-Type": "application/json" };
  let endpoint = "https://vision.googleapis.com/v1/images:annotate";
  if (hasSa) headers["Authorization"] = "Bearer " + await gSaAccessToken(env);
  else endpoint += "?key=" + encodeURIComponent(key);
  const resp = await fetch(endpoint, {
    method: "POST", headers,
    body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["ko", "en"] } }] })
  });
  if (!resp.ok) throw new Error("Google Vision " + resp.status + ": " + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  const r0 = (data.responses || [])[0] || {};
  if (r0.error) throw new Error("Google Vision: " + (r0.error.message || "error"));
  return String((r0.fullTextAnnotation && r0.fullTextAnnotation.text) || "").trim();
}
__name(ocrGoogleVision, "ocrGoogleVision");

// Gemini 비전 OCR — 멀티모달이 이미지를 직접 읽음(긴 상세페이지에 강함, 내부 타일링). env: GEMINI_API_KEY.
async function geminiVisionOcr(env, b64, mime) {
  const model = env.OCR_MODEL || env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
  const ask = "이 공연·전시 홍보물(상세페이지) 이미지에 있는 모든 텍스트를 위에서 아래로 빠짐없이 그대로 추출하세요. " +
    "제목·일시·장소·출연진·프로그램·곡목·가격·예매·문의·작은 글씨·표 안 글자까지 전부. " +
    "설명이나 요약 없이, 읽은 텍스트만 자연스러운 줄바꿈으로 출력하세요.";
  const body = {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime || "image/jpeg", data: b64 } }, { text: ask }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0 }
  };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error("Gemini Vision " + resp.status + ": " + (await resp.text()).slice(0, 300));
  const data = await resp.json();
  const cand = (data.candidates || [])[0] || {};
  const text = (((cand.content || {}).parts) || []).map((p) => p.text || "").join("").trim();
  return text;
}
__name(geminiVisionOcr, "geminiVisionOcr");

// 설정된 엔진으로 OCR 텍스트 추출 — 기본 Gemini 비전 우선(긴 페이지 강함) → Google → CLOVA.
async function runExternalOcr(env, b64, mime) {
  const pref = String(env.OCR_PROVIDER || "").toLowerCase();
  const hasGemini = !!env.GEMINI_API_KEY;
  const hasClova = !!(env.CLOVA_OCR_INVOKE_URL && env.CLOVA_OCR_SECRET);
  const hasGoogle = !!(env.GOOGLE_VISION_KEY || (env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY));
  const order = pref === "google" ? ["google", "gemini", "clova"]
    : pref === "clova" ? ["clova", "gemini", "google"]
    : ["gemini", "google", "clova"];
  let lastErr = null;
  for (const p of order) {
    try {
      if (p === "gemini" && hasGemini) return { text: await geminiVisionOcr(env, b64, mime), provider: "gemini" };
      if (p === "clova" && hasClova) return { text: await ocrClova(env, b64, mime), provider: "clova" };
      if (p === "google" && hasGoogle) return { text: await ocrGoogleVision(env, b64), provider: "google" };
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  throw new Error("no_ocr_provider");
}
__name(runExternalOcr, "runExternalOcr");

// ── 콘텐츠 제작 ▸ 로고 제작 ────────────────────────────────────────────────────
// 프롬프트 로직 = Nutlope/logocreator(app/api/generate-logo) 이식 — 매체 문장 → 로고 형태 → 스타일 →
// 글자 처리 → 색 → 배경 → 금지목록 순으로 쌓는 구조를 그대로 계승.
// ⚠ 엔진만 갈음: 원본은 Together AI(FLUX.2-pro / google flash-image)를 쓰고 새 API 키를 요구하지만,
//   이 레포는 이미 Worker 시크릿 GEMINI_API_KEY 하나로 OCR·분석을 돌린다(docs/KEYS.md §2).
//   원본도 「글자가 들어가는 로고」는 google flash-image 계열로 보내므로 = 같은 계열 모델 · 새 시크릿 0.
const LOGO_TYPES = {
  "icon-name": "a combination mark: one distinctive icon paired with the company name set directly beneath it",
  wordmark: "a wordmark: the company name itself is the logo, drawn as custom lettering with no separate icon",
  monogram: "a monogram / lettermark built only from the company's initials",
  emblem: "an emblem: the company name locked inside a badge or crest shape",
  icon: "a standalone icon mark",
  abstract: "an abstract mark: a distinctive non-representational symbol"
};
const LOGO_STYLES = {
  minimal: "Minimal - the fewest possible shapes, generous negative space, no ornament",
  geometric: "Geometric - precise circles, triangles and rectangles laid out on a clear grid",
  gradient: "Gradient - smooth colour transitions across the mark, modern and polished",
  luxury: "Luxury - refined elegant proportions, thin confident strokes, premium feel",
  retro: "Retro - vintage badge sensibility, warm nostalgic shapes, classic proportions",
  mascot: "Mascot - a friendly character illustration as the mark, clean and approachable",
  handdrawn: "Hand-drawn - organic brush and ink strokes with a crafted, human feel",
  dimensional: "3D - dimensional rendering with soft depth, subtle highlights and shadow"
};
// 색 이름 = 예울마루 브랜드 팔레트(index.html _CPAL = :root --c1~--c6) 그대로. 모델은 hex보다 이름에 잘 붙어서 둘 다 준다.
const LOGO_HEX_NAMES = {
  "#4A4DE7": "indigo blue", "#D88455": "warm salmon", "#1A6B3C": "deep green",
  "#C02872": "magenta", "#2D8AB3": "cyan blue", "#F5B400": "golden yellow"
};

function buildLogoPrompt(b) {
  const name = String(b.name || "").trim().slice(0, 80);
  const type = LOGO_TYPES[b.type] ? b.type : "icon-name";
  const style = LOGO_STYLES[b.style] ? b.style : "minimal";
  const polished = style === "gradient" || style === "dimensional";
  const hasText = type !== "icon" && type !== "abstract";
  const color = String(b.color || "auto").trim();
  const L = [];
  L.push(polished
    ? "A modern, polished brand logo with smooth, clean rendering, centred on a plain background."
    : "A flat 2D vector brand logo built from solid-colour shapes with crisp, clean edges, centred on a plain background.");
  L.push("Design it as " + LOGO_TYPES[type] + ".");
  L.push("Visual direction - " + LOGO_STYLES[style] + ".");
  if (!hasText) {
    L.push("Render it as a purely graphic symbol with no lettering: no letters and no numbers anywhere in the image.");
    if (name) L.push("The symbol should evoke: " + name + ".");
  } else if (type === "monogram") {
    L.push('Build it only from the initials of "' + name + '" - no other words.');
  } else {
    L.push('Set the company name "' + name + '" as clean, evenly-spaced lettering, spelled exactly like that with no extra or missing characters.');
    // 한글 이름이 기본값인 레포라 명시 — 안 적으면 모델이 로마자로 바꿔 쓰거나 없는 글자를 지어낸다.
    if (/[가-힣]/.test(name)) L.push("The name is written in Korean Hangul: draw every syllable block correctly and legibly, do not substitute Latin letters and do not invent glyphs.");
  }
  const tagline = String(b.tagline || "").trim().slice(0, 80);
  if (tagline && hasText) L.push('Place the short tagline "' + tagline + '" beneath the name in much smaller lettering.');
  if (color === "mono") {
    L.push("Draw the entire logo in one single solid near-black shade on a white background - strictly monochrome.");
  } else if (color === "auto" || !color) {
    L.push("Choose one confident brand palette of at most two colours.");
  } else {
    const nm = LOGO_HEX_NAMES[color.toUpperCase()];
    L.push("Use " + color + (nm ? " (" + nm + ")" : "") + " as the dominant brand colour of the mark"
      + (polished ? ", allowing tonal depth within that colour" : ", as a flat solid fill") + ".");
  }
  L.push("Background: one perfectly even, flat, single-colour field - no vignette, no gradient, no shadow, no texture, no border.");
  L.push("Show the logo alone: no mockup, no business card, no signage, no watermark, no caption, no colour swatches, no multiple variations in one image.");
  const extra = String(b.extra || "").trim().slice(0, 300);
  if (extra) L.push("Additional direction from the client: " + extra);
  return L.join(" ");
}
__name(buildLogoPrompt, "buildLogoPrompt");

// 프롬프트 → 로고 이미지(base64). 모델은 후보를 순서대로 시도 — 프리뷰 모델명이 바뀌어도 앱이 안 죽게.
async function generateLogoImage(env, b) {
  const models = [];
  if (env.LOGO_MODEL) models.push(String(env.LOGO_MODEL));
  models.push("gemini-3.1-flash-image", "gemini-2.5-flash-image");
  const prompt = buildLogoPrompt(b);
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } }
  };
  let lastErr = null;
  for (const m of models) {
    const url2 = "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
    let resp;
    try {
      resp = await fetch(url2, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { lastErr = e; continue; }
    if (!resp.ok) {
      lastErr = new Error("Gemini Image " + resp.status + ": " + (await resp.text()).slice(0, 300));
      if (resp.status === 404 || resp.status === 400) continue;   // 모델명 미지원 = 다음 후보로
      throw lastErr;
    }
    const data = await resp.json();
    const parts = ((((data.candidates || [])[0] || {}).content) || {}).parts || [];
    for (const p of parts) {
      const inl = p.inlineData || p.inline_data;
      if (inl && inl.data) return { image: inl.data, mime: inl.mimeType || inl.mime_type || "image/png", model: m, prompt };
    }
    lastErr = new Error("이미지가 오지 않았어요 — " + (parts.map((p) => p.text || "").join(" ").trim().slice(0, 200) || "빈 응답"));
  }
  throw lastErr || new Error("logo_generation_failed");
}
__name(generateLogoImage, "generateLogoImage");

// OCR 원문 텍스트 → 육하원칙 JSON (LLM: Gemini 우선/Claude).
async function structurePromoText(env, rawText) {
  const system = "당신은 공연·전시 홍보물에서 OCR로 추출한 한국어 텍스트를 받아 사실 정보를 정확히 정리하는 도우미입니다. " +
    "주어진 텍스트에 실제로 있는 내용만 사용하고, 없거나 불확실하면 빈 문자열로 두세요. 추측·창작 금지.";
  const ask = "다음은 홍보물 이미지에서 OCR로 읽은 원문 텍스트입니다(줄 순서가 흐트러졌을 수 있음). " +
    "아래 JSON 형식으로만 출력하세요. 설명·코드블록·머리말 없이 JSON 객체만.\n\n" +
    '{ "title":"공연·행사명(부제 포함)", "overview":"무엇을·왜 한두 문장", "when":"일시(날짜·요일·시간, 회차 모두)", ' +
    '"where":"장소(공연장·홀)", "who":"출연·연주·지휘·주최·주관·기획", "price":"가격(등급별)·할인·예매처·문의", ' +
    '"detail":"프로그램·곡목·줄거리·관람등급·러닝타임 등 본문용 상세" }\n\n# OCR 원문\n' + String(rawText || "").slice(0, 12000);
  let txt = await llmText(env, system, ask, 2000);
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let obj = {};
  try { obj = JSON.parse(txt); } catch (e) { const m = txt.match(/\{[\s\S]*\}/); obj = m ? JSON.parse(m[0]) : { detail: txt }; }
  const out = {};
  ["title", "overview", "when", "where", "who", "price", "detail"].forEach((k) => { out[k] = String(obj[k] || "").trim(); });
  return out;
}
__name(structurePromoText, "structurePromoText");

// ── 콘텐츠 제작 ▸ 카카오 76자 문구 제안 (260805) ───────────────────────────────
// 프로그램 상세 링크(프로그램 시트 K열 URL) → ①페이지 본문 텍스트 ②포스터·상세페이지 이미지 OCR → ③LLM이 후보 N개.
// 왜 페이지 텍스트 + OCR 둘 다인가(260805 실측): 예울마루 상세페이지는 일시·장소·티켓가격·할인정보를 HTML 표로
// 갖고 있지만 **출연자·프로그램·카피 문구는 이미지 안에만** 있다(브런치 콘서트 실측 = 페이지 텍스트에 연주자 이름 0).
// 사실은 페이지 텍스트에서, 홍보 표현은 OCR에서 나온다 → 한쪽만 쓰면 문구가 비거나 틀린다.
const KKO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const KKO_MAX_IMG = 2;           // OCR에 태울 이미지 수 상한 = 포스터 + 상세페이지(실측상 이 2장이 전부)
const KKO_MAX_IMG_BYTES = 6e6;   // 이미지 1장 상한 — Gemini inline_data 한도·Worker 메모리 보호(실측 포스터 0.2MB·상세 2.1MB)

// 링크 위생 — 서버가 대신 여는 요청이라 사설 대역은 원천 차단(SSRF). 링크는 시트에서 오지만 사람이 넣는 값이다.
function kkoSafeUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch (e) { throw new Error("링크 형식이 올바르지 않아요"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http(s) 링크만 읽을 수 있어요");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1" ||
      /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /^(fc|fd|fe80)/.test(h)) {
    throw new Error("내부 주소는 열 수 없어요");
  }
  return u;
}
__name(kkoSafeUrl, "kkoSafeUrl");

// HTML → 사람이 읽는 줄들. (&amp;는 맨 마지막에 — 먼저 풀면 `&amp;lt;`가 이중 디코드된다)
function kkoStripTags(html) {
  let t = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|dd|dt|tr|h[1-6]|section|figure)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&");
  return t.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
}
__name(kkoStripTags, "kkoStripTags");

// 상세 링크 열기 → 본문 텍스트 + OCR 대상 이미지.
// ⚠ 이미지 판별 = 「<article> 안 + /inday_fileinfo/」 — 260805 예울마루 공연·전시 페이지 실측으로 확정한 규칙이다.
//    og:image는 **전 페이지 공통 기본값**(사이트 대표 이미지)이라 포스터가 아니고, /src/img/ 는 로고·스와이프 등 크롬,
//    헤더 네비의 대관 썸네일도 /inday_fileinfo/ 라 <article> 경계가 있어야 걸러진다. 두 조건을 함께 걸면 포스터+상세 2장만 남는다.
//    사이트 구조가 바뀌어 0장이 되면 본문 안 이미지 → og:image 순으로 물러서고, 그래도 없으면 페이지 텍스트만으로 진행한다.
async function kkoFetchPage(rawUrl) {
  const u = kkoSafeUrl(rawUrl);
  const resp = await fetch(u.toString(), {
    headers: { "User-Agent": KKO_UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9" },
    redirect: "follow", cf: { cacheTtl: 300, cacheEverything: true }
  });
  // UA 없이 부르면 예울마루가 406을 준다(260805 실측) — 위 User-Agent는 장식이 아니다.
  if (!resp.ok) throw new Error("링크를 열 수 없어요 (HTTP " + resp.status + ")");
  const html = await resp.text();
  const am = html.match(/<article[\s\S]*?<\/article>/i);
  const seg = am ? am[0] : html;
  const imgs = [];
  const push = (src) => {
    let abs;
    try { abs = new URL(src, u).toString(); } catch (e) { return; }
    if (!/^https?:/i.test(abs) || imgs.indexOf(abs) >= 0) return;
    imgs.push(abs);
  };
  const re = /<img[^>]*\ssrc=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(seg))) { if (/\/inday_fileinfo\//i.test(m[1])) push(m[1]); }
  if (!imgs.length) { re.lastIndex = 0; while ((m = re.exec(seg))) { if (!/\.(svg|gif)(\?|$)/i.test(m[1])) push(m[1]); } }
  if (!imgs.length) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) push(og[1]);
  }
  return { url: u.toString(), text: kkoStripTags(seg).slice(0, 6000), images: imgs.slice(0, KKO_MAX_IMG) };
}
__name(kkoFetchPage, "kkoFetchPage");

// ArrayBuffer → base64 (청크 — 통째로 apply 하면 큰 이미지에서 스택이 터진다)
function kkoB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
__name(kkoB64, "kkoB64");

// 이미지들 OCR — 한 장 실패는 건너뛴다(나머지 장·페이지 텍스트로 계속 진행 = 전부 실패해야 빈 문자열).
async function kkoOcrImages(env, urls) {
  const out = [];
  for (const iu of urls) {
    try {
      const r = await fetch(iu, { headers: { "User-Agent": KKO_UA, "Referer": iu }, cf: { cacheTtl: 300, cacheEverything: true } });
      if (!r.ok) continue;
      const mime = String(r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
      if (!/^image\//i.test(mime)) continue;
      const buf = await r.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > KKO_MAX_IMG_BYTES) continue;
      const ocr = await runExternalOcr(env, kkoB64(buf), mime);
      const t = String((ocr && ocr.text) || "").trim();
      if (t) out.push(t);
    } catch (e) { console.error("[content/kakao] ocr", iu, String((e && e.message) || e)); }
  }
  return out.join("\n\n");
}
__name(kkoOcrImages, "kkoOcrImages");

// b = {url, program, title, date, extra, count}. 반환 = {items:[{tone,text,len}], ocrText, pageText, images, source, over}
async function suggestKakaoLines(env, b) {
  const limit = 76;   // 앱 입력칸 maxlength와 같은 값 — 길이는 textarea와 같게 UTF-16 .length로 센다(이모지 = 2)
  const count = Math.min(8, Math.max(1, parseInt(b.count, 10) || 5));
  const src = await kkoFetchPage(b.url);
  const ocrText = await kkoOcrImages(env, src.images);
  if (!src.text && !ocrText) throw new Error("링크에서 읽어낸 내용이 없어요 (페이지 구조 확인 필요)");
  const facts = [
    b.program ? "프로그램: " + String(b.program).slice(0, 200) : "",
    b.title ? "콘텐츠 제목: " + String(b.title).slice(0, 200) : "",
    b.date ? "발송 예정일: " + String(b.date).slice(0, 40) : "",
    b.extra ? "담당자 요청: " + String(b.extra).slice(0, 400) : ""
  ].filter(Boolean).join("\n");

  const system = "당신은 공연·전시 홍보 문구를 쓰는 한국어 카피라이터입니다. 카카오톡 채널 메시지 본문(글자수 제한이 엄격한 자리)을 씁니다. " +
    "주어진 자료에 실제로 있는 사실만 쓰고, 없는 정보(출연자·가격·특전·수상 이력 등)는 절대 지어내지 않습니다.";
  // 후보를 count+2개 요청하는 이유 = 길이 초과분을 **자르지 않고 버리기** 위한 여유분(잘린 문장은 문구가 아니다).
  const ask =
    "아래 자료는 공연·전시 상세페이지에서 가져온 것입니다(① 페이지 본문 텍스트 ② 포스터·상세 이미지 OCR 원문).\n" +
    "이 자료만 근거로, 카카오톡으로 발송할 홍보 문구 후보 " + (count + 2) + "개를 만들어 주세요.\n\n" +
    "[규칙]\n" +
    "1. 각 문구는 공백·문장부호 포함 " + limit + "자 이하여야 합니다. 넘으면 발송이 안 됩니다. 30자 이상으로 쓰세요.\n" +
    "2. 후보끼리 톤이 겹치지 않게 만드세요 — 정보 전달형 / 감성형 / 초대·권유형 / 궁금증 유발형 / 예매·마감 강조형 등.\n" +
    "3. 자료에 있는 사실(공연명·일시·장소·출연·가격)만 씁니다. 확인 안 되는 건 넣지 마세요.\n" +
    "4. '최고의·완벽한·유일한' 같은 과장 수식과 같은 뜻의 반복(예: 한 문장에 '음악적'을 두 번)은 쓰지 마세요.\n" +
    "5. 이모지는 넣더라도 0~1개까지. 해시태그·URL은 넣지 마세요(발송 시 따로 붙습니다).\n" +
    "6. 출력은 JSON 배열만. 설명·머리말·코드블록 없이.\n" +
    '   [{"tone":"정보형","text":"문구"}, …]\n\n' +
    (facts ? "# 신청 정보\n" + facts + "\n\n" : "") +
    "# 페이지 본문\n" + (src.text || "(없음)") + "\n\n" +
    "# 포스터·상세페이지 OCR 원문\n" + (ocrText || "(읽은 텍스트 없음)");

  let txt = await llmText(env, system, ask, 1600);
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let arr = [];
  try { arr = JSON.parse(txt); } catch (e) {
    const m = txt.match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!Array.isArray(arr)) arr = [];
  const seen = new Set();
  const items = [];
  let over = 0;
  for (const it of arr) {
    const text = String((it && typeof it === "object" ? it.text : it) || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > limit) { over++; continue; }   // 자르지 않고 버린다 — 잘린 문장은 문구가 아니다
    const key = text.replace(/[\s.,!?~·…'"]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ tone: String((it && it.tone) || "").trim().slice(0, 20), text, len: text.length });
    if (items.length >= count) break;
  }
  return { items, over, limit, ocrText, pageText: src.text, images: src.images, source: src.url };
}
__name(suggestKakaoLines, "suggestKakaoLines");

// === 블로그 초안 GitHub 연동 (서버 시크릿 PAT) ===
// 브라우저에 GitHub 토큰을 두지 않기 위해 dispatch/폴링을 Worker가 대행한다.
// PAT는 env.GITHUB_PAT(대체: GH_BLOG_PAT / GITHUB_TOKEN) — Cloudflare 시크릿. repo/branch는 env로 오버라이드 가능.
function ghBlogCfg(env) {
  return {
    pat: env.GITHUB_PAT || env.GH_BLOG_PAT || env.GITHUB_TOKEN || "",
    repo: env.GITHUB_REPO || "muteno/yeulmaru-promo",
    branch: env.GITHUB_BRANCH || "main"
  };
}
__name(ghBlogCfg, "ghBlogCfg");

// GitHub Contents API의 base64(개행 포함) → UTF-8 문자열
function ghDecodeB64(b64) {
  const clean = String(b64 || "").replace(/\s/g, "");
  if (!clean) return "";
  const bin = atob(clean);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}
__name(ghDecodeB64, "ghDecodeB64");

var index_default = {
  async scheduled(event, env, ctx) {
    const kst = new Date(Date.now() + 9 * 3600 * 1e3);
    const h = kst.getUTCHours();
    // 하루 1회(KST 10시대)만 보류 자동취소 + 공휴일 갱신 (기존 동작 유지 — cron이 */15로 바뀌어도 1회 보장)
    if (h === 10 && kst.getUTCMinutes() < PROMO_NOTIFY_CFG.scanMin) {
      ctx.waitUntil(autoCancelStalePending(env));
      const ky = kst.getUTCFullYear();
      ctx.waitUntil(getHolidays(env, ky, true));
      ctx.waitUntil(getHolidays(env, ky + 1, true));
    }
    // 홍보 담당자 알림 스캔 — 매 틱 (무음 없음). 인앱 메시지는 밤에 소리내지 않으므로(푸시 없음) 야간 게이팅이
    // 실효 없고, 스캔 자체를 끄면 lead/overdue 윈도우·회차 계산이 오염됨(감사1 HIGH-3/4). 무음은 향후 이메일/푸시 발송에만.
    ctx.waitUntil(promoNotifyScan(env));
    // [260801 운영자] 대관 DB 통합 — 구글 대관 일정 → 「프로그램」 시트 편입. 매시 첫 틱 1회(*/15 크론에서 시간당 1회).
    //   자동 실행은 env.GCAL_SYNC === '1'일 때만 = 운영자가 켜기 전엔 시트에 아무것도 안 쓴다(수동 = POST /api/gcal/sync).
    if (env.GCAL_SYNC === "1" && env.GCAL_ICS_URL && kst.getUTCMinutes() < 15) {
      ctx.waitUntil((async () => {
        try { const t = await getToken(env); await gcalSyncPrograms(env, t, {}); }
        catch (e) { console.error("gcal sync (cron)", e); }
      })());
    }
  },
  async fetch(request, env, ctx) {   // [260801] ctx = /api/gcal의 stale-while-revalidate(응답 뒤 갱신)에 필요
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth") {
        const { password } = await request.json();
        // 슈퍼 admin(0511)만 직접 로그인 허용. 0510(user)은 거부 — 개별 PIN 매칭 강제.
        if (password === env.ADMIN_PASSWORD) return json({ ok: true, role: "admin" }, env);
        return json({ ok: false, error: "Wrong password" }, env, 401);
      }

      // === PIN 초기 설정 (MS 이메일 기반, 인증 헤더 불요) ===
      // MS 인증으로 받은 이메일을 받아 그 row의 PIN(빈 값)만 설정. 이미 있으면 거부.
      // 인증은 클라이언트의 MS 로그인 결과(account.username == email)로 보장됨.
      if (url.pathname === "/api/auth/set-pin" && request.method === "POST") {
        try {
          const { email, pin } = await request.json();
          if (!email || !pin) {
            return json({ error: "이메일과 PIN이 필요해요" }, env, 400);
          }
          if (!/^\d{4}$/.test(String(pin).trim())) {
            return json({ error: "PIN은 4자리 숫자여야 해요" }, env, 400);
          }
          const token = await getToken(env);
          const { headers, rows } = await handleGetSheet(token, "담당자");
          const target = String(email).trim().toLowerCase();
          const matchedRow = rows.find((r) => {
            const rEmail = String(r["이메일"] || "").trim().toLowerCase();
            return rEmail !== "" && rEmail === target && !isFlagOn(r["휴직여부"]);
          });
          if (!matchedRow) {
            return json({ error: "등록되지 않은 이메일이거나 휴직 중인 계정이에요" }, env, 403);
          }
          const existingPin = String(matchedRow["PIN"] || "").trim();
          if (existingPin) {
            return json({ error: "이미 PIN이 설정된 계정이에요. 관리자에게 초기화 요청하세요." }, env, 409);
          }
          const values = headers.map((h) => {
            if (h === "PIN") return String(pin).trim();
            return matchedRow[h] !== void 0 && matchedRow[h] !== null ? matchedRow[h] : "";
          });
          await handleUpdateSheetRow(token, "담당자", matchedRow._rowIndex, { values }, "user", "manager");
          managerCache = { rows: null, expires: 0 };
          return json({ ok: true, name: matchedRow["담당자"] || "" }, env);
        } catch (e) {
          console.error("[set-pin]", e);
          return json({ error: e.message }, env, 500);
        }
      }

      // === PIN 초기화 (관리자 전용) ===
      // 슈퍼/서브 admin → 대상 이메일 row의 PIN 비움. 대상은 그 후 다시 set-pin 흐름으로 진입.
      if (url.pathname === "/api/auth/reset-pin" && request.method === "POST") {
        try {
          const token = await getToken(env);
          const auth = await checkAdmin(request, env, token);
          if (!auth.admin) {
            return json({ error: "관리자만 PIN을 초기화할 수 있어요" }, env, 403);
          }
          const { targetEmail } = await request.json();
          if (!targetEmail) {
            return json({ error: "targetEmail이 필요해요" }, env, 400);
          }
          const { headers, rows } = await handleGetSheet(token, "담당자");
          const target = String(targetEmail).trim().toLowerCase();
          const matchedRow = rows.find((r) => String(r["이메일"] || "").trim().toLowerCase() === target);
          if (!matchedRow) {
            return json({ error: "대상 이메일을 찾을 수 없어요" }, env, 404);
          }
          const values = headers.map((h) => {
            if (h === "PIN") return "";
            return matchedRow[h] !== void 0 && matchedRow[h] !== null ? matchedRow[h] : "";
          });
          await handleUpdateSheetRow(token, "담당자", matchedRow._rowIndex, { values }, "admin", "manager");
          managerCache = { rows: null, expires: 0 };
          return json({
            ok: true,
            name: matchedRow["담당자"] || "",
            by: auth.super ? "super" : (auth.userName || "sub")
          }, env);
        } catch (e) {
          console.error("[reset-pin]", e);
          return json({ error: e.message }, env, 500);
        }
      }

      // (/api/auth/super 제거됨 — 슈퍼admin 개념 폐기, 권한은 담당자 시트 관리자여부로 고정)

      // === 비밀번호 초기 저장 / 재설정 (PIN 기반, 인증 헤더 불요) ===
      // user가 자기 PIN으로 인증 → 비번 설정. admin only PATCH 정책 우회.
      // PIN이 담당자 시트의 활성 row와 매칭되면 그 row의 비번/계정여부 컬럼만 업데이트.
      if (url.pathname === "/api/auth/set-password" && request.method === "POST") {
        try {
          const { pin, newPassword } = await request.json();
          if (!pin || !newPassword) {
            return json({ error: "PIN과 비밀번호가 필요해요" }, env, 400);
          }
          const token = await getToken(env);
          const { headers, rows } = await handleGetSheet(token, "\uB2F4\uB2F9\uC790");
          // PIN 매칭 — 휴직여부 OFF인 row만 (계정여부는 초기 설정 시 OFF일 수 있어 무시)
          const matchedRow = rows.find((r) => {
            const rPin = String(r["PIN"] || "").trim();
            const isOnLeave = r["\uD734\uC9C1\uC5EC\uBD80"] === true || r["\uD734\uC9C1\uC5EC\uBD80"] === 1 || String(r["\uD734\uC9C1\uC5EC\uBD80"]).trim() === "1";
            return _pin4(rPin) === _pin4(pin) && !isOnLeave;
          });
          if (!matchedRow) {
            return json({ error: "PIN을 찾을 수 없거나 휴직 중인 계정이에요" }, env, 403);
          }
          // 이미 비번 설정된 경우 차단 (재설정은 admin이 처리)
          const existingPwd = String(matchedRow["\uBE44\uBC00\uBC88\uD638"] || "").trim();
          if (existingPwd) {
            return json({ error: "이미 비밀번호가 설정된 계정이에요. 관리자에게 재설정 요청하세요." }, env, 409);
          }
          // 전체 row values 배열 구성. 비밀번호 + 계정여부만 변경.
          const values = headers.map((h) => {
            if (h === "\uBE44\uBC00\uBC88\uD638") return newPassword;
            if (h === "\uACC4\uC815\uC5EC\uBD80") return true;
            return matchedRow[h] !== void 0 && matchedRow[h] !== null ? matchedRow[h] : "";
          });
          await handleUpdateSheetRow(token, "\uB2F4\uB2F9\uC790", matchedRow._rowIndex, { values }, "user", "manager");
          return json({ ok: true, name: matchedRow["\uB2F4\uB2F9\uC790"] || "" }, env);
        } catch (e) {
          console.error("[set-password]", e);
          return json({ error: e.message }, env, 500);
        }
      }

      // === [260805 장도 위젯] 공개 읽기 전용 — 홈페이지(yeulmaru.org 「장도 입도가능 시간 안내」 글) 임베드용 ===
      // 반환 = 운영_장도의 날짜·입도가능시간 **두 열만**(열 화이트리스트 — 시트에 열이 늘어나도 새 열은 안 나간다).
      // 이미 홈페이지에 월별 캘린더 이미지로 공개 중인 정보(개인정보 0)라 인증 게이트 앞 배치가 의도다(/api/auth류 선례).
      // 캐시 3층: CDN·브라우저 10분(Cache-Control) → KV 1시간(콜드 isolate 보호) → isolate 5분(getOpsCached)
      //  — 홈페이지 방문 트래픽이 Graph를 안 때린다. 시트 갱신 반영 = 최대 ~70분(조수 시간표 = 월 단위 선입력이라 충분) · 즉시 = ?fresh=1.
      if (url.pathname === "/api/public/jangdo" && request.method === "GET") {
        try {
          const list = await jangdoPublicRows(env, url.searchParams.get("fresh") === "1");
          return new Response(JSON.stringify({ ok: true, count: list.length, rows: list }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600", ...corsHeaders(env) }
          });
        } catch (e) {
          console.error("[public/jangdo]", e);
          return json({ ok: false, error: "unavailable" }, env, 503);
        }
      }

      // 같은 데이터의 **이미지 판**(홈페이지 본문 <img> 임베드용 — iframe이 저장 필터에 지워지는 대응).
      // max-age 120 = 「지금 입도 가능」 상태 문구가 최대 2분까지만 낡는다(데이터 자체는 KV 1시간 축 그대로).
      // 실패해도 이미지 자리는 비워야 하니 502가 아니라 '안내 문구를 그린 SVG'를 200으로 내준다(깨진 이미지 아이콘 방지).
      if (url.pathname === "/api/public/jangdo.svg" && request.method === "GET") {
        const svgHead = { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=120", ...corsHeaders(env) };
        try {
          const list = await jangdoPublicRows(env, url.searchParams.get("fresh") === "1");
          return new Response(buildJangdoSvg(list, jangdoNowKst()), { status: 200, headers: svgHead });
        } catch (e) {
          console.error("[public/jangdo.svg]", e);
          return new Response(buildJangdoSvg([], jangdoNowKst()), { status: 200, headers: svgHead });
        }
      }

      const pw = request.headers.get("X-App-Password");
      const role = roleOf(pw, env);
      if (!role) return json({ error: "Unauthorized" }, env, 401);

      // 동시 접속자 (presence) — Graph 토큰 불필요, 가벼운 KV 읽기/쓰기
      if (url.pathname === "/api/presence") {
        if (request.method === "POST") return json(await handlePresencePost(request, env), env);
        if (request.method === "GET") return json(await handlePresenceGet(env), env);
      }

      // 개인 할 일 메모 — KV 영구 저장 (key: memo:<이름>). 프론트 _memoLoad/_memoPersist 대응 (260611 추가 — 기존엔 라우트 부재로 저장 실패)
      if (url.pathname === "/api/memo") {
        if (request.method === "GET") {
          const u = String(url.searchParams.get("user") || "").slice(0, 40);
          if (!u) return json({ error: "no user" }, env, 400);
          let text = "";
          try { text = (await env.ops_kv.get("memo:" + u)) || ""; } catch (e) {}
          return json({ user: u, text }, env);
        }
        if (request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const u = String(b.user || "").slice(0, 40);
          if (!u) return json({ error: "no user" }, env, 400);
          try { await env.ops_kv.put("memo:" + u, String(b.text || "").slice(0, 100000)); } catch (e) { return json({ error: String(e) }, env, 500); }
          return json({ ok: true }, env);
        }
      }

      // 전역 앱 설정 — KV 영구(cfg:<키>). pets_visible = 캘린더 하단 장식 펫(공차는 애·크랩·LOVE 3마리 랜덤) 표시. GET=로그인 사용자 공개·POST=관리자(checkAdmin = 슈퍼 OR 서브admin PIN · 타 관리자 쓰기와 동일 게이트 · 운영자 260711). ⚠ Worker는 별도 Cloudflare 배포 필요
      if (url.pathname === "/api/config") {
        // cfg 값 읽기 헬퍼 — pets_visible(하단 펫) · lock_minutes(자동 잠금 분, 1~240, 기본 30)
        const _cfgRead = async () => {
          let pets = false, lockM = 30;
          try { pets = (await env.ops_kv.get("cfg:pets_visible")) === "1"; } catch (e) {}
          try { const s = await env.ops_kv.get("cfg:lock_minutes"); const n = parseInt(s, 10); if (n >= 1 && n <= 240) lockM = n; } catch (e) {}
          return { pets_visible: pets, lock_minutes: lockM };
        };
        if (request.method === "GET") {
          return json(await _cfgRead(), env);
        }
        if (request.method === "POST") {
          // roleOf(비번-only)는 ADMIN_PASSWORD만 admin → 클라는 APP_PASSWORD('0510')+PIN을 보내므로 checkAdmin(토큰·PIN 인지)로 검증(타 관리자 쓰기와 동일 · 슈퍼admin 개념 폐기 반영, 분신술 재검증 260711)
          let _cfgAuth = { admin: false };
          try { _cfgAuth = await checkAdmin(request, env, await getToken(env)); } catch (e) { return json({ error: "auth_failed: " + String(e) }, env, 500); }
          if (!_cfgAuth.admin) return json({ error: "Admin only" }, env, 403);
          let b = {};
          try { b = await request.json(); } catch (e) {}
          // 부분 갱신 — 넘어온 키만 기록(키별 KV 분리 저장이라 다른 키 클로버 없음: lock_minutes만 보내도 pets_visible 보존)
          try {
            if ("pets_visible" in b) await env.ops_kv.put("cfg:pets_visible", b.pets_visible ? "1" : "0");
            if ("lock_minutes" in b) {
              const lm = parseInt(b.lock_minutes, 10);
              if (!(lm >= 1 && lm <= 240)) return json({ error: "lock_minutes는 1~240(분) 범위" }, env, 400);
              await env.ops_kv.put("cfg:lock_minutes", String(lm));
            }
          } catch (e) { return json({ error: String(e) }, env, 500); }
          return json({ ok: true, ...(await _cfgRead()) }, env);   // read-back = 현재 전체 config 반환
        }
      }

      // === 콘텐츠 제작 — 네이버 블로그 초안 AI 생성 (Graph 토큰 불요) ===
      // ANTHROPIC_API_KEY 미설정 시 503 → 프론트가 로컬 템플릿 생성기로 폴백.
      if (url.pathname === "/api/content/blog" && request.method === "POST") {
        if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return json({ error: "no_api_key", note: "GEMINI_API_KEY 또는 ANTHROPIC_* 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const topic = String(bb.topic || "").slice(0, 2000).trim();
        if (!topic) return json({ error: "글의 주제(공연·행사명)가 필요해요" }, env, 400);
        try {
          const text = await generateBlogDraft(env, bb);
          return json({ text }, env);
        } catch (e) {
          console.error("[content/blog]", e);
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === ① OCR만 — 이미지 → 원문 텍스트 (외부 OCR: CLOVA/Google Vision). LLM 안 거침. ===
      if (url.pathname === "/api/content/ocr" && request.method === "POST") {
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const data = String(bb.data || "").replace(/^data:[^,]*,/, "").trim();
        const mime = bb.mime || "image/jpeg";
        if (!data) return json({ error: "이미지 데이터가 필요해요" }, env, 400);
        const hasExternal = env.GEMINI_API_KEY || (env.CLOVA_OCR_INVOKE_URL && env.CLOVA_OCR_SECRET) || env.GOOGLE_VISION_KEY || (env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);
        if (!hasExternal) return json({ error: "no_ocr_provider", note: "CLOVA_OCR_* / GOOGLE_VISION_KEY / GOOGLE_SA_* 중 하나 필요" }, env, 503);
        try {
          const ocr = await runExternalOcr(env, data, mime);
          return json({ text: ocr.text || "", provider: ocr.provider }, env);
        } catch (e) {
          console.error("[content/ocr]", e);
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === ② 분석 — OCR 원문 텍스트 → 육하원칙 JSON (LLM: Gemini/Claude). OCR과 분리. ===
      if (url.pathname === "/api/content/structure" && request.method === "POST") {
        if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return json({ error: "no_api_key", note: "GEMINI_API_KEY 또는 ANTHROPIC_* 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const text = String(bb.text || "").trim();
        if (!text) return json({ error: "분석할 텍스트가 필요해요" }, env, 400);
        try {
          const info = await structurePromoText(env, text);
          return json({ info }, env);
        } catch (e) {
          console.error("[content/structure]", e);
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === ④ 카카오 76자 문구 제안 — 상세 링크 → 페이지 텍스트 + 포스터 OCR → LLM이 후보 N개 ===
      // 인증 = 위 전역 게이트(X-App-Password). OCR·LLM 둘 다 유료 호출이라 공개 금지.
      if (url.pathname === "/api/content/kakao" && request.method === "POST") {
        if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return json({ error: "no_api_key", note: "GEMINI_API_KEY 또는 ANTHROPIC_* 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        if (!String(bb.url || "").trim()) return json({ error: "공연 상세 링크가 필요해요" }, env, 400);
        try {
          return json(await suggestKakaoLines(env, bb), env);
        } catch (e) {
          console.error("[content/kakao]", e);
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === ③ 로고 제작 — 이름·형태·스타일·색 → 로고 이미지 (Gemini 이미지 생성) ===
      // 인증은 위 전역 게이트(X-App-Password)가 이미 통과시킨 사용자만 — 이미지 생성은 유료 호출이라 공개면 안 된다.
      if (url.pathname === "/api/content/logo" && request.method === "POST") {
        if (!env.GEMINI_API_KEY) return json({ error: "no_api_key", note: "GEMINI_API_KEY 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const lname = String(bb.name || "").trim();
        const ltype = String(bb.type || "");
        if (!lname && ltype !== "icon" && ltype !== "abstract") return json({ error: "로고에 넣을 이름이 필요해요" }, env, 400);
        try {
          return json(await generateLogoImage(env, bb), env);
        } catch (e) {
          console.error("[content/logo]", e);
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === 블로그 초안 트리거 — 브라우저 대신 Worker가 repository_dispatch[nb-blog] 호출 (PAT=서버 시크릿) ===
      // 로그인 사용자(X-App-Password)면 사용 가능. 실제 글쓰기는 Actions(nb-blog.yml)가 수행 → drafts/<id>.json.
      if (url.pathname === "/api/blog/dispatch" && request.method === "POST") {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const payload = (bb && typeof bb.payload === "object" && bb.payload) ? bb.payload : (bb || {});
        const id = String(payload.id || ("nb" + Date.now() + Math.floor(Math.random() * 1e3))).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        // GitHub repository_dispatch는 client_payload 최상위 속성 10개 제한 → 전부 d 한 겹에 담아 우회(nb-blog.yml이 d를 풀어 읽음).
        const inner = Object.assign({}, payload, { id, mode: payload.mode === "structure" ? "structure" : "blog" });
        const client_payload = { d: inner };
        try {
          const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "yeulmaru-promo-worker" },
            body: JSON.stringify({ event_type: "nb-blog", client_payload })
          });
          if (gr.ok) return json({ ok: true, id }, env);
          const txt = (await gr.text()).slice(0, 200);
          return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: txt }, env, 502);
        } catch (e) {
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }
      // === 블로그 초안 결과 폴링 — drafts/<id>.json 있으면 파싱해 반환, 아직이면 404 ===
      if (url.pathname === "/api/blog/draft" && request.method === "GET") {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat" }, env, 503);
        const id = String(url.searchParams.get("id") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        if (!id) return json({ error: "id required" }, env, 400);
        try {
          const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/${id}.json?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
            headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" }
          });
          if (gr.status === 404) return json({ ready: false }, env, 404);
          if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
          const d = await gr.json();
          let draft = null;
          try { draft = JSON.parse(ghDecodeB64(d.content || "")); } catch (e) { draft = null; }
          if (!draft) return json({ ready: false, error: "parse_failed" }, env, 502);
          return json({ ready: true, draft }, env);
        } catch (e) {
          return json({ error: String((e && e.message) || e) }, env, 502);
        }
      }

      // === 콘텐츠 제작 ▸ 한글문서 편집 (260803 운영자) ===
      // 브라우저엔 GitHub 토큰이 없다 — 원본 업로드·워크플로 트리거·결과 수령이 전부 여기(시크릿 GITHUB_PAT)를 지난다.
      // 진행 상태 폴링은 신설하지 않고 블로그와 같은 /api/blog/draft(drafts/<id>.json)를 재사용한다.
      // 흐름: upload(원본 커밋) → dispatch(hwp-edit.yml) → [Actions가 claude -p 로 수정 후 결과 커밋] → file(결과 바이트).
      if (url.pathname.startsWith("/api/hwp/")) {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" };
        const hwpId = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        // 확장자는 화이트리스트 — 경로 조작 차단(문서 이름은 커밋 경로에 안 쓰고 워크플로 payload로만 넘긴다)
        const hwpExt = (n) => (/\.hwpx$/i.test(String(n || "")) ? "hwpx" : "hwp");

        if (url.pathname === "/api/hwp/upload" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = hwpId(b.id);
          const b64 = String(b.b64 || "").replace(/\s/g, "");
          if (!id) return json({ error: "id required" }, env, 400);
          if (!b64) return json({ error: "빈 파일이에요" }, env, 400);
          if (b64.length > 12e6) return json({ error: "문서가 너무 커요(8MB 이하)" }, env, 413);
          const path = `drafts/hwp/${id}.in.${hwpExt(b.name)}`;
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
              method: "PUT",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ message: `chore(hwp): ${id} 원본 [skip ci]`, content: b64, branch: cfg.branch })
            });
            if (!gr.ok) return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
            return json({ ok: true, id, path }, env);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 트리거 — 전용 event_type(hwp-edit)이라 블로그 초안 큐(concurrency: nb-blog)에 안 막힌다.
        if (url.pathname === "/api/hwp/dispatch" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = hwpId(b.id);
          if (!id) return json({ error: "id required" }, env, 400);
          const inner = { id, name: String(b.name || "문서").slice(0, 160), ext: hwpExt(b.name), ask: String(b.ask || "").slice(0, 4000) };
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
              method: "POST",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ event_type: "hwp-edit", client_payload: { d: inner } })
            });
            if (gr.ok) return json({ ok: true, id }, env);
            return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 결과 바이트 — 1MB 넘는 파일도 오게 raw 미디어타입으로 받는다(contents API의 base64 content 필드는 1MB 상한).
        // 확장자는 워크플로가 원본과 같게 쓰므로 hwp → hwpx 순으로 시도.
        if (url.pathname === "/api/hwp/file" && request.method === "GET") {
          const id = hwpId(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, env, 400);
          for (const ext of ["hwp", "hwpx"]) {
            try {
              const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/hwp/${id}.out.${ext}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
                headers: { ...ghHdr, "Accept": "application/vnd.github.raw" }
              });
              if (gr.status === 404) continue;
              if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
              return new Response(gr.body, { headers: { "Content-Type": "application/octet-stream", ...corsHeaders(env) } });
            } catch (e) {
              return json({ error: String((e && e.message) || e) }, env, 502);
            }
          }
          return json({ error: "not_ready" }, env, 404);
        }
      }

      // === 콘텐츠 제작 ▸ 오피스문서 편집 (260805 운영자) — 한글문서 편집(/api/hwp/*)의 오피스판 미러 ===
      // 편집 엔진 = GitHub Actions(office-edit.yml)의 OfficeCLI(iOfficeAI/OfficeCLI · Apache-2.0) + claude -p.
      // 흐름·인증·시크릿 전부 hwp 와 동일(신설 0): upload(원본 커밋) → dispatch(office-edit) → [Actions 수정 후 커밋]
      // → /api/blog/draft 폴링(공용) → file(결과 바이트). 다른 건 확장자 3종과 drafts/office/ 경로뿐.
      if (url.pathname.startsWith("/api/office/")) {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" };
        const ofcId = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        // 확장자 화이트리스트 — hwp(2종 폴백)와 달리 3종이라 미일치 = null → 400 거절. 경로 조작 차단 동일.
        const ofcExt = (n) => { const m = String(n || "").match(/\.(docx|xlsx|pptx)$/i); return m ? m[1].toLowerCase() : null; };

        if (url.pathname === "/api/office/upload" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = ofcId(b.id);
          const ext = ofcExt(b.name);
          const b64 = String(b.b64 || "").replace(/\s/g, "");
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "워드·엑셀·PPT(.docx·.xlsx·.pptx)만 올릴 수 있어요" }, env, 400);
          if (!b64) return json({ error: "빈 파일이에요" }, env, 400);
          if (b64.length > 12e6) return json({ error: "문서가 너무 커요(8MB 이하)" }, env, 413);
          const path = `drafts/office/${id}.in.${ext}`;
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
              method: "PUT",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ message: `chore(office): ${id} 원본 [skip ci]`, content: b64, branch: cfg.branch })
            });
            if (!gr.ok) return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
            return json({ ok: true, id, path }, env);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 트리거 — 전용 event_type(office-edit)이라 블로그(nb-blog)·한글문서(hwp-edit) 큐에 안 막힌다.
        if (url.pathname === "/api/office/dispatch" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = ofcId(b.id);
          const ext = ofcExt(b.name);
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "워드·엑셀·PPT(.docx·.xlsx·.pptx)만 고칠 수 있어요" }, env, 400);
          const inner = { id, name: String(b.name || "문서").slice(0, 160), ext, ask: String(b.ask || "").slice(0, 4000) };
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
              method: "POST",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ event_type: "office-edit", client_payload: { d: inner } })
            });
            if (gr.ok) return json({ ok: true, id }, env);
            return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 결과 바이트 — 1MB 넘는 파일도 오게 raw 미디어타입(hwp 와 동일). 확장자는 원본과 같으므로 3종 순회.
        if (url.pathname === "/api/office/file" && request.method === "GET") {
          const id = ofcId(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, env, 400);
          for (const ext of ["docx", "xlsx", "pptx"]) {
            try {
              const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/office/${id}.out.${ext}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
                headers: { ...ghHdr, "Accept": "application/vnd.github.raw" }
              });
              if (gr.status === 404) continue;
              if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
              return new Response(gr.body, { headers: { "Content-Type": "application/octet-stream", ...corsHeaders(env) } });
            } catch (e) {
              return json({ error: String((e && e.message) || e) }, env, 502);
            }
          }
          return json({ error: "not_ready" }, env, 404);
        }
      }

      // === 콘텐츠 제작 ▸ 용량 줄이기 (260805 운영자) — 오피스문서 편집(/api/office/*)의 **부분** 미러 ===
      // ⚠ 이 경로로 오는 건 **.pdf 와 구형 .hwp 둘뿐**이다. 나머지 7종(xlsx/xlsm/xltx/docx/dotx/pptx/potx/hwpx)은
      //    전부 ZIP 컨테이너라 브라우저가 직접 줄이고 **여기 오지 않는다**(서버 무경유 = 파일 무반출 · 8MB 상한 무관).
      //    「용량 줄이기인데 정작 큰 파일이 8MB 상한에 막힌다」는 모순을 그렇게 피한다 — 러너 전량 안이 기각된 이유.
      // ⚠ office 와 갈리는 지점: **claude -p 를 안 쓴다.** 압축은 결정적 처리라 판단할 게 없어 에이전트가 불필요하고,
      //    그래서 계정 체인·쿼터를 전혀 안 먹는다(slim.yml 에 OAuth 시크릿 자체가 없다).
      // 흐름은 동일(신설 0): upload(원본 커밋) → dispatch(slim) → [Actions 압축 후 커밋] → /api/blog/draft 폴링(공용) → file.
      if (url.pathname.startsWith("/api/slim/")) {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" };
        const slmId = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        // 2종 화이트리스트 — 미일치 = 400 거절(office 의 3종 화이트리스트와 같은 문법, 경로 조작 차단 동일).
        const slmExt = (n) => { const m = String(n || "").match(/\.(pdf|hwp)$/i); return m ? m[1].toLowerCase() : null; };
        const slmLevel = (v) => (["screen", "std", "hq"].includes(String(v || "")) ? String(v) : "std");

        if (url.pathname === "/api/slim/upload" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = slmId(b.id);
          const ext = slmExt(b.name);
          const b64 = String(b.b64 || "").replace(/\s/g, "");
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "PDF·구형 한글(.pdf·.hwp)만 서버로 보내요 — 나머지는 브라우저가 직접 줄여요" }, env, 400);
          if (!b64) return json({ error: "빈 파일이에요" }, env, 400);
          if (b64.length > 12e6) return json({ error: "문서가 너무 커요(8MB 이하)" }, env, 413);
          const path = `drafts/slim/${id}.in.${ext}`;
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
              method: "PUT",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ message: `chore(slim): ${id} 원본 [skip ci]`, content: b64, branch: cfg.branch })
            });
            if (!gr.ok) return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
            return json({ ok: true, id, path }, env);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 트리거 — 전용 event_type(slim)이라 블로그·한글문서·오피스문서 큐에 안 막힌다.
        if (url.pathname === "/api/slim/dispatch" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = slmId(b.id);
          const ext = slmExt(b.name);
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "PDF·구형 한글(.pdf·.hwp)만 서버에서 줄여요" }, env, 400);
          const inner = { id, name: String(b.name || "문서").slice(0, 160), ext, level: slmLevel(b.level) };
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
              method: "POST",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ event_type: "slim", client_payload: { d: inner } })
            });
            if (gr.ok) return json({ ok: true, id }, env);
            return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 결과 바이트 — 1MB 넘는 파일도 오게 raw 미디어타입(office·hwp 와 동일). 확장자는 원본과 같으므로 2종 순회.
        if (url.pathname === "/api/slim/file" && request.method === "GET") {
          const id = slmId(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, env, 400);
          for (const ext of ["pdf", "hwp"]) {
            try {
              const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/slim/${id}.out.${ext}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
                headers: { ...ghHdr, "Accept": "application/vnd.github.raw" }
              });
              if (gr.status === 404) continue;
              if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
              return new Response(gr.body, { headers: { "Content-Type": "application/octet-stream", ...corsHeaders(env) } });
            } catch (e) {
              return json({ error: String((e && e.message) || e) }, env, 502);
            }
          }
          return json({ error: "not_ready" }, env, 404);
        }
      }

      const token = await getToken(env);

      // 홍보기록
      if (url.pathname === "/api/records") {
        if (request.method === "GET") return json({ records: await handleGetRecords(token) }, env);
        if (request.method === "POST") return json(await handleAddRecord(token, await request.json(), role), env);
      }
      if (url.pathname.startsWith("/api/records/")) {
        const row = parseInt(url.pathname.split("/").pop());
        if (isNaN(row)) return json({ error: "Invalid row" }, env, 400);
        if (request.method === "PATCH") return json(await handleUpdateRecord(token, row, await request.json(), role), env);
        if (request.method === "DELETE") {
          const _delAuth = await checkAdmin(request, env, token);
          if (!_delAuth.admin) return json({ error: "Admin only (record delete)" }, env, 403);
          return json(await handleDeleteRecord(token, row, role), env);
        }
      }

      // 프로그램 PERFS 로드
      if (url.pathname === "/api/programs") {
        if (request.method === "GET") return json({ programs: await getProgramsCached(token) }, env);
      }

      // 마스터 시트 CRUD
      if (url.pathname.startsWith("/api/sheet/")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const slug = parts[2];
        const sheetName = SHEET_MAP[slug];
        if (!sheetName) return json({ error: "Unknown sheet: " + slug }, env, 400);

        // 로그 시트: GET admin only (슈퍼 또는 서브), mutating은 모두 금지
        if (slug === "log") {
          if (request.method !== "GET") return json({ error: "Log sheet is read-only via API" }, env, 403);
          const auth = await checkAdmin(request, env, token);
          if (!auth.admin) return json({ error: "Admin only" }, env, 403);
          if (parts.length === 3) return json(await handleGetSheet(token, sheetName), env);
          return json({ error: "Method not allowed" }, env, 405);
        }

        // 일반 시트
        if (request.method === "GET" && parts.length === 3) {
          return json(await getSheetCached(token, sheetName, slug), env);
        }
        if (request.method !== "GET") {
          const auth = await checkAdmin(request, env, token);
          if (!auth.admin) return json({ error: "Admin only" }, env, 403);
        }
        if (request.method === "POST" && parts.length === 3) {
          return json(await handleAddSheetRow(token, sheetName, await request.json(), role, slug), env);
        }
        if (parts.length === 4) {
          const row = parseInt(parts[3]);
          if (isNaN(row)) return json({ error: "Invalid row" }, env, 400);
          if (request.method === "PATCH") return json(await handleUpdateSheetRow(token, sheetName, row, await request.json(), role, slug), env);
          if (request.method === "DELETE") return json(await handleDeleteSheetRow(token, sheetName, row, role, slug), env);
        }
        return json({ error: "Method not allowed" }, env, 405);
      }

      // === 파일 마지막 수정시각 (변경 감지 polling용) ===
      if (url.pathname === "/api/lastmod") {
        const lmToken = await getToken(env);
        const { driveId, itemId } = await findFile(lmToken);
        const meta = await graphGet(lmToken, `/drives/${driveId}/items/${itemId}?$select=lastModifiedDateTime,eTag,cTag`);
        return json({
          lastModified: meta.lastModifiedDateTime || null,
          eTag: meta.eTag || null,
          cTag: meta.cTag || null,
          serverTs: (new Date()).toISOString()
        }, env);
      }
      // === 메시지(알림) — 로그인 사용자면 GET/POST/PATCH 허용 ===
      if (url.pathname === "/api/messages") {
        if (request.method === "GET") return json({ messages: await handleGetMessages(token) }, env);
        if (request.method === "POST") return json(await handleAddMessage(token, await request.json()), env);
      }
      if (url.pathname.startsWith("/api/messages/")) {
        const mid = decodeURIComponent(url.pathname.split("/").pop());
        if (request.method === "PATCH") return json(await handleMarkMessageRead(token, mid), env);
        if (request.method === "DELETE") return json(await handleDeleteMessage(token, mid, role), env);
      }

      // === 예매 프로세스 도표 공유 — 로그인 사용자: 목록/단건(범위 필터) · 저장/삭제(소유자 또는 admin) ===
      if (url.pathname === "/api/diagrams") {
        if (request.method === "GET") {
          return json({ diagrams: await handleDgmList(token, url.searchParams.get("user") || "", url.searchParams.get("dept") || "") }, env);
        }
        if (request.method === "POST") {
          const dgBody = await request.json();
          const dgAuth = await checkAdmin(request, env, token);
          const dgRes = await handleDgmSave(token, dgBody, dgAuth.admin);
          return json(dgRes, env, dgRes.status && !dgRes.ok ? dgRes.status : 200);
        }
      }
      if (url.pathname.startsWith("/api/diagrams/")) {
        const dgId = decodeURIComponent(url.pathname.split("/").pop());
        if (request.method === "GET") {
          const dgRes = await handleDgmGet(token, dgId, url.searchParams.get("user") || "", url.searchParams.get("dept") || "");
          return json(dgRes, env, dgRes.status && !dgRes.ok ? dgRes.status : 200);
        }
        if (request.method === "DELETE") {
          const dgAuth = await checkAdmin(request, env, token);
          const dgRes = await handleDgmDelete(token, dgId, url.searchParams.get("user") || "", dgAuth.admin);
          return json(dgRes, env, dgRes.status && !dgRes.ok ? dgRes.status : 200);
        }
      }

      // === 챗봇 — FAQ 조회(시트 자동생성) + 질의 로그 누적. 로그인 사용자 허용 ===
      if (url.pathname === "/api/chatbot/faq" && request.method === "GET") {
        return json({ faq: await handleGetFaq(token) }, env);
      }
      if (url.pathname === "/api/chatbot/log" && request.method === "POST") {
        return json(await handleAddChatLog(token, await request.json()), env);
      }
      if (url.pathname === "/api/chatbot/rules") {
        if (request.method === "GET") return json({ rules: await handleGetRules(token) }, env);
        if (request.method === "POST") {
          const rAuth = await checkAdmin(request, env, token);
          if (!rAuth.admin) return json({ error: "Admin only" }, env, 403);
          const body = await request.json();
          return json(await writeNamedSheetRows(token, RULES_SHEET, RULES_HEADERS, Array.isArray(body.rows) ? body.rows : []), env);
        }
      }

      // === 불편사항(QA) — POST 접수(로그인 사용자) / GET 조회(admin) ===
      if (url.pathname === "/api/qa") {
        if (request.method === "POST") return json(await handleAddQa(token, await request.json()), env);
        if (request.method === "GET") {
          const qAuth = await checkAdmin(request, env, token);
          if (!qAuth.admin) return json({ error: "Admin only" }, env, 403);
          try { const { rows } = await handleGetSheet(token, QA_SHEET); return json({ qa: rows }, env); }
          catch (e) { return json({ qa: [] }, env); }
        }
        if (request.method === "PATCH") {
          const qpAuth = await checkAdmin(request, env, token);
          if (!qpAuth.admin) return json({ error: "Admin only" }, env, 403);
          return json(await handleUpdateQa(token, await request.json()), env);
        }
      }

      // === [DB통합/이관] 운영 데이터 — 프로모 엑셀 "운영_*" 시트가 source of truth (Workbook API) ===
      // GET ?sheet=<name> → 운영_<name> 시트 {headers,rows,count}. GET (no param) → 운영_* 시트 목록.
      // POST {sheet,headers,rows} (admin) → 운영_<name> 시트 전체 교체. (dash push / 이관 / 일일입력 폼 공용)
      if (url.pathname === "/api/ops") {
        if (request.method === "GET") {
          const sheet = url.searchParams.get("sheet");
          if (sheet) {
            try {
              const opsName = opsSheetName(sheet);
              // [보안 260710 분신술 HIGH-1 · 260804 예매 확대] PII 시트 = 서버가 admin을 강제한다.
              //  클라 admin 게이트는 콘솔로 우회 가능하므로 여기서 막는다(log 시트 GET 선례 계승).
              //  ⚠ 운영_예매(260804 신설) = 주문 4만 행에 주문자명·휴대폰·회원키가 들어있다. 이 목록에
              //   안 넣으면 **앱 비번만으로 전량이 나간다** — 회원 시트와 같은 등급의 개인정보다.
              //   PII 시트를 새로 만들면 반드시 여기에 추가할 것.
              //  ⚠ 운영_예매집계(260805 신설) = 「집계라서 안전」이 아니다. 회원키 = 휴대폰 11자리 원본
              //   (booking_ingest가 `dg(휴대폰정규화)`를 그대로 박는다)이라 1행 = 실명 없는 연락처 1건이다.
              //   실측으로 앱 비번만으로 10,119건이 나갔다 — 집계·파생 시트도 원본 키를 지니면 같은 등급.
              const PII_SHEETS = ["운영_회원", "운영_예매", "운영_예매집계"];
              if (PII_SHEETS.includes(opsName)) {
                const piiAuth = await checkAdmin(request, env, token);
                if (!piiAuth.admin) return json({ error: "Admin only (personal data)" }, env, 403);
              }
              // 응답은 no-store(브라우저 디스크 캐시 잔류 차단). ⚠ Cloudflare 재배포 필요.
              if (opsName === "운영_회원") {
                // [성능 260711 운영자 "더 빠르게"] 3계층: isolate 인메모리(5분) → KV 전역(1시간, isolate 무관
                //  = 첫 요청도 웜히트면 <1s) → Graph 청크(병렬 4). fresh=1 = 캐시 전부 우회 후 재적재.
                //  KV 저장은 계정 내 암호화 저장(다른 시크릿과 동일 신뢰경계) · 응답은 계속 no-store(브라우저 잔류 차단).
                const MEM_KV_KEY = "membersheet:v1";
                const fresh = url.searchParams.get("fresh") === "1";
                if (fresh) delete opsCache[opsName];
                let data = null;
                const c = opsCache[opsName];
                if (!fresh && c && Date.now() < c.expires) data = c.data;
                if (!data && !fresh) {
                  try { const kv = await env.ops_kv.get(MEM_KV_KEY); if (kv) data = JSON.parse(kv); } catch (e) {}
                }
                if (!data) {
                  data = await memberSheetRead(token, opsName);
                  try { await env.ops_kv.put(MEM_KV_KEY, JSON.stringify(data), { expirationTtl: 3600 }); } catch (e) {}
                }
                opsCache[opsName] = { data, expires: Date.now() + TTL_MASTER };
                return new Response(JSON.stringify({ sheet, headers: data.headers, rows: data.rows, count: data.rows.length }), {
                  status: 200,
                  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(env) }
                });
              }
              // [분신술 260710 H2] fresh=1 = isolate 로컬 5분 캐시 우회(실시간 조회) — 실적 수정 모달의 편집 기준·저장 직전 재조회용.
              //  다른 isolate가 방금 쓴 변경을 stale 캐시로 놓쳐 전체 재작성이 그 변경을 지우는 동시성 유실 창 축소.
              if (url.searchParams.get("fresh") === "1") delete opsCache[opsName];
              const { headers, rows } = await getOpsCached(token, opsName);
              // PII 시트(예매·예매집계)는 회원 시트와 같이 no-store — 브라우저 디스크 캐시에 개인정보가 남지 않게.
              if (PII_SHEETS.includes(opsName)) {
                return new Response(JSON.stringify({ sheet, headers, rows, count: rows.length }), {
                  status: 200,
                  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(env) }
                });
              }
              return json({ sheet, headers, rows, count: rows.length }, env);
            } catch (e) {
              return json({ sheet, headers: [], rows: [], count: 0, note: "시트 없음 (미동기화)" }, env);
            }
          }
          const { driveId, itemId } = await findFile(token);
          const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
          const sheets = (ws.value || []).filter((w) => w.name.indexOf("운영_") === 0).map((w) => ({ name: w.name }));
          return json({ sheets }, env);
        }
        if (request.method === "POST") {
          const opsAuth = await checkAdmin(request, env, token);
          if (!opsAuth.admin) return json({ error: "Admin only (ops write)" }, env, 403);
          const body = await request.json();
          if (!body.sheet) return json({ error: "sheet name required" }, env, 400);
          const rows = Array.isArray(body.rows) ? body.rows : [];
          opsCache = {};  // ops 쓰기 → ops 캐시 전체 무효화(대상 시트 소수)
          if (body.mode === "append") return json(await opsAppendRows(token, body.sheet, rows), env);
          return json(await opsWriteSheet(token, body.sheet, body.headers || [], rows), env);
        }
      }

      // === [260803] 시트 유지보수(admin 전용) — 열/시트 「은퇴」 전용 라인(예술성/사업성 축 폐지에서 신설).
      //   이름 기반 조회(포지션 무관 = 열 밀림 사고 축과 무관) + confirm 문자열 재입력 필수(오타·오호출 방어) + 로그 시트 기록.
      //   ① POST /api/maint/delete-column {sheet, header, confirm:'<sheet>:<header>'} — 1행에서 헤더를 찾아 그 열 전체 물리 삭제(Range.delete shift:Left). 헤더 없음 = ok:false(멱등).
      //   ② POST /api/maint/delete-sheet {sheet:'운영_<이름>', confirm:'<sheet>'} — 운영_ 네임스페이스만(핵심 시트 보호). 시트 없음 = ok:false(멱등).
      if (url.pathname === "/api/maint/delete-column" && request.method === "POST") {
        const mAuth = await checkAdmin(request, env, token);
        if (!mAuth.admin) return json({ error: "Admin only (maintenance)" }, env, 403);
        const body = await request.json();
        const sheet = String(body.sheet || "").trim(), header = String(body.header || "").trim();
        if (!sheet || !header) return json({ error: "sheet/header required" }, env, 400);
        if (body.confirm !== sheet + ":" + header) return json({ error: "confirm mismatch — confirm:'<sheet>:<header>' 재입력 필요" }, env, 400);
        const { driveId, itemId } = await findFile(token);
        const hdr = await graphGet(token, `${sheetPathFor(driveId, itemId, sheet)}/usedRange?$select=values`);
        const headers = (hdr.values && hdr.values[0]) ? hdr.values[0].map((v) => String(v == null ? "" : v).trim()) : [];
        const idx = headers.indexOf(header);
        if (idx < 0) return json({ ok: false, sheet, header, note: "header not found (이미 삭제됨?)", headers }, env);
        const col = colLetter(idx + 1);
        await graphPost(token, `${sheetPathFor(driveId, itemId, sheet)}/range(address='${col}:${col}')/delete`, { shift: "Left" });
        opsCache = {};
        invalidateSheetCache("program");
        await logToSheet(token, "admin", "MAINT", sheet, 0, `delete-column ${header} (${col}열)`);
        return json({ ok: true, sheet, header, col }, env);
      }
      if (url.pathname === "/api/maint/delete-sheet" && request.method === "POST") {
        const sAuth = await checkAdmin(request, env, token);
        if (!sAuth.admin) return json({ error: "Admin only (maintenance)" }, env, 403);
        const body = await request.json();
        const sheet = String(body.sheet || "").trim();
        if (!sheet) return json({ error: "sheet required" }, env, 400);
        if (sheet.indexOf("운영_") !== 0) return json({ error: "운영_* 시트만 삭제 가능(핵심 시트 보호)" }, env, 400);
        if (body.confirm !== sheet) return json({ error: "confirm mismatch — confirm:'<sheet>' 재입력 필요" }, env, 400);
        const { driveId, itemId } = await findFile(token);
        const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
        const hit = (ws.value || []).find((w) => w.name === sheet);
        if (!hit) return json({ ok: false, sheet, note: "sheet not found (이미 삭제됨?)" }, env);
        const dr = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodeURIComponent(hit.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!dr.ok && dr.status !== 404) return json({ error: `Graph DELETE ${dr.status}: ${await dr.text()}` }, env, 502);
        opsCache = {};
        await logToSheet(token, "admin", "MAINT", sheet, 0, "delete-sheet");
        return json({ ok: true, sheet }, env);
      }

      // 공휴일 (KASI) — GET ?year=YYYY [&refresh=1]. KV 캐시. 임시·대체공휴일 포함.
      if (url.pathname === "/api/holidays") {
        const ky = new Date(Date.now() + 9 * 3600 * 1e3).getUTCFullYear();
        const year = parseInt(url.searchParams.get("year") || "", 10) || ky;
        const data = await getHolidays(env, year, url.searchParams.get("refresh") === "1");
        return json(data, env);
      }

      // [260731 운영자] 대관 일정 — 구글 캘린더 비공개 iCal 피드. 앱 로그인(비번) 필요 = 대관 일정은 내부 정보.
      //   GET /api/gcal?from=YYYY-MM-DD&to=YYYY-MM-DD  (기본 = 이번 달 ±1달) · refresh=1 = .ics 캐시 무시
      //   미설정(GCAL_ICS_URL 없음)이면 ok:false + days:[] — 프론트는 조용히 0건 처리(기존 화면 무영향).
      if (url.pathname === "/api/gcal") {
        const pw = request.headers.get("X-App-Password") || "";
        if (!roleOf(pw, env)) return json({ ok: false, error: "unauthorized" }, env, 401);
        if (!env.GCAL_ICS_URL) return json({ ok: false, error: "GCAL_ICS_URL 미설정", days: [], setup: true }, env);
        const nowKst = new Date(Date.now() + 9 * 3600 * 1e3);
        const y = nowKst.getUTCFullYear(), mo = nowKst.getUTCMonth();   // 0-based
        // 기본 창 = 지난달 1일 ~ 다음달 말일 (Date.UTC가 월 넘침·모자람을 알아서 정규화)
        const dFrom = url.searchParams.get("from") || new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10);
        const dTo = url.searchParams.get("to") || new Date(Date.UTC(y, mo + 2, 0)).toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dTo)) return json({ ok: false, error: "bad range", days: [] }, env, 400);
        try {
          return json(await gcalDays(env, dFrom, dTo, url.searchParams.get("refresh") === "1", ctx), env);
        } catch (e) {
          return json({ ok: false, error: String(e && e.message || e), days: [] }, env);
        }
      }

      // [260801 운영자] 대관 DB 통합 — 구글 대관 일정을 「프로그램」 시트에 편입(수동 실행). admin 전용.
      //   POST /api/gcal/sync        = 실제 반영(추가·수정·창 안 삭제)
      //   POST /api/gcal/sync?dry=1  = 미리보기(시트 무접촉) — 켜기 전에 무엇이 들어갈지 먼저 확인하는 용도
      if (url.pathname === "/api/gcal/sync") {
        const _a = await checkAdmin(request, env, token);
        if (!_a.admin) return json({ ok: false, error: "Admin only (gcal sync)" }, env, 403);
        if (!env.GCAL_ICS_URL) return json({ ok: false, error: "GCAL_ICS_URL 미설정" }, env);
        try {
          const plan = await gcalSyncPrograms(env, token, { dry: url.searchParams.get("dry") === "1" });
          return json(Object.assign({ ok: true }, plan), env);
        } catch (e) {
          return json({ ok: false, error: String(e && e.message || e) }, env, 500);
        }
      }

      // [260721 운영자] 콘텐츠 제작 ▸ 링크 자료수집 — 목록/파일 프록시 (핸들러 = 파일 하단 linkgrab 블록)
      if (url.pathname === "/api/linkgrab" && request.method === "GET") return lgList(url, env);
      if (url.pathname === "/api/linkgrab/file" && request.method === "GET") return lgFile(url, env);
      if (url.pathname === "/api/linkgrab/head" && request.method === "GET") return lgHead(url, env);
      if (url.pathname === "/api/linkgrab/ytdl" && request.method === "POST") return lgYtDispatch(request, env);
      if (url.pathname === "/api/linkgrab/ytstat" && request.method === "GET") return lgYtStat(url, env);
      if (url.pathname === "/api/linkgrab/ytfile" && request.method === "GET") return lgYtFile(url, env);

      if (url.pathname === "/api/health") return json({ status: "ok", ts: (/* @__PURE__ */ new Date()).toISOString() }, env);
      return json({ error: "Not found" }, env, 404);
    } catch (e) {
      console.error(e);
      return json({ error: e.message }, env, 500);
    }
  }
};
// ============================================================
// 콘텐츠 제작 ▸ 링크 자료수집 (linkgrab) — 운영자 260721
//  URL 하나를 받아 그 페이지 안의 내려받을 자료(PDF·문서·사진·영상·압축)를 목록으로 돌려준다.
//  GET /api/linkgrab?url=…             → { source, title, items:[{kind,title,url,dl,via,note,thumb,stream,vid}] }
//  GET /api/linkgrab/file?url=…&name=… → 파일 스트리밍 프록시(Content-Disposition: attachment = 탭 즉시 저장)
//  GET /api/linkgrab/head?url=…        → { size, type } (HEAD·Range 폴백 = 용량만 · 갤러리 우상단 표시용, 프론트가 항목별 지연 조회)
//  스캔 대상: img·video·source·poster·og:image 미디어 태그 + 파일 확장자 링크(사진·영상·문서·음성·압축) — 종류별 섹션.
//  전용 처리: linktr.ee(__NEXT_DATA__ JSON) · 드롭박스(dl=1, 폴더=ZIP) · 구글드라이브(uc?export=download)
//  · 유튜브 등 스트리밍(kind:'video'·stream:true — 저작권·기술상 다운로드 불가, 열기·yt-dlp 검토) · 아이콘·로고성 이미지 제외.
//  가드(SSRF·오남용): http/https만 · IP 리터럴/localhost/비표준 포트 차단 · HTML 3MB 캡 · 목록 15초 타임아웃 ·
//  파일 프록시 300MB 상한. 이식 노트(노뮤트 에디터): 이 블록 + 라우터 2줄 + 프론트 lg-* 블록이 전부(의존 = corsHeaders/json).
// ============================================================
var LG_EXT = {
  doc: /\.(pdf|hwpx?|docx?|xlsx?|pptx?|txt|rtf)(\?|#|$)/i,
  img: /\.(jpe?g|png|gif|webp|bmp|heic|svg)(\?|#|$)/i,
  video: /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i,
  audio: /\.(mp3|wav|m4a|aac|flac)(\?|#|$)/i,
  zip: /\.(zip|7z|rar|tar|gz|alz|egg)(\?|#|$)/i
};
function lgKindOf(href) {
  for (const k in LG_EXT) if (LG_EXT[k].test(href)) return k;
  return null;
}
function lgDec(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}
function lgGuardUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (_) { throw new Error("주소 형식이 아니에요"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http/https 주소만 가능해요");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) throw new Error("허용되지 않는 주소예요");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("표준 포트 주소만 가능해요");
  return u;
}
var LG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// 260721 실측(www.yeulmaru.org 530): 브라우저형 헤더 기본 + 실패/차단(52x·530·403·406) 시 400ms 쉬고 1회 재시도(UA 교대)
async function lgFetchPage(u, ms) {
  const mk = (ua) => fetch(u.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(ms || 15e3),
    headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ko,en;q=0.8" }
  });
  let res = null;
  try { res = await mk(LG_UA); } catch (_) {}
  if (!res || res.status >= 520 || res.status === 403 || res.status === 406) {
    await new Promise((r) => setTimeout(r, 400));
    try { const r2 = await mk("Mozilla/5.0 (compatible; yeulmaru-linkgrab)"); if (!res || (r2 && r2.status < (res.status || 999))) res = r2; } catch (_) {}
  }
  if (!res) throw new Error("connect");
  return res;
}
// 스트리밍 영상 식별 — 영상 섹션에 넣되(stream:true) 파일 다운로드는 불가(yt-dlp 경로 = 인프라 결정 대기)
function lgStreamInfo(href) {
  let u;
  try { u = new URL(href); } catch (_) { return null; }
  const h = u.hostname.toLowerCase();
  let vid = "";
  if (h === "youtu.be") vid = u.pathname.slice(1).split("/")[0];
  else if (h.endsWith("youtube.com")) vid = u.searchParams.get("v") || (u.pathname.match(/\/(shorts|embed)\/([^/?]+)/) || [])[2] || "";
  if (vid) return { stream: "youtube", vid, thumb: "https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg" };
  if (h === "youtu.be" || h.endsWith("youtube.com")) return { stream: "youtube", vid: "", thumb: "" };   // 재생목록·채널 등 — 영상(스트리밍) 취급
  if (h.endsWith("vimeo.com") || h.endsWith("arte.tv") || h.endsWith("tv.naver.com") || h.endsWith("tiktok.com")) return { stream: h.split(".").slice(-2).join("."), vid: "", thumb: "" };
  return null;
}
// 잘 알려진 저장소·스트리밍 주소의 다운로드 경로 재작성
function lgSpecial(href) {
  let u;
  try { u = new URL(href); } catch (_) { return null; }
  const h = u.hostname.toLowerCase();
  const st = lgStreamInfo(href);
  if (st) return { kind: "video", dl: null, stream: st.stream, vid: st.vid, thumb: st.thumb, note: "스트리밍 — [저장]을 누르면 변환해서 받아요(보통 2~5분)" };
  if (h.endsWith("dropbox.com")) {
    u.searchParams.set("dl", "1");
    const folder = u.pathname.includes("/scl/fo/") || u.pathname.startsWith("/sh/");
    return { kind: folder ? "zip" : (lgKindOf(u.pathname) || "doc"), dl: u.toString(), via: "direct", note: folder ? "폴더 전체를 ZIP 하나로 받아요" : "" };
  }
  if (h === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) return { kind: "doc", dl: "https://drive.google.com/uc?export=download&id=" + m[1], via: "direct", note: "대용량은 드라이브 확인 화면을 거쳐요" };
    if (u.pathname.startsWith("/drive/folders/")) return { kind: "link", dl: null, note: "드라이브 폴더 — 열어서 받아주세요" };
  }
  return null;
}
// 아이콘·로고·트래킹 픽셀 등 자료 가치 없는 이미지 걸러내기(범용 스캔 전용 — 명시 링크는 안 거름)
//  rsrc.php = 메타(페이스북·인스타·스레드)의 정적 리소스 번들러 경로 — 파일명이 해시라 logo/icon 어휘에 안 걸리는데
//  내용물은 전부 UI 스프라이트다(실측 260803: 스레드 공유 링크 스캔 결과 = 그 로고 .svg 1건이 「자료 1건」의 정체였다).
function lgJunkImg(abs) {
  return /favicon|sprite|logo|icon|badge|pixel|spacer|blank|1x1|\/emoji\/|\/flags?\/|\/rsrc\.php\//i.test(abs);
}
// 링크트리 페이지 — __NEXT_DATA__ JSON에서 링크·첨부(EXTENSION documentUrl) 추출
function lgParseLinktree(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch (_) { return null; }
  const pp = (data.props || {}).pageProps || {};
  const acct = pp.account || {};
  const items = [];
  for (const l of pp.links || []) {
    const title = String(l.title || "").trim() || "이름 없는 링크";
    if (l.type === "EXTENSION") {
      let doc = null;
      try { doc = JSON.parse((l.context || {}).data || "{}").documentUrl; } catch (_) {}
      if (doc) items.push({ kind: lgKindOf(doc) || "doc", title, url: doc, dl: doc, via: "proxy", note: "" });
      continue;
    }
    if (!l.url) continue;
    const sp = lgSpecial(l.url);
    if (sp) { items.push({ kind: sp.kind, title, url: l.url, dl: sp.dl || null, via: sp.via || "direct", note: sp.note || "", thumb: sp.thumb || "", stream: sp.stream || "", vid: sp.vid || "" }); continue; }
    const k = lgKindOf(l.url);
    items.push(k ? { kind: k, title, url: l.url, dl: l.url, via: "proxy", note: "", thumb: k === "img" ? l.url : "" } : { kind: "link", title, url: l.url, dl: null, via: "", note: "" });
  }
  return { source: "linktree", title: String(acct.pageTitle || acct.username || "").trim(), items };
}
// 범용 페이지 — 미디어 태그(img·video·source·audio·poster·og:image) + 파일 확장자 링크를 전수 스캔
function lgParseGeneric(html, baseUrl) {
  const items = [];
  const seen = new Set();
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i);
  function absol(raw) {
    if (!raw || /^(data|javascript|blob):/i.test(raw)) return "";
    try { return new URL(raw, baseUrl).toString(); } catch (_) { return ""; }
  }
  function push(abs, kind, extra) {
    if (!abs || seen.has(abs) || items.length >= 200) return;
    seen.add(abs);
    const name = lgDec((abs.split("?")[0].split("/").pop() || "파일")) || "파일";
    items.push(Object.assign({ kind, title: name, url: abs, dl: abs, via: "proxy", note: "", thumb: kind === "img" ? abs : "" }, extra || {}));
  }
  let m;
  // ① <video src poster> + 내부 <source> — 포스터는 그 영상의 썸네일로
  const reVideo = /<video\b[^>]*>/gi;
  while ((m = reVideo.exec(html))) {
    const tag = m[0];
    const src = absol((tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1]);
    const poster = absol((tag.match(/\sposter\s*=\s*["']([^"']+)["']/i) || [])[1]);
    if (src) push(src, "video", { thumb: poster || "" });
  }
  const reSource = /<source\b[^>]+>/gi;
  while ((m = reSource.exec(html))) {
    const tag = m[0];
    const src = absol((tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1]);
    if (!src) continue;
    const ty = (tag.match(/\stype\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    push(src, ty.startsWith("audio/") ? "audio" : (ty.startsWith("video/") ? "video" : (lgKindOf(src) || "video")));
  }
  const reAudio = /<audio\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = reAudio.exec(html))) push(absol(m[1]), "audio");
  // ② <img src> — 확장자 없어도 이미지로 취급(CDN 주소 대응) · 아이콘/로고/픽셀 제외
  const reImg = /<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = reImg.exec(html))) {
    const abs = absol(m[1]);
    if (!abs || lgJunkImg(abs)) continue;
    const k = lgKindOf(abs);
    if (k && k !== "img") continue;
    push(abs, "img");
  }
  const ogImg = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i);
  if (ogImg) push(absol(ogImg[1]), "img", { title: "대표 이미지(og:image)" });
  // ③ 파일 확장자가 있는 모든 href/src 링크(문서·압축·직링크 미디어) + 스트리밍 영상 링크
  const re = /(?:href|src)\s*=\s*["']([^"'\s]+)["']/gi;
  while ((m = re.exec(html)) && items.length < 200) {
    const abs = absol(m[1]);
    if (!abs) continue;
    const sp = lgSpecial(abs);
    const k = sp ? sp.kind : lgKindOf(abs);
    if (!k || k === "link") continue;
    if (k === "img" && lgJunkImg(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const name = lgDec((abs.split("?")[0].split("/").pop() || "파일")) || "파일";
    items.push({ kind: k, title: name, url: abs, dl: sp ? (sp.dl || null) : abs, via: sp ? (sp.via || "") : "proxy", note: sp ? (sp.note || "") : "", thumb: sp ? (sp.thumb || "") : (k === "img" ? abs : ""), stream: sp ? (sp.stream || "") : "", vid: sp ? (sp.vid || "") : "" });
  }
  return { source: "page", title: String((og && og[1]) || (tm && tm[1]) || "").trim(), items };
}
// ============================================================
// 스레드(Threads) 전용 파서 — 운영자 260803 "스레드 다운이 안가져와지는데 · 프로필 이런것만 가져오는듯"
//  왜 범용 스캔이 못 잡나: 스레드 웹앱은 Next.js가 아니라 메타의 Relay/Comet 스택("Barcelona")이라
//  게시물 사진·영상이 <img>/<video> 태그로 안 나온다. 실물은 전부
//      <script type="application/json" data-sjs>…</script>
//  안 SSR JSON(image_versions2 / video_versions)에 서명된 CDN 주소로 들어 있다.
//  → 범용 스캔(태그·확장자 축)이 줍는 건 UI 스프라이트뿐 = 「자료 1건 = 스레드 로고」(실측 260803 재현).
//  로직 정본 = muteno/nomute-editor apps/vidl/plugins/…/nomute_threads.py(러너에서 검증된 추출기)의 이식.
//  실측 함정 3종(그 파일 주석 = 여기서도 그대로 유효):
//   ⓐ 한 페이지에 video_versions 블록이 여럿(추천글 포함) → code(=shortcode) 대조가 필수.
//   ⓑ 캐러셀 항목엔 media_type이 없다 → video_versions 유무로 사진/영상을 가른다.
//   ⓒ 서명(oe=)이 영상 약 1일·사진 약 4일에 만료된다 → 주소 캐싱 금지(매번 새로 판다).
// ============================================================
var LG_TH_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var LG_TH_SJS = /<script[^>]+type="application\/json"[^>]*\bdata-sjs\b[^>]*>([\s\S]*?)<\/script>/g;
var LG_TH_PATH = /^\/(?:@([^/?#]+)\/)?(post|t|share)\/([\w-]+)/;
// 정규 주소 형태 — @ 가 페이지 안에서 &#064; 로 이스케이프돼 있어(실측) '@'만 보는 정규식은 못 잡는다.
var LG_TH_POST = /threads\.(?:net|com)\/(?:@|&#0*64;|%40)([^/"'?#&]+)\/post\/([\w-]+)/i;
// 브라우저로 보이게 하는 최소 세트 — 이게 없으면 로그인 월·축약 셸이 200 text/html로 조용히 돌아온다.
var LG_TH_NAV = {
  "User-Agent": LG_UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1"
};
function lgThInfo(u) {
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  if (h !== "threads.net" && h !== "threads.com" && !h.endsWith(".threads.net") && !h.endsWith(".threads.com")) return null;
  const m = u.pathname.match(LG_TH_PATH);
  return m ? { user: m[1] || "", kind: m[2], code: m[3] } : null;
}
// shortcode → 숫자 postID(위치기반 base64). 11자면 64^10 규모라 Number 정밀도를 넘는다 → BigInt 필수.
function lgThPk(code) {
  let pk = 0n;
  for (const c of String(code)) { const i = LG_TH_ALPHA.indexOf(c); if (i < 0) return ""; pk = pk * 64n + BigInt(i); }
  return pk.toString();
}
function lgThWalk(node, hit) {
  if (Array.isArray(node)) { for (const v of node) lgThWalk(v, hit); return; }
  if (node && typeof node === "object") { hit(node); for (const k in node) lgThWalk(node[k], hit); }
}
// 이 게시물에 해당하는 노드만 골라낸다 — code(문자) 우선, 없으면 pk(숫자)로도 맞춰본다(응답 형태에 따라 한쪽만 실린다).
function lgThNodes(html, code) {
  const pk = lgThPk(code), found = [];
  const re = new RegExp(LG_TH_SJS.source, "g");
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (raw.indexOf(code) < 0 && (!pk || raw.indexOf(pk) < 0)) continue;   // 이 글이 안 든 블록은 파싱 자체를 생략
    let data;
    try { data = JSON.parse(raw); } catch (_) { continue; }
    lgThWalk(data, (n) => {
      const c = n.code;
      const ok = c === code || ((c === void 0 || c === null) && pk && String(n.pk) === pk);
      if (ok && found.indexOf(n) < 0) found.push(n);
    });
  }
  return found;
}
// 게시물 노드 '안에서' 실제 미디어를 가진 딕트를 등장 순서대로. 고정 경로(carousel_media)로 찍으면 래퍼 하나에 통째로 놓친다.
function lgThMedia(post) {
  const out = [];
  const hasMedia = (x) => {
    if (x.carousel_media) return false;   // 캐러셀 컨테이너도 대표 썸네일을 문다 → 여기서 멈추면 슬라이드 전량이 사라진다
    const c = x.image_versions2 && x.image_versions2.candidates;
    return !!(x.video_versions || (c && c[0] && c[0].url));
  };
  const rec = (x) => {
    if (Array.isArray(x)) { for (const v of x) rec(v); return; }
    if (x && typeof x === "object") {
      if (hasMedia(x)) { if (out.indexOf(x) < 0) out.push(x); return; }
      for (const k in x) rec(x[k]);
    }
  };
  rec(post);
  return out;
}
function lgThBestImg(m) {   // 최고 해상도 1장(면적 기준)
  const c = (m.image_versions2 && m.image_versions2.candidates) || [];
  let best = null, px = -1;
  for (const x of c) { if (!x || !x.url) continue; const p = (x.width || 0) * (x.height || 0); if (p > px) { best = x; px = p; } }
  return best;
}
function lgThBestVid(m) {   // type 101 > 102 > 103 (값이 작을수록 고화질)
  let best = null, rank = 1e9;
  for (const x of m.video_versions || []) { if (!x || !x.url) continue; const t = Number(x.type) || 999; if (t < rank) { best = x; rank = t; } }
  return best;
}
// 파싱 결과 = { source:'threads', … } · 게시물 노드를 못 찾으면 null(호출부가 범용 스캔으로 강등)
function lgParseThreads(html, code, user) {
  const nodes = lgThNodes(html, code);
  if (!nodes.length) return null;
  let post = nodes[0], slides = [];
  for (const n of nodes) { const g = lgThMedia(n); if (g.length > slides.length) { slides = g; post = n; } }
  const who = String((post.user && post.user.username) || user || "threads").replace(/[^\w.-]+/g, "");
  const cap = String((post.caption && post.caption.text) || "");
  const ttl = cap.trim().split("\n")[0].slice(0, 60);
  const items = [];
  slides.forEach((m, i) => {
    const nm = who + "_" + code + (slides.length > 1 ? "_" + (i + 1) : "");
    const v = lgThBestVid(m), img = lgThBestImg(m);
    if (v) items.push({ kind: "video", title: nm + ".mp4", url: v.url, dl: v.url, via: "proxy", note: "", thumb: (img && img.url) || "", stream: "", vid: "" });
    else if (img) items.push({ kind: "img", title: nm + ".jpg", url: img.url, dl: img.url, via: "proxy", note: "", thumb: img.url, stream: "", vid: "" });
  });
  return { source: "threads", title: (ttl ? ttl + " · " : "") + "@" + (who || "threads"), items };
}
// 스레드 주소 1건을 목록으로 — 공유 링크(/share/) 해소 → 원글 페이지 수신 → SSR JSON 파싱.
//  ⚠ 공유 링크는 요청자에 따라 응답이 갈린다(실측 260803):
//    · 브라우저 UA → 200 + 클라이언트 라우팅 셸(og:* 0건 · 미디어 JSON 0건) = 읽을 정답이 페이지에 없다
//    · 비-브라우저 UA → 302 Location = 정규 주소(/@user/post/<code>) = 서버가 직접 알려준다
//  그래서 share 첫 요청만 일부러 봇 UA로 던지고, 원글 페이지는 다시 브라우저 UA로 연다(그래야 SSR JSON이 실린다).
async function lgThResolve(u, th) {
  if (th.kind !== "share") return { th, page: u.toString() };
  try {
    const r = await fetch(u.toString(), { redirect: "manual", signal: AbortSignal.timeout(12e3), headers: { "User-Agent": "yeulmaru-linkgrab/1.0", "Accept-Language": LG_TH_NAV["Accept-Language"] } });
    const m = LG_TH_POST.exec(r.headers.get("location") || "");
    if (r.body && r.body.cancel) { try { r.body.cancel(); } catch (_) {} }
    if (m) return { th: { user: m[1], kind: "post", code: m[2] }, page: "https://www.threads.com/@" + m[1] + "/post/" + m[2] };
  } catch (_) {}
  return null;   // 302를 못 받았다 = 셸 폴백(호출부가 메타에서 되찾는다)
}
async function lgGrabThreads(u, th) {
  let hit = await lgThResolve(u, th), html = "";
  if (!hit) {
    // 폴백 = 공유 셸을 브라우저 UA로 열어 메타(og:url·al:android:url)에서 정규 주소를 되찾는다.
    //  ⚠ 본문 아무 데서나 정규 주소를 줍는 폴백은 두지 않는다 — 한 페이지에 추천글 코드가 수십 개 섞여 엉뚱한 글을 받는다.
    let shell;
    try { shell = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(15e3), headers: LG_TH_NAV }); } catch (_) { return null; }
    if (!shell.ok) return null;
    html = await shell.text();
    const mu = html.match(/property=["'](?:og:url|al:android:url)["'][^>]*content=["']([^"']+)/i);
    const m = LG_TH_POST.exec((mu && mu[1]) || shell.url || "");
    if (!m) return { source: "page", title: "스레드", items: [], _shell: true };   // 정답 신호 0 = 지어내지 않는다
    hit = { th: { user: m[1], kind: "post", code: m[2] }, page: "https://www.threads.com/@" + m[1] + "/post/" + m[2] };
    html = "";
  }
  if (!html) {
    let r;
    try { r = await fetch(hit.page, { redirect: "follow", signal: AbortSignal.timeout(15e3), headers: LG_TH_NAV }); } catch (_) { return null; }
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    html = new TextDecoder("utf-8").decode(buf.byteLength > 6e6 ? buf.slice(0, 6e6) : buf);   // 원글 페이지 실측 ≈ 850KB(범용 3MB 캡보다 넉넉히)
  }
  const out = lgParseThreads(html, hit.th.code, hit.th.user);
  if (out) return out;
  // SSR JSON을 못 읽었다(로그인 월·구조 변경) = 그 페이지 범용 스캔으로 강등.
  // 최소한 og:image(대표 사진)는 원글 페이지에 언제나 실려 있다 → 로고 1건보다는 낫다.
  const gen = lgParseGeneric(html, hit.page);
  return gen.items.length ? gen : null;
}
// 스트리밍 주소(유튜브 등) 1건 = 그 자체가 결과 — 페이지를 열지 않는다.
//  왜: ⓐ 받을 파일이 그 HTML 안에 없다(스캔해도 자기 영상은 목록에 안 들어온다 — 실측 = 파비콘·JS 번들 36건)
//      ⓑ 유튜브가 데이터센터 IP(워커 egress)에 HTTP 429를 준다 = 「페이지 응답 오류 HTTP 429」로 전량 실패(운영자 260803 실측).
//  필요한 정보(영상 id·썸네일)는 이미 주소에 다 있고, 제목만 oEmbed로 보강한다(가벼운 공개 엔드포인트 · 실패해도 결과 불변).
async function lgStreamMeta(st, href) {
  if (st.stream !== "youtube") return null;
  try {
    const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(href), { signal: AbortSignal.timeout(6e3), headers: { "User-Agent": LG_UA, "Accept": "application/json" } });
    if (!r.ok) return null;
    const d = await r.json();
    return { title: String(d.title || "").slice(0, 120), thumb: String(d.thumbnail_url || "") };
  } catch (_) { return null; }
}
async function lgStreamOnly(target, st, env) {
  const href = target.toString();
  const sp = lgSpecial(href) || {};
  const meta = await lgStreamMeta(st, href);
  const name = (meta && meta.title) || href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80);
  return json({
    source: "stream",
    title: (meta && meta.title) || target.hostname.replace(/^www\./, ""),
    items: [{ kind: "video", title: name, url: href, dl: null, via: "", note: sp.note || "스트리밍 — [저장]을 누르면 변환해서 받아요(보통 2~5분)", thumb: (meta && meta.thumb) || sp.thumb || st.thumb || "", stream: sp.stream || st.stream || "", vid: sp.vid || st.vid || "" }]
  }, env);
}
// 항목별 용량·타입 조회(HEAD → Range 폴백) — 갤러리 우상단 표시용(프론트가 지연 호출)
async function lgHead(url, env) {
  let target;
  try { target = lgGuardUrl(url.searchParams.get("url")); } catch (e) { return json({ error: e.message }, env, 400); }
  const hdr = { "User-Agent": LG_UA, "Accept-Language": "ko,en;q=0.8" };
  try {
    let r = await fetch(target.toString(), { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8e3), headers: hdr });
    let size = parseInt(r.headers.get("content-length") || "0", 10) || 0;
    let type = r.headers.get("content-type") || "";
    if (!r.ok || !size) {
      r = await fetch(target.toString(), { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8e3), headers: Object.assign({ "Range": "bytes=0-0" }, hdr) });
      const total = String(r.headers.get("content-range") || "").split("/")[1];
      size = (total && total !== "*") ? (parseInt(total, 10) || 0) : (parseInt(r.headers.get("content-length") || "0", 10) || 0);
      type = r.headers.get("content-type") || type;
      try { if (r.body && r.body.cancel) r.body.cancel(); } catch (_) {}
    }
    return json({ size, type }, env);
  } catch (_) { return json({ size: 0, type: "" }, env); }
}
async function lgList(url, env) {
  let target;
  try { target = lgGuardUrl(url.searchParams.get("url")); } catch (e) { return json({ error: e.message }, env, 400); }
  // ① 스트리밍 주소 = 페이지를 열지 않고 그 자리에서 확정(유튜브 429 봉합 · lgStreamOnly 주석 참조)
  const st0 = lgStreamInfo(target.toString());
  if (st0) return lgStreamOnly(target, st0, env);
  // ② 스레드 = 전용 파서(사진·영상이 태그가 아니라 SSR JSON에 있다 · lgParseThreads 주석 참조) — 실패하면 ③으로 강등
  const th0 = lgThInfo(target);
  if (th0) {
    let thOut = null;
    try { thOut = await lgGrabThreads(target, th0); } catch (_) {}
    if (thOut) { if (!thOut.title) thOut.title = target.hostname; return json(thOut, env); }
  }
  // ③ 범용 스캔
  let res;
  try { res = await lgFetchPage(target, 15e3); } catch (_) { return json({ error: "페이지에 접속하지 못했어요(시간 초과·차단)" }, env, 502); }
  if (res.status >= 520) return json({ error: "이 사이트가 백엔드 자동 접속을 막고 있어요(해외·봇 차단 추정, HTTP " + res.status + ") — 이 링크는 자동 수집이 안 돼요" }, env, 502);
  if (res.status === 403 || res.status === 406) return json({ error: "이 사이트가 자동 수집을 거부했어요(HTTP " + res.status + ")" }, env, 502);
  if (res.status === 429) return json({ error: "이 사이트가 접속 횟수를 제한했어요(HTTP 429) — 잠시 뒤 다시 시도해 주세요" }, env, 502);
  if (!res.ok) return json({ error: "페이지 응답 오류 HTTP " + res.status }, env, 502);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html")) {
    // 파일 직링크 — 그 파일 1건짜리 목록으로 응답
    const k = lgKindOf(target.pathname) || (ct.startsWith("image/") ? "img" : ct.startsWith("video/") ? "video" : "doc");
    const name = lgDec(target.pathname.split("/").pop() || "파일");
    return json({ source: "file", title: name, items: [{ kind: k, title: name, url: target.toString(), dl: target.toString(), via: "proxy", note: "", thumb: k === "img" ? target.toString() : "" }] }, env);
  }
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf.byteLength > 3e6 ? buf.slice(0, 3e6) : buf);
  const host = target.hostname.toLowerCase();
  let out = null;
  if (host === "linktr.ee" || host.endsWith(".linktr.ee")) out = lgParseLinktree(html);
  if (!out) out = lgParseGeneric(html, res.url || target.toString());
  if (!out.title) out.title = target.hostname;
  return json(out, env);
}
// --- 영상(yt-dlp) 저장 파이프라인 — 운영자 승인 260721: 권리 보유·이용 허가 콘텐츠 전용(앱 동의 체크 후) ---
//  앱 → POST /api/linkgrab/ytdl → repository_dispatch[ytdl] → Actions(.github/workflows/ytdl.yml, yt-dlp)
//  → 릴리스 ytdl-drops 자산(<id>.mp4) → /ytstat 폴링 → /ytfile = GitHub 서명 URL 발급(브라우저 직접 수신 — 대용량 안전).
//  id = 영상 URL의 SHA-1 앞 16자리 → 같은 영상 재요청 = 변환 생략(자산 재사용, 7일 보관).
async function lgYtId(u) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(u)));
  return "v" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
async function lgYtRel(env) {
  const cfg = ghBlogCfg(env);
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/releases/tags/ytdl-drops`, { headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" } });
  if (!r.ok) return null;
  return r.json();
}
// 자산 조회 — 단일본(<id>.mp4) 또는 분할본(<id>.pNN.mp4 + <id>.done.json 완료 마커) 인식
function lgYtLookup(rel, id) {
  const assets = (rel && rel.assets) || [];
  const one = assets.find((a) => a.name === id + ".mp4");
  if (one) return { ready: true, size: one.size, asset: one.id };
  if (assets.find((a) => a.name === id + ".done.json")) {
    const re = new RegExp("^" + id + "\\.p\\d+\\.mp4$");
    const parts = assets.filter((a) => re.test(a.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
    if (parts.length) return { ready: true, size: parts.reduce((s, p) => s + p.size, 0), parts: parts.map((p) => ({ asset: p.id, size: p.size, name: p.name })) };
  }
  const err = assets.find((a) => a.name === id + ".err.txt");
  if (err) return { failed: true, errAsset: err.id };   // errAsset = 실패 사유 원문 위치(ytstat이 읽어 앱에 넘긴다)
  return null;
}
// 화질 = max·1080·720·480만(그 외 = max). ⚠ id 해시에 함께 들어간다 —
// 안 넣으면 1080으로 한 번 변환한 영상에 「최고화질」을 눌러도 옛 1080본이 재사용된다.
var LG_YT_Q = ["max", "1080", "720", "480"];
function lgYtQ(v) {
  v = String(v || "max");
  return LG_YT_Q.indexOf(v) >= 0 ? v : "max";
}
async function lgYtDispatch(request, env) {
  const cfg = ghBlogCfg(env);
  if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const vurl = String(b.url || "");
  if (!lgStreamInfo(vurl)) return json({ error: "스트리밍 영상 주소가 아니에요" }, env, 400);
  const q = lgYtQ(b.q);
  const id = await lgYtId(vurl + "|" + q);
  const hit = lgYtLookup(await lgYtRel(env), id);
  if (hit && hit.ready) return json(Object.assign({ ok: true, id, q }, hit), env);   // 같은 영상·같은 화질 변환분(단일/분할) 재사용
  const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
    method: "POST",
    headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "yeulmaru-promo-worker" },
    body: JSON.stringify({ event_type: "ytdl", client_payload: { d: { id, url: vurl, q, title: String(b.title || "").slice(0, 120) } } })
  });
  if (!gr.ok) return json({ error: "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 160) }, env, 502);
  return json({ ok: true, id, q }, env);
}
// 실패 사유 원문 읽기 — 러너가 올린 err.txt(≤1KB) 그대로. 260803 개정 전에는 앱이 원인과 무관하게
// 「초대형(6GB 초과)」이라고만 떠서 운영자가 용량 문제로 오해했다(실제 원인 = 유튜브 봇 차단).
async function lgYtErrText(env, assetId) {
  const cfg = ghBlogCfg(env);
  try {
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}/releases/assets/${assetId}`, {
      headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/octet-stream", "User-Agent": "yeulmaru-promo-worker" }
    });
    if (!r.ok) return "";
    return (await r.text()).slice(0, 900);
  } catch (_) { return ""; }
}
async function lgYtStat(url, env) {
  const id = String(url.searchParams.get("id") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  if (!id) return json({ error: "id가 필요해요" }, env, 400);
  const hit = lgYtLookup(await lgYtRel(env), id);
  if (hit && hit.failed && hit.errAsset) hit.reason = await lgYtErrText(env, hit.errAsset);
  return json(hit || { ready: false }, env);
}
async function lgYtFile(url, env) {
  const cfg = ghBlogCfg(env);
  const aid = String(url.searchParams.get("asset") || "").replace(/\D/g, "");
  if (!aid) return json({ error: "asset이 필요해요" }, env, 400);
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/releases/assets/${aid}`, { redirect: "manual", headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/octet-stream", "User-Agent": "yeulmaru-promo-worker" } });
  const loc = r.headers.get("location");
  if (!loc) return json({ error: "파일 위치를 얻지 못했어요" }, env, 502);
  return json({ url: loc }, env);
}
async function lgFile(url, env) {
  let target;
  try { target = lgGuardUrl(url.searchParams.get("url")); } catch (e) { return json({ error: e.message }, env, 400); }
  let res;
  try {
    res = await fetch(target.toString(), { redirect: "follow", headers: { "User-Agent": LG_UA, "Accept-Language": "ko,en;q=0.8" } });
  } catch (_) { return json({ error: "파일을 받아오지 못했어요" }, env, 502); }
  if (!res.ok || !res.body) return json({ error: "원본 응답 오류 HTTP " + res.status }, env, 502);
  const len = parseInt(res.headers.get("content-length") || "0", 10);
  if (len > 300 * 1024 * 1024) return json({ error: "300MB 초과 파일은 원본 링크로 받아주세요" }, env, 413);
  let name = String(url.searchParams.get("name") || lgDec(target.pathname.split("/").pop() || "") || "download").replace(/[\r\n"\\]+/g, " ").trim().slice(0, 180) || "download";
  if (name.indexOf(".") < 0) {
    const em = (target.pathname.match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0];
    if (em) name += em;
  }
  const h = new Headers(corsHeaders(env));
  h.set("Content-Type", res.headers.get("content-type") || "application/octet-stream");
  if (len) h.set("Content-Length", String(len));
  h.set("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(name));
  h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: 200, headers: h });
}

export {
  index_default as default
};
//# sourceMappingURL=index.js.map