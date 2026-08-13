#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사업비 거울 빌더 — 「<연도>년 예술사업 대시보드.xlsx」(운영자 업로드) → data/biz_finance.js

산출물은 **기계산출물**이다(레포 규범 「⚙ 기계산출물 손편집 금지」). 값을 고치려면
원본 xlsx를 갈아끼우고 이 스크립트를 다시 돌려라 — data/biz_finance.js를 손으로 고치지 마라.

무엇을 담나 (원천 열 그대로 · 파생값 0):
  예산 · 전표실적(지출 a) · 판매수수료 · 정산서(매출 b) · 유료인원 · 초대인원
파생값(차액·수익율·계·비율)은 **저장하지 않는다** — 화면이 계산한다(값 이원화 금지).
  차액 = rev - vou   ·   수익율 = rev / (vou + fee) * 100   ·   계 = paid + inv

🚨 단위 함정(실측 260812):
  · 25공연·25전시 = **원**. 시트 머리의 「(단위 : 천원)」은 낡은 딱지다(값이 45,208,740 = 원).
  · 25교육 **요약표**(B3:J14) = **천원**, 25교육 **세부표**(B18:L37) = **원**.
    → 교육은 지출·판매수수료·매출을 **세부표(원)에서 구분별로 합산**해 담는다(반올림 손실 0).
      예산·수강인원만 요약표에서 가져온다(세부표엔 구분별 예산이 한 칸에 뭉쳐 있다).

🚨 공연 시트가 두 벌이다: 「25공연」 · 「25공연_260319수정」.
  운영자 260812 확정 = **260319수정본이 정본**. 구본은 담지 않고 차이만 검산 로그로 찍는다.

🔑 사업NO는 **위치가 아니라 정체성**에 묶는다(운영자 260812 「연도별로 추가 데이터가 왔을때도 문제 없이 삽입되어야」).
  구판처럼 시트 행 순서로 `01,02,…`를 새로 매기면, 엑셀 **중간에 한 줄만 끼워도 그 뒤 NO가 전부 밀려**
  이미 시트(`운영_사업비`)에 저장된 담당자 수정본이 **엉뚱한 사업에 붙는다**(또는 통째로 고아가 된다).
  → 재빌드 때 **이전 산출물(data/biz_finance.js)을 먼저 읽어** 같은 (연도, 조인키)에 붙어 있던 NO를 **그대로 재사용**하고,
    처음 보는 사업만 그 연도·분야의 **남는 다음 번호**를 받는다. 사업명을 고쳐도 NO는 안 바뀐다(구 이름도 같이 기억한다).
  = 한 사업의 NO는 **한 번 정해지면 영구**. 연도가 늘어도, 줄이 끼어도, 이름이 바뀌어도 시트 행이 안 어긋난다.

검산(실패 시 rc=1):
  ① 각 분야 행 합 == 시트 합계 행 (예산·전표실적·판매수수료·매출·인원)
  ② 교육 세부표 구분별 합 == 교육 요약표 값(천원 반올림 오차 ≤ 1천원)
  ③ 사업NO 중복 0 · 빈 사업명 0 · 조인키 중복 0(한 해 안에서 두 사업이 같은 키면 링크가 갈린다)
  ④ NO 안정성: 이전 산출물에 있던 (연도, 키)의 NO가 하나도 안 바뀌었나
