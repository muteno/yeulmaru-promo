#!/usr/bin/env node
'use strict';
/**
 * claude_api_failover.js — 구독 OAuth 토큰으로 **Messages API를 직접** 호출하며 5계정 폴오버.
 *
 * 왜 이 파일이 따로 있나(운영자 260812 「워커 쓰지말고 깃에서해 그래야 4개 계정 배선이 돌아」):
 *   예울이 채팅의 종전 Actions 경로는 `claude -p` CLI를 썼다 → 매 질문마다 러너에서
 *   `npm install -g @anthropic-ai/claude-code`(실측 20~30초)를 깔고 시작했다. 대화에는 못 쓰는 지연이다.
 *   Worker 즉답(`/api/yeul/chat`)은 빨랐지만 **토큰이 한 개**라 그 계정이 쿼터·만료로 막히면 그대로 죽는다
 *   (260812 실측 = Worker에 ANTHROPIC_AUTH_TOKEN이 있는데도 최근 채팅 3건 전부 Actions로 폴백).
 *   → 답은 「Actions에 남되 CLI를 벗는다」다: 5계정 체인은 그대로 돌면서 CLI 설치가 사라진다.
 *
 * 왜 되는가: 구독 OAuth 토큰(`sk-ant-oat…`)은 `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`
 *   헤더로 원시 Messages API에서 그대로 동작한다. 추가 규약은 하나 — **system 첫 블록 = Claude Code 신원**
 *   (아니면 403 `Request not allowed`). 같은 배선의 선례 = `src/index.js` `claudeText`.
 *
 * 계약은 CLI판(`claude_failover.js`)과 **같다** — 체인·쿼터 정규식·승격 신호를 그 파일에서 가져다 쓴다.
 *   활성(체인 첫 시도)이 쿼터로 막힐 때만 `.nomute_active_quota` 신호 → account_failover.py 가 sticky 승격.
 *   서브 계정 쿼터·비쿼터 실패는 신호 없이 폴오버만.
 *
 * 사용(github-script 스크립트 안):
 *   const path = require('path');
 *   const { runClaudeApiWithFailover } = require(path.join(process.env.GITHUB_WORKSPACE, 'shared/claude_api_failover.js'));
 *   const r = await runClaudeApiWithFailover({ model, effort, system, user, maxTokens });
 *   const text = r.ok ? r.text : '';   const err = r.ok ? '' : r.error;
 *
 * env 전제 = CLI판과 동일: ACTIVE_ACCOUNT · ACC_<계정명>.
 * 런타임 전제 = Node 18+ (전역 fetch/AbortController). GitHub ubuntu-latest 러너는 20+ 기본 탑재 = 설치 0.
 */
const { CHAIN, QUOTA_RE, rotatedOrder, markActiveQuota, scrubToken } = require('./claude_failover.js');

const API_URL = 'https://api.anthropic.com/v1/messages';
// ⚠ 이 문장을 system 첫 블록에서 빼면 구독 OAuth 토큰은 403 `Request not allowed`를 받는다(규약).
const CC_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

function tokenFor(acct) {
  return String(process.env['ACC_' + acct] || '').trim();
}

/** 한 계정으로 1회 호출. 성공 = 비어있지 않은 텍스트, 실패 = throw. */
async function askOnce(token, o) {
  const body = {
    model: o.model,
    // ⚠ sonnet-5·opus-5는 thinking이 기본 ON이고 max_tokens가 thinking+답변을 **함께** 덮는다 →
    //   2~6문장 답이라도 여유를 준다(생성한 만큼만 과금). 빠듯하면 생각만 하다 잘린 답이 나온다.
    max_tokens: o.maxTokens || 2000,
    system: [{ type: 'text', text: CC_IDENTITY }, { type: 'text', text: String(o.system || '') }],
    messages: [{ role: 'user', content: String(o.user || '') }]
  };
  // ⚠ `effort`는 **`output_config` 안**이다(최상위 아님) · low|medium|high|xhigh|max.
  if (o.effort) body.output_config = { effort: o.effort };
  // ⚠ temperature/top_p/top_k를 되살리지 마라 — opus-5·sonnet-5는 400을 준다(제거된 파라미터).

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs || 90000);
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
        'authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    const raw = await resp.text();
    // 상태코드를 에러 문자열에 실어 보낸다 — 429/529 등이 QUOTA_RE 판정에 그대로 걸리게(승격 신호의 재료).
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + raw.slice(0, 600));
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('JSON 파싱 실패: ' + raw.slice(0, 200)); }
    return (data.content || []).filter((x) => x && x.type === 'text').map((x) => x.text).join('').trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ACTIVE_ACCOUNT 부터 체인을 순회하며 Messages API 호출. 첫 성공(비어있지 않은 텍스트)에서 반환.
 * @returns {{ok:boolean, text?:string, error?:string, account:?string, order:string[], triedIndex?:number}}
 */
async function runClaudeApiWithFailover(opts) {
  opts = opts || {};
  const order = rotatedOrder();
  let lastErr = '';

  for (let i = 0; i < order.length; i++) {
    const acct = order[i];
    const token = tokenFor(acct);
    if (!token) {
      console.log('  ⚠️ ' + acct + ' 토큰 없음(ACC_' + acct + ' 미설정) — 다음 계정 시도');
      lastErr = lastErr || ('토큰 없음 (' + acct + ')');
      continue;
    }
    try {
      const text = await askOnce(token, opts);
      if (text) {
        console.log('  ✅ ' + acct + ' 성공(' + text.length + '자)');
        return { ok: true, text: text, account: acct, order: order, triedIndex: i };
      }
      lastErr = '빈 응답 (' + acct + ')';
      console.log('  ⚠️ ' + acct + ' 빈 응답 — 다음 계정 시도');   // 쿼터 확증 불가 → 신호 없이 폴오버
    } catch (e) {
      const emsg = scrubToken(String((e && e.message) || e)).trim();
      lastErr = emsg.slice(0, 1500);
      const isQuota = QUOTA_RE.test(emsg);
      if (i === 0 && isQuota) { markActiveQuota(); }   // 활성(첫 시도)이 쿼터 → 승격 신호(CLI판과 같은 계약)
      console.log('  ⚠️ ' + acct + ' 실패' + (isQuota ? '(쿼터 추정)' : '') + ' — 다음 계정 시도: ' + emsg.slice(0, 200));
    }
  }
  return { ok: false, error: lastErr || '전 계정 실패', account: null, order: order };
}

module.exports = { runClaudeApiWithFailover, CHAIN };

// 로컬 점검용(API 호출 안 함): node shared/claude_api_failover.js → 체인·순환 순서·토큰 보유 여부만 출력.
if (require.main === module) {
  console.log('CHAIN      =', CHAIN.join(' → '));
  console.log('ACTIVE     =', String(process.env.ACTIVE_ACCOUNT || CHAIN[0]).trim());
  console.log('폴오버 순서 =', rotatedOrder().join(' → '));
  console.log('토큰 보유   =', CHAIN.map((a) => a + (tokenFor(a) ? '✓' : '✗')).join(' '));
}
