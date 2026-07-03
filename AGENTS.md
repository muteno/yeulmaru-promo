# AGENTS.md — yeulmaru-promo (타 AI 모델·에이전트 공통 계약)

> Claude 외 모델(Codex·Gemini 등)로 이 repo를 작업할 때도 아래 계약을 동일하게 따른다.
> Claude 세션용 상세 인계는 `CLAUDE.md`, 디자인 SSOT는 `docs/디자인기틀.md`.

## 💬 응답 언어
- 사용자는 한국어 화자 — **모든 대화·설명·요약은 한국어로.**

## 🎨 디자인 계약 (필수)
1. **SSOT = `docs/디자인기틀.md`** — UI 작업 전 필독. 기틀에 있는 토큰(`:root` 2블록)과
   정본 컴포넌트(`.btn` 8변형·`.u-*`·`.sw`·`.icon-btn`·`.toast`·`.chip`·`.modal`·`nb-*` 등 11종)만 사용.
2. **새 raw hex 금지** — 새 색은 `:root` 토큰으로만 정의하고 `var()`로 사용.
   새 `:root` 블록 추가, 정의만 하고 안 쓰는 고아 토큰, 토큰 이중 정의 전부 금지.
3. **기틀에 없는 값/형태가 필요하면 작업을 멈추고 운영자에게 질문**
   (필요 이유 + 가장 가까운 기존 후보 제시). 임의 창작 절대 금지.
4. **게이트**: `python3 tools/check_design.py`가 위반을 검사한다(커밋 시 `.githooks/pre-commit`이 강제).
   `index.html`·`signage/*.html`을 편집했으면 커밋 전에 반드시 직접 실행해 exit 0 확인.
5. 운영자 승인분은 즉시 기틀 편입: 토큰 추가 → `docs/디자인기틀.md` 등재 →
   `tools/check_design.py` baseline 갱신 + 사유 주석.

## ⚠️ 동시 편집 주의 (이 repo는 여러 세션이 동시 작업)
- 커밋/푸시/머지 **직전에 반드시 `git fetch origin main`** — 옛 main 기반 브랜치를 그대로 머지하면
  그 사이 들어온 남의 변경이 되돌려질 수 있다(필요 시 rebase).
- **main에 force-push 절대 금지.** 머지는 PR로.
- 이미 머지된 PR의 브랜치에 새 커밋을 쌓지 말 것 — 최신 main에서 새 브랜치.

## 🚫 데이터 안전
- 로컬 `통합 문서1.xlsm` 직접 편집 금지(SharePoint 마스터와 충돌·손상). 시트 데이터는 앱 모달/Worker API로만.
- Worker(`src/index.js`)는 git과 무관 — Cloudflare에 별도 배포해야 반영.
