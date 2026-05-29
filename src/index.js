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

// === 담당자 시트 캐시 (서브 admin 인증용, 5분 TTL) ===
var managerCache = { rows: null, expires: 0 };
async function getManagersCached(token) {
  if (managerCache.rows && Date.now() < managerCache.expires) return managerCache.rows;
  const { rows } = await handleGetSheet(token, "\uB2F4\uB2F9\uC790");
  managerCache = { rows, expires: Date.now() + 5 * 60 * 1000 };
  return rows;
}
__name(getManagersCached, "getManagersCached");

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
    String(r["PIN"] || "").trim() === String(pin).trim() &&
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
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph GET ${r.status}: ${await r.text()}`);
  return r.json();
}
__name(graphGet, "graphGet");

async function graphPatch(token, path, body) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Graph PATCH ${r.status}: ${await r.text()}`);
  return r.json();
}
__name(graphPatch, "graphPatch");

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
  const data = await graphGet(token, `${sheetPath(driveId, itemId)}/usedRange`);
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
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, SP.programSheetName)}/usedRange`);
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
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, sheetName)}/usedRange`);
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
  const { rows } = await handleGetSheet(token, sheetName);
  const nextRow = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${nextRow}:${lastCol}${nextRow}')`, { values: [body.values] });
  if (slug !== "log") await logToSheet(token, role, "CREATE", sheetName, nextRow, summarize(body.values));
  return { ok: true, row: nextRow };
}
__name(handleAddSheetRow, "handleAddSheetRow");

async function handleUpdateSheetRow(token, sheetName, row, body, role, slug) {
  const { driveId, itemId } = await findFile(token);
  const lastCol = colLetter(body.values.length);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${row}:${lastCol}${row}')`, { values: [body.values] });
  if (slug !== "log") await logToSheet(token, role, "UPDATE", sheetName, row, summarize(body.values));
  return { ok: true };
}
__name(handleUpdateSheetRow, "handleUpdateSheetRow");

async function handleDeleteSheetRow(token, sheetName, row, role, slug) {
  const { driveId, itemId } = await findFile(token);
  const data = await graphGet(token, `${sheetPathFor(driveId, itemId, sheetName)}/usedRange`);
  const numCols = (data.values && data.values[0]) ? data.values[0].length : 10;
  const lastCol = colLetter(numCols);
  await graphPatch(token, `${sheetPathFor(driveId, itemId, sheetName)}/range(address='A${row}:${lastCol}${row}')`, { values: [Array(numCols).fill("")] });
  if (slug !== "log") await logToSheet(token, role, "DELETE", sheetName, row, "");
  return { ok: true };
}
__name(handleDeleteSheetRow, "handleDeleteSheetRow");


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
    } catch (e) {
      console.error("autoCancel row", row._rowIndex, e);
    }
  }
  console.log("autoCancel: " + cancelled + " row(s) processed");
  return cancelled;
}
__name(autoCancelStalePending, "autoCancelStalePending");

var index_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(autoCancelStalePending(env));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth") {
        const { password } = await request.json();
        // 슈퍼 admin(0511)만 직접 로그인 허용. 0510(user)은 거부 — 개별 PIN 매칭 강제.
        if (password === env.ADMIN_PASSWORD) return json({ ok: true, role: "admin" }, env);
        return json({ ok: false, error: "Wrong password" }, env, 401);
      }

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
            return rPin === String(pin).trim() && !isOnLeave;
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

      const pw = request.headers.get("X-App-Password");
      const role = roleOf(pw, env);
      if (!role) return json({ error: "Unauthorized" }, env, 401);
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
        if (request.method === "DELETE") return json(await handleDeleteRecord(token, row, role), env);
      }

      // 프로그램 PERFS 로드
      if (url.pathname === "/api/programs") {
        if (request.method === "GET") return json({ programs: await handleGetPrograms(token) }, env);
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
          return json(await handleGetSheet(token, sheetName), env);
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

      if (url.pathname === "/api/health") return json({ status: "ok", ts: (/* @__PURE__ */ new Date()).toISOString() }, env);
      return json({ error: "Not found" }, env, 404);
    } catch (e) {
      console.error(e);
      return json({ error: e.message }, env, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map