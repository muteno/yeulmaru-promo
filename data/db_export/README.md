# data/db_export/ — SharePoint 시트 반입 폴더 (MISO 이식용)

> **용도**: SharePoint `통합 문서1.xlsm`(클라우드 마스터)의 각 시트를 **CSV UTF-8**로 내보내서
> 이 폴더에 넣는다. 그 다음 `node tools/miso/build_db.mjs`를 실행하면 레포 안의 유관 데이터와
> **하나로 합쳐** `data/miso_db.json`(+ `data/miso_kb/*.csv`)이 생성된다.
> ⚠️ `.gitignore`가 `*.xlsx/*.xlsm`을 차단하므로 반드시 **CSV**로 내보낼 것 (엑셀: 파일 → 내보내기 → CSV UTF-8).

## 파일명 규칙 (slug 또는 한글 시트명 그대로 — 둘 다 인식)

| 넣을 파일명 | 원본 시트 | slug |
|---|---|---|
| `applysettings.csv` 또는 `홍보접수설정.csv` | 홍보접수설정 | applysettings |
| `records.csv` 또는 `신청내역.csv` | 신청내역 | records |
| `programs.csv` 또는 `프로그램.csv` | 프로그램 | programs |
| `platforms.csv` 또는 `플랫폼.csv` | 플랫폼 | platforms |
| `contents.csv` 또는 `콘텐츠형식.csv` | 콘텐츠형식 | contents |
| `managers.csv` 또는 `담당자.csv` | 담당자 | managers |
| `special.csv` 또는 `PromoSpecial.csv` | PromoSpecial(담당자 특별일정) | special |
| `logs.csv` 또는 `로그.csv` | 로그 | logs |
| `messages.csv` 또는 `메시지.csv` | 메시지(알림함) | messages |
| `챗봇FAQ.csv` / `챗봇로그.csv` / `불편사항.csv` / `규정.csv` / `도표.csv` | 챗봇·QA·규정·도표 시트 | chatbot_faq / chatbot_log / qa_complaints / rules / diagrams |
| `운영_전시마스터.csv` / `운영_전시일일.csv` | 전시 DB (docs 스냅샷보다 우선) | exhib_master / exhib_daily |
| `운영_<이름>.csv` | 기타 운영 시트 | ops_<이름> |
| (그 외 아무 이름) | 미인식명도 파일명 그대로 반입 | 파일명 |

- 시트 일부만 넣어도 된다 — 있는 것만 합친다(없는 시트는 결과 meta에 `missing`으로 표시).
- 첫 행 = 헤더 행이어야 한다(스크립트가 헤더 기준으로 동작 — 열 순서가 바뀌어도 안전).
- **레포 최상단에 직접 올린 `*.csv`·`*.json`도 자동 반입**된다(같은 파일명 규칙). 엑셀(`.xlsx/.xlsm`)은
  `python3 tools/miso/xlsx_to_csv.py <파일>`로 시트별 CSV 변환 후 실행.
- **회원 DB(파일명에 `회원` 포함)는 데이터를 반입하지 않는다** — 구조(헤더·행수)만 `meta.memberSchema`로
  설계 등재. 실데이터 반입은 `--include-members`(산출물 커밋 금지, MISO 반입 전용).

## 🔒 개인정보 기본 차단 (공개 레포 주의)

이 레포는 **Public**이다. 병합 스크립트는 `PIN`·`비밀번호`·`이메일` 헤더 컬럼을 **기본 제거**하고
결과에 무엇을 제거했는지 기록한다. 원본 CSV(특히 `managers`)를 **커밋하지 말 것** —
이 폴더의 CSV는 `.gitignore`로 차단되어 있고, 커밋 대상은 마스킹된 산출물(`data/miso_db.json` ·
`data/miso_kb/`)뿐이다. (전 컬럼이 필요하면 로컬에서 `--include-secrets`로 뽑아 **MISO에만** 올릴 것.)

## 산출물 (기계산출물 — 손편집 금지, 값 수정은 원본 CSV/소스를 고치고 재실행)

- `data/miso_db.json` — 전 데이터셋 단일 번들(`{meta, datasets:{이름:{headers, rows}}}`,
  기존 전시 DB `{headers, rows}` 규격 계승). MISO 워크플로/코드 노드·v0 GUI 구현용.
- `data/miso_kb/<이름>.csv` — 데이터셋별 마스킹 CSV. MISO **지식베이스(에이전트)** 업로드용.
