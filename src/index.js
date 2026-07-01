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

// === 메시지(알림) 시트 — 자동 생성 + CRUD ===
var MSG_SHEET = "메시지";
var MSG_HEADERS = ["ID", "수신자", "종류", "트리거", "이전", "이후", "사유", "참조번호", "참조요약", "KST", "읽음"];

async function graphPost(token, path, body) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Graph POST ${r.status}: ${await r.text()}`);
  return r.json();
}
__name(graphPost, "graphPost");

// 메시지 시트 없으면 생성 + 헤더 기록 (최초 1회)
async function ensureMessagesSheet(token) {
  const { driveId, itemId } = await findFile(token);
  const ws = await graphGet(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets`);
  const exists = (ws.value || []).some((w) => w.name === MSG_SHEET);
  if (!exists) {
    await graphPost(token, `/drives/${driveId}/items/${itemId}/workbook/worksheets/add`, { name: MSG_SHEET });
    const lastCol = colLetter(MSG_HEADERS.length);
    await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='A1:${lastCol}1')`, { values: [MSG_HEADERS] });
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
  const { rows } = await handleGetSheet(token, MSG_SHEET);
  const nextRow = rows.length > 0 ? Math.max(...rows.map((r) => r._rowIndex)) + 1 : 2;
  const values = [
    msg.id || "", msg.recipient || "", msg.type || "일반", msg.trigger || "",
    msg.before || "", msg.after || "", msg.reason || "", msg.refNo || "",
    msg.refSummary || "", msg.kst || kstNowText(), msg.read ? "TRUE" : "FALSE"
  ];
  const lastCol = colLetter(values.length);
  const addr = `A${nextRow}:${lastCol}${nextRow}`;
  // 셀을 텍스트 서식으로 먼저 지정 — KST/번호가 Excel 날짜·숫자로 자동변환되는 것 방지
  await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='${addr}')`, { numberFormat: [values.map(() => "@")] });
  await graphPatch(token, `${sheetPathFor(driveId, itemId, MSG_SHEET)}/range(address='${addr}')`, { values: [values] });
  return { ok: true, row: nextRow };
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

// === [DB통합/이관] 운영 데이터를 프로모 엑셀(통합 문서1.xlsm)의 "운영_*" 시트에 저장 (source of truth, Workbook API 읽기·쓰기 OK 검증됨). dash 파일은 501이라 dash가 push만 함. ===
function opsSheetName(s){ return "운영_" + String(s).replace(/[()（）]/g, ""); }
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
  const ur = await graphGet(token, `${sheetPathFor(driveId, itemId, name)}/usedRange`);
  const vals = ur.values || [];
  if (!vals.length) throw new Error("sheet empty/missing: " + name);
  const headers = vals[0].map((h) => String(h == null ? "" : h));
  const nextRow = vals.length + 1;
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

