#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
대시보드 2열 하한 정본 게이트 — JS 수와 CSS 미디어쿼리가 갈리지 못하게 (운영자 260807-10, stdlib only)

무엇이 문제였나(실측): 「2열이냐 1열이냐」를 정하는 폭이 **두 언어에 나뉘어** 있다 —
  ⓐ JS `_bizBookWide()`  = 책 판형·레일 fetch·줌 보정·캐러셀 철거 8곳이 보는 판정
  ⓑ CSS `@media(max-width:…){#sales-rail{display:none}}` = 레일을 실제로 숨기는 곳
둘이 어긋나면 **레일만 뜬 반쪽 레이아웃**(CSS는 보여주는데 JS는 「좁다」며 데이터도 안 당김)이나
**빈 우 열**(JS는 2열로 그리는데 CSS가 숨김)이 된다. 게다가 구판은 `1200`이 JS 8곳에 매직넘버로
흩어져 있어 한 곳만 고치면 조용히 갈렸다 — 그래서 수는 `_BIZ_WIDE_MIN` 한 곳으로 모으고 여기서 잠근다.

검사 4종 (전부 **하드 0** — 래칫 아님):
  ① 정본 상수: `var _BIZ_WIDE_MIN=<N>;`가 소스 전체에 1회(첫 페인트 전 블록 = _bizZoomTarget보다 먼저)
  ② 판정 함수: `_bizBookWide()`가 그 상수를 그대로 쓴다(`window.innerWidth>=_BIZ_WIDE_MIN`) · 선언 1회
  ③ CSS 짝: `@media(max-width:<N-1>px){#sales-rail{display:none}}`가 1회 — JS 「≥N = 2열」의 여집합
  ④ 매직넘버 부활 금지: `window.innerWidth`를 1100~1600 사이 **숫자**와 직접 비교하는 자리 0
     (768=모바일 · 840=메모보드 FIT는 다른 축이라 대상 밖)

실행: python3 tools/check_wide_threshold.py   (위반 시 exit 1)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

CONST = re.compile(r"var\s+_BIZ_WIDE_MIN\s*=\s*(\d+)\s*;")
FN = re.compile(r"function\s+_bizBookWide\s*\(\s*\)\s*\{\s*return\s+window\.innerWidth\s*>=\s*_BIZ_WIDE_MIN\s*;\s*\}")
FN_ANY = re.compile(r"function\s+_bizBookWide\s*\(")
# ④ 책 축 매직넘버 — innerWidth를 1100~1600 사이 리터럴과 직접 비교
#    ⚠ `window.` 접두를 요구하지 **않는다** — `w.innerWidth>1200`처럼 별칭에 담아도 같은 사고다.
#      대신 그 줄에서 매치 **앞쪽에 주석 시작(`//`·`/*`)이 있으면 건너뛴다**(주석 안 예시는 코드가 아니다).
MAGIC = re.compile(r"\binnerWidth\s*[<>]=?\s*(1[1-5]\d\d|1600)\b")


def main() -> int:
    if not INDEX.exists():
        print("✗ check_wide_threshold — index.html 없음")
        return 1
    src = INDEX.read_text(encoding="utf-8")
    bad = []

    # ① 정본 상수
    hits = CONST.findall(src)
    n = len(hits)
    width = None
    if n != 1:
        bad.append(f"`var _BIZ_WIDE_MIN=<수>;` 선언이 {n}곳 — 정확히 1곳이어야 한다(0=삭제 · 2+=값 이원화)")
    else:
        width = int(hits[0])
        if not (900 <= width <= 2000):
            bad.append(f"_BIZ_WIDE_MIN={width} — 대시보드 2열 하한으로 말이 안 되는 값(900~2000 밖)")

    # ② 판정 함수가 상수를 그대로 쓴다
    n_fn = len(FN_ANY.findall(src))
    if n_fn != 1:
        bad.append(f"`_bizBookWide` 선언이 {n_fn}개 — 정확히 1개여야 한다")
    elif not FN.search(src):
        bad.append(
            "`_bizBookWide()`가 `window.innerWidth>=_BIZ_WIDE_MIN`이 아니다 — "
            "판정식에 숫자를 다시 박으면 CSS 짝과 갈린다"
        )

    # ③ CSS 짝 = N-1
    #    ⚠ **줄머리 앵커**로 잰다 — 주석 안에 같은 문자열을 적어 두면 그게 실제 규칙 행세를 한다
    #      (킬테스트에서 실제로 통과해 버렸다: JS 주석의 예시 한 줄이 CSS 검사를 만족시켰다).
    css_rule = re.compile(
        r"^@media\(max-width:(\d+)px\)\{#sales-rail\{display:none\}\}", re.M
    )
    found = css_rule.findall(src)
    if width is not None:
        if len(found) != 1:
            bad.append(
                f"레일 숨김 미디어쿼리(줄머리 규칙)가 {len(found)}곳 — 정확히 1곳이어야 한다"
            )
        elif int(found[0]) != width - 1:
            bad.append(
                f"레일 숨김 미디어쿼리가 `max-width:{found[0]}px` — JS 하한 {width}의 여집합인 "
                f"`max-width:{width-1}px`여야 한다(어긋나면 레일만 뜬 반쪽 레이아웃)"
            )

    # ④ 매직넘버 부활 금지
    for m in MAGIC.finditer(src):
        head = src.rfind("\n", 0, m.start()) + 1
        prefix = src[head:m.start()]
        if "//" in prefix or "/*" in prefix:
            continue   # 주석 안 예시(이 게이트 자신을 설명하는 줄 등) = 코드가 아니다
        ln = src.count("\n", 0, m.start()) + 1
        bad.append(
            f"L{ln}: `{m.group(0)}` — 책 축 폭 비교는 `_bizBookWide()`만 쓴다(숫자는 _BIZ_WIDE_MIN 한 곳)"
        )

    if bad:
        print("✗ 2열 하한 정본 위반 %d건 — docs/작업이력.md 260807-10 블록 참조" % len(bad))
        for b in bad:
            print("  - " + b)
        return 1

    print(
        "✅ check_wide_threshold 통과 — 2열 하한 %d = JS 상수 1곳 · `_bizBookWide()` 유일 판정 · "
        "CSS 짝 max-width:%dpx · 매직넘버 0." % (width, width - 1)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
