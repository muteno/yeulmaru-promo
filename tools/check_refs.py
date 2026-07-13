#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_refs — 라우터·지침이 백틱으로 가리키는 레포 경로 실존 검사 (stdlib only)

대상: CLAUDE.md(마스터 라우터) · docs/앱지침.md(도메인 두뇌).
원장(docs/작업이력.md)은 과거 시점 경로를 원문 보존하므로 검사 제외.
레포가 커지면 여기에 게이트를 누적한다(참조 정합·금지 패턴 등).

사용: python3 tools/check_refs.py   (exit 0=통과 / 1=위반)
호출처: .githooks/pre-commit(커밋 시) · 수정 모드 절차 d)
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = ["CLAUDE.md", "docs/앱지침.md"]

# 비파일 표기 허용 목록 — 레포명·세션 키 나열 등 파일 경로가 아닌 백틱 원문
ALLOW = {
    "muteno/yeulmaru-promo",
    "role/pw/subAdminPin/myApplicant/myUserDept",
}


def scan(name):
    p = ROOT / name
    if not p.exists():
        return ["(대상 파일 자체 미실존: %s)" % name]
    txt = p.read_text(encoding="utf-8")
    # 펜스 코드블록은 예시·복붙용 원문이라 제외
    txt = re.sub(r"```.*?```", "", txt, flags=re.S)
    pats = re.findall(r"`([\w./가-힣_-]+/[\w./가-힣_-]+)`", txt)
    bad = []
    for q in sorted(set(pats)):
        if any(ch in q for ch in "{}*<>$"):  # 슬롯·글롭·변수 제외
            continue
        if "://" in q or q.startswith("/"):  # URL·API 엔드포인트 제외
            continue
        if q in ALLOW:
            continue
        if not (ROOT / q.rstrip("/")).exists():
            bad.append("%s → `%s`" % (name, q))
    return bad


def main():
    bad = [b for t in TARGETS for b in scan(t)]
    if bad:
        print("❌ check_refs 실패 — 백틱 경로 참조 미실존:")
        for b in bad:
            print(" -", b)
        return 1
    print("✅ check_refs 통과 — 라우터·지침의 경로 참조 전부 실존.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