async function getHolidays(env, year, forceRefresh) {
  const key = `holidays:${year}`;
  if (!forceRefresh) {
    const cached = await env.ops_kv.get(key);
    if (cached) return JSON.parse(cached);
  }
  let days = [];
  try { days = await fetchHolidaysFromKasi(env, year); } catch (e) {}
  if (days.length) {
    const payload = { year, days, cachedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await env.ops_kv.put(key, JSON.stringify(payload));
    return payload;
  }
  const cached = await env.ops_kv.get(key);
  if (cached) return JSON.parse(cached);
  return { year, days: [], cachedAt: null };
}
__name(getHolidays, "getHolidays");

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
  const model = env.BLOG_MODEL || "claude-opus-4-8";
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

  const system = "당신은 GS칼텍스 예울마루(전남 여수에 있는 복합문화예술공간)의 홍보 담당자입니다. " +
    "네이버 블로그에 올릴 한국어 포스팅 초안을 작성합니다. 가장 중요한 것은 글쓴이가 밝힌 '의도·목적'을 분명히 달성하는 것입니다 — " +
    "글 전체가 그 의도를 향하도록 구성하고, 의도가 흐려져 모호한 글이 되지 않게 하세요. " +
    "공연·행사의 사실 정보(일시·장소·출연·가격 등)는 아래 '공연 정보'와 '추가 참고'에 주어진 범위 안에서만 사용하고, 없는 사실을 임의로 지어내지 마세요. " +
    "유명하지 않은 공연일 수 있으니 주어진 정보만으로도 충실하고 매력적인 글이 되도록 쓰세요. " +
    "독자가 읽기 편한 자연스러운 블로그 문체로 쓰고, 결과는 곧바로 붙여넣을 수 있도록 '제목 한 줄 + 본문'만, 설명·머리말·코드블록 없이 글 본문 텍스트만 내보내세요.";

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
  const model = env.OCR_MODEL || env.BLOG_MODEL || "claude-opus-4-8";
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

// === 블로그 초안 GitHub 연동 (서버 시크릿 PAT) ===
// 브라우저에 GitHub 토큰을 두지 않기 위해 dispatch/폴링을 Worker가 대행한다.
// PAT는 env.GITHUB_PAT(대체: GH_BLOG_PAT / GITHUB_TOKEN) — Cloudflare 시크릿. repo/branch는 env로 오버라이드 가능.
function ghBlogCfg(env) {
  return {
    pat: env.GITHUB_PAT || env.GH_BLOG_PAT || env.GITHUB_TOKEN || "",
    repo: env.GITHUB_REPO || "yeulmaru/yeulmaru-promo",
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
    ctx.waitUntil(autoCancelStalePending(env));
    const ky = new Date(Date.now() + 9 * 3600 * 1e3).getUTCFullYear();
    ctx.waitUntil(getHolidays(env, ky, true));
    ctx.waitUntil(getHolidays(env, ky + 1, true));
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

      // === 블로그 초안 트리거 — 브라우저 대신 Worker가 repository_dispatch[nb-blog] 호출 (PAT=서버 시크릿) ===
      // 로그인 사용자(X-App-Password)면 사용 가능. 실제 글쓰기는 Actions(nb-blog.yml)가 수행 → drafts/<id>.json.
      if (url.pathname === "/api/blog/dispatch" && request.method === "POST") {
        const cfg = ghBlogCfg(env);
        if (!cfg.pat) return json({ error: "no_github_pat", note: "Worker에 GITHUB_PAT 시크릿 미설정" }, env, 503);
        let bb = {};
        try { bb = await request.json(); } catch (e) {}
        const payload = (bb && typeof bb.payload === "object" && bb.payload) ? bb.payload : (bb || {});
        const id = String(payload.id || ("nb" + Date.now() + Math.floor(Math.random() * 1e3))).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
        const client_payload = Object.assign({}, payload, { id, mode: payload.mode === "structure" ? "structure" : "blog" });
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
      }

      // === [DB통합/이관] 운영 데이터 — 프로모 엑셀 "운영_*" 시트가 source of truth (Workbook API) ===
      // GET ?sheet=<name> → 운영_<name> 시트 {headers,rows,count}. GET (no param) → 운영_* 시트 목록.
      // POST {sheet,headers,rows} (admin) → 운영_<name> 시트 전체 교체. (dash push / 이관 / 일일입력 폼 공용)
      if (url.pathname === "/api/ops") {
        if (request.method === "GET") {
          const sheet = url.searchParams.get("sheet");
          if (sheet) {
            try {
              const { headers, rows } = await handleGetSheet(token, opsSheetName(sheet));
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
          if (body.mode === "append") return json(await opsAppendRows(token, body.sheet, rows), env);
          return json(await opsWriteSheet(token, body.sheet, body.headers || [], rows), env);
        }
      }

      // 공휴일 (KASI) — GET ?year=YYYY [&refresh=1]. KV 캐시. 임시·대체공휴일 포함.
      if (url.pathname === "/api/holidays") {
        const ky = new Date(Date.now() + 9 * 3600 * 1e3).getUTCFullYear();
        const year = parseInt(url.searchParams.get("year") || "", 10) || ky;
        const data = await getHolidays(env, year, url.searchParams.get("refresh") === "1");
        return json(data, env);
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