사용: python3 tools/build_biz_finance.py [원본.xlsx ...]   (기본 = 레포 최상단 「*년 예술사업 대시보드.xlsx」)
"""
import glob
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "biz_finance.js")

# ── 시트·행 위치는 **탐지**한다(하드코딩 금지) ───────────────────────────────────────────
#   운영자 260812 「연도별로 추가 데이터가 왔을때도 문제 없이 삽입되어야 해」 —
#   `25공연` 같은 이름이나 `6~22행` 같은 범위를 코드에 박아두면 2024·2026 엑셀에서 **조용히 빈 값**을 뽑는다
#   (행이 한 줄만 밀려도 합계 행을 사업으로 읽거나 마지막 사업을 통째로 흘린다). 그래서:
#     · 시트 = 「<yy|yyyy><분야>」로 시작하는 이름을 다 모아 **가장 최신 개정본**을 고른다
#       (뒤에 6자리 날짜가 붙은 것 = 개정본 · 여럿이면 가장 큰 수 · 없으면 이름이 가장 짧은 원본).
#       운영자 260812 「260319를 최신으로 해줘」가 이 규칙의 근거이자 첫 적용례다.
#     · 행 = 머리글(`구분`)과 합계 행(`계`/`합계`)을 찾아 그 사이만 읽는다.
#   검산(행합 == 시트 합계)이 이 탐지의 안전망이다 — 범위를 잘못 잡으면 합이 안 맞아 rc=1로 멈춘다.
CAT_WORDS = [("공연", "공연"), ("전시", "전시"), ("교육", "교육")]
TOTAL_LABELS = ("계", "합계", "합 계", "총계")


# 시트가 스스로 밝히는 연도·분야 — 제목 셀 「2024 전시사업 운영 결과」 꼴(첫 5행 A~E칸).
#   ⚠ **이름보다 이걸 믿는다.** 운영자가 지난해 파일을 복사해 새 해 파일을 만들면 시트 이름만 남고 내용은 지난해다
#     (실측 260812: 2026 파일 안에 `25전시`·`25교육`이 그대로 있었고 내용도 2025였다 — 이름만 보면 2026 전시로 잘못 싣는다).
#   이름이 `원문`·`수정`처럼 연도·분야를 아예 안 밝히는 시트도 이 규칙이면 읽힌다(2024 파일이 그 꼴).
TITLE_RE = re.compile(r"(20\d\d)\s*년?\s*(공연|전시|교육)\s*사업")


def sheet_says(cells):
    for r in range(1, 6):
        for c in "ABCDE":
            m = TITLE_RE.search(txt(cells, "%s%d" % (c, r)))
            if m:
                return int(m.group(1)), m.group(2)
    return None, None


def pick_sheet(book, year, word):
    """그 해 그 분야 시트 고르기 — ① 제목이 스스로 밝힌 것 우선 ② 없으면 이름 규칙 ③ 여럿이면 개정본 최신."""
    yy = str(year)[2:]
    said, named = [], []
    for n in book:
        sy, sc = sheet_says(book[n])
        flat = n.replace(" ", "")
        rev = re.findall(r"(\d{6})", flat)
        key = (max(int(x) for x in rev) if rev else -1, 1 if "수정" in flat else 0, -len(flat), n)   # 개정 날짜 → 「수정」 표기 → 짧은 이름 순
        if sy == year and sc == word:
            said.append(key)
        elif sy is None and (flat.startswith(yy + word) or flat.startswith(str(year) + word)):
            named.append(key)   # 제목이 아무 말도 안 한 시트만 이름으로 건진다(제목이 다른 해를 밝히면 제외)
    cands = said or named
    if not cands:
        return None
    cands.sort(reverse=True)
    return cands[0][-1]   # 이름은 늘 튜플 마지막 — 정렬 키를 늘려도 안 깨진다(키를 늘렸다가 여기서 -2를 집어 KeyError 났다)


def find_row(cells, col, want, lo=1, hi=80, contains=False):
    for r in range(lo, hi + 1):
        v = txt(cells, "%s%d" % (col, r))
        if (want in v) if contains else (v == want):
            return r
    return 0


def is_total(v):
    return v.replace(" ", "") in tuple(t.replace(" ", "") for t in TOTAL_LABELS)


def block_rows(cells, head, col="B", hi=80):
    """머리글 행 다음(부머리글 1줄 건너뜀)부터 합계 행 직전까지의 데이터 행 번호 + 합계 행 번호."""
    start, data, tot = head + 2, [], 0
    for r in range(start, hi + 1):
        v = txt(cells, "%s%d" % (col, r))
        if is_total(v):
            tot = r
            break
        data.append(r)
    while data and not any(txt(cells, "%s%d" % (c, data[-1])) for c in "BCDEFGHIJKLMN"):
        data.pop()   # 꼬리 빈 행 제거
    return data, tot


# ── xlsx 읽기(stdlib only) ────────────────────────────────────────────────
def load_book(path):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si"):
            ss.append("".join(t.text or "" for t in si.iter(NS + "t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    RN = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    rmap = {r.get("Id"): r.get("Target") for r in rels.findall(RN + "Relationship")}
    RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    out = {}
    for sh in wb.find(NS + "sheets"):
        tgt = rmap[sh.get(RID)]
        if not tgt.startswith("xl/"):
            tgt = "xl/" + tgt
        out[sh.get("name")] = read_sheet(z, tgt, ss)
    return out


def read_sheet(z, target, ss):
    """{'B6': '신년음악회', ...} — 계산값(v)만. 수식은 무시(파생값은 우리가 다시 센다)."""
    cells = {}
    for row in ET.fromstring(z.read(target)).find(NS + "sheetData").findall(NS + "row"):
        for c in row.findall(NS + "c"):
            t, v = c.get("t"), c.find(NS + "v")
            isel = c.find(NS + "is")
            if t == "s" and v is not None:
                val = ss[int(v.text)]
            elif t == "inlineStr" and isel is not None:
                val = "".join(x.text or "" for x in isel.iter(NS + "t"))
            elif v is not None:
                val = v.text
            else:
                continue
            cells[c.get("r")] = val
    return cells


def txt(cells, ref):
    return re.sub(r"\s+", " ", str(cells.get(ref, "") or "")).strip()


class N(int):
    """숫자 셀 값 + **원천 상태**. `int`를 그대로 상속하므로 더하기·서식·비교는 한 글자도 안 바뀐다
       (`sum()`·`%d`·`f"{v:,}"` 전부 종전 그대로 동작) — 상태를 얹기 위해 호출부를 고칠 필요가 없다.
    ⚠ `__slots__`를 쓰지 않는다 — int 하위 타입은 빈 슬롯만 허용해서(가변 길이 타입) 붙이는 순간 TypeError다."""

    def __new__(cls, v, st):
        o = int.__new__(cls, v)
        o.st = st
        return o


_FILL = ("bud", "vou", "fee", "rev", "paid", "inv")   # 「채웠나」를 묻는 금액·인원 6칸(cnt·mon·acct는 분야마다 축이 없어 제외)


def num(cells, ref):
    """숫자 셀 → N(값, 상태). 상태 = '값'(숫자 있음) · '영'(원천이 진짜 0) · '빈'(셀 부재·'-'·에러·못 읽음).
    ⚠ 구판은 셋을 **전부 0으로 뭉갰다**. 그래서 260812 실측에서 두 가지가 동시에 터졌다:
       ① 「아직 안 적었다」와 「0원이 맞다」가 화면에서 구별되지 않았다(0인 99칸 중 진짜 미입력 72 · 정상 0 17).
          그 결과 2026 수익율이 87.8%로 떴다 — 전표실적 14건이 미입력이라 분모가 빠진 것뿐인데
          「2026이 제일 잘된 해」로 읽힌다. `2026-공연-04`는 3,639.8%가 그대로 표에 찍혔다.
       ② `'3회'`·`'1480명'`처럼 **단위가 붙은 값 20칸이 조용히 0으로 사라졌다**(float() 실패 → 0).
    그래서 여기서 상태를 갈라 두고, `mark_blank`가 행에 `blank`로 적는다. 화면은 그걸 읽어 「미입력」과 「0원」을 가른다."""
    s = str(cells.get(ref, "") or "").strip()
    if not s or s.startswith("#") or s in ("-", "—"):
        return N(0, "빈")
    body = s.replace(",", "")
    try:
        n = int(round(float(body)))
        return N(n, "영" if n == 0 else "값")
    except ValueError:
        pass
    m = re.search(r"-?\d+(?:\.\d+)?", body)   # '3회'·'1480명'·'1,480 명' — 숫자만 떼어 회수한다
    if not m:
        return N(0, "빈")
    try:
        n = int(round(float(m.group())))
    except ValueError:
        return N(0, "빈")
    # '구제' = 원본이 텍스트라 엑셀 SUM도 못 셌던 칸. 값은 살아났지만 **원천 합계 행과는 어긋난다**
    #   → `audit`이 이 표시를 보고 「합계가 틀린 게 아니라 원천이 빠뜨린 것」을 구분한다.
    return N(n, "구제")


def mark_blank(row, axis=()):
    """원천이 **빈칸이던** 칸 이름을 `blank`에 적는다 — 파생값이 아니라 원천 사실의 기록이다(그래서 저장해도 된다).
    `axis` = 그 분야 원본 시트에 **열 자체가 없는** 칸. 채울 원천이 없으므로 「미기입」이라 적지 않는다
       (적으면 담당자가 영원히 못 채우는 항목을 채우라고 재촉하는 오탐이 된다)."""
    row["blank"] = "|".join(
        k for k in _FILL if k not in axis and getattr(row.get(k), "st", "값") == "빈")
    return row


# index.html L6045 `_uName`과 **같은 정규화**(공연명 조인 축) — 한 글자도 다르면 조인이 갈린다
_UN_1 = re.compile(r"\s*[-–—]\s*여수\s*$")
_UN_2 = re.compile(r"[〈〉<>「」『』\[\]（）()]")
_UN_3 = re.compile(r"[_\-–—·.,’'\"~!:：]")


def uname(s):
    s = _UN_1.sub("", str(s or ""))
    s = _UN_2.sub("", s)
    s = _UN_3.sub("", s)
    return re.sub(r"\s+", "", s).lower()


# ── 분야별 추출 ───────────────────────────────────────────────────────────
def pull_perf(cells, year, warn):
    """공연: B구분(예술성/상업성) C사업명 D진행월 E횟수 F예산 G전표실적 I판매수수료 J정산서 M판매 N초대.
    B는 병합이라 값이 구간 첫 행에만 있다 → 마지막 값을 이어받는다."""
    head = find_row(cells, "B", "구분")
    if not head:
        warn.append("공연 시트에서 머리글(B열 '구분')을 못 찾았다")
        return []
    data, tot_r = block_rows(cells, head)
    rows, acct = [], ""
    for r in data:
        b = txt(cells, "B%d" % r).replace(" ", "")
        if b:
            acct = b
        name = txt(cells, "C%d" % r)
        if not name:
            continue
        rows.append(mark_blank(dict(
            cat="공연", acct=acct, name=name, mon=txt(cells, "D%d" % r),
            cnt=num(cells, "E%d" % r), bud=num(cells, "F%d" % r), vou=num(cells, "G%d" % r),
            fee=num(cells, "I%d" % r), rev=num(cells, "J%d" % r),
            paid=num(cells, "M%d" % r), inv=num(cells, "N%d" % r),
        )))   # 공연 시트는 6칸 축이 전부 있다 → 축 제외 없음
    audit(rows, tot_at(cells, tot_r, "FGIJMN"), "공연", warn)
    return rows


def pull_exhib(cells, year, warn):
    """전시: B사업명 C예산 D전표실적 F판매수수료 G정산서 J유료 K무료.
    ⚠ 이 시트엔 예술성/상업성 같은 회계 구분 축이 **없다** → acct는 비운다(없는 축을 창작하지 않는다)."""
    # ⚠ 전시 표가 **A열에서 시작하는 해**가 있다(2024 실측: 구분이 A · 2025는 B). 한 칸 차이를 여기서 흡수한다 —
    #   안 하면 머리글을 못 찾아 그 해 전시가 통째로 빈다(첫 판이 그랬다).
    base = "B" if find_row(cells, "B", "구분") else ("A" if find_row(cells, "A", "구분") else "")
    if not base:
        warn.append("전시 시트에서 머리글('구분')을 A·B 어느 열에서도 못 찾았다")
        return []
    sh = 0 if base == "B" else -1
    col = lambda c: chr(ord(c) + sh)
    head = find_row(cells, base, "구분")
    data, tot_r = block_rows(cells, head, col=base)
    rows = []
    for r in data:
        name = txt(cells, "%s%d" % (base, r))
        if not name:
            continue
        rows.append(mark_blank(dict(
            cat="전시", acct="", name=name, mon="", cnt=0,
            bud=num(cells, "%s%d" % (col("C"), r)), vou=num(cells, "%s%d" % (col("D"), r)),
            fee=num(cells, "%s%d" % (col("F"), r)), rev=num(cells, "%s%d" % (col("G"), r)),
            paid=num(cells, "%s%d" % (col("J"), r)), inv=num(cells, "%s%d" % (col("K"), r)),
        )))   # 전시 시트도 6칸 축이 전부 있다(회계구분·진행월·횟수만 없고, 그 셋은 애초에 `_FILL` 밖)
    audit(rows, tot_at(cells, tot_r, "".join(col(c) for c in "CDFGJK")), "전시", warn)
    return rows


def pull_edu(cells, year, warn):
    """교육: **요약표(천원)** + **세부표(원)** 두 겹.
    금액 3종(지출·판매수수료·매출)은 세부표 원 단위 합산 = 반올림 손실 0. 예산·수강인원은 요약표(×1000 / 그대로).
    ⚠ 요약표의 「… 소계」·「합 계」·「판매수수료」 행은 사업이 아니라 **롤업**이다 → 사업 행으로 담지 않는다
      (판매수수료는 사업별 fee에 이미 분배돼 있어 롤업까지 담으면 이중 계상된다).
    회계구분(acct) = 소계가 묶어주는 이름에서 읽는다(「클래스 사업비 소계」 → 그 위 행들 = `클래스`).
      소계 뒤에 남은 행들은 세부표의 구분 값을 쓴다(2025 = `공모사업`) — 없으면 비운다."""
    s_head = find_row(cells, "B", "구분")
    d_head = find_row(cells, "C", "프로그램")
    if not s_head or not d_head:
        warn.append("교육 시트에서 요약(B'구분')·세부(C'프로그램') 머리글을 못 찾았다")
        return []
    # 세부표: B구분(병합 → 이어받기) C프로그램 E실제집행 F판매수수료 G순매출
    d_data, d_tot = block_rows(cells, d_head)
    det, cur = [], ""
    for r in d_data:
        b = txt(cells, "B%d" % r)
        if b:
            cur = b
        det.append(dict(B=cur, C=txt(cells, "C%d" % r), vou=num(cells, "E%d" % r),
                        fee=num(cells, "F%d" % r), rev=num(cells, "G%d" % r)))
    # 요약표: B구분 C예산(천원) D지출(천원) F매출(천원) I수강인원 — 롤업 제외 + 소계로 회계구분 확정
    s_data, s_tot = block_rows(cells, s_head)
    rows, pend = [], []
    for r in s_data:
        name = txt(cells, "B%d" % r)
        if not name:
            continue
        if "소계" in name:                       # 롤업 — 위에 쌓인 사업들의 회계구분을 확정하고 비운다
            grp = name.replace("소계", "").replace("사업비", "").strip()
            for x in pend:
                x["acct"] = grp
            pend = []
            continue
        if name.replace(" ", "") == "판매수수료":   # 롤업(사업별 fee로 이미 분배) — 담지 않는다
            continue
        part = [d for d in det if d["B"] == name] or [d for d in det if d["C"] == name]
        vou = sum(d["vou"] for d in part)
        fee = sum(d["fee"] for d in part)
        rev = sum(d["rev"] for d in part)
        if not part:
            warn.append("교육 「%s」에 대응하는 세부표 행이 없다(원 단위 금액을 못 뽑는다)" % name)
        # 검산 ② 세부(원) ↔ 요약(천원): 반올림 1천원 이내
        for lab, a, b in (("지출", vou, num(cells, "D%d" % r) * 1000), ("매출", rev, num(cells, "F%d" % r) * 1000)):
            if abs(a - b) > 1000:
                warn.append("교육 %s %s 세부합 %s ≠ 요약 %s (Δ%s)" % (name, lab, f"{a:,}", f"{b:,}", f"{a-b:,}"))
        # 세부표 대응 행이 없으면 금액 3종은 「0원」이 아니라 **못 읽은 것**이다 → N(0,'빈')으로 적어 화면이 가릴 수 있게 한다.
        #   (구판은 sum()의 결과 0을 그대로 담아 「0원인 사업」처럼 보이게 했다.)
        st3 = "값" if part else "빈"
        row = dict(cat="교육", acct=(part[0]["B"] if part and part[0]["B"] != name else ""), name=name,
                   mon="", cnt=0, bud=N(num(cells, "C%d" % r) * 1000, num(cells, "C%d" % r).st),
                   vou=N(vou, st3), fee=N(fee, st3), rev=N(rev, st3),
                   paid=num(cells, "I%d" % r), inv=N(0, "빈"))
        mark_blank(row, axis=("inv",))   # ⚠ 교육 원본 시트엔 **초대인원 열 자체가 없다** → 미기입이 아니라 「해당 없음」
        rows.append(row)
        pend.append(row)
    # 합계 = **세부표(원)** 쪽을 기준으로 검산한다(요약은 천원 반올림이라 원 단위 행합과 애초에 안 맞는다).
    #   예산·초대는 대응 합계 칸이 없어 None = 검산 건너뜀.
    tot = tot_at(cells, d_tot, ".EFG..")
    tot = dict(bud=None, vou=tot["vou"], fee=tot["fee"], rev=tot["rev"],
               paid=num(cells, "I%d" % s_tot) if s_tot else None, inv=None)
    audit(rows, tot, "교육", warn)
    return rows


def tot_at(cells, row, cols):
    """합계 행의 6칸(예산·전표실적·판매수수료·매출·유료·초대)을 열 문자로 읽는다. '.' = 그 시트에 없는 칸."""
    keys = ("bud", "vou", "fee", "rev", "paid", "inv")
    if not row:
        return dict((k, None) for k in keys)
    return dict((k, None if c == "." else num(cells, "%s%d" % (c, row))) for k, c in zip(keys, cols))


# ══ [260813 운영자] 「정산서 매출」 별도 파일 반입 ═══════════════════════════════════════════
#   운영자: 「이 내용이 가장 최신 매출 관련 지표야 이거 반영해주면 됨」(`<연도>년 기획사업 정산서 매출.xlsx`)
#   대시보드 파일과 **모양이 다르다** — 시트 한 장(`매출`)에 `구분 · 제목 · 정산서 일정 · 금액`뿐이다.
#   ⚠ **이름으로 자동 매칭하지 않는다.** 260813 실측에서 자동 매칭이 두 건을 틀리게 붙였다:
#        「2026 어린이 뮤지컬<100층짜리 집>」 → 뮤지컬1(미세스 다웃파이어)   ← 완전히 다른 공연
#        브런치콘서트 2회차가 둘 다 한 줄에 쏠림
#      돈을 옮기는 일이라 「그럴듯한 추측」이 틀리면 사업 하나의 매출이 통째로 뒤바뀐다.
#      그래서 **사람이 읽고 고칠 수 있는 명시 대응표**를 둔다(아래). 표에 없는 줄은 조용히 버리지 않고
#      **새 사업으로 추가**하거나 경고로 알린다.
SETTLE_FILE_RE = re.compile(r"(20\d\d)\s*년?\s*기획사업\s*정산서\s*매출")

# 제목에 이 낱말이 있으면 그 사업NO로 간다(한 NO에 여러 줄이 붙으면 **합산**한다 — 브런치콘서트 2회차 같은 경우).
#   낱말은 제목에서 그 사업만 골라내는 가장 짧은 조각으로 고른다(길면 표기가 조금만 바뀌어도 안 붙는다).
SETTLE_MAP = {
    2026: [
        ("신년음악회", "2026-공연-01"),
        ("실내악", "2026-공연-02"),
        ("김영욱", "2026-공연-03"),          # 공모사업(김영욱,춘자씨,그때도오늘)
        ("한국페스티발앙상블", "2026-공연-04"),
        ("국립심포니", "2026-공연-05"),
        ("노인의 꿈", "2026-공연-06"),
        ("헬로", "2026-공연-07"),            # 헬로!오페라 <세비야의 이발사> = 씨앗 「헬로시리즈」
        ("미세스 다웃파이어", "2026-공연-14"),
        ("브런치콘서트", "2026-공연-15"),      # 4월·6월 2회차 → 한 사업에 합산
        ("100층짜리", "2026-공연-16"),
    ],
}
# 표에 없는 줄 = 씨앗에 그 사업이 아예 없는 것(2026 전시·교육). **새 사업으로 세운다.**
#   금액 말고는 원본에 없으므로 나머지 칸은 전부 `빈`으로 둔다 = 화면이 「미기입」으로 정직하게 말한다.
SETTLE_NEW_CAT = {"기획전시": "전시", "기획교육": "교육", "기획공연": "공연"}


# ══ [260813 운영자] 사업명 = **이미 저장된 공연명**으로 교체 ═══════════════════════════════
#   지시: 「지금 이미 저장된 공연명으로 최대한 매칭시켜서 바꿔봐 사업명을」 + 운영자가 준 이름 목록.
#   왜 여기냐: `data/biz_finance.js`는 기계산출물이라 손으로 못 고친다 — 값을 바꾸려면 이 빌더를 고친다.
#   ⚠ **이름으로 자동 매칭하지 않는다**(SETTLE_MAP과 같은 이유) — 260813 실측에서 자동 매칭이
#     「100층짜리 집」을 「미세스 다웃파이어」에 붙였다. 사람이 읽고 고칠 수 있는 사업NO 대응표로만 간다.
#   ⚠ 사업NO는 **안 바뀐다** — 이름이 바뀌어도 `prev_ids()`의 alias(그 NO가 가졌던 옛 키)가 NO를 붙잡는다.
#     재빌드 로그의 「NO 재사용 N건 / 신규 0건」이 그 실증이다.
NAME_MAP = {
    2026: {
        "2026-공연-01": "2026 신년음악회",
        "2026-공연-02": "2026 실내악 페스티벌",
        #   ⚠ 괄호를 안 쓴다 — 화면(`_finNamePair`)이 괄호 안을 공연명으로 읽어 「김영욱, 춘자씨」만 떴다.
        #     운영자 표기 「김영욱, 춘자씨 > 2026 공모사업」의 화살표 오른쪽이 사업명이다.
        "2026-공연-03": "2026 공모사업",
        "2026-공연-06": "연극 <노인의 꿈>",
        "2026-공연-07": "2026 헬로!오페라",
        "2026-공연-08": "조재혁 피아노 리사이틀",
        "2026-공연-09": "국립현대무용단 <트리플 빌>",
        # ⚠ 「다비드 바뱅 & 아드리앙 몽도 <피아노 피아노>」는 씨앗에 **두 줄**이 걸린다
        #   (`2026-공연-10 피아노&피아노` · `2026-공연-11 클래식4(피아노&피아노)`) — 둘 다 10월·예술성.
        #   운영자 목록엔 한 줄뿐이라 **`클래식4` 묶음을 단 공연-11**을 택했다(다른 클래식1~3이 전부
        #   실제 공연 한 편씩을 달고 있어 그 계열이 맞다). 공연-10은 이름을 안 건드리고 남긴다
        #   = 중복인지 별개 공연인지는 원본을 아는 사람이 정할 일이라, 추측으로 지우지 않는다.
        "2026-공연-11": "다비드 바뱅 & 아드리앙 몽도 <피아노 피아노>",
    },
}


def apply_names(rows, year, warn):
    """사업명을 운영자 확정 이름으로 바꾼다. 반환 = 바뀐 건수."""
    table = NAME_MAP.get(year) or {}
    if not table:
        return 0
    by_no = {r.get("no"): r for r in rows if r.get("no")}
    n = 0
    for no, nm in sorted(table.items()):
        r = by_no.get(no)
        if r is None:
            warn.append("사업명 대응표의 `%s`가 %d년 씨앗에 없다 — 표를 고쳐라(사업이 지워졌거나 NO가 바뀌었다)" % (no, year))
            continue
        if r["name"] == nm:
            continue
        # ⚠ 이름을 바꾸기 **전에** 원본의 묶음 이름(괄호 앞 「클래식3」·「연극2」…)을 `tag`로 남긴다.
        #   화면 비고 열이 그걸 쓰는데, 새 이름엔 괄호가 없어(`연극 <노인의 꿈>`) 그냥 바꾸면 비고가
        #   회계구분(예술성)으로 주저앉는다 = 운영자가 「비고에 클래식2, 아동극1」이라고 정한 축이 사라진다.
        #   ⚠ 원본에 괄호가 **없던** 행은 남기지 않는다 — 사업명을 통째로 비고에 복사하게 되고,
        #     그건 「묶음 이름」이 아니다(첫 판에서 공연-01 비고가 「신년음악회」가 됐다). 그 행은 종전대로 회계구분이 선다.
        m = re.match(r"^([^(（]*)[(（][^)）]*[)）]\s*$", str(r["name"]).strip())
        tg = (m.group(1).strip() if m else "")
        if tg:
            r["tag"] = tg
        print("[사업비] %d년 사업명 %s %-28s → %-34s (비고 %s)" % (year, no, str(r["name"])[:28], nm, tg))
        r["name"] = nm
        n += 1
    return n


def pull_settle(cells, year, warn):
    """`매출` 시트 → [(구분, 제목, 금액)]. 합계·주석 줄은 건너뛴다."""
    out = []
    r = 1
    blanks = 0
    while blanks < 6:
        r += 1
        cat = txt(cells, "A%d" % r)
        if not cat:
            blanks += 1
            continue
        blanks = 0
        if cat.startswith("※") or "합" in cat.replace(" ", "")[:2]:
            continue
        if cat not in SETTLE_NEW_CAT:
            continue
        title = txt(cells, "B%d" % r)
        amt = num(cells, "D%d" % r)
        if not title or amt.st == "빈":
            continue
        out.append((cat, title, int(amt)))
    return out


def settle_split(lines, year):
    """정산서 줄들을 「대응표에 있는 것(NO별 합산)」과 「없는 것」으로 가른다."""
    table = SETTLE_MAP.get(year, [])
    hit, unmapped = {}, []
    for cat, title, amt in lines:
        no = next((n for kw, n in table if kw in title), None)
        if no:
            hit[no] = hit.get(no, 0) + amt   # 한 사업에 회차가 여럿이면 합산(브런치콘서트 4월·6월)
        else:
            unmapped.append((cat, title, amt))
    return hit, unmapped


def settle_new_rows(unmapped, year):
    """대응표에 없는 줄 = 씨앗에 아예 없는 사업. **새로 세운다**(금액만 있고 나머지는 전부 미기입).
    ⚠ NO 배정 **전에** 불러야 이 행들도 같은 규칙으로 NO를 받는다."""
    fresh = []
    for cat, title, amt in unmapped:
        c = SETTLE_NEW_CAT[cat]
        row = dict(cat=c, acct="", name=re.sub(r"\s+", " ", title).strip(), mon="", cnt=0,
                   bud=N(0, "빈"), vou=N(0, "빈"), fee=N(0, "빈"), rev=N(amt, "값"),
                   paid=N(0, "빈"), inv=N(0, "빈"))
        mark_blank(row, axis=("inv",) if c == "교육" else ())
        fresh.append(row)
        print("[사업비] %d년 정산서 매출 신규 %s %-30s %s" % (year, c, row["name"][:30], f"{amt:,}"))
    return fresh


def settle_apply_rev(rows, hit, year, warn):
    """대응표에 있는 사업의 매출을 **덮어쓴다**(운영자 「가장 최신 매출 관련 지표」).
    ⚠ NO 배정 **뒤에** 불러야 한다 — 그 전엔 행에 `no`가 없어 짝을 못 찾는다."""
    by_no = {r.get("no"): r for r in rows if r.get("no")}
    for no, amt in sorted(hit.items()):
        r = by_no.get(no)
        if r is None:
            warn.append("정산서 매출 대응표의 `%s`가 %d년 씨앗에 없다 — 표를 고쳐라(사업이 지워졌거나 NO가 바뀌었다)" % (no, year))
            continue
        old = int(r.get("rev") or 0)
        if old != amt:
            print("[사업비] %d년 정산서 매출 갱신 %s %-24s %14s → %s"
                  % (year, no, str(r.get("name"))[:24], f"{old:,}", f"{amt:,}"))
        r["rev"] = N(amt, "값")
        mark_blank(r, axis=("inv",) if r.get("cat") == "교육" else ())


def audit(rows, tot, cat, warn):
    """검산 ① 행 합 == 시트 합계 행. tot의 None 칸은 원본에 대응 합계가 없다는 뜻 = 건너뛴다.

    ⚠ 260812 실측으로 알게 된 예외 하나 — **엑셀 합계 행이 틀린 경우가 있다.**
       원본에 `'1480명'`처럼 단위가 붙어 텍스트로 들어간 셀이 있으면 엑셀 `SUM()`은 그 칸을 **건너뛴다**.
       구판 빌더도 같이 못 읽어서(float() 실패 → 0) 양쪽이 똑같이 틀린 채 검산을 통과했다.
       이제 빌더는 숫자를 회수하므로 행합이 시트 합계보다 커진다 — 이건 우리가 틀린 게 아니라
       **원천 합계가 빠뜨린 것**이다. 차이가 회수분으로 정확히 설명되면 실패가 아니라 경고로 남긴다
       (덮지 않는다 · 설명이 안 되는 차이는 종전대로 하드 실패)."""
    for k, lab in (("bud", "예산"), ("vou", "전표실적"), ("fee", "판매수수료"),
                   ("rev", "매출"), ("paid", "유료인원"), ("inv", "초대인원")):
        if tot.get(k) is None:
            continue
        got = sum(r[k] for r in rows)
        if got != tot[k]:
            # 회수분 = 숫자로 못 읽히던 셀에서 되찾은 값(엑셀 SUM이 셈에서 뺀 바로 그 칸들)
            saved = [(r["name"], int(r[k])) for r in rows if getattr(r.get(k), "st", "") == "구제"]
            if saved and got - tot[k] == sum(v for _, v in saved):
                warn.append(
                    "ℹ %s %s — 원천 합계가 %s인데 행합은 %s. 차이 %s = 엑셀 SUM이 못 읽은 텍스트 셀 %d칸(%s). "
                    "빌더가 그 값을 회수했으므로 **행합 쪽이 맞다**." % (
                        cat, lab, f"{int(tot[k]):,}", f"{int(got):,}", f"{int(got - tot[k]):,}",
                        len(saved), " · ".join("%s %s" % (n, f"{v:,}") for n, v in saved)))
                continue
            warn.append("%s %s 행합 %s ≠ 시트 합계 %s (Δ%s)" % (cat, lab, f"{got:,}", f"{tot[k]:,}", f"{got-tot[k]:,}"))


# ── 산출 ─────────────────────────────────────────────────────────────────
def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def built_at():
    """씨앗 생성 시각(KST · 분까지). 앱의 `_finStamp()`와 **같은 문자열 꼴**이라 그대로 비교·정렬된다."""
    import datetime
    kst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(tz=kst).strftime("%Y-%m-%d %H:%M")


def emit(years, srcs, warn):
    lines = [
        "// [기계산출물 — 손편집 금지] tools/build_biz_finance.py가 「<연도>년 예술사업 대시보드.xlsx」(운영자 업로드)에서 생성.",
        "//   값 수정 = 원본 xlsx 교체 후 `python3 tools/build_biz_finance.py` 재실행. 이 파일을 손으로 고치지 마라.",
        "//   ⚠ 이건 **씨앗(seed) + 폴백**이다. 정본은 시트 `운영_사업비` — 같은 (연도, 사업NO) 행이 시트에 있으면",
        "//     시트가 이긴다(index.html `_finIdx`). 담당자가 앱에서 고친 값을 이 파일이 되돌리는 일은 없다.",
        "// 단위 = **원**(정수). 25교육 요약표는 원본이 천원이라 빌더가 세부표(원)에서 합산·환산했다.",
        "// 파생값(차액·수익율·계·비율)은 담지 않는다 — 화면이 센다: 차액=rev-vou · 수익율=rev/(vou+fee)*100 · 계=paid+inv.",
        "// 필드: no 사업NO(고유 인덱스) · cat 분야 · acct 회계구분(거르기 축) · name 사업명 · key 조인키(_uName)",
        "//       mon 진행월 · cnt 횟수 · bud 예산 · vou 전표실적(a) · fee 판매수수료 · rev 정산서매출(b) · paid 유료 · inv 초대",
        "//       blank 원천이 **빈칸이던** 칸 이름(`|` 구분) — 파생값이 아니라 원천 사실이라 담는다.",
        "//       tag 원본 사업명의 묶음 이름(「클래식3」·「연극2」…) — 사업명을 운영자 확정 공연명으로 바꿔도",
        "//         화면 **비고** 열이 그걸 계속 쓸 수 있게 남긴다(이름 교체가 있던 행에만 있다).",
        "//         이게 없으면 「아직 안 적었다(0)」와 「0원이 맞다」가 화면에서 같아진다. 실측 260812 = 0인 99칸 중",
        "//         진짜 미입력 72 · 담당자가 적은 0 17 · 원천에 열 없음 9 · 못 읽음 1. 분야에 열 자체가 없는 칸은",
        "//         「해당 없음」이라 여기 안 적는다(교육 inv). 화면 판정 = index.html `_finBlank`.",
        "// built = 이 씨앗을 만든 시각(KST). 화면 「(YYYY. M. D. 기준)」의 **폴백**이다 —",
        "//   시트에 `수정일시`가 있는 행이 하나라도 있으면 그쪽(담당자가 실제로 건드린 시각)이 이긴다(`_finAsOf`).",
        "//   ⚠ 오늘 날짜를 화면이 스스로 찍으면 안 된다 — 데이터가 반년째 그대로여도 늘 「오늘 기준」이라 거짓이 된다.",
        "var BIZ_FIN={ver:1,unit:'원',built:%s,years:{" % js_str(built_at()),
    ]
    ykeys = sorted(years.keys())
    for yi, y in enumerate(ykeys):
        lines.append(" %d:{src:%s,rows:[" % (y, js_str(srcs[y])))
        for r in years[y]:
            lines.append(
                "  {no:%s,cat:%s,acct:%s,name:%s,key:%s,mon:%s,cnt:%d,bud:%d,vou:%d,fee:%d,rev:%d,paid:%d,inv:%d,blank:%s,tag:%s},"
                % (js_str(r["no"]), js_str(r["cat"]), js_str(r["acct"]), js_str(r["name"]),
                   js_str(r["key"]), js_str(r["mon"]), r["cnt"], r["bud"], r["vou"], r["fee"],
                   r["rev"], r["paid"], r["inv"], js_str(r.get("blank", "")), js_str(r.get("tag", ""))))
        lines[-1] = lines[-1].rstrip(",")
        lines.append(" ]}%s" % ("," if yi < len(ykeys) - 1 else ""))
    lines.append("}};")
    return "\n".join(lines) + "\n"


def prev_ids():
    """이전 산출물에서 (연도, 조인키) → 사업NO 지도와 연도·분야별 최대 순번을 읽는다.

    파일을 실행하지 않고 **정규식으로** 필요한 세 필드만 뽑는다(신뢰 경계 축소 · 손상 파일이면 그냥 빈 지도).
    이름이 바뀐 사업도 잃지 않게 `alias`(그 NO가 지금까지 가졌던 모든 키)도 같이 모은다.
    """
    ids, used, alias = {}, {}, {}
    if not os.path.exists(OUT):
        return ids, used, alias
    try:
        src = open(OUT, encoding="utf-8").read()
    except OSError:
        return ids, used, alias
    cur = None
    for line in src.split("\n"):
        m = re.match(r"\s*(20\d\d):\{", line)
        if m:
            cur = int(m.group(1))
            continue
        m = re.search(r'\{no:"([^"]+)".*?key:"([^"]*)"', line)
        if not m or cur is None:
            continue
        no, key = m.group(1), m.group(2)
        ids[(cur, key)] = no
        alias.setdefault(no, set()).add(key)
        s = re.match(r"^(20\d\d)-(.+)-(\d+)$", no)
        if s:
            k = (int(s.group(1)), s.group(2))
            used[k] = max(used.get(k, 0), int(s.group(3)))
    return ids, used, alias


def main(argv):
    paths = argv[1:] or sorted(glob.glob(os.path.join(ROOT, "*예술사업 대시보드*.xlsx")))
    if not paths:
        print("[사업비] 원본 xlsx를 못 찾았다 — 레포 최상단에 「<연도>년 예술사업 대시보드.xlsx」를 두거나 경로를 인자로 줘라")
        return 1
    # [260813] 정산서 매출 파일은 **대시보드와 따로** 모은다 — 모양이 달라 같은 파서로 못 읽는다.
    settle_books = {}
    for _sp in sorted(glob.glob(os.path.join(ROOT, "*기획사업 정산서 매출*.xlsx"))):
        _sm = SETTLE_FILE_RE.search(os.path.basename(_sp)) or re.search(r"(20\d\d)", os.path.basename(_sp))
        if _sm:
            settle_books.setdefault(int(_sm.group(1)), []).append(_sp)
    old_ids, old_used, old_alias = prev_ids()
    years, srcs, warn = {}, {}, []
    # [260812-6] **한 해에 파일이 여러 개**일 수 있다(실측: 2024가 공연·전시 두 파일로 왔다).
    #   같은 연도 파일들의 시트를 한 책으로 합친다 — 시트 이름이 겹치면 파일 순서로 접미를 붙여 둘 다 살린다
    #   (둘 다 `원문`이었다 · 어느 쪽이 어느 분야인지는 아래 제목 셀 판정이 가른다).
    books_by_year = {}
    for _p in paths:
        _m = re.search(r"(20\d\d)", os.path.basename(_p))
        if not _m:
            continue
        _y = int(_m.group(1))
        _bk = books_by_year.setdefault(_y, {})
        for _n, _c in load_book(_p).items():
            _k = _n if _n not in _bk else ("%s#%d" % (_n, len(_bk)))
            _bk[_k] = _c
    for p in paths:
        m = re.search(r"(20\d\d)", os.path.basename(p))
        if not m:
            warn.append("파일명에서 연도를 못 읽었다: %s" % os.path.basename(p))
            continue
        year = int(m.group(1))
        book = books_by_year.pop(year, None)
        if book is None:
            continue   # 이미 합쳐 처리한 해
        rows, used = [], {}
        for label, word in CAT_WORDS:
            nm = pick_sheet(book, year, word)
            if not nm:
                print("[사업비] %d년 %s 자료 없음 — 건너뜀(그 해 그 분야는 화면에서 빈 칸으로 나온다)" % (year, label))
                continue
            used[label] = nm
            rows += {"공연": pull_perf, "전시": pull_exhib, "교육": pull_edu}[label](book[nm], year, warn)
            if label == "공연":
                for alt in [n for n in book if n != nm and n.replace(" ", "").startswith((str(year)[2:] + word, str(year) + word))]:
                    diff_log(book[nm], book[alt], nm, alt)
        # ── [260813] 정산서 매출 반입 — 별도 파일(`<연도>년 기획사업 정산서 매출.xlsx`)이 있으면 얹는다 ──
        #   대시보드 파일보다 **나중에** 온 최신 실적이라 여기서 덮는다(운영자 「가장 최신 매출 관련 지표」).
        #   ⚠ NO 배정 **앞**에서 얹어야 새로 세운 전시·교육 사업도 같은 규칙으로 NO를 받는다.
        _settle_hit = {}
        for _sf in sorted(settle_books.get(year, [])):
            _sb = load_book(_sf)
            _sheet = next((n for n in _sb if "매출" in n), None)
            if not _sheet:
                warn.append("%d년 정산서 매출 파일에 `매출` 시트가 없다: %s" % (year, os.path.basename(_sf)))
                continue
            _h, _un = settle_split(pull_settle(_sb[_sheet], year, warn), year)
            for _k, _v in _h.items():
                _settle_hit[_k] = _settle_hit.get(_k, 0) + _v
            rows += settle_new_rows(_un, year)   # NO 배정 **전** — 새 사업도 같은 규칙으로 번호를 받는다
            used["정산서매출"] = os.path.basename(_sf)

        # ── 사업NO 배정 = 정체성 고정(재빌드·중간 삽입에도 안 밀린다) ────────────────────
        for r in rows:
            r["key"] = uname(r["name"])
        taken, reused = set(), 0
        for r in rows:   # ① 이전 산출물에 같은 (연도, 조인키)가 있으면 **그 NO 그대로**
            no = old_ids.get((year, r["key"]))
            if no and no not in taken:
                r["no"] = no
                taken.add(no)
                reused += 1
        seq = {}
        for r in rows:   # ② 처음 보는 사업만 그 연도·분야의 **남는 다음 번호**(이전 최대치 뒤에서 이어붙인다)
            if r.get("no"):
                continue
            c = r["cat"]
            n = seq.get(c, old_used.get((year, c), 0))
            while True:
                n += 1
                cand = "%d-%s-%02d" % (year, c, n)
                if cand not in taken:
                    break
            seq[c] = n
            r["no"] = cand
            taken.add(cand)
        # ③ 이전에 있었는데 이번 원본에 안 나타난 NO = 사업명이 바뀌었거나 빠진 것. **자동으로 이어붙이지 않는다** —
        #    개명 추정은 틀리면 담당자가 고친 값을 엉뚱한 사업에 붙이므로, 여기선 알리기만 하고 사람이 판단한다.
        gone = sorted(no for (y, k), no in old_ids.items() if y == year and no not in taken)
        if gone:
            print("[사업비] ⚠ %d년 — 이전 산출물에 있던 NO %d건이 이번 원본에 없다(개명·삭제 추정): %s"
                  % (year, len(gone), ", ".join(gone)))
            print("        시트(운영_사업비)에 이 NO의 담당자 수정본이 있으면 고아가 된다 — 사업명을 되돌리거나 앱에서 옮겨라.")
        if reused:
            print("[사업비] %d년 NO 재사용 %d건 / 신규 %d건 (재빌드해도 시트 행과 안 어긋난다)"
                  % (year, reused, len(rows) - reused))
        if _settle_hit:
            settle_apply_rev(rows, _settle_hit, year, warn)   # NO 배정 **뒤** — 그 전엔 행에 no가 없다
        # 사업명 교체도 NO 배정 뒤 — 대응표가 사업NO를 쓴다.
        # ⚠ **조인키(`key`)는 다시 세지 않는다.** 키는 원본 엑셀 이름에서 나온 값이고, 그게 곧
        #   「이 사업이 누구인가」의 지문이다(`prev_ids()`가 (연도, 키)로 NO를 붙잡는다).
        #   바꾼 이름으로 키를 다시 세면, 다음 재빌드가 **엑셀의 옛 이름**과 못 이어 NO를 새로 매긴다
        #   = 시트에 저장된 담당자 수정본이 통째로 고아가 된다(260813 실측: 8건 전부 새 번호를 받았다).
        #   표시 이름과 조인키가 갈리는 건 의도된 것이다 — 키는 사람이 보는 값이 아니다.
        apply_names(rows, year, warn)
        years[year], srcs[year] = rows, used
        print("[사업비] %d년 %d행 — %s" % (year, len(rows), " · ".join("%s=%s" % kv for kv in used.items())))
        for cat in ("공연", "전시", "교육"):
            g = [r for r in rows if r["cat"] == cat]
            if g:
                print("   %s %2d건  전표실적 %15s  판매수수료 %12s  매출 %15s"
                      % (cat, len(g), f'{sum(r["vou"] for r in g):,}', f'{sum(r["fee"] for r in g):,}',
                         f'{sum(r["rev"] for r in g):,}'))
        # 검산 ③ 사업NO 중복 · 빈 이름 · 조인키 중복(한 해에 같은 키가 둘이면 공연↔사업비 링크가 갈린다)
        nos = [r["no"] for r in rows]
        if len(set(nos)) != len(nos):
            warn.append("%d년 사업NO 중복" % year)
        if any(not r["name"] for r in rows):
            warn.append("%d년 빈 사업명" % year)
        keys = [r["key"] for r in rows]
        dup = sorted(set(k for k in keys if keys.count(k) > 1))
        if dup:
            warn.append("%d년 조인키 중복 %d건 — 같은 이름 두 사업은 링크가 갈린다: %s" % (year, len(dup), ", ".join(dup)))
        # 검산 ④ NO 안정성 — 이전 산출물의 (연도, 키)가 다른 NO로 바뀌지 않았나
        moved = [(k, no, old_ids[(year, k)]) for k, no in ((r["key"], r["no"]) for r in rows)
                 if (year, k) in old_ids and old_ids[(year, k)] != no]
        if moved:
            warn.append("%d년 사업NO가 바뀐 사업 %d건(시트 행 어긋남 위험): %s"
                        % (year, len(moved), ", ".join("%s %s→%s" % (k, o, n) for k, n, o in moved)))
    if not years:
        print("[사업비] 담을 연도가 없다")
        return 1
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(emit(years, srcs, warn))
    print("[사업비] → %s" % os.path.relpath(OUT, ROOT))
    # `ℹ` 머리표 = 실패가 아니라 **알림**(원천이 틀렸고 빌더가 바로잡은 자리). 덮지 않고 매 빌드 출력하되 rc는 0.
    notes = [w for w in warn if w.startswith("ℹ ")]
    bad = [w for w in warn if not w.startswith("ℹ ")]
    for n in notes:
        print("   " + n)
    if bad:
        print("\n[사업비] ❌ 검산 실패 %d건" % len(bad))
        for w in bad:
            print("   · " + w)
        return 1
    print("[사업비] ✅ 검산 통과(행합 == 시트 합계 · 교육 세부↔요약 일치 · NO 중복 0%s)"
          % (" · 원천 합계 정정 %d건" % len(notes) if notes else ""))
    return 0


def diff_log(a, b, na, nb):
    """공연 시트가 여러 벌일 때 정본↔구본의 차이 — 정본을 고른 근거를 빌드 로그에 남긴다(값은 정본만 담는다).
    사업명(C열)으로 짝을 짓는다 — 두 벌의 행 번호가 다를 수 있어 같은 행끼리 비교하면 엉뚱한 차이가 난다."""
    head_a, head_b = find_row(a, "B", "구분"), find_row(b, "B", "구분")
    if not head_a or not head_b:
        return
    bmap = {}
    for r in block_rows(b, head_b)[0]:
        nm = txt(b, "C%d" % r)
        if nm:
            bmap[nm] = r
    hits = []
    for r in block_rows(a, head_a)[0]:
        nm = txt(a, "C%d" % r)
        if not nm or nm not in bmap:
            continue
        rb = bmap[nm]
        for col, lab in (("G", "전표실적"), ("I", "판매수수료"), ("J", "매출")):
            va, vb = num(a, "%s%d" % (col, r)), num(b, "%s%d" % (col, rb))
            if va != vb:
                hits.append("%s %s %s → %s" % (nm, lab, f"{vb:,}", f"{va:,}"))
    if hits:
        print("[사업비] 공연 시트 2벌 차이 — 정본 「%s」 채택(구본 「%s」 미반입) · %d건" % (na, nb, len(hits)))
        for h in hits:
            print("   · " + h)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
