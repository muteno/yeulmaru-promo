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

      // 동시 접속자 (presence) — Graph 토큰 불필요, 가벼운 KV 읽기/쓰기
      if (url.pathname === "/api/presence") {
        if (request.method === "POST") return json(await handlePresencePost(request, env), env);
        if (request.method === "GET") return json(await handlePresenceGet(env), env);
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