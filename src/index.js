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
    "Access-Control-Allow-Headers": "Content-Type, X-App-Password, X-Sub-Admin-PIN, X-Acct-PIN",
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

// [260812 운영자 「회계 담당자가 새로 신규 필요(권한)」] 회계 담당자 검증 — checkAdmin과 **같은 문법**
//   (앱 비번 + 본인 PIN 헤더 → 담당자 시트로 재검증 · 휴직 제외). 다른 점은 보는 열 하나뿐: 관리자여부 → 회계여부.
//   ⚠ 클라이언트 판정(`_isAcct()`)은 콘솔로 우회 가능하므로 **쓰기 허용은 반드시 여기서** 정한다(PII 시트 GET 선례와 같은 축).
//   관리자는 상위 권한이라 호출측에서 `checkAdmin ∨ checkAccountant`로 묶는다 — 여기선 회계 열만 본다.
async function checkAccountant(request, env, token) {
  const pw = request.headers.get("X-App-Password");
  if (pw !== env.APP_PASSWORD && pw !== env.ADMIN_PASSWORD) return { acct: false };
  const pin = request.headers.get("X-Acct-PIN");
  if (!pin) return { acct: false };
  const rows = await getManagersCached(token);
  const user = rows.find((r) =>
    _pin4(r["PIN"]) === _pin4(pin) &&
    isFlagOn(r["\uD68C\uACC4\uC5EC\uBD80"]) &&
    !isFlagOn(r["\uD734\uC9C1\uC5EC\uBD80"])
  );
  if (user) return { acct: true, userName: user["\uB2F4\uB2F9\uC790"] };
  return { acct: false };
}
__name(checkAccountant, "checkAccountant");

// 회계 담당자가 쓸 수 있는 유일한 운영 시트. 여기 이름을 늘리는 건 **권한 확대**다 — 운영자 승인 없이 늘리지 마라.
var ACCT_WRITE_SHEETS = ["\uC6B4\uC601_\uC0AC\uC5C5\uBE44"];

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
//  #4A4DE7=--accent · #1A1A2E=--text · #888=--dim · #bbb=--muted · #fff=--surface-solid · #E24B4A=--danger-btn ·
//  #E1DFEC=--neutral-d(게이지 트랙 = 물에 잠긴 시간).
//  ⚠ [260805-39 운영자 「그린을 코발트로」] 「가능」 신호 = --green(#1A6B3C) → **--accent(#4A4DE7)**. 그래서 「지금」 마커는
//    --text(#1A1A2E)로 뺐다 — 마커까지 코발트로 두면 코발트 막대 위에서 묻혀 안 보인다. 「불가」 빨강(--danger-btn)은 그대로.
//  ⚠ `<img>`로 실리므로 SVG 내부 **스크립트**는 브라우저가 실행하지 않는다 = 상태 계산·조판 전부 서버(여기)에서 끝낸다.
//    단 SMIL `<animate>`·CSS는 `<img>` 안에서도 재생된다(스크립트만 차단) → 게이지 채움·「지금」 마커 박동에 SMIL을 쓴다.
//    ⚠ SMIL 미지원 환경 대비: 와이프용 clip 사각형의 **정적 width는 전체 폭**으로 두고 애니메이션이 0에서 자라게 한다.
//      (정적 0으로 두면 애니메이션이 안 도는 환경에서 가능 구간이 통째로 안 보인다.) begin은 0s 고정 —
//      지연이 필요하면 values 앞에 0을 한 번 더 넣어 멈춰 세운다(begin 지연 = 그 사이 정적 전체 폭이 번쩍인다).
//  rgba()는 SVG 1.1 미지원 → fill-opacity로 표현(같은 토큰 alpha 변주 = 기틀 §3.5②).
export function buildJangdoSvg(rows, nowKst, dayOffset) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // [260805-39 개정 · 운영자 지시] 표기 = 한국어 「오전/오후 N시 M분」. 내부 계산은 그대로 분(minute) 24시간.
  //  ⚠ **정오는 「낮 12시」** — 운영자 지적(「pm 12:21 이라고 하면 헷갈려」)대로 12:21을 「오후 12시 21분」이라 쓰면
  //    점심때를 밤처럼 읽는다. 오전/오후/낮 세 갈래로 갈라 12시대만 「낮」을 쓴다.
  const half = (m) => { const h = Math.floor(m / 60) % 24; return h < 12 ? 0 : (h === 12 ? 1 : 2); };   // 0=오전 1=낮12시대 2=오후
  const pre = ["오전 ", "낮 ", "오후 "];
  const hm = (m) => { const h = (Math.floor(m / 60) % 12) || 12, mm = m % 60; return h + "시" + (mm ? " " + mm + "분" : ""); };
  const korAt = (m) => pre[half(m)] + hm(m);                                    // 단독 시각 — "오후 10시"
  //  끝 시각도 오전/오후를 **붙인다** — 운영자 260806 「이거 열시만 오후 열시라고 하면 될듯」(「오후 3시 36분 ~ 10시」의 그 10시).
  //  ⚠ 예외는 **낮 12시대 하나**뿐 — 운영자 최초 예시가 「오전 6시 29분 ~ 12시 21분」이었고, 정오는 앞머리 없이도
  //    안 헷갈린다(오히려 「낮 12시 21분」까지 쓰면 장황). 즉 「같은 반나절이면 생략」 규칙은 폐기하고 12시대만 남긴다.
  const korRange = (r) => korAt(r[0]) + " ~ " + (half(r[1]) === 1 ? hm(r[1]) : korAt(r[1]));
  const fmtTick = (m) => pre[half(m)].trim() + ((Math.floor(m / 60) % 12) || 12) + "시";
  // 글자폭 어림(한글 1em · 나머지 비율) — 시간이 긴 날 큰 글씨가 카드 밖으로 나가지 않게 자동 축소한다.
  const estEm = (s) => { let w = 0; for (const c of s) w += /[가-힣]/.test(c) ? 1 : c === " " ? 0.28 : 0.62; return w; };
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
  const off = Math.max(0, Math.min(14, dayOffset | 0));
  const day = addDay(nowKst.ymd, off), isToday = off === 0;
  const rawT = map[day], ranges = jangdoRanges(rawT);

  // 게이지 축 = 통상 오전 6시~오후 10시(진섬다리 통행 창). 실데이터가 그 밖으로 나가는 날은 시(hour) 단위로 넓혀 잘리지 않게 한다.
  let AX0 = 6 * 60, AX1 = 22 * 60;
  if (ranges) for (const r of ranges) { AX0 = Math.min(AX0, r[0]); AX1 = Math.max(AX1, r[1]); }
  AX0 = Math.floor(AX0 / 60) * 60; AX1 = Math.ceil(AX1 / 60) * 60;

  // ── [260806 운영자 선택값] 조판 상수 = 여기 한 블록이 SSOT.
  //    출처 = 플레이그라운드 `docs/reports/260806_장도카드_플레이그라운드.html`(축 72) 회신분을 그대로 배선.
  //    다음 튜닝 라운드도 **이 블록만** 갈아끼우면 된다(본문 조판식은 전부 T를 참조).
  //    ⚠ 신규 색 0 — 전부 기틀 §0 팔레트 칩. 이번 라운드 역할 재지정 2건(제목·날짜 = --text/--dim → --accent)은
  //      **이 카드 안에서만** 적용한다. 「전 앱 동축 일괄」은 운영자가 카드를 튜닝한 맥락을 넘어서므로 손대지 않는다.
  const T = {
    W: 1300, pad: 44, radius: 7, yTitle: 70, gapTime: 66, lhTime: 1.74,
    gapStat: 60, gapGauge: 34, gapTick: 40, gapNote: 50, padBot: 42,
    font: "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif",
    fsTitle: 22.5, fwTitle: 500, lsTitle: -0.5, fsDate: 21, fwDate: 800,
    fsTime: 34, fwTime: 800, lsTime: -0.5, fsStat: 19, fwStat: 500,
    fsTick: 16.5, fwTick: 900, fsLeg: 13.5, fsNote: 16, fwNote: 500,
    barH: 26, barR: 21, segMin: 8, tickStep: 180, tickLen: 5,
    mkW: 2.5, mkOver: 7, mkDotR: 4.5, mkDotY: 11, pingMax: 15, pingDur: 2.2,
    wipeDur: 0.95, wipeEase: "0.22 1 0.36 1", dotR: 12, legSw: 15, legSwR: 3.5,
    cOk: "#4A4DE7", cTrack: "#E1DFEC", cMk: "#1A1A2E", cTitle: "#4A4DE7", cTime: "#1A1A2E",
    cDate: "#4A4DE7", cBadge: "#4A4DE7", cStatOk: "#4A4DE7", cStatNo: "#E24B4A", cStatEnd: "#888",
    cNone: "#888", cTick: "#bbb", cNote: "#bbb", cCard: "#fff", aBorder: 0.2
  };
  const W = T.W, PAD = T.pad, GX = PAD, GW = W - PAD * 2;
  const px = (m) => GX + (Math.max(AX0, Math.min(AX1, m)) - AX0) / (AX1 - AX0) * GW;
  let y = T.yTitle, body = "", defs = "";
  const badge = off === 0 ? "오늘" : off === 1 ? "내일" : "";
  body += '<text x="' + PAD + '" y="' + y + '" font-size="' + T.fsTitle + '" font-weight="' + T.fwTitle +
          '" letter-spacing="' + T.lsTitle + '" fill="' + T.cTitle + '">장도 입도 가능 시간</text>';
  body += '<text x="' + (W - PAD) + '" y="' + y + '" text-anchor="end" font-size="' + T.fsDate +
          '" font-weight="' + T.fwDate + '" fill="' + T.cDate + '">' + esc(label(day)) +
          (badge ? ' <tspan fill="' + T.cBadge + '" font-weight="700">' + badge + "</tspan>" : "") + "</text>";

  if (ranges) {
    // 구간마다 **한 줄**(운영자 예시가 두 줄) — 한 줄에 이어 붙이면 「~」가 두 번 나와 어디서 끊기는지 눈에 안 들어온다.
    const lines = ranges.map(korRange);
    const fs = Math.min(T.fsTime, Math.max(16, Math.floor(GW / Math.max.apply(null, lines.map(estEm)))));
    lines.forEach((ln, i) => {
      y += i === 0 ? T.gapTime : Math.round(fs * T.lhTime);
      body += '<text x="' + PAD + '" y="' + y + '" font-size="' + fs + '" font-weight="' + T.fwTime +
              '" letter-spacing="' + T.lsTime + '" fill="' + T.cTime + '">' + esc(ln) + "</text>";
    });

    y += isToday ? T.gapStat : Math.round(T.gapStat * 0.79);
    if (isToday) {                                   // 「지금」 상태는 오늘 카드에만 — 내일 카드에 붙이면 거짓말이 된다
      let dot = T.cStatEnd, txt = "오늘 입도 시간이 종료됐어요", col = T.cStatEnd, live = false;
      for (const r of ranges) {
        if (nowKst.min >= r[0] && nowKst.min < r[1]) { dot = col = T.cStatOk; txt = "지금 입도 가능 · " + korAt(r[1]) + "까지"; live = true; break; }
        if (nowKst.min < r[0]) { dot = col = T.cStatNo; txt = "지금은 입도 불가 · " + korAt(r[0]) + "부터 입도 가능"; break; }
      }
      body += '<circle cx="' + (PAD + T.dotR) + '" cy="' + (y - 6) + '" r="' + T.dotR + '" fill="' + dot + '">' +
              (live ? '<animate attributeName="opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite"/>' : "") + "</circle>";
      body += '<text x="' + (PAD + T.dotR * 2 + 10) + '" y="' + y + '" font-size="' + T.fsStat +
              '" font-weight="' + T.fwStat + '" fill="' + col + '">' + esc(txt) + "</text>";
    }
    // 범례 — 자리를 폭·색칩 크기 식으로 잡는다(하드코딩하면 W나 칩 크기를 바꿀 때마다 어긋난다)
    const LX = W - PAD - 164, SW = T.legSw;
    body += '<rect x="' + LX + '" y="' + (y - SW - 2) + '" width="' + SW + '" height="' + SW + '" rx="' + T.legSwR + '" fill="' + T.cOk + '"/>' +
            '<text x="' + (LX + SW + 5) + '" y="' + (y - 4) + '" font-size="' + T.fsLeg + '" fill="' + T.cDate + '">입도 가능</text>' +
            '<rect x="' + (LX + SW + 72) + '" y="' + (y - SW - 2) + '" width="' + SW + '" height="' + SW + '" rx="' + T.legSwR + '" fill="' + T.cTrack + '"/>' +
            '<text x="' + (LX + SW * 2 + 77) + '" y="' + (y - 4) + '" font-size="' + T.fsLeg + '" fill="' + T.cDate + '">물에 잠김</text>';

    // 게이지 — 트랙 전체 = 하루 통행 창, 채움 = 건널 수 있는 시간, 회색 = 다리가 잠겨 못 건너는 시간
    const BT = y + T.gapGauge, BH = T.barH, BR = Math.min(T.barR, BH / 2);   // 모서리 상한 = 높이 절반(그 위는 같은 모양)
    defs += '<clipPath id="wipe"><rect x="' + GX + '" y="' + (BT - 40) + '" width="' + GW + '" height="' + (BH + 80) + '">' +
            '<animate attributeName="width" values="0;' + GW + '" keyTimes="0;1" dur="' + T.wipeDur + 's" begin="0s"' +
            ' calcMode="spline" keySplines="' + T.wipeEase + '" fill="freeze"/></rect></clipPath>';
    body += '<rect x="' + GX + '" y="' + BT + '" width="' + GW + '" height="' + BH + '" rx="' + BR + '" fill="' + T.cTrack + '"/>';
    let segs = "";
    for (const r of ranges) {
      const x0 = px(r[0]), x1 = px(r[1]);
      segs += '<rect x="' + x0.toFixed(1) + '" y="' + BT + '" width="' + Math.max(T.segMin, x1 - x0).toFixed(1) +
              '" height="' + BH + '" rx="' + BR + '" fill="' + T.cOk + '"/>';
    }
    // 「지금」 마커 — 와이프 안에 넣어 게이지가 채워지며 함께 드러난다. 박동(ping)은 무한 반복.
    if (isToday && nowKst.min >= AX0 && nowKst.min <= AX1) {
      const nx = px(nowKst.min).toFixed(1);
      segs += '<line x1="' + nx + '" y1="' + (BT - T.mkOver) + '" x2="' + nx + '" y2="' + (BT + BH + T.mkOver) +
              '" stroke="' + T.cMk + '" stroke-width="' + T.mkW + '" stroke-linecap="round"/>' +
              '<circle cx="' + nx + '" cy="' + (BT - T.mkDotY) + '" r="' + T.mkDotR + '" fill="' + T.cMk + '" fill-opacity="0.42">' +
              '<animate attributeName="r" values="' + T.mkDotR + ';' + T.pingMax + '" dur="' + T.pingDur + 's" repeatCount="indefinite"/>' +
              '<animate attributeName="fill-opacity" values="0.42;0" dur="' + T.pingDur + 's" repeatCount="indefinite"/></circle>' +
              '<circle cx="' + nx + '" cy="' + (BT - T.mkDotY) + '" r="' + T.mkDotR + '" fill="' + T.cMk + '"/>';
    }
    body += '<g clip-path="url(#wipe)">' + segs + "</g>";

    // 눈금 (와이프 밖 = 처음부터 보인다)
    const TY = BT + BH + T.gapTick;
    for (let m = AX0; m <= AX1; m += T.tickStep) {
      const tx = px(m).toFixed(1);
      const anchor = px(m) < GX + 18 ? "start" : px(m) > GX + GW - 18 ? "end" : "middle";
      body += '<line x1="' + tx + '" y1="' + (BT + BH + 3) + '" x2="' + tx + '" y2="' + (BT + BH + 3 + T.tickLen) +
              '" stroke="#000" stroke-opacity="0.09" stroke-width="1"/>' +
              '<text x="' + tx + '" y="' + TY + '" text-anchor="' + anchor + '" font-size="' + T.fsTick +
              '" font-weight="' + T.fwTick + '" fill="' + T.cTick + '">' + fmtTick(m) + "</text>";
    }
    y = TY;
  } else {
    y += 50;
    // ⚠ 미등록·통제 공지 문구는 **--dim 고정**(cNone) — 플레이그라운드에선 이 자리가 「날짜 글자」 축에 묶여 있었지만,
    //   운영자가 바꾼 건 우상단 날짜지 이 안내 문구가 아니다. 묶어두면 안내가 강조색으로 튄다.
    body += '<text x="' + PAD + '" y="' + y + '" font-size="' + (rawT ? T.fsTime * 0.8 : T.fsTime * 0.62) +
            '" font-weight="700" fill="' + (rawT ? T.cTime : T.cNone) + '">' +
            esc(rawT || (isToday ? "오늘" : "이 날짜의") + " 입도 시간이 아직 등록되지 않았어요") + "</text>";
  }
  // [260805-39] 「내일」 줄은 뺐다(운영자 지시) — 내일은 같은 카드의 ?d=1 판으로 내고 홈페이지에서 접었다 편다.
  y += T.gapNote;
  body += '<text x="' + PAD + '" y="' + y + '" font-size="' + T.fsNote + '" font-weight="' + T.fwNote +
          '" fill="' + T.cNote + '">위 시간 외에는 진섬다리가 물에 잠겨 출입이 불가합니다. 아래 월별 캘린더도 함께 확인해 주세요.</text>';

  const H = Math.round(y + T.padBot);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
    '" role="img" aria-label="장도 입도 가능 시간" font-family="' + esc(T.font) + '">' +
    (defs ? "<defs>" + defs + "</defs>" : "") +
    '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="' + T.radius + '" fill="' + T.cCard +
    '" stroke="#000" stroke-opacity="' + T.aBorder + '"/>' +
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
// === 지역 방문자 지수 (한국관광공사 빅데이터 — 기초지자체 일별 방문자수) ===
//   [260803] 여수·순천·광양 3개 시의 「요일별 기대 방문객」을 계산해 홍보 게시일 판단에 쓴다.
//   ⚠ 실시간이 아니다 — 실측 집계 지연 = 23일(260803 기준 최신 데이터 20260711).
//     그래서 「지금 붐비나」가 아니라 **요일·시기 패턴**만 제공한다(docs/공공API_발급절차.md §2-D).
//   · 자격증명 = env.DATAGO_KEY (없으면 공휴일용 env.KASI_KEY로 폴백 — 같은 포털의 같은 계정 키).
//     Encoding/Decoding 어느 판을 넣어도 동작하게 공휴일 쪽과 같은 관용구를 쓴다(%가 있으면 이미 인코딩된 것).
//   · API에 지역 필터 파라미터가 없다 → 전국(하루 807행)이 통째로 오므로 signguNm으로 걸러 쓴다.
//   · KV 24시간 캐시 + stale-while-revalidate(gcal과 같은 축). 원본이 하루 단위라 더 자주 받을 이유가 없다.
var VISITOR_CITIES = ["여수시", "순천시", "광양시"];
var VISITOR_DOW = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
var VISITOR_WINDOW_DAYS = 28;   // 평균 낼 창 = 4주(요일마다 4표본)
var VISITOR_TTL = 86400;

