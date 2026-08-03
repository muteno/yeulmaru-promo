# hwp/ — 한글문서 미리보기 렌더러 (외부 이식본)

이 폴더는 **콘텐츠 제작 ▸ 한글문서 편집**의 브라우저 미리보기를 담당한다.
직접 만든 렌더러가 아니라 **외부 오픈소스 이식본**이다 — 값·로직을 임의로 고치지 말 것.

| 파일 | 출처 | 라이선스 | 상태 |
|---|---|---|---|
| `vendor/rhwp/rhwp.js` · `rhwp_bg.wasm` | [rhwp](https://github.com/DoHyun468/claw-hwp) — 한글 포맷 WASM 렌더러 | MIT (`vendor/rhwp/LICENSE`) | **무편집 원본 그대로** |
| `viewer-core.js` | claw-hwp `plugins/claw-hwp/skills/hwp/scripts/preview-viewer.js` | MIT | 렌더 파이프라인 계승 + 툴바 DOM 결합만 제거(임의 컨테이너 렌더용) |

- **원본 저장소**: <https://github.com/DoHyun468/claw-hwp> (운영자 260803 지시로 도입)
- 원본 뷰어는 자체 다크 팔레트 툴바를 갖고 있어 그대로 못 쓴다 → **크롬(툴바·버튼·칩)은 이 레포 기틀 컴포넌트**로 다시 짜고,
  **페이지 렌더 코어만** 가져왔다. `viewer-core.js`의 색은 전부 `:root` 토큰(`--surface-solid`·`--glass-shadow`).
- 원본이 주석으로 못 박은 **불변식 5개**(measureTextWidth 선등록 / 픽셀 상한 / 기하 스윕 선행 /
  `getPageTextLayout` 호출로 borrow 해제 / CSS 스케일만 갱신)는 `viewer-core.js` 머리말에 그대로 옮겨 뒀다.
  **하나라도 어기면 렌더가 panic 하거나 조용히 깨진다.**

## 업데이트 방법

rhwp가 올라가면 claw-hwp를 다시 클론해 `docs/vendor/rhwp/` 3파일을 이 폴더로 덮어쓴다.
`viewer-core.js`는 원본 `preview-viewer.js`의 렌더 절(§7)과 diff 해서 불변식 변화만 반영한다.

## 편집 엔진과의 관계

미리보기(브라우저) = 여기. **실제 문서 수정**은 GitHub Actions(`.github/workflows/hwp-edit.yml`)가
같은 claw-hwp 저장소의 **`hwp` 스킬**을 러너에 설치해 `claude -p`(구독 OAuth 체인)로 수행한다 —
브라우저는 파일을 보여주기만 하고 고치지 않는다.
