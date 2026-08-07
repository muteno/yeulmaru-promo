# -*- coding: utf-8 -*-
"""보도자료 자료 첨부 — 올린 문서에서 글자만 뽑아 낸다.

콘텐츠 제작 ▸ 보도자료 만들기에서 운영자가 붙이는 자료(출연자 프로필·기획안·서식 참고본)를
LLM에게 넘기기 전에 텍스트로 바꾸는 자리다. 서식·이미지는 버리고 **글자만** 본다.

지원 = .hwp(HWP 5.0 OLE) · .hwpx/.docx/.pptx(ZIP+XML) · .pdf(pdftotext) · .txt/.md
  ⚠ .hwp가 이 목록에 있는 게 핵심이다 — 운영자가 실제로 준 프로필 4건 중 3건이 구형 .hwp였고,
    ZIP도 PDF도 아니라 브라우저·anydoc 어느 쪽으로도 안 열렸다. 그래서 여기서 직접 읽는다.

왜 서버(anydoc)로 안 보내나 = 왕복이 한 번 더 늘고(디스패치+폴링) 러너에서 어차피 읽을 수 있다.
  이 파일은 의존성이 olefile 하나뿐이고 나머지는 표준 라이브러리다.

실행:
    python3 tools/press_srcext.py <파일…>            # 사람이 볼 형태로 표준출력
    python3 tools/press_srcext.py --json <파일…>     # [{name, chars, text}] JSON
"""
import argparse
import json
import os
import re
import struct
import subprocess
import sys
import zipfile

MAX_CHARS = 40000        # 자료 하나가 프롬프트를 통째로 먹지 않게(초과분은 잘라내고 표시)


# ── HWP 5.0 (OLE 복합문서) ──────────────────────────────
# 본문 = BodyText/SectionN 스트림. FileHeader의 flags bit0 = 압축(raw deflate).
# 레코드 = 32bit 헤더(tag 10 | level 10 | size 12), size==0xFFF면 다음 4바이트가 실제 크기.
# 우리가 쓰는 건 HWPTAG_PARA_TEXT(67) 하나뿐 — 문단 글자.
_HWP_PARA_TEXT = 67
# 인라인 제어문자: 확장(8 wchar 차지)과 단순(1 wchar)이 섞여 있다. 잘못 세면 글자가 통째로 밀린다.
_HWP_CTRL_EXT = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}


def _hwp_text(payload):
    out, j, n = [], 0, len(payload) - 1
    while j < n:
        ch = struct.unpack("<H", payload[j:j + 2])[0]
        if ch >= 32:
            out.append(chr(ch))
            j += 2
        elif ch in (10, 13):
            out.append("\n")
            j += 2
        elif ch in _HWP_CTRL_EXT:
            j += 16                      # 확장 제어 = 8 wchar
        else:
            j += 2
    return "".join(out)


def _hwp_section(data):
    i, res, n = 0, [], len(data)
    while i + 4 <= n:
        header = struct.unpack("<I", data[i:i + 4])[0]
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        i += 4
        if size == 0xFFF:
            if i + 4 > n:
                break
            size = struct.unpack("<I", data[i:i + 4])[0]
            i += 4
        payload = data[i:i + size]
        i += size
        if tag == _HWP_PARA_TEXT:
            res.append(_hwp_text(payload))
    return "\n".join(res)


def read_hwp(path):
    import olefile
    import zlib
    ole = olefile.OleFileIO(path)
    try:
        compressed = bool(struct.unpack("<I", ole.openstream("FileHeader").read()[36:40])[0] & 1)
        parts = []
        for s in sorted([x for x in ole.listdir() if x and x[0] == "BodyText"], key=lambda x: x[1]):
            raw = ole.openstream(s).read()
            if compressed:
                raw = zlib.decompress(raw, -15)
            parts.append(_hwp_section(raw))
        return "\n".join(parts)
    finally:
        ole.close()


# ── ZIP+XML 계열 ────────────────────────────────────────
_TAG = re.compile(r"<[^>]+>")
_PARA_BREAK = re.compile(r"</(?:w:p|hp:p|a:p)>", re.I)


def _xml_text(xml):
    s = _PARA_BREAK.sub("\n", xml)
    s = _TAG.sub("", s)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&#xa;", "\n")):
        s = s.replace(a, b)
    return s


def read_zipxml(path, members):
    out = []
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        for pat in members:
            for nm in sorted(n for n in names if re.match(pat, n)):
                try:
                    out.append(_xml_text(z.read(nm).decode("utf-8", "ignore")))
                except Exception as e:
                    sys.stderr.write("[press_srcext] %s 안의 %s 실패: %s\n" % (path, nm, e))
    return "\n".join(out)


def read_pdf(path):
    try:
        return subprocess.run(["pdftotext", "-layout", path, "-"],
                              capture_output=True, timeout=120).stdout.decode("utf-8", "ignore")
    except FileNotFoundError:
        return ""            # pdftotext 없으면 조용히 빈손 — 나머지 자료는 살린다
    except Exception as e:
        sys.stderr.write("[press_srcext] pdftotext 실패: %s\n" % e)
        return ""


READERS = {
    ".hwp": read_hwp,
    ".hwpx": lambda p: read_zipxml(p, [r"Contents/section\d+\.xml$"]),
    ".docx": lambda p: read_zipxml(p, [r"word/document\.xml$"]),
    ".pptx": lambda p: read_zipxml(p, [r"ppt/slides/slide\d+\.xml$"]),
    ".pdf": read_pdf,
    ".txt": lambda p: open(p, encoding="utf-8", errors="ignore").read(),
    ".md": lambda p: open(p, encoding="utf-8", errors="ignore").read(),
}
EXTS = sorted(READERS)


def tidy(s):
    s = str(s or "").replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return "\n".join(ln.strip() for ln in s.split("\n")).strip()


def extract(path):
    """→ {name, ext, chars, text, error?}. 실패해도 예외를 안 던진다(자료 하나가 전체를 막지 않게)."""
    name = os.path.basename(path)
    ext = os.path.splitext(name)[1].lower()
    r = {"name": name, "ext": ext, "chars": 0, "text": ""}
    fn = READERS.get(ext)
    if not fn:
        r["error"] = "지원하지 않는 형식(%s) — %s만 읽어요" % (ext or "확장자 없음", " ".join(EXTS))
        return r
    try:
        t = tidy(fn(path))
    except Exception as e:
        r["error"] = str(e)[:200]
        return r
    if len(t) > MAX_CHARS:
        t = t[:MAX_CHARS] + "\n…(이하 생략 — 원문 %d자)" % len(t)
    r["text"] = t
    r["chars"] = len(t)
    if not t:
        r["error"] = "글자를 못 찾았어요(이미지만 있는 문서일 수 있어요)"
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    res = [extract(f) for f in a.files]
    if a.json:
        print(json.dumps(res, ensure_ascii=False))
        return
    for r in res:
        print("=" * 20, r["name"], "(%d자)" % r["chars"], r.get("error", ""))
        print(r["text"][:2000])


if __name__ == "__main__":
    main()
