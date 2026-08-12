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


def pick_sheet(book, year, word):
    yy = str(year)[2:]
    cands = []
    for n in book:
        flat = n.replace(" ", "")
        if not (flat.startswith(yy + word) or flat.startswith(str(year) + word)):
            continue
        rev = re.findall(r"(\d{6})", flat[len(yy) + len(word):])
        cands.append((max(int(x) for x in rev) if rev else -1, -len(flat), n))
    if not cands:
        return None
    cands.sort(reverse=True)   # 개정 날짜 큰 것 → 없으면 이름 짧은 것
    return cands[0][2]


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


def num(cells, ref):
    """숫자 셀 → int(원). 빈칸·'-'·에러값(#DIV/0!)은 0."""
    s = str(cells.get(ref, "") or "").strip()
    if not s or s.startswith("#") or s in ("-", "—"):
        return 0
    try:
        return int(round(float(s)))
    except ValueError:
        return 0


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
        rows.append(dict(
            cat="공연", acct=acct, name=name, mon=txt(cells, "D%d" % r),
            cnt=num(cells, "E%d" % r), bud=num(cells, "F%d" % r), vou=num(cells, "G%d" % r),
            fee=num(cells, "I%d" % r), rev=num(cells, "J%d" % r),
            paid=num(cells, "M%d" % r), inv=num(cells, "N%d" % r),
        ))
    audit(rows, tot_at(cells, tot_r, "FGIJMN"), "공연", warn)
    return rows


def pull_exhib(cells, year, warn):
    """전시: B사업명 C예산 D전표실적 F판매수수료 G정산서 J유료 K무료.
    ⚠ 이 시트엔 예술성/상업성 같은 회계 구분 축이 **없다** → acct는 비운다(없는 축을 창작하지 않는다)."""
    head = find_row(cells, "B", "구분")
    if not head:
        warn.append("전시 시트에서 머리글(B열 '구분')을 못 찾았다")
        return []
    data, tot_r = block_rows(cells, head)
    rows = []
    for r in data:
        name = txt(cells, "B%d" % r)
        if not name:
            continue
        rows.append(dict(
            cat="전시", acct="", name=name, mon="", cnt=0,
            bud=num(cells, "C%d" % r), vou=num(cells, "D%d" % r), fee=num(cells, "F%d" % r),
            rev=num(cells, "G%d" % r), paid=num(cells, "J%d" % r), inv=num(cells, "K%d" % r),
        ))
    audit(rows, tot_at(cells, tot_r, "CDFGJK"), "전시", warn)
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
        row = dict(cat="교육", acct=(part[0]["B"] if part and part[0]["B"] != name else ""), name=name,
                   mon="", cnt=0, bud=num(cells, "C%d" % r) * 1000, vou=vou, fee=fee, rev=rev,
                   paid=num(cells, "I%d" % r), inv=0)
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


def audit(rows, tot, cat, warn):
    """검산 ① 행 합 == 시트 합계 행. tot의 None 칸은 원본에 대응 합계가 없다는 뜻 = 건너뛴다."""
    for k, lab in (("bud", "예산"), ("vou", "전표실적"), ("fee", "판매수수료"),
                   ("rev", "매출"), ("paid", "유료인원"), ("inv", "초대인원")):
        if tot.get(k) is None:
            continue
        got = sum(r[k] for r in rows)
        if got != tot[k]:
            warn.append("%s %s 행합 %s ≠ 시트 합계 %s (Δ%s)" % (cat, lab, f"{got:,}", f"{tot[k]:,}", f"{got-tot[k]:,}"))


# ── 산출 ─────────────────────────────────────────────────────────────────
def js_str(s):
    return json.dumps(s, ensure_ascii=False)


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
        "var BIZ_FIN={ver:1,unit:'원',years:{",
    ]
    ykeys = sorted(years.keys())
    for yi, y in enumerate(ykeys):
        lines.append(" %d:{src:%s,rows:[" % (y, js_str(srcs[y])))
        for r in years[y]:
            lines.append(
                "  {no:%s,cat:%s,acct:%s,name:%s,key:%s,mon:%s,cnt:%d,bud:%d,vou:%d,fee:%d,rev:%d,paid:%d,inv:%d},"
                % (js_str(r["no"]), js_str(r["cat"]), js_str(r["acct"]), js_str(r["name"]),
                   js_str(r["key"]), js_str(r["mon"]), r["cnt"], r["bud"], r["vou"], r["fee"],
                   r["rev"], r["paid"], r["inv"]))
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
    paths = argv[1:] or sorted(glob.glob(os.path.join(ROOT, "*년 예술사업 대시보드.xlsx")))
    if not paths:
        print("[사업비] 원본 xlsx를 못 찾았다 — 레포 최상단에 「<연도>년 예술사업 대시보드.xlsx」를 두거나 경로를 인자로 줘라")
        return 1
    old_ids, old_used, old_alias = prev_ids()
    years, srcs, warn = {}, {}, []
    for p in paths:
        m = re.search(r"(20\d\d)", os.path.basename(p))
        if not m:
            warn.append("파일명에서 연도를 못 읽었다: %s" % os.path.basename(p))
            continue
        year, book = int(m.group(1)), load_book(p)
        rows, used = [], {}
        for label, word in CAT_WORDS:
            nm = pick_sheet(book, year, word)
            if not nm:
                warn.append("%d년 %s 시트를 못 찾았다(이름이 「%s%s…」로 시작해야 한다)" % (year, label, str(year)[2:], word))
                continue
            used[label] = nm
            rows += {"공연": pull_perf, "전시": pull_exhib, "교육": pull_edu}[label](book[nm], year, warn)
            if label == "공연":
                for alt in [n for n in book if n != nm and n.replace(" ", "").startswith((str(year)[2:] + word, str(year) + word))]:
                    diff_log(book[nm], book[alt], nm, alt)
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
    if warn:
        print("\n[사업비] ❌ 검산 실패 %d건" % len(warn))
        for w in warn:
            print("   · " + w)
        return 1
    print("[사업비] ✅ 검산 통과(행합 == 시트 합계 · 교육 세부↔요약 일치 · NO 중복 0)")
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
