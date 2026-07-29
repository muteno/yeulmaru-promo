# 이관본/ — GS MISO 이식 전달물 (단일 홈 · 채팅 지시로 계속 갱신)

> 운영자 지시(Q.26): 전달할 것은 전부 이 폴더에 모으고, 채팅으로 개선하며 계속 갱신한다.
> 내부망 접근 URL: `https://promo.yeulmaru.org/이관본/<파일명>` (앱과 같은 호스팅 — 대시보드가 열리면 이것도 열린다)

## ⭐ 최우선 경로 — 파일 1개 첨부로 끝

**`standalone.html` (3.5MB)** = 원본 대시보드 통짜 이식판. MISO 대화형(Opus 4.8)에 첨부하고 이렇게 말한다:

```
첨부한 standalone.html은 완성된 웹앱이다. 코드를 수정·재작성하지 말고
이 파일을 그대로 서빙(배포)해줘. 정적 HTML 하나면 된다.
```

| 특성 | 내용 |
|---|---|
| 동일성 | 원본 index.html 코드 그대로(재구현 아님) — 디자인·기능·버튼·출력·UIUX 동일 |
| 진입 | 첫 화면 = PIN 입력, **0510(슈퍼키)** 통과. 팀즈/MS 로그인 없음(후순위 분리) |
| 데이터 | 정본 DB 25개 데이터셋 + 공휴일 2026/27 내장. 서버(workers.dev) 연결되면 실서버 우선(CRUD까지 동일), 안 되면 내장 데이터로 조회(저장 시 안내) |
| 검증 | 헤드리스 스모크 통과(PIN 게이트→진입→오프라인 렌더·JS 에러 0) — `tools/miso/smoke_standalone.mjs` |
| 알려진 한계 | 팀즈/MS Graph 의존 기능(OneDrive 폴더 탐색 등) = 후순위(동작 안 함) · 내부망이 CDN(jsdelivr·plotly) 차단 시 일부 차트·폰트 폴백 |

## 폴더 구성

| 항목 | 내용 |
|---|---|
| `standalone.html` | ⭐ 통짜 이식판 (위) |
| `빌드명세.md` | 폴백: 첨부가 안 되거나 재구현이 필요할 때 Opus 4.8에게 주는 빌드 지시서 |
| `현장실행킷.md` | 내부망 현장 가이드 — 분기 결정트리·에이전트 프롬프트·API 계약·키 치환표 |
| `miso_db.json` | 정본 DB 단일 번들 `{meta, datasets}` (기계산출물) |
| `data/*.csv` | 데이터셋별 CSV 26개 — MISO 지식베이스 업로드·개별 첨부용 (PIN·비밀번호·이메일 마스킹) |
| `비공개/` | 회원 DB MISO 반입 패키지(원장 29,752행 + 집계 3종) — **gitignore 차단, 로컬 생성 전용**(`node tools/miso/build_members.mjs`) |

## 갱신 규약 (기계산출물 — 손편집 금지)

- 데이터 갱신: 새 시트 CSV를 `data/db_export/`(또는 레포 루트)에 넣고 `npm run build:misodb`
- 이식판 갱신: `node tools/miso/build_standalone.mjs` (원본 index.html 변경도 이 명령으로 반영)
- 회원 패키지: `node tools/miso/build_members.mjs` → `비공개/` (커밋 안 됨)
- 검증: `node tools/miso/smoke_standalone.mjs` (로컬 HTTPS 서빙 필요 — 명령 헤더 주석 참조)
- 이 폴더의 파일을 손으로 고치지 말 것 — 원본(index.html·CSV·문서 원문)을 고치고 재생성.