function visitorKey(env) {
  const k = env.DATAGO_KEY || env.KASI_KEY || "";
  if (!k) return "";
  return k.includes("%") ? k : encodeURIComponent(k);
}
__name(visitorKey, "visitorKey");

function visitorYmd(d) {   // Date(UTC 기준 KST 시각) → YYYYMMDD
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
__name(visitorYmd, "visitorYmd");

// 포털 게이트웨이가 간헐적으로 연결을 끊는다(실측) → 1회 재시도. 재시도로도 실패하면 던진다.
async function visitorFetch(env, startYmd, endYmd, numOfRows) {
  const sk = visitorKey(env);
  const url = `https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList` +
    `?serviceKey=${sk}&MobileOS=ETC&MobileApp=yeulmaru-promo` +
    `&startYmd=${startYmd}&endYmd=${endYmd}&numOfRows=${numOfRows}&pageNo=1&_type=json`;
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("visitor http " + r.status);
      const j = await r.json();
      const body = j && j.response && j.response.body;
      if (!body) throw new Error("visitor bad payload");
      let items = body.items && body.items.item;
      if (!items) items = [];
      if (!Array.isArray(items)) items = [items];
      return { total: Number(body.totalCount || 0), items };
    } catch (e) { last = e; }
  }
  throw last || new Error("visitor fetch failed");
}
__name(visitorFetch, "visitorFetch");

// 집계 지연폭이 고정이 아니므로 「데이터가 차 있는 마지막 날」을 매번 찾는다.
//   7일 간격으로 뒤로 훑어 첫 히트를 찾고(최대 9회 = 63일), 거기서 하루씩 앞으로 6일까지 밀어 정확한 끝을 잡는다.
async function visitorLatestYmd(env) {
  const base = Date.now() + 9 * 3600 * 1e3;
  let hit = null;
  for (let back = 14; back <= 77; back += 7) {
    const d = new Date(base - back * 86400 * 1e3);
    const y = visitorYmd(d);
    let res;
    try { res = await visitorFetch(env, y, y, 1); } catch (e) { continue; }
    if (res.total > 0) { hit = { ymd: y, back }; break; }
  }
  if (!hit) return null;
  // 앞으로 밀 때는 호출 실패(≠0행)로 멈추면 최신 며칠을 잃는다 → 실패는 건너뛰고 계속, 0행에서만 멈춘다.
  //   ⚠ 기준점(coarse)은 고정해 두고 fwd를 뺀다 — hit.back을 그때그때 빼면 걸음이 겹쳐 날짜를 건너뛴다.
  const coarse = hit.back;
  for (let fwd = 1; fwd <= 6; fwd++) {
    const d = new Date(base - (coarse - fwd) * 86400 * 1e3);
    const y = visitorYmd(d);
    let res;
    try { res = await visitorFetch(env, y, y, 1); } catch (e) { continue; }
    if (res.total > 0) hit = { ymd: y, back: coarse - fwd }; else break;
  }
  return hit.ymd;
}
__name(visitorLatestYmd, "visitorLatestYmd");

function visitorBuild(items, fromYmd, toYmd) {
  // 외지인(b) = 일상생활권 밖에서 온 방문자 = 홍보 대상. 현지인(a)은 상주인구라 거의 상수라 제외한다.
  const bucket = {};
  for (const c of VISITOR_CITIES) bucket[c] = {};
  for (const it of items) {
    const city = String(it.signguNm || "");
    if (!bucket[city]) continue;
    if (!String(it.touDivNm || "").startsWith("외지인")) continue;
    const w = String(it.daywkDivNm || "");
    if (!bucket[city][w]) bucket[city][w] = [];
    bucket[city][w].push(Number(it.touNum) || 0);
  }
  const cities = {};
  for (const c of VISITOR_CITIES) {
    const avg = VISITOR_DOW.map((w) => {
      const v = bucket[c][w] || [];
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    });
    const used = avg.filter((v) => v > 0);
    const mean = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
    cities[c.replace(/시$/, "")] = {
      avg,                                                     // 요일별 평균 외지인 수(월~일)
      idx: avg.map((v) => mean ? Math.round(v / mean * 100) / 100 : 0),   // 전체 평균 대비 지수(1.00 기준)
      peak: avg.indexOf(Math.max.apply(null, avg))             // 가장 붐비는 요일 인덱스
    };
  }
  return { ok: true, dow: VISITOR_DOW, from: fromYmd, to: toYmd, cities };
}
__name(visitorBuild, "visitorBuild");

async function visitorRefresh(env) {
  const latest = await visitorLatestYmd(env);
  if (!latest) throw new Error("visitor: 가용 데이터 없음");
  const end = new Date(Date.UTC(+latest.slice(0, 4), +latest.slice(4, 6) - 1, +latest.slice(6, 8)));
  const start = new Date(end.getTime() - (VISITOR_WINDOW_DAYS - 1) * 86400 * 1e3);
  const fromYmd = visitorYmd(start);
  // 하루 807행 × 28일 ≈ 22,600행. 한 번에 받아 캐시한다(지역 필터가 없어 나눠 받아도 이득이 없다).
  const res = await visitorFetch(env, fromYmd, latest, VISITOR_WINDOW_DAYS * 900);
  const payload = visitorBuild(res.items, fromYmd, latest);
  const nowKst = new Date(Date.now() + 9 * 3600 * 1e3);
  payload.lagDays = Math.round((Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) - end.getTime()) / 86400 / 1e3);
  payload.cachedAt = (/* @__PURE__ */ new Date()).toISOString();
  try { await env.ops_kv.put("visitors:idx", JSON.stringify(payload), { expirationTtl: VISITOR_TTL }); } catch (e) {}
  try { await env.ops_kv.put("visitors:idx:last", JSON.stringify(payload)); } catch (e) {}
  return payload;
}
__name(visitorRefresh, "visitorRefresh");

async function visitorIndex(env, force, ctx) {
  if (!visitorKey(env)) return { ok: false, error: "DATAGO_KEY 미설정", setup: true, cities: {} };
  if (!force) {
    try {
      const c = await env.ops_kv.get("visitors:idx");
      if (c) return JSON.parse(c);
    } catch (e) {}
    // 캐시가 식었으면 마지막 성공본을 즉시 주고 갱신은 뒤로 넘긴다(gcal과 같은 stale-while-revalidate).
    try {
      const stale = await env.ops_kv.get("visitors:idx:last");
      if (stale && ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(visitorRefresh(env).catch(() => {}));
        const p = JSON.parse(stale); p.stale = true; return p;
      }
    } catch (e) {}
  }
  try {
    return await visitorRefresh(env);
  } catch (e) {
    try {
      const stale = await env.ops_kv.get("visitors:idx:last");
      if (stale) { const p = JSON.parse(stale); p.stale = true; return p; }
    } catch (e2) {}
    return { ok: false, error: String(e && e.message || e), cities: {} };
  }
}
__name(visitorIndex, "visitorIndex");

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

