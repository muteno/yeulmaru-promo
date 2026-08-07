# -*- coding: utf-8 -*-
"""보도자료 워드(.docx) 조립기 — 콘텐츠 제작 ▸ 보도자료 만들기의 산출 엔진.

들어오는 것 = LLM이 쓴 구조화 텍스트(아래 「입력 문법」) + 앱에서 채운 사진(base64).
나가는 것  = A4 워드 문서 한 벌.

서식 정본 = 260705 GS칼텍스 예울마루 하반기 티켓오픈 참고자료(운영자 첨부5) 실측값.
  · 기본 = 맑은 고딕 sz21(10.5pt) · A4 · 여백 1in · 본문폭 9026 dxa
  · 제목 sz32 bold #2B2B33 / 라벨 sz18 #6A6A72 / 리드 sz17 #6A6A72
  · 소제목 sz25 bold #34408C + 아래 실선(sz10 space5 #34408C) · before60 after120 · keepNext
  · 본문 #2B2B2B · after80 line300auto
  · 캡션 sz16 italic #8A8A92 가운데 · before20 after20 line288auto
  · 표 2열 테두리 #E2E2E8 · tcMar 110/170 · vAlign center
색은 위 6개(#2B2B33 #6A6A72 #8A8A92 #2B2B2B #34408C #E2E2E8)뿐 — 새 색 금지.

⚠ 「완성된 워드」의 뜻(운영자 260806-3 「초안을 보고 빈 공간에 사진도 넣을 수 있도록」):
   사진 자리는 **워드에서 바로 사진을 끼울 수 있는 빈 액자**로 나간다.
   · 앱에서 사진을 채웠으면  → 그 자리에 사진이 박혀서 나온다(캡션까지).
   · 안 채웠으면            → 같은 크기의 **빈 액자 + 안내 문구 + 캡션 초안**이 남는다.
     워드에서 액자 안을 클릭해 [삽입 ▸ 그림]만 하면 되도록 문단 하나를 통째로 비워 둔다.
   두 경우의 자리·크기가 같아야 나중에 사진을 끼워도 쪽 배치가 안 흔들린다.

입력 문법(LLM 출력 = 이 형식 그대로):
    ===TITLE===   제목 한 줄
    ===LEDE===    리드 한두 줄
    ===BODY===
      도입 문단들
      ## 1. 꼭지 제목 : 부제        ← 소제목(번호는 LLM이 붙인 그대로)
      - 티켓 오픈 : 8월 7일(금)      ← 「▫ 키 : 값」 정보 불릿
      본문 문단
      [사진: 설명 — 캡션: 캡션문]    ← 사진 자리(앱 _nbPhotoParse와 같은 문법)
      | 왼쪽 | 오른쪽 |             ← 2열 표(연속된 줄이 한 표)
    ===NOTES===   〔확정 필요〕 항목들(선택)

실행:
    python3 tools/press_docx.py --in spec.json --out 결과.docx
    spec.json = {"text": "<위 문법 전체>", "label": "…", "photos": {"0": {"b64": "…", "mime": "image/jpeg"}}}
"""
import argparse
import base64
import io
import json
import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

C_TITLE = "2B2B33"
C_META = "6A6A72"
C_CAP = "8A8A92"
C_BODY = "2B2B2B"
C_ACC = "34408C"
C_LINE = "E2E2E8"
FONT = "맑은 고딕"

BODY_W_DXA = 9026          # 본문폭(첨부5 실측)
BODY_W_IN = 6.27           # 같은 값의 인치 — 사진 최대 폭
PHOTO_MAX_H_IN = 3.3       # 사진 최대 높이 — 폭만 맞추면 세로 긴 사진이 한 쪽을 통째로 먹는다(600×400 실측 4.18in)
PHOTO_BOX_IN = 2.6         # 빈 액자 높이 = 사진을 끼웠을 때와 비슷한 자리

