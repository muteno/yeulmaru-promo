#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사업 목록 표 정본 게이트 — 「서로 참조값 가지도록」의 정적 층 (운영자 260807-8, stdlib only)

운영자 지시: 「사업 목록 리스트는 항상 저렇게 표기되게 고정해줘. 서로 참조값 가지도록
              (하나를 바꾸면 다른것도 바뀌게)」

무엇이 문제였나(실측): 같은 사업 목록을 **두 화면**이 그린다 —
  ⓐ 대시보드 3면 우 열 「판매현황 상세」(`_bizCompRender`)
  ⓑ 「사업 결과 비교」 모달(`_bizRender`)
그런데 집계는 손복사(코드 주석이 「한쪽 수정 시 반드시 동시 수정」이라 경고하고 있었다), 표는 아예
따로 타이핑돼 있었다. 결과 = 260807 표기 개정 6차(일시 M/D·제목 1행 말줄임·대소 배지·회차 병기·
관객수 개명·열 간격)가 **전부 ⓐ에만** 걸리고 ⓑ는 구 표기 그대로 남았다. 눈으로만 관리되는 쌍둥이는
반드시 갈린다 — 그래서 잠근다.

검사 4종 (전부 **하드 0** — 래칫 아님):
  ① 정본 함수 실존: `function _bizListBuild(` · `function _bizListTable(` 각 1개
  ② 머리글 조립은 한 곳: 사업 목록 머리글 배열 리터럴(`['일시',''],['공연명','']…`)이 소스 전체에 1회
  ③ 두 화면 모두 정본을 부른다: `_bizListTable(` 호출이 2곳 이상, `_bizListBuild(` 호출이 2곳 이상
  ④ 구 표기 부활 금지: 사업 목록 축의 폐지 어휘(`'공연일','공연명','장르','회차','판매좌석'` 배열)가 0

실행: python3 tools/check_biz_list.py   (위반 시 exit 1)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# ② 사업 목록 머리글 = 이 리터럴 한 벌이 정본. 열 이름이 바뀌어도 「앞 두 칸」은 구조상 고정이라
#    여기를 앵커로 잡는다(열 추가·개명에 안 깨지고, 두 번째 타이핑만 잡는다).
HEAD_ANCHOR = re.compile(r"\[\['일시',''\],\['공연명',''\]")
# ④ 폐지된 구 머리글 배열(모달이 들고 있던 것) — 부활하면 잡는다
OLD_HEAD = re.compile(r"\['공연일','공연명','장르','회차','판매좌석'")


def main() -> int:
    if not INDEX.exists():
        print("✗ check_biz_list — index.html 없음")
        return 1
    src = INDEX.read_text(encoding="utf-8")
    bad = []

    # ① 정본 함수 실존
    for fn in ("_bizListBuild", "_bizListTable"):
        n = len(re.findall(r"function\s+" + fn + r"\s*\(", src))
        if n != 1:
            bad.append(f"정본 함수 `{fn}` 선언이 {n}개 — 정확히 1개여야 한다(0=삭제 · 2+=분기 발생)")

    # ② 머리글은 한 곳에서만 조립
    n_head = len(HEAD_ANCHOR.findall(src))
    if n_head != 1:
        bad.append(
            f"사업 목록 머리글 배열이 {n_head}곳 — 1곳(정본 `_bizListTable`)이어야 한다. "
            "두 번째 타이핑 = 화면이 갈리기 시작하는 자리다."
        )

    # ③ 두 화면이 정본을 부른다 (선언 1 + 호출 N → 등장 수로 센다)
    for fn, need in (("_bizListTable", 2), ("_bizListBuild", 2)):
        calls = len(re.findall(re.escape(fn) + r"\s*\(", src)) - 1  # 선언 1개 제외
        if calls < need:
            bad.append(
                f"`{fn}` 호출이 {calls}곳 — 3면 인라인과 모달 둘 다 불러야 하므로 {need}곳 이상이어야 한다"
            )

    # ④ 구 표기 부활 금지
    n_old = len(OLD_HEAD.findall(src))
    if n_old:
        bad.append(
            f"폐지된 구 머리글 배열(공연일·회차·판매좌석)이 {n_old}곳 되살아났다 — "
            "사업 목록 표기는 `_bizListTable` 한 곳에서만 바꾼다"
        )

    if bad:
        print("✗ 사업 목록 표 정본 위반 %d건 — docs/작업이력.md 260807-8 블록 참조" % len(bad))
        for b in bad:
            print("  - " + b)
        return 1

    print(
        "✅ check_biz_list 통과 — 사업 목록 집계·표기 정본 1벌 "
        "(_bizListBuild/_bizListTable) · 3면·모달 공유 · 구 표기 잔존 0."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