// opt = { model, effort } — 미지정이면 종전 그대로(BLOG_MODEL 또는 opus-5 · effort 미전송 = API 기본 high).
// ⚠ `effort`는 **`output_config` 안**이다(최상위 아님) · GA라 베타 헤더 불요 · low|medium|high|xhigh|max.
// ⚠ 이 함수에 `temperature`/`top_p`/`top_k`를 되살리지 마라 — opus-5·sonnet-5는 400을 준다(제거된 파라미터).
// ⚠ opus-5는 **thinking이 기본 ON**이고 `max_tokens`가 thinking+답변을 **함께** 덮는다 → 짧은 답이라도 여유를 준다.
async function claudeText(env, system, userText, maxTokens, opt) {
  opt = opt || {};
  const model = opt.model || env.BLOG_MODEL || "claude-opus-5";
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
  const body = { model, max_tokens: maxTokens || 4000, system: sysParam, messages: [{ role: "user", content: userText }] };
  if (opt.effort) body.output_config = { effort: opt.effort };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers,
    body: JSON.stringify(body)
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

// ── AI 홍보 ▸ 상세페이지 추출 캐시 (260806) ───────────────────────────────
// 「한 번 조회했으면 그걸 가지고 있어야 한다」(운영자 260806) — 추출(본문 텍스트+이미지 OCR)을 KV(ops_kv)에
// 영구 저장하고 fresh=1 로만 다시 읽는다. 카카오 76자(suggestKakaoLines)와 AI 홍보 전략(/api/promo/*)이
// 같은 저장소를 공유한다 — 같은 URL = 같은 추출본 = 재OCR 0. 키는 프로그램ID가 아니라 URL 축(URL이 정체성).
function pdKey(u) {
  const s = String(u || "").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;   // djb2 — 짧은 결정적 키(충돌 보강 = 길이 접미)
  return "pdext:v1:" + h.toString(36) + ":" + s.length;
}
__name(pdKey, "pdKey");
async function promoDetailGet(env, rawUrl, opt) {
  opt = opt || {};
  const key = pdKey(rawUrl);
  if (!opt.fresh) {
    try {
      const hit = await env.ops_kv.get(key);
      if (hit) {
        const d = JSON.parse(hit);
        // maxAgeMs 지정 호출(카카오 문구 = 24h)은 그보다 낡은 캐시를 재추출 — 가격·할인 갱신이 문구에 늦게 반영되지 않게.
        // AI 홍보 전략은 무기한(수동 「새로 읽기」로만 갱신) — 상세페이지는 게시 후 거의 안 바뀐다.
        if (d && d.ts && (!opt.maxAgeMs || Date.now() - d.ts < opt.maxAgeMs)) { d.cached = true; return d; }
      }
    } catch (e) { /* 캐시 읽기 실패 = 새로 추출로 진행 */ }
  }
  const src = await kkoFetchPage(rawUrl);
  const ocrText = await kkoOcrImages(env, src.images);
  const d = { url: src.url, text: src.text, images: src.images, ocrText, ts: Date.now() };
  try { await env.ops_kv.put(key, JSON.stringify(d)); } catch (e) { /* 저장 실패해도 추출본은 반환 */ }
  d.cached = false;
  return d;
}
__name(promoDetailGet, "promoDetailGet");

// ══ AI 홍보 ▸ 자동 브리핑 (260806 운영자 「누르지 않더라도 자동으로 그날그날 추론」) ═══════════════
// 매일 KST 08:30 틱(scheduled)에 Worker가 포트폴리오 팩을 서버측에서 조립해 promo-advise 레일로 디스패치한다
// (모델 = opus 5 · effort high — 운영자 260806 지정 · 수동 추론은 종전 max 유지).
// 왜 Worker 조립인가: 브라우저 없이 도는 자리이면서 Graph(시트)·KV(캐시·포인터)·GITHUB_PAT(커밋/디스패치)를
// 이미 다 가진 유일한 곳 = 시크릿 신설 0 (Actions 러너엔 Graph 자격증명이 없어 조립 불가). 개인정보 경계 동일 —
// 집계는 서버 안에서 끝나고 팩엔 숫자만 실린다(회원·예매 원본 행이 밖으로 안 나간다).
// ⚠ 집계 = 「축약판」 — 화면 판매현황(_salesBuild)의 5신호 분모 사다리 전부가 아니라
//   {회차 오픈좌석 합(전 회차 기재 시) → 마스터 총오픈석 → 기준석×회차 수} 3단까지만 온다.
//   그 사실을 팩 note에 명시한다(없는 정밀을 가장하지 않는다 · 정밀 축 = 화면 수동 추론).
function paSerialISO(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (!isFinite(n) || n < 20000 || n > 60000) { const s = String(v).trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; }
  const d = new Date((n - 25569) * 86400 * 1000);   // 프런트 excelSerialToISO와 같은 식
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
__name(paSerialISO, "paSerialISO");
function paKstToday() { return new Date(Date.now() + 9 * 3600 * 1e3).toISOString().slice(0, 10); }
__name(paKstToday, "paKstToday");
// 조인 정규화 — 프런트 _uName의 서버 사본(값이 어긋나면 조인이 「끊길」 뿐 오조인은 안 난다 = 안전측)
function paNorm(s) { return String(s || "").replace(/\s*[-–—]\s*여수\s*$/, "").replace(/[〈〉<>「」『』\[\]（）()]/g, "").replace(/[_\-–—·.,'’"~!:：]/g, "").replace(/\s+/g, "").toLowerCase(); }
__name(paNorm, "paNorm");
function paNum(v) { if (v === null || v === undefined || v === "") return null; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? null : n; }
__name(paNum, "paNum");
function paBdDate(v) { const s = String(paNum(v) || ""); if (s.length !== 8) return null; const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); return isNaN(d.getTime()) ? null : d; }
__name(paBdDate, "paBdDate");
function paCurve14(pts) { if (pts.length <= 14) return pts; const st = Math.ceil(pts.length / 13), o = []; for (let i = 0; i < pts.length; i += st) o.push(pts[i]); if (o[o.length - 1] !== pts[pts.length - 1]) o.push(pts[pts.length - 1]); return o; }
__name(paCurve14, "paCurve14");

// GitHub 커밋·디스패치 한 벌 — 수동 라우트(/api/promo/upload·dispatch)와 자동 브리핑(크론)이 같은 함수를 쓴다.
async function paGhCommitPack(cfg, id, packStr) {
  const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker", "Content-Type": "application/json" };
  const b64 = kkoB64(new TextEncoder().encode(packStr).buffer);
  const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/promo/${id}.in.json`, {
    method: "PUT", headers: ghHdr,
    body: JSON.stringify({ message: `chore(promo): ${id} 입력 팩 [skip ci]`, content: b64, branch: cfg.branch })
  });
  if (gr.ok) return { ok: true };
  return { ok: false, err: { error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) } };
}
__name(paGhCommitPack, "paGhCommitPack");
async function paGhDispatchAdvise(cfg, d) {
  const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker", "Content-Type": "application/json" };
  const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
    method: "POST", headers: ghHdr, body: JSON.stringify({ event_type: "promo-advise", client_payload: { d } })
  });
  if (gr.ok) return { ok: true };
  return { ok: false, err: { error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) } };
}
__name(paGhDispatchAdvise, "paGhDispatchAdvise");

// 포트폴리오 팩 서버 조립 — 프런트 _paBuildPack(portfolio)과 같은 스키마(프롬프트 SSOT = promo-advise.yml 공유)
async function paBuildServerPack(env, token) {
  const today = paKstToday();
  const typeLabel = (t) => (t === "전시" ? "전시" : (t === "예술교육" ? "교육" : "공연"));
  const progs = (await getProgramsCached(token)).map((p) => ({
    f: String(p["풀네임"] || "").trim(), n: String(p["줄임말"] || "").trim(),
    t: String(p["콘텐츠구분"] || "").trim(), id: String(p["프로그램ID"] || p["공연ID"] || "").trim(),
    s: paSerialISO(p["시작일"]), e: paSerialISO(p["종료일"]),
    ss: paSerialISO(p["판매시작일"]), se: paSerialISO(p["판매종료일"]), ps: paSerialISO(p["홍보시작일"]),
    g: String(p["구분"] || "").trim(), g2: String(p["장르"] || "").trim(), l: String(p["장소"] || "").trim(),
    u: String(p["URL"] || "").trim(),
    rc: (() => { const n = parseInt(String(p["회차"] == null ? "" : p["회차"]).replace(/[^0-9]/g, ""), 10); return (n > 0 && n <= 999) ? n : 0; })(),   // 프로그램 관리 지정 회차(분모 명시 신호 — 프런트 _rc 합류축과 동일)
    po: (() => { const f = String(p["홍보노출"] == null ? "" : p["홍보노출"]).trim(); return f !== "" ? /^(y|yes|true|1|o)/i.test(f) : !!paSerialISO(p["홍보시작일"]); })()   // 홍보 게이트(프런트 _promoOn 동형 — 닫힘 = 신청 자체 불가 = 구 점검 A0 신호)
  })).filter((p) => p.f && !/^R\d{6}_/.test(p.id))                    // R접두 = 대관 편입 행 제외(프런트 PERFS_GC 분리와 같은 계약 = 기획만)
    .filter((p) => { const end = p.se || p.e; return end && end >= today; })
    .sort((a, b) => String(a.ss || a.s || "9999").localeCompare(String(b.ss || b.s || "9999")))
    .slice(0, 20);
  if (!progs.length) return { v: 1, today, scope: "portfolio", auto: 1, programs: [] };

  let daily = null, master = null, rounds = null, exDaily = null, exMaster = null, recs = [], opsL = null;
  try { daily = await getOpsCached(token, "운영_일일입력"); } catch (e) {}
  try { master = await getOpsCached(token, "운영_공연마스터"); } catch (e) {}
  try { rounds = await getOpsCached(token, "운영_회차상세"); } catch (e) {}
  try { exDaily = await getOpsCached(token, "운영_전시일일"); } catch (e) {}
  try { exMaster = await getOpsCached(token, "운영_전시마스터"); } catch (e) {}
  try { recs = await handleGetRecords(token); } catch (e) {}
  try { opsL = await getOpsCached(token, "운영_세부운영관리대장(정리)"); } catch (e) {}   // [260807] 분모 신호 — 운영대장 행수 = 회차(프런트 _opsIndex 축 이식)
  let grpS = null;
  try { grpS = await getOpsCached(token, "운영_단체"); } catch (e) {}   // [260807 운영자 「단체라고 따로 구분지어 포함」] 단체 = 개인(일일입력·티켓셀러)과의 차이분 원장

  const dmap = {};
  ((daily && daily.rows) || []).forEach((r) => { const k = paNorm(r["공연명"]); if (!k || paNum(r["기준일자"]) === null) return; (dmap[k] = dmap[k] || []).push(r); });
  Object.keys(dmap).forEach((k) => dmap[k].sort((a, b) => (paNum(a["기준일자"]) || 0) - (paNum(b["기준일자"]) || 0)));
  const mmap = {};
  ((master && master.rows) || []).forEach((r) => { const k = paNorm(r["공연명"]); if (k && !mmap[k]) mmap[k] = r; });
  const rmap = {};
  ((rounds && rounds.rows) || []).forEach((r) => { const id = String(r["ID"] || r["공연ID"] || "").trim(); if (!id) return; const e = rmap[id] = rmap[id] || { n: 0, sum: 0, filled: 0 }; e.n++; const s = paNum(r["오픈좌석"]); if (s != null && s > 0) { e.sum += s; e.filled++; } });
  const exd = {};
  ((exDaily && exDaily.rows) || []).forEach((r) => { const id = String(r["전시ID"] || "").trim(); if (!id) return; (exd[id] = exd[id] || []).push(r); });
  Object.keys(exd).forEach((k) => exd[k].sort((a, b) => String(a["기준일자"]).localeCompare(String(b["기준일자"]))));
  const exm = {};
  ((exMaster && exMaster.rows) || []).forEach((r) => { const k = paNorm(r["전시명"]); if (k && !exm[k]) exm[k] = r; });
  // 운영대장 인덱스 — (정규화 공연명|연도) → {count(행수 = 회차), base(기본좌석)} + 공연ID 직조인(프런트 _opsIndex 이식 · ±1년 가드)
  const opsIdx = { byId: {}, byNY: {} };
  ((opsL && opsL.rows) || []).forEach((r) => {
    const k = paNorm(r["공연명"]); if (!k) return;
    const y = parseInt(String(r["년도"] || "").replace(/[^0-9]/g, ""), 10) || null;
    const kk = k + "|" + (y || "?");
    const e = opsIdx.byNY[kk] = opsIdx.byNY[kk] || { count: 0, base: 0 };
    e.count++; if (!e.base) e.base = paNum(r["기본좌석"]) || 0;
    const rid = String(r["공연ID"] || "").trim(); if (rid) { const ei = opsIdx.byId[rid] = opsIdx.byId[rid] || { count: 0, base: 0 }; ei.count++; if (!ei.base) ei.base = paNum(r["기본좌석"]) || 0; }
  });
  const opsFor = (p) => {
    if (p.id && opsIdx.byId[p.id]) return opsIdx.byId[p.id];
    const k = paNorm(p.f), yy = parseInt((p.s || p.ss || today).slice(0, 4), 10);
    for (const dy of [0, 1, -1]) { const hit = opsIdx.byNY[k + "|" + (yy + dy)]; if (hit) return hit; }   // ±1년 가드 = 재연 오매칭 방지(프런트 _opsLookup 동형)
    return null;
  };
  // 단체 인덱스 — 건별 증분 합산(프런트 gmap 동형: 공연ID 우선 → 정규화명 폴백 · 시점 축은 안 실음 = 「언제 들어왔냐는 의미가 없다」)
  const grpIdx = { byId: {}, byNorm: {} };
  ((grpS && grpS.rows) || []).forEach((r) => {
    const nm = String(r["공연명"] || "").trim(); if (!nm) return;
    const seat = paNum(r["좌석"]) || 0, money = paNum(r["금액"]) || 0;
    const gid = String(r["공연ID"] || "").trim();
    const add = (o) => { o.seat += seat; o.money += money; o.cnt++; };
    if (gid) add(grpIdx.byId[gid] = grpIdx.byId[gid] || { seat: 0, money: 0, cnt: 0 });
    add(grpIdx.byNorm[paNorm(nm)] = grpIdx.byNorm[paNorm(nm)] || { seat: 0, money: 0, cnt: 0 });
  });
  const grpFor = (p, m) => {
    const mid = m ? String(m["ID"] || "").trim() : "";
    if (mid && grpIdx.byId[mid]) return grpIdx.byId[mid];
    if (p.id && grpIdx.byId[p.id]) return grpIdx.byId[p.id];
    return grpIdx.byNorm[paNorm(p.f)] || null;
  };

  const salesFor = (p) => {
    if (p.t === "전시") {
      const m = exm[paNorm(p.f)];
      if (!m) return { none: true, why: "전시DB(운영_전시마스터) 미매칭" };
      const ds = exd[String(m["전시ID"] || "").trim()] || [];
      const occs = ds.map((r) => ({ d: String(paNum(r["기준일자"]) || ""), v: paNum(r["점유율"]) })).filter((x) => x.d.length === 8 && x.v != null);
      return { status: String(m["상태"] || "").trim() || "?", occ: occs.length ? occs[occs.length - 1].v : (paNum(m["최종점유율"]) || null), curve: paCurve14(occs.map((x) => [x.d.slice(4, 6) + "-" + x.d.slice(6, 8), x.v])), note: "전시 = 점유율% 축(전시DB 자동집계)" };
    }
    if (p.t === "예술교육") return { none: true, why: "교육은 판매 원장 없음" };
    const rows = dmap[paNorm(p.f)] || [];
    const m = mmap[paNorm(p.f)];
    if (!rows.length && !m) return { none: true, why: "일일입력·공연마스터 미등록(집계 전)" };
    // [260807 운영자] 총누적 = 개인(일일입력 = 티켓셀러) + 단체(운영_단체 차이분 · 시점 무의미) — 운영 리포트와 같은 총량.
    //   추이·페이스·최근7일·곡선은 개인 축으로만(프런트와 동일 = 단체가 추세를 오염하지 않는다).
    const indiv = rows.length ? (paNum(rows[rows.length - 1]["합계좌석"]) || 0) : 0;
    const grp = grpFor(p, m);
    const seats = indiv + (grp ? grp.seat : 0);
    const ops = opsFor(p);
    const base = (m && paNum(m["기준석"])) || (ops && ops.base) || 926;
    // [260807 운영자 「회차가 감안이 안 돼 100% 초과」] 분모 회차 = 프런트 _salesBuild 5신호 사다리 이식 —
    //   max(마스터 총회차 · 회차상세 행수 · 운영대장 행수 · 프로그램 관리 지정 회차), 전부 0이면 공연 기간 일수(하루 1회 가정 · 추정 표기).
    const rs = m ? rmap[String(m["ID"] || "").trim()] : null;
    let rc = Math.max((m && paNum(m["총회차"])) || 0, rs ? rs.n : 0, ops ? ops.count : 0, p.rc || 0);
    let rcSrc = rc > 0 ? "명시" : "";
    if (!rc) {
      const d0 = p.s ? new Date(p.s + "T00:00:00") : null, d1 = p.e ? new Date(p.e + "T00:00:00") : null;
      rc = (d0 && d1) ? Math.max(1, Math.round((d1 - d0) / 86400000) + 1) : 1;
      rcSrc = "기간일수 추정";
    }
    const rsOk = !!(rs && rs.n > 0 && rs.filled === rs.n && (!((m && paNum(m["총회차"])) > 1) || paNum(m["총회차"]) === rs.n));
    const totalOpen = rsOk ? rs.sum : ((m && paNum(m["총오픈석"])) ? paNum(m["총오픈석"]) : base * rc);
    let fcNum = 0, fcDen = 0;
    for (let i = 1; i < rows.length; i++) {
      const ex = String(rows[i]["예측제외"] || "").trim().toUpperCase();
      if (ex && ex !== "N" && ex !== "FALSE" && ex !== "0") continue;
      const a = paBdDate(rows[i - 1]["기준일자"]), b = paBdDate(rows[i]["기준일자"]);
      fcNum += (paNum(rows[i]["합계좌석"]) || 0) - (paNum(rows[i - 1]["합계좌석"]) || 0);
      fcDen += (a && b) ? Math.max(1, Math.round((b - a) / 86400000)) : 1;
    }
    const dday = p.s ? Math.round((new Date(p.s + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000) : null;
    return {
      status: (p.ss && p.ss <= today && today <= (p.se || p.e || today)) ? "active" : (p.ss && p.ss > today ? "notyet" : "unknown"),
      seats, indiv, groupSeats: grp ? grp.seat : 0, groupCnt: grp ? grp.cnt : 0,
      totalOpen: totalOpen || null, occ: totalOpen ? Math.round(seats / totalOpen * 1000) / 10 : null,
      target: (m && paNum(m["목표점유율"])) || null, dday,
      fcRate: (rows.length >= 2 && fcDen > 0) ? Math.round(fcNum / fcDen * 10) / 10 : null,
      last7: rows.slice(-7).map((r) => { const s = String(paNum(r["기준일자"]) || ""); return { d: s.length === 8 ? s.slice(4, 6) + "-" + s.slice(6, 8) : s, seat: paNum(r["합계좌석"]) || 0 }; }),
      curve: paCurve14(rows.map((r) => { const s = String(paNum(r["기준일자"]) || ""); return [s.length === 8 ? s.slice(4, 6) + "-" + s.slice(6, 8) : s, paNum(r["합계좌석"]) || 0]; })),
      note: "분모 = " + (rsOk ? "회차별 오픈석 합" : ((m && paNum(m["총오픈석"])) ? "마스터 총오픈석" : ("기준석 " + base + "×" + rc + "회차(" + rcSrc + ")"))) + " — 화면 판매현황과 같은 신호 사다리"
    };
  };
  const recDate = (r) => { const y = r["연도"] ? String(r["연도"]) : ""; const mm = String(r["월"] || "").padStart(2, "0"); const dd = String(r["일"] || "").padStart(2, "0"); const d = y + "-" + mm + "-" + dd; return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
  const slotRecs = recs.filter((r) => { const st = String(r["진행 상태"] || "").trim(); return st === "신청 중" || st === "예정" || st === "완료"; });
  const promoFor = (p) => {
    const hist = [], plan = []; let last = "";
    slotRecs.forEach((r) => {
      if (String(r["프로그램"] || "").trim() !== p.f) return;
      const d = recDate(r); if (!d) return;
      const it = { d, ch: String(r["플랫폼 1"] || "").trim().slice(0, 14), t: String(r["콘텐츠 제목"] || "").slice(0, 40), st: String(r["진행 상태"] || "").trim() };
      if (d < today) { hist.push(it); if (d > last) last = d; } else plan.push(it);
    });
    hist.sort((a, b) => a.d < b.d ? -1 : 1); plan.sort((a, b) => a.d < b.d ? -1 : 1);
    return { history: hist.slice(-40), planned: plan, lastDate: last };
  };
  const lim = new Date(today + "T00:00:00"); lim.setDate(lim.getDate() + 21);
  const limK = lim.toISOString().slice(0, 10), calBy = {};
  slotRecs.forEach((r) => {
    const d = recDate(r); if (!d || d < today || d > limK) return;
    const ch = String(r["플랫폼 1"] || "");
    const isK = /카카오/.test(ch), isS = /문자|SMS|LMS/i.test(ch);
    if (!isK && !isS) return;
    const tag = (isS ? ("문자(" + String(r["플랫폼 2"] || "전체").trim() + ")") : "카카오") + " 「" + String(r["콘텐츠 제목"] || r["프로그램"] || "").slice(0, 24) + "」";
    (calBy[d] = calBy[d] || []).push(tag);
  });

  // 고객 집계 — 예매집계(장르별 관람 1회+/2회+)와 회원(연령·시도 TOP). 원본 행은 여기서 소멸, 숫자만 팩에 남는다.
  let audience = null;
  try {
    const agg = await getOpsCached(token, "운영_예매집계");
    const genreTot = {}; let allRepeat = 0, n = 0;
    ((agg && agg.rows) || []).forEach((r) => {
      const k = String(r["회원키"] || "").trim(); if (!k) return; n++;
      const per = {};
      String(r["분포"] || "").split(";").forEach((pair) => {
        const i = pair.lastIndexOf(":"); if (i < 1) return;
        const key = pair.slice(0, i); const cnt = parseInt(pair.slice(i + 1), 10) || 0;
        const gi = key.indexOf("|"); const g = gi >= 0 ? key.slice(gi + 1) : key;
        per[g] = (per[g] || 0) + cnt;
      });
      let tot = 0;
      for (const g in per) { tot += per[g]; const e = genreTot[g] = genreTot[g] || { any: 0, rep: 0 }; e.any++; if (per[g] >= 2) e.rep++; }
      if (tot >= 2) allRepeat++;
    });
    if (n) {
      audience = {
        sampleNote: "예매기록에 회원이 확정 연결된 " + n.toLocaleString() + "명 표본(2020~2025) = 하한 · 전체 구매회원 환산 ×1.53 배까지만",
        allRepeat, genres: Object.keys(genreTot).sort((a, b) => genreTot[b].any - genreTot[a].any).slice(0, 6).map((g) => ({ g, any: genreTot[g].any, rep: genreTot[g].rep }))
      };
      let mem = null;
      try { const kv = await env.ops_kv.get("membersheet:v1"); if (kv) mem = JSON.parse(kv); } catch (e) {}
      if (!mem) { mem = await memberSheetRead(token, "운영_회원"); try { await env.ops_kv.put("membersheet:v1", JSON.stringify(mem), { expirationTtl: 3600 }); } catch (e) {} }
      if (mem && mem.rows) {
        const age = {}, sido = {};
        mem.rows.forEach((r) => { const a = String(r["연령대"] || "").trim(); if (a && a !== "미상") age[a] = (age[a] || 0) + 1; const s = String(r["주소1"] || "").trim(); if (s) sido[s] = (sido[s] || 0) + 1; });
        audience.memberN = mem.rows.length;
        audience.age = Object.keys(age).sort((a, b) => age[b] - age[a]).slice(0, 4).map((k) => [k, age[k]]);
        audience.city = Object.keys(sido).sort((a, b) => sido[b] - sido[a]).slice(0, 5).map((k) => [k, sido[k]]);   // 시도 기준(프런트 시 단위 합산과 축이 다름 — basis에 그대로 표기)
      }
    }
  } catch (e) { audience = null; }

  // [260807 운영자 「상세페이지의 할인율·마감 임박 같은 것도 추론에 포함」] 상세페이지 추출본 동봉 —
  //   공용 KV 캐시(promoDetailGet · 카카오와 한 저장소 · maxAge 3일). 냉수집(OCR)은 런당 4건 상한 = 서브요청 예산 보호,
  //   다음 런들이 이어서 데운다(캐시 히트는 KV 1읽기라 전 프로그램 무료). 실패·미수집 = null(브리핑이 「재료 없음」으로 정직 처리).
  let coldLeft = 4;
  const dets = {};
  for (const p of progs) {
    if (!p.u) continue;
    const saleOn = p.ss && p.ss <= today; const soon = p.ss && p.ss > today && (new Date(p.ss) - new Date(today)) / 86400000 <= 45;
    if (!saleOn && !soon) continue;
    try {
      const key = pdKey(p.u);
      let hit = null; try { const raw2 = await env.ops_kv.get(key); if (raw2) { const dd = JSON.parse(raw2); if (dd && dd.ts && Date.now() - dd.ts < 3 * 86400000) hit = dd; } } catch (e2) {}
      if (!hit) { if (coldLeft <= 0) continue; coldLeft--; hit = await promoDetailGet(env, p.u, {}); }
      if (hit) dets[p.f] = { ts: hit.ts, text: String(hit.text || "").slice(0, 1000), ocr: String(hit.ocrText || "").slice(0, 1000) };
    } catch (e) { /* 한 프로그램 실패 = 그 건만 재료 없음 */ }
  }
  return {
    v: 1, today, scope: "portfolio", auto: 1,
    programs: progs.map((p) => ({ name: p.f, short: p.n, type: typeLabel(p.t), genre: p.g2 || p.g, place: p.l, period: { show: [p.s, p.e], sale: [p.ss, p.se], promoStart: p.ps }, promoOpen: p.po, sales: salesFor(p), promo: promoFor(p), detail: dets[p.f] || null })),
    calendar: { busy: Object.keys(calBy).sort().map((d) => ({ d, what: calBy[d].join(" · ") })) },
    audience,
    note: "서버 자동 조립(매일 KST 08:30) — 분모 = 5신호 사다리(화면 판매현황 동형) · 고객 거주지는 시도 기준 · 상세페이지 재료 = KV 캐시(냉수집 런당 4건)"
  };
}
__name(paBuildServerPack, "paBuildServerPack");

// 브리핑 서식판 — 프롬프트(promo-advise.yml)의 말투·형식이 크게 바뀌면 이 값을 올린다 → 포인터 fv 불일치 =
// 다음 15분 틱에 1회 자동 재생성(운영자가 안 눌러도 새 서식으로 「새로고침」). 선례 = nomute chan_brief PVER 해시 축.
const PA_FMT_V = "v7-group-260807";   // v7 = 단체 구분(개인+단체 총량 · 추이는 개인 축) · v6 = 자기 산출 오류 서사화 금지(원칙 9-1) · v5 = 점검 신호 흡수 + 상세재료 + 분모 5신호 + 라벨 불릿
// 자동 브리핑 1회 실행 — 크론(매일 08:30 KST)과 /api/promo/auto-run(admin 수동)이 같은 함수를 쓴다.
async function paAutoBrief(env, opt) {
  opt = opt || {};
  const cfg = ghBlogCfg(env);
  if (!cfg.pat) return { ok: false, error: "no_github_pat" };
  const ymd = paKstToday().replace(/-/g, "");
  const guardKey = "pa:auto:day:" + ymd;
  if (!opt.force) { try { if (await env.ops_kv.get(guardKey)) return { ok: false, skipped: "이미 오늘 브리핑을 만들었어요" }; } catch (e) {} }
  const token = opt.token || await getToken(env);
  const pack = await paBuildServerPack(env, token);
  if (!pack.programs || !pack.programs.length) return { ok: false, skipped: "판매창이 살아있는 기획 프로그램이 없어요" };
  const id = "pa" + Date.now() + "a";   // 13자리 ms + a(auto) — drafts_retain ID_RE 규약 유지
  const up = await paGhCommitPack(cfg, id, JSON.stringify(pack));
  if (!up.ok) return { ok: false, error: up.err && up.err.error, note: up.err && up.err.note };
  const dp = await paGhDispatchAdvise(cfg, { id, effort: "high", auto: 1 });   // 자동 = opus 5 · high(운영자 260806)
  if (!dp.ok) return { ok: false, error: dp.err && dp.err.error, note: dp.err && dp.err.note };
  try { await env.ops_kv.put(guardKey, "1", { expirationTtl: 172800 }); } catch (e) {}
  try { await env.ops_kv.put("pa:auto:latest", JSON.stringify({ id, ymd: paKstToday(), ts: Date.now(), fv: PA_FMT_V })); } catch (e) {}
  return { ok: true, id };
}
__name(paAutoBrief, "paAutoBrief");

// b = {url, program, title, date, extra, count}. 반환 = {items:[{tone,text,len}], ocrText, pageText, images, source, over}
async function suggestKakaoLines(env, b) {
  const limit = 76;   // 앱 입력칸 maxlength와 같은 값 — 길이는 textarea와 같게 UTF-16 .length로 센다(이모지 = 2)
  const count = Math.min(8, Math.max(1, parseInt(b.count, 10) || 5));
  // [260806] 추출은 공용 캐시 경유 — 24h 안에 같은 링크를 다시 부르면 재수집·재OCR 없이 즉시(AI 홍보 전략과 한 저장소)
  const src = await promoDetailGet(env, b.url, { maxAgeMs: 24 * 3600 * 1e3 });
  const ocrText = src.ocrText || "";
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

// ═══════════════════════════════════════════════════════════════════════════
// 검색 모니터링 — 「예울마루」가 어디에 걸렸나 (운영자 260806 · 절차 문서 = docs/reports/260805_검색모니터링_키발급_절차.html)
//   출처 3갈래, 전부 **자격증명이 있을 때만** 켜진다(미설정 = 그 갈래만 조용히 건너뜀 · 앱 나머지 무관):
//     ① 구글  = Google Alerts **RSS**(키 불요 · env.GALERT_RSS) — 구글 Custom Search JSON API는 신규 가입이 막혀 대안이 이것뿐
//     ② 네이버 = 검색 오픈 API(env.NAVER_SEARCH_ID/SECRET) — ⛔ 260806 신규 발급 소멸 실측 · 키 확보 시에만 켜짐(코드는 존치)
//     ②′ 카카오(다음) = Daum 검색 REST API(env.KAKAO_REST_KEY · 무료 쿼터) 웹문서·블로그·다음카페 — 네이버 카페 구멍의 실질 대체
//     ③ 공연  = KOPIS OpenAPI(env.KOPIS_KEY) — 네이버 플레이스 「공연·전시」 탭의 원천. ⚠ **공연 전용(전시는 안 나온다)**
//   ⚠ RSS 주소엔 운영자 구글 계정 ID가 들어간다 — 이 레포는 **Public**이라 코드에 박지 않고 env로만 받는다(GCAL_ICS_URL 선례).
//   ⚠ Q28(260731 운영자 「홍보 알림 당분간 없애줘」) 준수 — 이 스캔은 **알림을 쏘지 않는다**. KV에 쌓고 API로만 내준다.
//   저장 = KV 단일 값 `sm:state` {items[최근 300], seen[링크 해시 3000]} — 스캔 1회 = KV 읽기 1 + 쓰기 1(항목별 조회 0).
//     seen을 items보다 넓게 잡는 이유 = items에서 밀려난 옛 글이 되살아나 「새 글」로 다시 뜨는 걸 막는다.
// ═══════════════════════════════════════════════════════════════════════════
var SM_KEY = "sm:state";
var SM_MAX_ITEMS = 300;
var SM_MAX_SEEN = 3e3;
// 네이버 4갈래. webkr은 sort 파라미터가 없다(있는 갈래에만 sort=date → 최신순).
var SM_NAVER_KINDS = [
  { ep: "blog", label: "블로그", sort: "date" },
  { ep: "news", label: "뉴스", sort: "date" },
  { ep: "cafearticle", label: "카페글", sort: "date" },
  { ep: "webkr", label: "웹문서", sort: "" }
];
// 카카오(다음) 3갈래 — 운영자 260807 「다음 등 주요 포털까지」. 네이버 카페 구멍(robots가 Googlebot 전면 차단)의 실질 대체이기도 하다.
var SM_KAKAO_KINDS = [
  { ep: "web", label: "웹문서" },
  { ep: "blog", label: "블로그" },
  { ep: "cafe", label: "카페글" }
];

// HTML 엔티티 해제 + 태그 제거.
//   ⚠ 순서가 함정이다 — Google Alerts·네이버 검색 API는 제목을 **엔티티로 인코딩된 HTML**(`&lt;b&gt;`)로 보낸다.
//     태그 제거를 먼저 하면 그때는 태그가 없다가 해제 직후 `<b>`로 되살아난다(실측 버그 · probe_sm_parse.mjs가 잡음).
//     그렇다고 「해제 → 전체 태그 제거」로 뒤집으면 본문의 진짜 `&lt;A&gt;`(꺾쇠 글자)까지 먹는다.
//   → 해제 뒤에는 **강조 태그만** 지운다. 꺾쇠 글자는 살고 <b>는 죽는다. &amp;는 항상 마지막(이중 해제 방지).
function smText(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<\/?(?:b|i|em|strong|br)\s*\/?>/gi, "")
    .replace(/\s+/g, " ").trim();
}
__name(smText, "smText");

// FNV-1a 32bit — 중복 판정용 링크 해시(암호용 아님). KV 값 하나에 수천 개를 담아야 해서 짧아야 한다.
function smHash(s) {
  const str = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
__name(smHash, "smHash");

// Google Alerts의 link는 google.com/url?…&url=<진짜주소> 리다이렉트 — 진짜 주소만 남긴다.
function smUnwrapGoogle(href) {
  const raw = String(href || "");
  const m = raw.match(/[?&]url=([^&]+)/);
  if (!m) return raw;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}
__name(smUnwrapGoogle, "smUnwrapGoogle");

// Atom <entry> 최소 파서 — Workers엔 DOMParser가 없어 ICS 파서와 같은 정규식 축으로 뽑는다.
function smParseAtom(xml) {
  const out = [];
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const e = m[1];
    const t = e.match(/<title\b[^>]*>([\s\S]*?)<\/title>/);
    const l = e.match(/<link\b[^>]*href="([^"]*)"/);
    const p = e.match(/<published\b[^>]*>([\s\S]*?)<\/published>/) || e.match(/<updated\b[^>]*>([\s\S]*?)<\/updated>/);
    const link = smUnwrapGoogle(smText(l ? l[1] : ""));
    if (!link) continue;
    out.push({ title: smText(t ? t[1] : "") || link, link, date: String(p ? p[1] : "").slice(0, 10) });
  }
  return out;
}
__name(smParseAtom, "smParseAtom");

// KOPIS는 XML(<db> 반복) — 블록 뽑기 + 태그값 뽑기 두 조각이면 충분하다.
function smXmlBlocks(xml, tag) {
  const out = [];
  const re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "g");
  let m;
  while ((m = re.exec(String(xml || "")))) out.push(m[1]);
  return out;
}
__name(smXmlBlocks, "smXmlBlocks");

function smXmlVal(block, tag) {
  const m = String(block || "").match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">"));
  return m ? smText(m[1]) : "";
}
__name(smXmlVal, "smXmlVal");

// 8초 타임아웃 fetch — 한 갈래가 늦어도 스캔 전체가 물리지 않게(AbortSignal 미지원이면 그냥 fetch).
async function smFetch(url, init) {
  const o = Object.assign({ headers: { "User-Agent": "yeulmaru-promo-worker" } }, init || {});
  try { if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) o.signal = AbortSignal.timeout(8e3); } catch (e) {}
  return fetch(url, o);
}
__name(smFetch, "smFetch");

// 피드 머리의 <title> = 그 알림의 검색어("Google 알리미 - 예울마루 공연"). 접두어를 떼면 그대로 키워드 꼬리표가 된다.
//   ⚠ <entry> 안에도 <title>이 있으므로 **첫 entry 앞 구간에서만** 찾는다(안 그러면 첫 기사 제목을 검색어로 오인한다).
function smFeedTitle(xml) {
  const head = String(xml || "").split(/<entry\b/)[0];
  const m = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/);
  return smText(m ? m[1] : "").replace(/^Google\s*(알리미|Alert)\s*[-–—]\s*/i, "").trim();
}
__name(smFeedTitle, "smFeedTitle");

// ① 구글 — Google Alerts RSS(복수 가능: 쉼표·공백·줄바꿈 구분 · 최대 16개). 키 불요.
//   운영자 260806~07: 키워드 8종 + site: 5종(blog.naver/tistory/brunch/cafe.daum/yeosu.go.kr) = 13개 등록 → 상한 16은 여유분.
async function smFromAlerts(env) {
  const urls = String(env.GALERT_RSS || "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
  if (!urls.length) return { on: false, items: [], note: "GALERT_RSS 미설정" };
  const items = [];
  let ok = 0;
  for (const u of urls.slice(0, 16)) {
    try {
      const r = await smFetch(u);
      if (!r.ok) { console.error("[sm/alerts]", r.status); continue; }
      const xml = await r.text();
      ok++;
      const kw = smFeedTitle(xml);
      for (const e of smParseAtom(xml)) items.push({ src: "google", kind: "알림", title: e.title, link: e.link, date: e.date, kw });
    } catch (e) { console.error("[sm/alerts]", e); }
  }
  return { on: true, items, feeds: urls.length, ok, note: ok < urls.length ? "구글 피드 " + ok + "/" + urls.length + "만 응답" : "" };
}
__name(smFromAlerts, "smFromAlerts");

// 네이버 항목의 날짜 — 블로그는 postdate(YYYYMMDD), 뉴스는 pubDate(RFC1123), 카페·웹은 없다.
function smNaverDate(it) {
  const pd = String((it && it.postdate) || "");
  if (/^\d{8}$/.test(pd)) return pd.slice(0, 4) + "-" + pd.slice(4, 6) + "-" + pd.slice(6, 8);
  const pub = String((it && it.pubDate) || "");
  if (pub) { const d = new Date(pub); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  return "";
}
__name(smNaverDate, "smNaverDate");

// ② 네이버 — 검색 오픈 API 4갈래. 키워드 × 갈래마다 1회(키워드 1개 = 시간당 4회 = 하루 96회, 한도 25,000의 0.4%).
async function smFromNaver(env, keywords) {
  const id = env.NAVER_SEARCH_ID, sec = env.NAVER_SEARCH_SECRET;
  if (!id || !sec) return { on: false, items: [], note: "NAVER_SEARCH_ID/SECRET 미설정" };
  const items = [];
  for (const kw of keywords) {
    for (const g of SM_NAVER_KINDS) {
      try {
        const u = "https://openapi.naver.com/v1/search/" + g.ep + ".json?display=20&query=" + encodeURIComponent(kw) + (g.sort ? "&sort=" + g.sort : "");
        const r = await smFetch(u, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": sec, "User-Agent": "yeulmaru-promo-worker" } });
        if (!r.ok) { console.error("[sm/naver]", g.ep, r.status); continue; }
        const j = await r.json();
        for (const it of (j && j.items) || []) {
          const link = smText(it.originallink || it.link || "");
          if (!link) continue;
          items.push({ src: "naver", kind: g.label, title: smText(it.title) || link, link, date: smNaverDate(it), kw });
        }
      } catch (e) { console.error("[sm/naver]", g.ep, e); }
    }
  }
  return { on: true, items };
}
__name(smFromNaver, "smFromNaver");

// ②′ 카카오(다음) — Daum 검색 REST API(공식 문서 실측 260807: dapi.kakao.com/v2/search/{web,blog,cafe} ·
//   헤더 `Authorization: KakaoAK <REST키>` · sort=recency · size≤50 · documents[].{title,contents,url,datetime}).
//   카카오디벨로퍼스 앱의 REST API 키 = env.KAKAO_REST_KEY. 티스토리·브런치·다음카페가 이 축으로 들어온다.
async function smFromKakao(env, keywords) {
  const key = env.KAKAO_REST_KEY;
  if (!key) return { on: false, items: [], note: "KAKAO_REST_KEY 미설정" };
  const items = [];
  // 갈래별 실패를 스캔 응답의 notes로 내보낸다 — 콘솔 로그는 밖에서 안 보여 「0건」과 「인증 실패」가 구분이 안 됐다(260807 실가동 실측).
  //   응답 본문 머리도 함께(카카오는 401/403에 원인 코드를 JSON으로 준다). 키 값은 절대 안 싣는다.
  const errs = [];
  for (const kw of keywords) {
    for (const g of SM_KAKAO_KINDS) {
      try {
        const u = "https://dapi.kakao.com/v2/search/" + g.ep + "?sort=recency&size=20&query=" + encodeURIComponent(kw);
        const r = await smFetch(u, { headers: { Authorization: "KakaoAK " + key, "User-Agent": "yeulmaru-promo-worker" } });
        if (!r.ok) {
          let body = "";
          try { body = (await r.text()).slice(0, 160); } catch (e) {}
          // ⚠ 카카오 401 본문은 보낸 appKey를 그대로 메아리친다(260807 실측) — 유효 키가 notes·KV로 새지 않게
          //   키 문자열과 appKey(...) 패턴을 가린 뒤에만 밖으로 내보낸다. 원문은 로그에도 안 남긴다.
          body = body.split(key).join("«키»").replace(/appKey\([0-9a-zA-Z]+\)/g, "appKey(«가림»)").slice(0, 120);
          console.error("[sm/kakao]", g.ep, r.status, body);
          errs.push(g.ep + " HTTP " + r.status + (body ? " " + body : ""));
          continue;
        }
        const j = await r.json();
        for (const d of (j && j.documents) || []) {
          const link = smText(d.url || "");
          if (!link) continue;
          items.push({ src: "kakao", kind: g.label, title: smText(d.title) || link, link, date: String(d.datetime || "").slice(0, 10), kw });
        }
      } catch (e) { console.error("[sm/kakao]", g.ep, e); errs.push(g.ep + " " + String(e).slice(0, 60)); }
    }
  }
  return { on: true, items, note: errs.length ? "카카오: " + Array.from(new Set(errs)).slice(0, 3).join(" · ") : "" };
}
__name(smFromKakao, "smFromKakao");

// KOPIS 응답(<db> 반복) → 표준 항목. 시설명이 우리 것이 아닌 건 여기서 버린다(폴백 경로 대비).
//   id(mt20id)를 함께 남긴다 — 새 공연의 상세(가격·예매처)를 물을 때 필요.
function smKopisRows(xml, fclt) {
  const out = [];
  for (const b of smXmlBlocks(xml, "db")) {
    const id = smXmlVal(b, "mt20id");
    const nm = smXmlVal(b, "prfnm");
    if (!id || !nm) continue;
    const fc = smXmlVal(b, "fcltynm");
    if (fclt && fc && fc.indexOf(fclt) < 0) continue;
    out.push({
      src: "kopis", kind: smXmlVal(b, "genrenm") || "공연", title: nm, id,
      link: "https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=" + encodeURIComponent(id),
      date: smXmlVal(b, "prfpdfrom").replace(/\./g, "-"),
      extra: [fc, smXmlVal(b, "prfstate")].filter(Boolean).join(" · ")
    });
  }
  return out;
}
__name(smKopisRows, "smKopisRows");

// 공연상세 /pblprfr/{mt20id} (공식 명세 · 운영자 260807 원문) — 가격(pcseguidance)·예매처(relates)·런타임·연령·출연.
//   운영자 착안 「동일 공연 전국 평균 가격대」의 기초 데이터가 여기의 price다. 상세 XML → 화면에 필요한 최소만 남긴다.
function smKopisDetailParse(xml) {
  const b = smXmlBlocks(xml, "db")[0];
  if (!b) return null;
  const vendors = smXmlBlocks(b, "relate")
    .map((r) => ({ nm: smXmlVal(r, "relatenm"), url: smXmlVal(r, "relateurl") }))
    .filter((v) => v.url).slice(0, 6);
  return {
    price: smXmlVal(b, "pcseguidance"),
    runtime: smXmlVal(b, "prfruntime"),
    age: smXmlVal(b, "prfage"),
    cast: smXmlVal(b, "prfcast").slice(0, 120),
    time: smXmlVal(b, "dtguidance").slice(0, 160),
    poster: smXmlVal(b, "poster"),
    vendors
  };
}
__name(smKopisDetailParse, "smKopisDetailParse");

async function smKopisDetail(env, id) {
  const xml = await smKopisGet("pblprfr/" + encodeURIComponent(id), "?service=" + encodeURIComponent(env.KOPIS_KEY));
  return xml ? smKopisDetailParse(xml) : null;
}
__name(smKopisDetail, "smKopisDetail");

// KOPIS 엔드포인트는 https·http 둘 다 도는 이력이 있어 순서대로 시도한다(한쪽이 막혀도 갈래가 안 죽게).
async function smKopisGet(path, qs) {
  for (const base of ["https://www.kopis.or.kr/openApi/restful/", "http://www.kopis.or.kr/openApi/restful/"]) {
    try {
      const r = await smFetch(base + path + qs);
      if (!r.ok) continue;
      const t = await r.text();
      if (t && t.indexOf("<db>") >= 0) return t;
    } catch (e) { console.error("[sm/kopis]", path, e); }
  }
  return "";
}
__name(smKopisGet, "smKopisGet");

// ③ 공연 — KOPIS. 2단(시설코드 조회 → 코드로 필터)이 정본 경로고, 코드가 안 잡히면 목록을 훑어 시설명으로 거른다.
//   공식 명세(운영자 260807 원문 확보): 엔드포인트 /openApi/restful/pblprfr · 필드 mt20id/prfnm/prfpdfrom/prfpdto/fcltynm/genrenm/prfstate
//   ⚠ 결과코드 05 「최대 31일까지 조회가능」 → 기간은 **30일 창으로 쪼개서** 여러 번 묻는다(180일 한 방 = 전건 에러 05).
//   ⚠ 결과코드 06 「최대 조회수 100건」 → rows=100이 상한(그대로 사용).
//   ⚠ 시설코드 파라미터명(prfplccd)은 명세 예제에 없어 미확정 — 그래서 **폴백(시설명 필터 스캔)을 함께 둔다**(어느 쪽이든 결과 동일).
//   실존 확인(260807 웹 실측): 예울마루 대극장 = FC000826 · 공연 페이지 PF247041(실내악 페스티벌 [여수]) — KOPIS DB에 우리 시설이 있다.
async function smFromKopis(env) {
  if (!env.KOPIS_KEY) return { on: false, items: [], note: "KOPIS_KEY 미설정" };
  const fclt = String(env.KOPIS_FACILITY || "예울마루").trim();
  const kst = new Date(Date.now() + 9 * 3600 * 1e3);
  const ymd = (d) => String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  const svc = "service=" + encodeURIComponent(env.KOPIS_KEY);
  // 오늘부터 ~180일을 30일 창 6개로 — 명세 05(31일 상한) 준수. 창 경계에 걸친 공연은 양쪽에 나와도 링크 해시가 걷어낸다.
  const spans = [];
  for (let i = 0; i < 6; i++) {
    const s = new Date(kst.getTime() + i * 30 * 864e5);
    const e2 = new Date(kst.getTime() + ((i + 1) * 30 - 1) * 864e5);
    spans.push("&stdate=" + ymd(s) + "&eddate=" + ymd(e2));
  }
  let items = [], mode = "";
  // (1) 정본 — 공연시설 목록에서 우리 시설 코드를 얻어 그 코드로만 공연을 받는다.
  try {
    const plc = await smKopisGet("prfplc", "?" + svc + "&cpage=1&rows=10&shprfnmfct=" + encodeURIComponent(fclt));
    const ids = smXmlBlocks(plc, "db").map((b) => ({ id: smXmlVal(b, "mt10id"), nm: smXmlVal(b, "fcltynm") }))
      .filter((x) => x.id && (!x.nm || x.nm.indexOf(fclt) >= 0)).slice(0, 3);
    for (const x of ids) {
      for (const span of spans) {
        const xml = await smKopisGet("pblprfr", "?" + svc + span + "&cpage=1&rows=100&prfplccd=" + encodeURIComponent(x.id));
        const rows = smKopisRows(xml, "");
        if (rows.length) { items = items.concat(rows); mode = "prfplccd"; }
      }
    }
  } catch (e) { console.error("[sm/kopis] plc", e); }
  // (2) 폴백 — 코드 경로가 빈손이면 창마다 기간 목록을 페이지로 훑어 시설명으로 거른다(창당 3쪽 = 300건 상한).
  if (!items.length) {
    for (const span of spans) {
      for (let p = 1; p <= 3; p++) {
        const xml = await smKopisGet("pblprfr", "?" + svc + span + "&cpage=" + p + "&rows=100");
        if (!xml) break;
        items = items.concat(smKopisRows(xml, fclt));
        if (smXmlBlocks(xml, "db").length < 100) break;
      }
    }
    if (items.length) mode = "scan";
  }
  return { on: true, items, mode: mode || "none", facility: fclt };
}
__name(smFromKopis, "smFromKopis");

async function smLoad(env) {
  try {
    const raw = await env.ops_kv.get(SM_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { items: Array.isArray(s.items) ? s.items : [], seen: Array.isArray(s.seen) ? s.seen : [], last: s.last || null, judge: s.judge || null };
    }
  } catch (e) { console.error("[sm/load]", e); }
  return { items: [], seen: [], last: null, judge: null };
}
__name(smLoad, "smLoad");

// 스캔 1회 — 켜진 갈래를 모아 링크 해시로 중복을 걷어내고 새 것만 앞에 쌓는다. 알림 발화 0(Q28).
async function smScan(env) {
  const kws = String(env.MONITOR_KEYWORDS || "예울마루").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const [g, n, kk, k] = await Promise.all([smFromAlerts(env), smFromNaver(env, kws), smFromKakao(env, kws), smFromKopis(env)]);
  const st = await smLoad(env);
  const seen = new Set(st.seen);
  const stamp = new Date().toISOString();
  const fresh = [];
  for (const it of g.items.concat(n.items, kk.items, k.items)) {
    const h = smHash(it.link);
    if (seen.has(h)) continue;
    seen.add(h);
    fresh.push(Object.assign({ seenAt: stamp }, it));
  }
  // 새로 발견된 KOPIS 공연만 상세를 1회 붙인다(스캔당 ≤10건) — 가격·예매처·런타임(운영자 260807 가격대 축).
  //   기존 항목은 다시 안 묻는다 = 상세 호출 총량이 「신작 수」에 비례(매시 반복 부담 0).
  for (const t of fresh.filter((x) => x.src === "kopis" && x.id).slice(0, 10)) {
    try { const d = await smKopisDetail(env, t.id); if (d) t.detail = d; } catch (e) { console.error("[sm/kopis] detail", t.id, e); }
  }
  const items = fresh.concat(st.items).slice(0, SM_MAX_ITEMS);
  const last = {
    at: stamp, added: fresh.length,
    sources: { google: g.on ? g.items.length : null, naver: n.on ? n.items.length : null, kakao: kk.on ? kk.items.length : null, kopis: k.on ? k.items.length : null },
    kopisMode: k.mode || null,
    notes: [g.note, n.note, kk.note, k.note].filter(Boolean)
  };
  try { await env.ops_kv.put(SM_KEY, JSON.stringify({ items, seen: Array.from(seen).slice(-SM_MAX_SEEN), last, judge: st.judge || null })); }
  catch (e) { console.error("[sm/save]", e); }
  return last;
}
__name(smScan, "smScan");

// === [260807 운영자 「3일 이내 올라온 것 중 예울마루와 관련된거를 … sonnet 5가 3시간마다 걸러내게」] AI 관련도 선별 ===
// 왜: 키워드 「예울마루」로 걸린 글엔 동명·스치는 언급이 섞인다(운영자 「관련 없는것도 있어서」) — 제목·분류·검색어만으로
//   sonnet 5(구독 OAuth 배선 claudeText 그대로 = 추가 비용 0)가 관련/무관을 판정해 항목에 rel(1/0)·relWhy를 새긴다.
// 시각: scheduled()가 KST 8·11·14·17시 **:15 틱**에 부른다 — 3시간 간격 + 「밤 7시~오전 8시 멈춤」 + 같은 시각
//   :00 틱의 smScan과 KV 마지막-쓰기 경합 회피(스캔은 초 단위로 끝난다). 알림 발화 0(Q28) — 화면 조회용 표식만.
// 대상: 최근 3일(발행일 우선·수집시각 폴백) 중 미판정. KOPIS 갈래는 시설 필터로 수집돼 정의상 관련 = AI 없이 rel=1.
function smItemAgeDays(it, now) {
  const s = String((it && (it.date || it.seenAt)) || "");
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00Z" : s);
  if (isNaN(t)) return Infinity;
  return Math.max(0, (now - t) / 864e5);
}
__name(smItemAgeDays, "smItemAgeDays");
async function smJudge(env) {
  if (!env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_API_KEY) return { ok: false, note: "ANTHROPIC_* 미설정" };
  const st = await smLoad(env);
  const now = Date.now();
  const cand = [];
  let auto = 0;
  for (const it of st.items) {
    if (!it || it.rel === 0 || it.rel === 1 || smItemAgeDays(it, now) > 3) continue;
    if (it.src === "kopis") { it.rel = 1; it.relWhy = "시설 필터 수집(자동)"; auto++; continue; }
    cand.push(it);
  }
  const batch = cand.slice(0, 60);   // 회당 상한 — 크론 3시간 간격이라 밀려도 다음 회가 잇는다
  let judged = 0, rel = 0, note = "";
  if (batch.length) {
    const lines = batch.map((it, i) => JSON.stringify({ i, t: String(it.title || "").slice(0, 120), k: it.kind || "", kw: it.kw || "", d: it.date || "" }));
    const sys = "너는 여수 GS칼텍스 예울마루(공연장·전시·예술교육 복합문화공간 · 예술의 섬 장도 포함) 홍보팀의 검색 결과 선별 담당이다. "
      + "각 항목이 이 시설과 실질적으로 관련된 글인지 판정한다. 관련(r=1) = 예울마루의 공연·전시·교육·행사·시설·방문 후기를 실제로 다루는 글. "
      + "무관(r=0) = 동명의 다른 장소·아파트·상호, 키워드만 스친 무관 문서, 다른 지역 이야기. 제목만으로 애매하면 r=1(놓치는 쪽보다 안전). "
      + '답은 JSON 배열만: [{"i":번호,"r":0또는1,"w":"근거 15자 이내"}] — 다른 텍스트 금지.';
    try {
      const model = env.MONITOR_JUDGE_MODEL || "claude-sonnet-5";
      const txt = await claudeText(env, sys, lines.join("\n"), 3000, { model, effort: "low" });
      const m = txt.match(/\[[\s\S]*\]/);
      for (const v of JSON.parse(m ? m[0] : txt)) {
        const it = batch[v && v.i];
        if (!it || (v.r !== 0 && v.r !== 1)) continue;
        it.rel = v.r; it.relWhy = String(v.w || "").slice(0, 40); judged++; if (v.r === 1) rel++;
      }
    } catch (e) { console.error("[sm/judge]", e); note = String(e).slice(0, 120); }
  }
  st.judge = { at: new Date().toISOString(), model: env.MONITOR_JUDGE_MODEL || "claude-sonnet-5", pool: cand.length, judged, rel, irrel: judged - rel, auto, note };
  try { await env.ops_kv.put(SM_KEY, JSON.stringify({ items: st.items, seen: st.seen.slice(-SM_MAX_SEEN), last: st.last, judge: st.judge })); }
  catch (e) { console.error("[sm/judge save]", e); }
  return { ok: true, ...st.judge };
}
__name(smJudge, "smJudge");

// === [260807 운영자 「KOPIS 공연 상세에서 유관된 타지역 공연이 있는지 확인해서 알려주게」] 같은 공연 타지역 검색 ===
// 앱 공연명 → 핵심 제목(마지막 <본제> 우선 · [지역]꼬리·장르 접두·연도 탈락) → KOPIS 기간 목록에 이름을 물어
//   예울마루 제외 타지역만 남긴다. ⚠ shprfnm 파라미터는 명세 예제에 없어 미확정(prfplccd와 같은 상황) —
//   무시돼 전 목록이 와도 **로컬 이름 대조가 최종 필터**라 결과는 같다(단 그땐 창당 1쪽 = 100건 너머는 못 본다).
// 캐시 = KV 24h(sm:rel:해시) — 상세를 열 때마다 KOPIS를 두드리지 않는다.
function smKopisCore(name) {
  let s = String(name || "").trim();
  const br = s.match(/<([^<>]{2,})>/g);
  if (br && br.length) s = br[br.length - 1].replace(/[<>]/g, "");
  return s.replace(/\[[^\]]*\]/g, " ")
    .replace(/^(뮤지컬|연극|오페라|발레|무용|콘서트|클래식|국악|가족오페라|가족뮤지컬|어린이\s*뮤지컬)\s+/, "")
    .replace(/\b20\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
}
__name(smKopisCore, "smKopisCore");
function smKopisNorm(s) { return String(s || "").replace(/\[[^\]]*\]/g, "").replace(/[<>〈〉《》]/g, "").replace(/\b20\d{2}\b/g, "").replace(/\s+/g, "").toLowerCase(); }
__name(smKopisNorm, "smKopisNorm");
async function smKopisRelated(env, name) {
  if (!env.KOPIS_KEY) return { ok: false, error: "KOPIS_KEY 미설정" };
  const core = smKopisCore(name);
  if (core.length < 2) return { ok: true, name, core, rows: [] };
  const ck = "sm:rel:" + smHash(core);
  try { const c = await env.ops_kv.get(ck); if (c) return JSON.parse(c); } catch (e) {}
  const fclt = String(env.KOPIS_FACILITY || "예울마루").trim();
  const kst = new Date(Date.now() + 9 * 3600 * 1e3);
  const ymd = (d) => String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  const svc = "service=" + encodeURIComponent(env.KOPIS_KEY);
  const nc = smKopisNorm(core);
  const out = [], ids = new Set();
  for (let i = -1; i < 6 && out.length < 8; i++) {   // −30일~+180일 = 30일 창 7개(명세 05 「31일 상한」 준수)
    const s = new Date(kst.getTime() + i * 30 * 864e5);
    const e2 = new Date(kst.getTime() + ((i + 1) * 30 - 1) * 864e5);
    const xml = await smKopisGet("pblprfr", "?" + svc + "&stdate=" + ymd(s) + "&eddate=" + ymd(e2) + "&cpage=1&rows=100&shprfnm=" + encodeURIComponent(core));
    for (const b of smXmlBlocks(xml, "db")) {
      const id = smXmlVal(b, "mt20id"), nm = smXmlVal(b, "prfnm"), fc = smXmlVal(b, "fcltynm");
      if (!id || !nm || ids.has(id)) continue;
      const nn = smKopisNorm(nm);
      if (!(nn === nc || (nc.length >= 4 && (nn.indexOf(nc) >= 0 || nc.indexOf(nn) >= 0)))) continue;
      ids.add(id);
      if (fclt && fc && fc.indexOf(fclt) >= 0) continue;   // 우리 시설 = 「타지역」이 아니다
      out.push({
        id, title: nm, place: fc, area: smXmlVal(b, "area"), state: smXmlVal(b, "prfstate"),
        from: smXmlVal(b, "prfpdfrom").replace(/\./g, "-"), to: smXmlVal(b, "prfpdto").replace(/\./g, "-"),
        link: "https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=" + encodeURIComponent(id)
      });
      if (out.length >= 8) break;
    }
  }
  const res = { ok: true, name, core, rows: out, at: new Date().toISOString() };
  try { await env.ops_kv.put(ck, JSON.stringify(res), { expirationTtl: 86400 }); } catch (e) {}
  return res;
}
__name(smKopisRelated, "smKopisRelated");

// 갈래별 준비 상태 — 화면이 「무엇이 아직 안 켜졌나」를 그대로 말할 수 있게.
function smReady(env) {
  return {
    google: !!env.GALERT_RSS,
    naver: !!(env.NAVER_SEARCH_ID && env.NAVER_SEARCH_SECRET),
    kakao: !!env.KAKAO_REST_KEY,
    kopis: !!env.KOPIS_KEY
  };
}
__name(smReady, "smReady");
// === [260806 운영자 「빠르게 뭐든 대답」] 예울이 채팅 — Worker 동기 호출 ===
// 왜 Worker인가: 종전 경로는 GitHub Actions 왕복이라 **실측 40초**(nb-blog run #20 07:33:45→07:34:25 · 큐 대기 0)가
//   바닥이었다 — 러너 부팅 + `npm install -g @anthropic-ai/claude-code` + 커밋·푸시. 대화에는 못 쓰는 지연이다.
// 왜 되는가: 구독 OAuth 토큰(`sk-ant-oat…`)은 `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20` 로
//   **원시 Messages API에서 그대로 동작한다**(공식 문서 경로). 이 레포는 이미 그 배선을 갖고 있다 — `claudeText`와
//   `extractPromoInfo`가 쓰는 헤더 두 줄이 그것이고, 「system 첫 블록 = Claude Code 신원」 규약도 실측(403)으로 확정돼 있다.
//   ⚠ 구 `docs/KEYS.md` 1-b의 「구독 OAuth는 Actions의 claude -p 에서만 동작(원시 Messages API 불가)」은 **오기**다 —
//      같은 레포의 이 코드가 반증이고, 그 문구를 근거로 「유료 키 신규 발급이 필요하다」고 판단하면 있는 배선을 못 본다.
// 모델 라우팅(운영자 260806) = 기본 `claude-sonnet-5` · effort **low** / 어려우면 `claude-opus-5` · effort **medium**.
//   ⚠ 이 두 줄 = Worker 경로의 모델 SSOT. `.github/workflows/nb-blog.yml` 라우팅과 **같은 값**이어야 한다 —
//      한쪽만 고치면 폴백이 탈 때 같은 질문에 다른 결로 답한다.
// 페르소나 SSOT = 레포 `persona/yeuli.md`(카드 수정 = 말투 자동 추종). Worker는 체크아웃이 없으니 GitHub Contents API로
//   읽고 KV에 10분 캐시한다 — 매 질문마다 왕복하면 「빠르게」가 도로 깨진다.
var YEUL_PERSONA_TTL = 600;
async function yeulPersonaCard(env) {
  try { const c = await env.ops_kv.get("yeul:persona"); if (c) return c; } catch (e) {}
  const cfg = ghBlogCfg(env);
  if (!cfg.pat) return "";
  try {
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/persona/yeuli.md?ref=${encodeURIComponent(cfg.branch)}`, {
      headers: { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" }
    });
    if (!r.ok) return "";
    const j = await r.json();
    const txt = ghDecodeB64(j.content).slice(0, 20000);
    if (txt) { try { await env.ops_kv.put("yeul:persona", txt, { expirationTtl: YEUL_PERSONA_TTL }); } catch (e) {} }
    return txt;
  } catch (e) { return ""; }
}
__name(yeulPersonaCard, "yeulPersonaCard");

// b = { q, persona(기기별 오버라이드), ctx(집계 요약 · 개인정보 없음), deep }
// ⚠ `llmText`를 쓰지 않는다 — 그쪽은 GEMINI_API_KEY가 있으면 Gemini를 먼저 잡는다. 예울이는 운영자가 모델을 지정한 기능이라
//    Claude로 고정한다(`claudeText` 직행).
// 프롬프트는 `nb-blog.yml` yeulchat 분기와 **같은 문장**이다 — 두 경로가 같은 답을 내야 폴백이 티가 안 난다.
// 복잡 질문 판정 — **판정 SSOT는 앱 `_yeulAiDeep`**(index.html)이고 앱은 매번 `deep`을 실어 보낸다.
//   여기는 `deep`이 **아예 안 온 호출**만 받는 안전판이다. 없으면 그런 호출은 어려운 질문에도 조용히 sonnet·low로
//   답한다(모델이 안 붙은 것처럼 보이는 바로 그 증상). 규칙은 앱과 같은 문장 — 한쪽을 고치면 **여기도 같이 고쳐라**.
function yeulDeep(q) {
  q = String(q || "");
  return q.length >= 60 || /전략|기획|분석|설계|보고서|제안서?|비교|계획|정리해|작성해?\s*줘|써\s*줘|만들어|장단점|로드맵|개선안/.test(q);
}
__name(yeulDeep, "yeulDeep");

async function yeulChat(env, b) {
  const over = String(b.persona || "").slice(0, 6000).trim();
  const card = over || (await yeulPersonaCard(env)) ||
    "너는 GS칼텍스 예울마루(전남 여수의 복합문화예술공간)의 공식 도우미 캐릭터 「예울이」다. 밝고 정중한 존댓말로 간결하게 답한다.";
  let p = "위 페르소나 카드의 인물 「예울이」로서, 예울마루 직원이 사내 앱 채팅으로 보낸 아래 질문에 답한다.\n";
  p += "- 사실만: 카드·참고 정보에 없는 구체 사실(날짜·가격·규정 조항·인원수)은 지어내지 말고 「확실하지 않다」고 말한다.\n";
  p += "- 길이: 2~6문장, 채팅 말풍선 하나 분량. 머리말·사고 과정 없이 답변 본문만 출력한다.\n";
  if (b.ctx) p += "\n# 참고 정보 (앱이 동봉한 집계 요약 — 개인정보 없음)\n" + String(b.ctx).slice(0, 1200) + "\n";
  p += "\n# 질문\n" + String(b.q || "").slice(0, 800);
  // 앱이 보낸 판정을 우선 존중하고(SSOT), 필드가 없을 때만 서버가 판정한다.
  const deep = (b.deep === undefined || b.deep === null) ? yeulDeep(b.q) : !!b.deep;
  const model = deep ? "claude-opus-5" : "claude-sonnet-5";
  const effort = deep ? "medium" : "low";
  // max_tokens = 답변 2~6문장 + **thinking 몫**(두 모델 다 thinking이 기본 ON이고 max_tokens가 둘을 함께 덮는다).
  //   빠듯하게 잡으면 생각만 하다 잘린 답이 나온다 — 짧은 답이라도 여유를 준다(생성한 만큼만 과금).
  const text = await claudeText(env, card + "\n\n---\n\n# 지금 할 일", p, deep ? 4000 : 2000, { model, effort });
  return { text, model, effort };
}
__name(yeulChat, "yeulChat");

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
    // [260806 운영자] 검색 모니터링 스캔 — 매시 첫 틱 1회(*/15 크론에서 시간당 1회 · 구글/네이버에 과하지 않은 간격).
    //   갈래가 하나도 안 켜졌으면 아예 안 돈다(=KV 왕복 0). ⚠ 알림 발화 0 — Q28(「홍보 알림 당분간 없애줘」) 준수.
    if (kst.getUTCMinutes() < 15 && (env.GALERT_RSS || (env.NAVER_SEARCH_ID && env.NAVER_SEARCH_SECRET) || env.KAKAO_REST_KEY || env.KOPIS_KEY)) {
      ctx.waitUntil(smScan(env).then((r) => console.log("[sm]", JSON.stringify(r))).catch((e) => console.error("sm scan", e)));
    }
    // [260807 운영자] 검색 모니터링 AI 선별 — sonnet 5가 최근 3일치의 관련/무관을 판정(「관련 없는것도 있어서 관련된 것만」).
    //   시각 = KST 8·11·14·17시 **:15 틱** = 3시간 간격 + 「밤 7시~오전 8시 멈춤」 + 같은 시각 스캔(:00 틱)과 KV 경합 회피.
    //   엔진 = 구독 OAuth claudeText 재사용(추가 비용 0) · 알림 발화 0(Q28) — 화면 조회용 rel 표식만 새긴다.
    if ([8, 11, 14, 17].indexOf(h) >= 0 && kst.getUTCMinutes() >= 15 && kst.getUTCMinutes() < 30
        && (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY)
        && (env.GALERT_RSS || (env.NAVER_SEARCH_ID && env.NAVER_SEARCH_SECRET) || env.KAKAO_REST_KEY || env.KOPIS_KEY)) {
      ctx.waitUntil(smJudge(env).then((r) => console.log("[sm/judge]", JSON.stringify(r))).catch((e) => console.error("sm judge", e)));
    }
    // [260806 운영자] AI 홍보 자동 브리핑 — 매일 KST 08:30 틱에 서버가 포트폴리오 팩을 조립해 추론 디스패치
    //   (「누르지 않더라도 자동으로 그날그날」 · 총론 + 7/30/90일 시계 · opus 5 high). 중복 방어 = KV 일자 가드.
    if (h === 8 && kst.getUTCMinutes() >= 30 && kst.getUTCMinutes() < 45) {
      ctx.waitUntil(paAutoBrief(env, {}).then((r) => console.log("[promo-auto]", JSON.stringify(r))).catch((e) => console.error("promo auto brief", e)));
    } else {
      // 부트스트랩 2축(운영자 260806) — ①포인터 부재(첫 가동·콜드스타트 「일단 한바퀴 돌려줘」) ②서식판(PA_FMT_V) 불일치
      //   (프롬프트 개정 후 「그 느낌으로 새로고침해줘」): 다음 틱에 1회 재생성. 성공하면 포인터 fv가 갱신돼 영구 무동작 ·
      //   시도 가드(KV 2h)가 실패 반복 발화를 막는다. 선례 = nomute chan_brief PVER(버전 불일치 = 다음 run 강제 재생성).
      ctx.waitUntil((async () => {
        try {
          const raw = await env.ops_kv.get("pa:auto:latest");
          let cur = null; try { cur = raw ? JSON.parse(raw) : null; } catch (e2) {}
          if (cur && cur.fv === PA_FMT_V) return;
          const kick = "pa:auto:kick:" + PA_FMT_V;
          if (await env.ops_kv.get(kick)) return;
          await env.ops_kv.put(kick, "1", { expirationTtl: 7200 });
          const r = await paAutoBrief(env, { force: true });   // force = 서식판 갱신은 당일 재생성이 목적(일자 가드 통과)
          console.log("[promo-auto:bootstrap]", JSON.stringify(r));
        } catch (e) { console.error("promo auto bootstrap", e); }
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
      // ?d=N = 오늘로부터 N일 뒤(0~14 · 기본 0). 카드 안에 토글을 넣을 수 없어서(=`<img>`는 클릭·hover가 통째로 죽는다)
      //  「내일」은 **다른 주소의 같은 카드**로 낸다 — 홈페이지에서 <details>로 접었다 펴면 그게 토글이 된다.
      if (url.pathname === "/api/public/jangdo.svg" && request.method === "GET") {
        const svgHead = { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=120", ...corsHeaders(env) };
        const dOff = Math.max(0, Math.min(14, parseInt(url.searchParams.get("d"), 10) || 0));
        try {
          const list = await jangdoPublicRows(env, url.searchParams.get("fresh") === "1");
          return new Response(buildJangdoSvg(list, jangdoNowKst(), dOff), { status: 200, headers: svgHead });
        } catch (e) {
          console.error("[public/jangdo.svg]", e);
          return new Response(buildJangdoSvg([], jangdoNowKst(), dOff), { status: 200, headers: svgHead });
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

      // === 검색 모니터링 — 「예울마루」가 어디에 걸렸나 (260806) ===
      //   GET  /api/monitor/feed  = 쌓인 목록(최신순) + 갈래별 준비 상태. ?src=google|naver|kopis · ?limit=1~300
      //   POST /api/monitor/scan  = 지금 한 바퀴(평소엔 크론이 매시 1회). 알림 발화 0 — Q28 준수.
      if (url.pathname === "/api/monitor/feed" && request.method === "GET") {
        const st = await smLoad(env);
        const src = String(url.searchParams.get("src") || "").trim();
        const lim = Math.max(1, Math.min(SM_MAX_ITEMS, parseInt(url.searchParams.get("limit"), 10) || 100));
        const rows = (src ? st.items.filter((x) => x && x.src === src) : st.items).slice(0, lim);
        return json({ ok: true, count: rows.length, total: st.items.length, last: st.last, judge: st.judge, ready: smReady(env), rows }, env);
      }
      if (url.pathname === "/api/monitor/scan" && request.method === "POST") {
        const rd = smReady(env);
        if (!rd.google && !rd.naver && !rd.kakao && !rd.kopis) return json({ error: "no_source", note: "GALERT_RSS / NAVER_SEARCH_* / KAKAO_REST_KEY / KOPIS_KEY 중 하나는 있어야 한다", ready: rd }, env, 503);
        try { return json({ ok: true, ready: rd, ...(await smScan(env)) }, env); }
        catch (e) { console.error("[sm/scan]", e); return json({ error: String(e) }, env, 500); }
      }
      // POST /api/monitor/judge = AI 관련도 선별 지금 1회(평소엔 크론이 KST 8·11·14·17시) — 운영자 260807
      if (url.pathname === "/api/monitor/judge" && request.method === "POST") {
        if (!env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_API_KEY) return json({ error: "no_ai", note: "ANTHROPIC_AUTH_TOKEN(또는 ANTHROPIC_API_KEY)이 있어야 한다" }, env, 503);
        try { return json(await smJudge(env), env); }
        catch (e) { console.error("[sm/judge]", e); return json({ error: String(e) }, env, 500); }
      }
      // GET /api/monitor/kopis-related?name=공연명 = 같은 공연의 타지역 일정(예울마루 제외 · 24h 캐시) — 운영자 260807
      if (url.pathname === "/api/monitor/kopis-related" && request.method === "GET") {
        const nm = String(url.searchParams.get("name") || "").trim();
        if (!nm) return json({ error: "name 필요" }, env, 400);
        if (!env.KOPIS_KEY) return json({ error: "KOPIS_KEY 미설정" }, env, 503);
        try { return json(await smKopisRelated(env, nm), env); }
        catch (e) { console.error("[sm/rel]", e); return json({ error: String(e) }, env, 500); }
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

      // === [260806] 예울이 채팅 — 동기 즉답(1~3초). 종전 Actions 경로(40초)의 앞단이다. ===
      // 인증 = 위 전역 게이트(X-App-Password). 미설정이면 503 → **앱이 조용히 Actions 경로로 폴백**하므로
      //   키가 없어도 기능이 죽지 않는다(느려질 뿐). 그래서 여기서 502/503을 던지는 게 안전한 실패다.
      if (url.pathname === "/api/yeul/chat" && request.method === "POST") {
        if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return json({ error: "no_api_key", note: "ANTHROPIC_* 미설정 — 앱이 Actions 경로로 폴백" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        if (!String(bb.q || "").trim()) return json({ error: "질문이 필요해요" }, env, 400);
        try {
          return json(await yeulChat(env, bb), env);
        } catch (e) {
          console.error("[yeul/chat]", e);
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

      // === ⑤ 공연 상세페이지 추출 — 상세 링크 → 페이지 본문 + 포스터·상세 이미지 OCR (LLM 안 거침) ===
      // ④ 카카오 76자와 **같은 추출·같은 KV 캐시**(promoDetailGet · 24h maxAge) 그대로 — 수집기·캐시 신설 0.
      // 쓰는 곳 = 블로그 도우미 3️⃣ 「연결된 공연 고르기」(사람이 캡처해 올리던 자리를 자동 OCR로).
      // 같은 링크를 카카오에서 이미 읽었으면 cached:true로 즉시 온다. fresh=1이면 캐시를 무시하고 다시 읽는다.
      if (url.pathname === "/api/content/detail" && request.method === "POST") {
        const hasExternal = env.GEMINI_API_KEY || (env.CLOVA_OCR_INVOKE_URL && env.CLOVA_OCR_SECRET) || env.GOOGLE_VISION_KEY || (env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);
        if (!hasExternal) return json({ error: "no_ocr_provider", note: "GEMINI_API_KEY / CLOVA_OCR_* / GOOGLE_VISION_KEY / GOOGLE_SA_* 중 하나 필요" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        if (!String(bb.url || "").trim()) return json({ error: "공연 상세 링크가 필요해요" }, env, 400);
        try {
          const d = await promoDetailGet(env, bb.url, { maxAgeMs: 24 * 3600 * 1e3, fresh: !!bb.fresh });
          return json({ url: d.url, text: d.text || "", ocrText: d.ocrText || "", images: d.images || [], cached: !!d.cached }, env);
        } catch (e) {
          console.error("[content/detail]", e);
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
        const slmLevel = (v) => (["std", "screen", "small", "min"].includes(String(v || "")) ? String(v) : "std");   // index.html `_SL_LV`·slim_runner LEVELS 와 같은 집합(260805 게이지 개정 — hq 폐지·small/min 신설)

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

      // === 콘텐츠 제작 ▸ 문서 → 마크다운 (260805 운영자) — 오피스문서 편집(/api/office/*)의 변환판 미러 ===
      // 변환 엔진 = GitHub Actions(anydoc-convert.yml)의 firecrawl/anydoc(MIT · 네이티브 Rust NAPI = 브라우저 불가).
      // 흐름·인증·시크릿 전부 office 와 동일(신설 0): upload(원본 커밋) → dispatch(anydoc-convert) → [Actions 변환 후 커밋]
      // → /api/blog/draft 폴링(공용) → file(마크다운 텍스트). 다른 건 확장자 21종과 결과가 .md 텍스트라는 점뿐.
      if (url.pathname.startsWith("/api/anydoc/")) {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" };
        const adId = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        // 확장자 화이트리스트 = anydoc README 지원표 21종(프런트 _DM_EXT 와 같은 목록). 미일치 = null → 400 거절(경로 조작 차단).
        const adExt = (n) => { const m = String(n || "").match(/\.(doc|docx|docm|ppt|pps|pot|pptx|pptm|ppsx|ppsm|xls|xlsx|xlsm|xlsb|odt|ods|odp|rtf|epub|csv|pdf)$/i); return m ? m[1].toLowerCase() : null; };

        if (url.pathname === "/api/anydoc/upload" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = adId(b.id);
          const ext = adExt(b.name);
          const b64 = String(b.b64 || "").replace(/\s/g, "");
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "지원하지 않는 형식이에요(워드·PPT·엑셀·오픈도큐먼트·RTF·EPUB·CSV·PDF)" }, env, 400);
          if (!b64) return json({ error: "빈 파일이에요" }, env, 400);
          if (b64.length > 12e6) return json({ error: "문서가 너무 커요(8MB 이하)" }, env, 413);
          const path = `drafts/anydoc/${id}.in.${ext}`;
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
              method: "PUT",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ message: `chore(anydoc): ${id} 원본 [skip ci]`, content: b64, branch: cfg.branch })
            });
            if (!gr.ok) return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
            return json({ ok: true, id, path }, env);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 트리거 — 전용 event_type(anydoc-convert)이라 블로그(nb-blog)·한글문서(hwp-edit)·오피스(office-edit) 큐에 안 막힌다.
        if (url.pathname === "/api/anydoc/dispatch" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = adId(b.id);
          const ext = adExt(b.name);
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "지원하지 않는 형식이에요(워드·PPT·엑셀·오픈도큐먼트·RTF·EPUB·CSV·PDF)" }, env, 400);
          const inner = { id, name: String(b.name || "문서").slice(0, 160), ext };   // 변환은 지시가 없다 = ask 없음(office 와 유일한 payload 차이)
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
              method: "POST",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ event_type: "anydoc-convert", client_payload: { d: inner } })
            });
            if (gr.ok) return json({ ok: true, id }, env);
            return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 결과 마크다운 — 1MB 넘어도 오게 raw 미디어타입(hwp·office 와 동일). 결과 확장자는 언제나 .md 하나.
        if (url.pathname === "/api/anydoc/file" && request.method === "GET") {
          const id = adId(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, env, 400);
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/anydoc/${id}.out.md?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
              headers: { ...ghHdr, "Accept": "application/vnd.github.raw" }
            });
            if (gr.status === 404) return json({ error: "not_ready" }, env, 404);
            if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
            return new Response(gr.body, { headers: { "Content-Type": "text/markdown; charset=utf-8", ...corsHeaders(env) } });
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }
      }

      // === 콘텐츠 제작 ▸ 보도자료 만들기 (260806 운영자) — /api/office/* 의 미러 ===
      // 흐름은 오피스문서 편집과 같다(신설 개념 0): upload(자료 원본 커밋·선택) → dispatch(press-release)
      //   → [Actions 가 집필 + 워드 조립 후 커밋] → /api/blog/draft 폴링(공용) → file(워드 수령).
      // ⚠ office 와 갈리는 지점 둘:
      //   ① 자료 원본은 **여러 개**다(출연자 프로필 여러 건) → `.src<N>.<ext>` 로 번호를 붙인다.
      //   ② 확장자 화이트리스트가 넓다(.hwp 포함) — 운영자가 실제로 주는 프로필이 구형 .hwp라
      //      ZIP도 PDF도 아니고, 러너의 tools/press_srcext.py 가 그걸 직접 읽는다.
      if (url.pathname.startsWith("/api/press/")) {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        const ghHdr = { "Authorization": "Bearer " + cfg.pat, "Accept": "application/vnd.github+json", "User-Agent": "yeulmaru-promo-worker" };
        const prId = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        const prExt = (n) => { const m = String(n || "").match(/\.(hwp|hwpx|docx|pptx|pdf|txt|md)$/i); return m ? m[1].toLowerCase() : null; };

        if (url.pathname === "/api/press/upload" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = prId(b.id);
          const ext = prExt(b.name);
          const n = Math.max(0, Math.min(9, parseInt(b.n, 10) || 0));   // 자료 번호(0~9) — 경로 조작 차단
          const b64 = String(b.b64 || "").replace(/\s/g, "");
          if (!id) return json({ error: "id required" }, env, 400);
          if (!ext) return json({ error: "한글·워드·PPT·PDF·텍스트(.hwp·.hwpx·.docx·.pptx·.pdf·.txt·.md)만 올릴 수 있어요" }, env, 400);
          if (!b64) return json({ error: "빈 파일이에요" }, env, 400);
          if (b64.length > 12e6) return json({ error: "자료가 너무 커요(8MB 이하)" }, env, 413);
          const path = `drafts/press/${id}.src${n}.${ext}`;
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
              method: "PUT",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ message: `chore(press): ${id} 자료 [skip ci]`, content: b64, branch: cfg.branch })
            });
            if (!gr.ok) return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "upload_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
            return json({ ok: true, id, path }, env);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 트리거 — 전용 event_type(press-release)이라 블로그·오피스 큐에 안 막힌다.
        if (url.pathname === "/api/press/dispatch" && request.method === "POST") {
          let b = {};
          try { b = await request.json(); } catch (e) {}
          const id = prId(b.id);
          if (!id) return json({ error: "id required" }, env, 400);
          const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
          const inner = {
            id,
            tone: cut(b.tone, 8) === "blog" ? "blog" : "press",
            main: cut(b.main, 160),
            hooks: (Array.isArray(b.hooks) ? b.hooks : []).slice(0, 6).map((x) => cut(x, 300)),
            srcs: (Array.isArray(b.srcs) ? b.srcs : []).slice(0, 10).map((x) => cut(x, 160)),
            perfs: (Array.isArray(b.perfs) ? b.perfs : []).slice(0, 12).map((x) => ({
              name: cut(x && x.name, 160), url: cut(x && x.url, 300), detail: cut(x && x.detail, 24000)
            })),
            prevDraft: cut(b.prevDraft, 60000),
            revise: cut(b.revise, 4000)
          };
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/dispatches`, {
              method: "POST",
              headers: { ...ghHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ event_type: "press-release", client_payload: { d: inner } })
            });
            if (gr.ok) return json({ ok: true, id }, env);
            return json({ error: gr.status === 401 || gr.status === 403 ? "github_denied" : "dispatch_failed", status: gr.status, note: (await gr.text()).slice(0, 200) }, env, 502);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }

        // 결과 워드 — 산출은 언제나 .docx 하나라 office 처럼 확장자를 순회하지 않는다.
        if (url.pathname === "/api/press/file" && request.method === "GET") {
          const id = prId(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, env, 400);
          try {
            const gr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/drafts/press/${id}.out.docx?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`, {
              headers: { ...ghHdr, "Accept": "application/vnd.github.raw" }
            });
            if (gr.status === 404) return json({ error: "not_ready" }, env, 404);
            if (!gr.ok) return json({ error: "github " + gr.status }, env, 502);
            return new Response(gr.body, { headers: { "Content-Type": "application/octet-stream", ...corsHeaders(env) } });
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }
      }

      // === AI 홍보 ▸ 전략 추론(총론 브리핑) — 「AI 홍보」 대메뉴의 LLM 축(「점검」= 규칙 스캔의 짝) ===
      // [260806 운영자 확정] 자동 그날그날(크론 08:30 KST) · 총론 + 7/30/90일 · 개별 추론은 「일단 지금 필요없음」.
      // 조립·디스패치는 전부 서버(paAutoBrief — 크론과 admin 수동 실행이 같은 함수 1벌). 결과는 공용 /api/blog/draft 폴링.
      // ⚠ 구 개별 축 라우트(detail/upload/dispatch)는 호출자 소멸로 제거(260806 2차) — 복원 지점 = PR #716.
      //   상세페이지 KV 캐시(promoDetailGet)는 카카오 76자(/api/content/kakao)가 계속 쓴다(제거 아님).
      if (url.pathname.startsWith("/api/promo/")) {
        // 최신 자동 브리핑 포인터 — 로그인 사용자 전체(브리핑 열람은 admin 전용이 아니다)
        if (url.pathname === "/api/promo/auto-latest" && request.method === "GET") {
          try { const v = await env.ops_kv.get("pa:auto:latest"); return json(v ? Object.assign({ ok: true }, JSON.parse(v)) : { ok: false }, env); }
          catch (e) { return json({ ok: false }, env); }
        }
        // 즉시 1회 실행(admin) — 오늘분 재생성 허용(force) · 크론과 같은 함수라 결과 형태도 동일
        if (url.pathname === "/api/promo/auto-run" && request.method === "POST") {
          try {
            const tkn = await getToken(env);
            const aAuth = await checkAdmin(request, env, tkn);
            if (!aAuth.admin) return json({ error: "Admin only" }, env, 403);
            const r = await paAutoBrief(env, { force: true, token: tkn });
            return json(r, env, r.ok ? 200 : 500);
          } catch (e) {
            return json({ error: String((e && e.message) || e) }, env, 502);
          }
        }
        return json({ error: "unknown promo route" }, env, 404);
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
          // [260812] 권한 = admin **또는** 회계 담당자(단, 회계는 `ACCT_WRITE_SHEETS` 한 장뿐).
          //   ⚠ 구판은 auth를 먼저 보고 body를 나중에 읽었다 — 어느 시트인지 알아야 회계를 판정할 수 있으므로
          //     순서를 뒤집었다(`request.json()`은 한 번만 읽히므로 위로 올린다). admin 경로의 판정 결과는 무변.
          const body = await request.json();
          if (!body.sheet) return json({ error: "sheet name required" }, env, 400);
          const opsAuth = await checkAdmin(request, env, token);
          let opsWho = opsAuth.admin ? (opsAuth.userName || "admin") : null;
          if (!opsAuth.admin) {
            if (!ACCT_WRITE_SHEETS.includes(opsSheetName(body.sheet)))
              return json({ error: "Admin only (ops write)" }, env, 403);
            const acct = await checkAccountant(request, env, token);
            if (!acct.acct) return json({ error: "Admin or accountant only (ops write)" }, env, 403);
            opsWho = acct.userName || "acct";
          }
          const rows = Array.isArray(body.rows) ? body.rows : [];
          opsCache = {};  // ops 쓰기 → ops 캐시 전체 무효화(대상 시트 소수)
          if (body.mode === "append") return json(await opsAppendRows(token, body.sheet, rows), env);
          const opsRes = await opsWriteSheet(token, body.sheet, body.headers || [], rows);
          // 사업비는 돈 원장이라 **누가 언제 몇 행을 썼는지**를 로그 시트에 남긴다(다른 운영 시트는 종전대로 무기록).
          if (ACCT_WRITE_SHEETS.includes(opsSheetName(body.sheet)))
            try { await logToSheet(token, opsWho || "?", "OPS", opsSheetName(body.sheet), 0, `write ${rows.length}\uD589`); } catch (e) {}
          return json(opsRes, env);
        }
      }

      // === [260803] 시트 유지보수(admin 전용) — 열/시트 「은퇴」 전용 라인(예술성/사업성 축 폐지에서 신설).
      //   이름 기반 조회(포지션 무관 = 열 밀림 사고 축과 무관) + confirm 문자열 재입력 필수(오타·오호출 방어) + 로그 시트 기록.
      //   ① POST /api/maint/delete-column {sheet, header, confirm:'<sheet>:<header>'} — 1행에서 헤더를 찾아 그 열 전체 물리 삭제(Range.delete shift:Left). 헤더 없음 = ok:false(멱등).
      //   ② POST /api/maint/delete-sheet {sheet:'운영_<이름>', confirm:'<sheet>'} — 운영_ 네임스페이스만(핵심 시트 보호). 시트 없음 = ok:false(멱등).
      // [260812] ③ POST /api/maint/add-column {sheet, header} — 1행 **맨 끝에** 헤더를 심는다(멱등: 이미 있으면 무접촉).
      //   왜 필요한가: 담당자 시트에 `회계여부`(P열)를 새로 다는데, 절대명령 9가 xlsm 직접 편집을 금지한다 →
      //   시트 구조 변경도 Worker를 거쳐야 한다. delete-column의 짝이고 **끝 append만** 한다
      //   (중간 삽입 = 뒤 열 전부 밀림 = 앱지침 「positional 시트 철칙」이 금지한 그 사고).
      //   confirm 재입력은 안 건다 — 열 추가는 되돌릴 수 있고(delete-column) 기존 값을 한 칸도 안 건드린다.
      if (url.pathname === "/api/maint/add-column" && request.method === "POST") {
        const aAuth = await checkAdmin(request, env, token);
        if (!aAuth.admin) return json({ error: "Admin only (maintenance)" }, env, 403);
        const body = await request.json();
        const sheet = String(body.sheet || "").trim(), header = String(body.header || "").trim();
        if (!sheet || !header) return json({ error: "sheet/header required" }, env, 400);
        const { driveId, itemId } = await findFile(token);
        const meta = await graphGet(token, `${sheetPathFor(driveId, itemId, sheet)}/usedRange?$select=columnCount`);
        const nCol = meta.columnCount || 0;
        const hr = nCol ? await graphGet(token, `${sheetPathFor(driveId, itemId, sheet)}/range(address='A1:${colLetter(nCol)}1')?$select=values`) : { values: [[]] };
        const headers = ((hr.values && hr.values[0]) || []).map((v) => String(v == null ? "" : v).trim());
        const at = headers.indexOf(header);
        if (at >= 0) return json({ ok: true, sheet, header, col: colLetter(at + 1), note: "already exists (no-op)" }, env);
        // 끝의 빈 헤더 칸은 재사용한다(구 열 삭제 자국) — 없으면 그 다음 칸.
        let idx = headers.length;
        while (idx > 0 && !headers[idx - 1]) idx--;
        const col = colLetter(idx + 1);
        await graphPatch(token, `${sheetPathFor(driveId, itemId, sheet)}/range(address='${col}1:${col}1')`, { values: [[header]] });
        invalidateSheetCache("manager");
        opsCache = {};
        await logToSheet(token, "admin", "MAINT", sheet, 0, `add-column ${header} (${col}\uC5F4)`);
        return json({ ok: true, sheet, header, col }, env);
      }
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

      // [260803] 지역 방문자 지수 — GET /api/visitors [&refresh=1]. 앱 로그인 필요. KV 24h 캐시.
      //   실시간 아님(집계 지연 ~23일) → 요일·시기 패턴 전용. 미설정이면 ok:false + setup:true (화면 무영향).
      if (url.pathname === "/api/visitors") {
        const pw = request.headers.get("X-App-Password") || "";
        if (!roleOf(pw, env)) return json({ ok: false, error: "unauthorized" }, env, 401);
        return json(await visitorIndex(env, url.searchParams.get("refresh") === "1", ctx), env);
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