# ── OOXML은 자식 순서가 스키마로 고정돼 있다(어기면 Word·LibreOffice가 파일을 못 연다).
SEQ = {
    "tblPr": ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
              "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders",
              "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription"],
    "tcPr": ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap",
             "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"],
    "pPr": ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
            "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
            "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
            "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
            "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection",
            "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
            "sectPr", "pPrChange"],
}


def _el(tag, **kw):
    e = OxmlElement(tag)
    for k, v in kw.items():
        e.set(qn("w:" + k), str(v))
    return e


def put(parent, el):
    """스키마 순서를 지켜 넣는다(같은 태그가 이미 있으면 교체)."""
    order = SEQ[parent.tag.split("}")[-1]]
    name = el.tag.split("}")[-1]
    for old in parent.findall(qn("w:" + name)):
        parent.remove(old)
    idx = order.index(name)
    for child in parent:
        cn = child.tag.split("}")[-1]
        if cn not in order or order.index(cn) > idx:
            child.addprevious(el)
            return el
    parent.append(el)
    return el


class Builder:
    def __init__(self):
        doc = Document()
        s = doc.sections[0]
        s.page_width, s.page_height = Inches(8.27), Inches(11.69)
        s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Inches(1)
        n = doc.styles["Normal"]
        n.font.name = FONT
        n.font.size = Pt(10.5)
        rf = n.element.get_or_add_rPr().get_or_add_rFonts()
        for a in ("w:ascii", "w:eastAsia", "w:hAnsi", "w:cs"):
            rf.set(qn(a), FONT)
        self.doc = doc

    # ── 조각 ────────────────────────────────────────────
    def p(self):
        return self.doc.add_paragraph()

    def spacing(self, p, before=None, after=None, line=None, keep_next=False, keep_lines=False):
        pPr = p._p.get_or_add_pPr()
        if keep_next:
            put(pPr, _el("w:keepNext"))
        if keep_lines:
            put(pPr, _el("w:keepLines"))
        sp = _el("w:spacing")
        if before is not None:
            sp.set(qn("w:before"), str(before))
        if after is not None:
            sp.set(qn("w:after"), str(after))
        if line is not None:
            sp.set(qn("w:line"), str(line))
            sp.set(qn("w:lineRule"), "auto")
        put(pPr, sp)
        return p

    def run(self, p, text, size=None, bold=False, color=None, italic=False):
        r = p.add_run(text)
        rf = r._r.get_or_add_rPr().get_or_add_rFonts()
        for a in ("w:ascii", "w:eastAsia", "w:hAnsi", "w:cs"):
            rf.set(qn(a), FONT)
        if size:
            r.font.size = Pt(size)
        r.bold = bold
        r.italic = italic
        if color:
            r.font.color.rgb = RGBColor.from_string(color)
        return r

    def rich(self, p, text, size=None, color=C_BODY):
        """**굵게** 마크만 해석 — 그 밖의 마크다운은 글자 그대로 둔다(보도자료에 기호가 튀면 안 된다)."""
        for i, chunk in enumerate(re.split(r"\*\*(.+?)\*\*", text)):
            if chunk:
                self.run(p, chunk, size=size, bold=bool(i % 2), color=color)
        return p

    # ── 컴포넌트 ────────────────────────────────────────
    def title(self, text):
        p = self.p()
        self.spacing(p, after=40)
        self.run(p, text, size=16, bold=True, color=C_TITLE)

    def label(self, text):
        p = self.p()
        self.spacing(p, after=40)
        self.run(p, text, size=9, color=C_META)

    def lede(self, text):
        p = self.p()
        self.spacing(p, after=120, line=288)
        self.run(p, text, size=8.5, color=C_META)

    def head(self, text):
        p = self.p()
        pPr = p._p.get_or_add_pPr()
        put(pPr, _el("w:keepNext"))
        put(pPr, _el("w:keepLines"))
        bdr = OxmlElement("w:pBdr")
        bdr.append(_el("w:bottom", val="single", sz=10, space=5, color=C_ACC))
        put(pPr, bdr)
        put(pPr, _el("w:spacing", before=60, after=120))
        self.run(p, text, size=12.5, bold=True, color=C_ACC)

    def para(self, text, before=None):
        p = self.p()
        self.spacing(p, before=before, after=80, line=300)
        self.rich(p, text)

    def subhead(self, text):
        """소절 머리 — 한 꼭지 안을 다시 나누는 굵은 한 줄.

        왜 필요한가(260806 3판 실측): 메인 공연에 출연자가 셋이면 서술이 10문단을 넘는데,
        문단만 이어 붙이면 「누구 얘기를 읽고 있는지」가 사라진다. 사람이 손으로 쓴 3판은
        연주자마다 굵은 한 줄을 세워 나눴고 그게 읽히는 이유였다.
        `## 꼭지`를 하나 더 파지 않는 이유 = 그건 공연 단위 머리줄(강조색 밴드)이라
        같은 공연 안을 쪼개는 데 쓰면 목차가 거짓말이 된다. 그래서 본문 활자 그대로 굵게만,
        앞 여백으로 숨만 틔운다(새 색·새 활자 0).
        """
        self.para(text, before=180)

    def bullet(self, key, val, first=False, last=False):
        p = self.p()
        self.spacing(p, before=(30 if first else 0), after=(140 if last else 0), line=276)
        p.paragraph_format.left_indent = Pt(6)
        self.run(p, "▫ ", color=C_ACC)
        if val:
            self.run(p, key + " : ", bold=True, color=C_TITLE)
            self.run(p, val, color=C_BODY)
        else:
            self.run(p, key, color=C_BODY)

    def caption(self, text):
        p = self.p()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        self.spacing(p, before=20, after=20, line=288)
        self.run(p, text, size=8, italic=True, color=C_CAP)

    def photo(self, desc, cap, att):
        """사진 자리. att = {'bytes':…} 면 박아서, 없으면 빈 액자로."""
        if att and att.get("bytes"):
            try:
                p = self.p()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                self.spacing(p, before=60, after=0, line=240)
                pic = p.add_run().add_picture(io.BytesIO(att["bytes"]), width=Inches(BODY_W_IN))
                # 폭만 맞추면 세로 긴 사진이 한 쪽을 통째로 먹는다 — 높이가 넘치면 비율 유지로 되줄인다.
                if pic.height > Inches(PHOTO_MAX_H_IN):
                    pic.width = int(pic.width * Inches(PHOTO_MAX_H_IN) / pic.height)
                    pic.height = Inches(PHOTO_MAX_H_IN)
                if cap or desc:
                    self.caption(cap or desc)
                return
            except Exception as e:                       # 깨진 이미지 하나가 문서 전체를 못 막게
                sys.stderr.write("[press_docx] 사진 삽입 실패 → 빈 액자로 대체: %s\n" % e)
        self._empty_frame(desc, cap)

    def _empty_frame(self, desc, cap):
        """빈 액자 = 1×1 점선 표. 워드에서 칸 안을 클릭해 [삽입 ▸ 그림]이면 끝.

        문단이 아니라 표로 두는 이유 = 사진을 안 넣어도 **높이가 유지**되기 때문이다.
        문단 여백으로 자리를 비우면 사진을 끼우는 순간 뒤 쪽이 통째로 밀린다.
        """
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        tblPr = t._tbl.tblPr
        put(tblPr, _el("w:tblW", w=BODY_W_DXA, type="dxa"))
        bd = OxmlElement("w:tblBorders")
        for e in ("top", "left", "bottom", "right"):
            bd.append(_el("w:" + e, val="dashed", sz=6, space=0, color=C_LINE))
        put(tblPr, bd)
        c = t.rows[0].cells[0]
        tcPr = c._tc.get_or_add_tcPr()
        put(tcPr, _el("w:tcW", w=BODY_W_DXA, type="dxa"))
        put(tcPr, _el("w:vAlign", val="center"))
        tr = t.rows[0]._tr.get_or_add_trPr()
        tr.append(_el("w:trHeight", val=int(PHOTO_BOX_IN * 1440), hRule="atLeast"))
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        self.spacing(p, line=288)
        self.run(p, "여기에 사진을 넣어 주세요", size=9, color=C_CAP)
        p2 = c.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        self.spacing(p2, line=288)
        self.run(p2, desc or "", size=8, italic=True, color=C_CAP)
        if cap:
            self.caption(cap)

    def table2(self, rows, w1=2756):
        w2 = BODY_W_DXA - w1
        t = self.doc.add_table(rows=len(rows), cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        tblPr = t._tbl.tblPr
        put(tblPr, _el("w:tblW", w=BODY_W_DXA, type="dxa"))
        bd = OxmlElement("w:tblBorders")
        for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
            bd.append(_el("w:" + e, val="single", sz=4, space=0, color="auto"))
        put(tblPr, bd)
        cm = OxmlElement("w:tblCellMar")
        cm.append(_el("w:left", w=10, type="dxa"))
        cm.append(_el("w:right", w=10, type="dxa"))
        put(tblPr, cm)
        for i, cells in enumerate(rows):
            # 한 행이 쪽 경계에서 반으로 갈리지 않게(값이 위아래로 찢어지면 표가 아니다)
            t.rows[i]._tr.get_or_add_trPr().append(_el("w:cantSplit"))
            for j, txt in enumerate(cells[:2]):
                c = t.rows[i].cells[j]
                tcPr = c._tc.get_or_add_tcPr()
                put(tcPr, _el("w:tcW", w=(w1 if j == 0 else w2), type="dxa"))
                tb = OxmlElement("w:tcBorders")
                for e in ("top", "left", "bottom", "right"):
                    tb.append(_el("w:" + e, val="single", sz=4, space=0, color=C_LINE))
                put(tcPr, tb)
                m = OxmlElement("w:tcMar")
                m.append(_el("w:top", w=110, type="dxa"))
                m.append(_el("w:left", w=170, type="dxa"))
                m.append(_el("w:bottom", w=110, type="dxa"))
                m.append(_el("w:right", w=170, type="dxa"))
                put(tcPr, m)
                put(tcPr, _el("w:vAlign", val="center"))
                p = c.paragraphs[0]
                self.spacing(p, line=264)
                if j == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    self.rich(p, txt, color=C_TITLE)
                    for r in p.runs:
                        r.bold = True
                else:
                    self.rich(p, txt)

    def gap(self, pt=6):
        p = self.p()
        self.spacing(p, before=0, after=0)
        p.paragraph_format.space_after = Pt(pt)


# ── 입력 파싱 ───────────────────────────────────────────
SEC_RE = re.compile(r"^===\s*(TITLE|LABEL|LEDE|BODY|NOTES)\s*===\s*$", re.M)
PHOTO_RE = re.compile(r"^[ \t]*\[사진[^:\[\]]*:\s*([^\]]+)\][ \t]*$")
HEAD_RE = re.compile(r"^#{1,3}\s+(.+?)\s*$")
BULLET_RE = re.compile(r"^\s*[-*▫•]\s+(.+?)\s*$")
ROW_RE = re.compile(r"^\s*\|(.+)\|\s*$")
# 소절 머리 = 줄 전체가 하나의 **굵게**. 안쪽에 `**`가 또 없어야 한다(문장 중간 강조와 구분).
SUBHEAD_RE = re.compile(r"^\*\*(?!\s)((?:(?!\*\*).)+?)\*\*$")


def split_sections(text):
    """===SECTION=== 블록으로 쪼갠다. 머리표가 하나도 없으면 전문을 BODY로 본다."""
    parts, cur, out = SEC_RE.split(str(text or "")), None, {}
    if len(parts) == 1:
        return {"BODY": parts[0].strip()}
    it = iter(parts[1:])
    for name in it:
        out[name] = next(it, "").strip()
    if parts[0].strip() and "BODY" not in out:
        out["BODY"] = parts[0].strip()
    return out


def parse_photo(line):
    m = PHOTO_RE.match(line)
    if not m:
        return None
    body = m.group(1).strip()
    desc, cap = body, ""
    cm = re.match(r"^(.*?)(?:\s*[—–|-]\s*)?캡션\s*(?:제안)?\s*[:：]\s*(.*)$", body)
    if cm:
        desc = cm.group(1).strip()
        cap = cm.group(2).strip().strip("\"'「」“”")
    return desc or body, cap


def build(spec):
    b = Builder()
    sec = split_sections(spec.get("text", ""))
    photos = {}
    for k, v in (spec.get("photos") or {}).items():
        try:
            photos[int(k)] = {"bytes": base64.b64decode(re.sub(r"^data:[^,]*,", "", str(v.get("b64") or "")))}
        except Exception as e:
            sys.stderr.write("[press_docx] 사진 %s 디코드 실패: %s\n" % (k, e))

    if sec.get("TITLE"):
        b.title(sec["TITLE"].replace("\n", " ").strip())
    lab = spec.get("label") or sec.get("LABEL")
    if lab:
        b.label(str(lab).replace("\n", " ").strip())
    if sec.get("LEDE"):
        b.lede(" ".join(sec["LEDE"].split()))

    def emit_body(src, photo_idx):
        lines = str(src or "").split("\n")
        i, blts, rows = 0, [], []

        def flush_bullets():
            for k, (kk, vv) in enumerate(blts):
                b.bullet(kk, vv, first=(k == 0), last=(k == len(blts) - 1))
            del blts[:]

        def flush_rows():
            if rows:
                b.table2(list(rows))
                b.gap()
                del rows[:]

        while i < len(lines):
            ln = lines[i]
            i += 1
            st = ln.strip()
            if not st:
                flush_bullets()
                flush_rows()
                continue
            hm = HEAD_RE.match(st)
            if hm:
                flush_bullets()
                flush_rows()
                b.head(hm.group(1))
                continue
            rm = ROW_RE.match(st)
            if rm:
                flush_bullets()
                cells = [c.strip() for c in rm.group(1).split("|")]
                if all(re.fullmatch(r":?-{2,}:?", c or "") for c in cells if c):
                    continue                                   # 마크다운 표 구분선은 버린다
                rows.append(cells[:2] if len(cells) >= 2 else [cells[0], ""])
                continue
            flush_rows()
            ph = parse_photo(ln)
            if ph:
                flush_bullets()
                b.photo(ph[0], ph[1], photos.get(photo_idx[0]))
                photo_idx[0] += 1
                continue
            bm = BULLET_RE.match(st)
            if bm:
                inner = bm.group(1)
                kv = re.match(r"^\s*(.{1,20}?)\s*[:：]\s*(.+)$", inner)
                blts.append((kv.group(1), kv.group(2)) if kv else (inner, ""))
                continue
            flush_bullets()
            if SUBHEAD_RE.match(st):
                b.subhead(st)          # 줄 전체가 **굵게** = 소절 머리
            else:
                b.para(st)
        flush_bullets()
        flush_rows()

    idx = [0]
    emit_body(sec.get("BODY", ""), idx)
    if sec.get("NOTES", "").strip():
        b.gap()
        b.head("[내부용] 배포 전 확정·확인이 필요한 항목")
        b.lede("아래는 초안에만 붙는 내부 점검용입니다. 배포본에서는 삭제해 주세요.")
        emit_body(sec["NOTES"], idx)
    return b.doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="spec JSON 경로")
    ap.add_argument("--out", dest="out", required=True, help="결과 .docx 경로")
    a = ap.parse_args()
    with open(a.inp, encoding="utf-8") as f:
        spec = json.load(f)
    doc = build(spec)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    doc.save(a.out)
    print("saved: %s (%d bytes)" % (a.out, os.path.getsize(a.out)))


if __name__ == "__main__":
    main()
