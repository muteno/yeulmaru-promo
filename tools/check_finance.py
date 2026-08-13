#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사업비 인덱스 게이트 — 「공연에 딸린 사업 실적」 축의 정적 층 (운영자 260812, stdlib only)

운영자 지시 2줄이 이 게이트의 계약이다:
  ⓐ 「그 공연은 고유하니까 **거기에 매달아야함**. 그니까 인덱싱이 늘어나는거임. 근데 **인덱싱 no**가 있따면
     **회계쪽이랑 분류**해놓으면 나중에 거를때 비용이 좀 덜하겠지」
  ⓑ 「연도별로 **추가 데이터가 왔을때도 문제 없이 삽입**되어야 해. 그리고 공연은 항상 고유하니까
     **그 공연에 딸린 사업 실적 개념으로 db 인덱싱이 운영**되어야 하고」

기존 게이트 어느 것도 이 축을 안 묻는다 — check_design은 색·수치, check_biz_list는 사업 목록 표기,
smoke_* 는 픽셀·열림이다. 여기서만 묻는 것 = **「인덱스가 성한가」**.

검사 8종 (전부 **하드 0** — 래칫 아님):
  ① 씨앗 구조: `data/biz_finance.js`가 `BIZ_FIN` + 연도별 `rows`를 갖고, 각 행에 필수 필드가 다 있다.
  ② **사업NO 유일**: 전 연도 통틀어 중복 0. NO = `<연도>-<분야>-<순번>` 꼴.
  ③ **연도 안 조인키 유일**: 한 해에 같은 `key`가 둘이면 공연↔사업비 링크가 갈린다(어느 쪽이 붙을지 미정).
  ④ **파생값 미저장**: 씨앗에 차액·수익율·계(`diff`/`margin`/`ppl`/`차액`/`수익율`) 필드 0.
     — 저장하면 원본 수식과 갈리고, 갈린 순간 화면과 시트가 서로 다른 답을 낸다.
  ⑤ 앱 정본 함수 각 1개: `_finRows` `_finIdx` `_finOf` `_finCalc` `_finLinkMap` `_isAcct` `_finWrite`.
     — 2개가 되는 순간 「집계가 두 벌」이다(`_bizListBuild` 쌍둥이 사고와 같은 축).
  ⑥ 인덱스 축 실존: `_FIN_COLS`에 `사업NO`·`연도`·`회계구분`·`연결키`가 다 있다(ⓐ의 「no + 회계 분류 + 매달기」).
  ⑦ 권한 축 실존: 프론트 `회계여부` 컬럼 + Worker `checkAccountant` + `ACCT_WRITE_SHEETS` + `X-Acct-PIN`.
     그리고 Worker `/api/ops` POST가 **body를 auth보다 먼저** 읽는다(어느 시트인지 알아야 회계를 판정한다).
  ⑧ **NO 안정성 실증**(ⓑ의 핵심): 빌더를 「가운데 한 줄이 없던 이전본」으로 다시 돌려도
     살아남은 사업의 NO가 **한 건도 안 바뀌는가**. 이게 깨지면 담당자가 시트에 저장한 수정본이
     엉뚱한 사업에 붙거나 통째로 고아가 된다 — 이 축의 유일한 실질 위험이다.

킬테스트 6/6 차단 실증(260812 · 이 게이트를 등재한 근거):
  ① 빌더의 NO 재사용(정체성 고정)을 지우고 순번을 매번 새로 매기게 → ⑧ rc=1
  ② 씨앗 행에 `margin:` 필드를 하나 넣음 → ④ rc=1 (`2025-공연-01`에 파생값 저장됨을 지목)
  ③ `_finOf`를 한 벌 더 복사 → ⑤ rc=1 (선언 2개)
  ④ `_FIN_COLS`에서 `연결키` 제거 → ⑥ rc=1
  ⑤ Worker ops POST에서 body를 auth 뒤로 되돌림 → ⑦ rc=1
  ⑥ ops POST의 `ACCT_WRITE_SHEETS` 분기 무력화 → ⑦ rc=1
  · 전부 원복하면 rc=0
⚠ ⑤는 **첫 판이 새어나갔다** — 이 자리를 설명하는 주석에 `request.json()`이라는 글자가 들어 있어
  게이트가 코드가 아니라 **주석의 위치**를 재고 통과했다. 주석을 먼저 지우도록 고치고 재실증했다.
  (교훈: 리터럴 실존·순서 검사는 주석을 걷어내고 재야 한다 — `check_wide_threshold` ③이 같은 이유로
   줄머리 앵커를 요구하게 된 것과 같은 축.)

짝(런타임 층) = `tools/smoke_finance.mjs` — 「소스에 축이 있나」가 아니라 「브라우저에서 실제로 도는가」를 잰다.

실행: python3 tools/check_finance.py   (위반 시 exit 1)
호출처: .githooks/pre-commit · npm run check
"""
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "biz_finance.js"
INDEX = ROOT / "index.html"
WORKER = ROOT / "src" / "index.js"
BUILDER = ROOT / "tools" / "build_biz_finance.py"

NO_RE = re.compile(r"^20\d\d-[^-]+-\d{2,}$")
NEED = ("no", "cat", "acct", "name", "key", "mon", "cnt", "bud", "vou", "fee", "rev", "paid", "inv")
BANNED = ("diff", "margin", "ppl", "cost", "차액", "수익율", "수익률")
CANON = ("_finRows", "_finIdx", "_finOf", "_finCalc", "_finLinkMap", "_isAcct", "_finWrite")
AXES = ("사업NO", "연도", "회계구분", "연결키")

ROW_RE = re.compile(r"\{no:\"[^\"]+\".*?\}")
FLD_RE = re.compile(r"(\w+):(\"(?:[^\"\\]|\\.)*\"|-?\d+)")


def parse_seed(src):
    """씨앗 파일을 **실행하지 않고** 파싱한다(게이트가 산출물을 신뢰하지 않는다는 뜻)."""
    years, cur = {}, None
    for line in src.split("\n"):
        m = re.match(r"\s*(20\d\d):\{", line)
        if m:
            cur = int(m.group(1))
            years[cur] = []
            continue
        for rm in ROW_RE.finditer(line):
            if cur is None:
                continue
            row = {}
            for k, v in FLD_RE.findall(rm.group(0)):
                row[k] = json.loads(v) if v.startswith('"') else int(v)
            years[cur].append(row)
    return years


def run_builder_with_prev(prev_text):
    """이전 산출물을 `prev_text`로 갈아끼운 채 빌더를 돌리고, 그 결과 텍스트를 돌려준다(레포 파일 무접촉)."""
    spec = importlib.util.spec_from_file_location("_bf_probe", BUILDER)
    bf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bf)
    tmp = Path(tempfile.mkdtemp(prefix="finchk_"))
    try:
        out = tmp / "biz_finance.js"
        out.write_text(prev_text, encoding="utf-8")
        bf.OUT = str(out)
        buf, sys.stdout = sys.stdout, open(os.devnull, "w")
        try:
            rc = bf.main(["build_biz_finance.py"])
        finally:
            sys.stdout.close()
            sys.stdout = buf
        return rc, out.read_text(encoding="utf-8")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    bad = []
    for p in (SEED, INDEX, WORKER, BUILDER):
        if not p.exists():
            print("✗ check_finance — 없음: %s" % p.relative_to(ROOT))
            return 1
    seed_src = SEED.read_text(encoding="utf-8")
    idx_src = INDEX.read_text(encoding="utf-8")
    wk_src = WORKER.read_text(encoding="utf-8")

    # ── ① 구조 ────────────────────────────────────────────────────────────
    if "var BIZ_FIN=" not in seed_src:
        bad.append("씨앗에 `var BIZ_FIN=` 선언이 없다")
    years = parse_seed(seed_src)
    if not years:
        bad.append("씨앗에서 연도별 행을 한 건도 못 읽었다 — 산출 형식이 바뀌었나")
    total = 0
    for y, rows in sorted(years.items()):
        total += len(rows)
        for r in rows:
            miss = [k for k in NEED if k not in r]
            if miss:
                bad.append("%d년 `%s` 행에 빠진 필드: %s" % (y, r.get("no", "?"), ", ".join(miss)))
                break

    # ── ② 사업NO 유일 + 꼴 ────────────────────────────────────────────────
    allno = [r["no"] for rows in years.values() for r in rows if "no" in r]
    dup = sorted(set(n for n in allno if allno.count(n) > 1))
    if dup:
        bad.append("사업NO 중복 %d건 — 시트 행이 어느 사업 것인지 갈린다: %s" % (len(dup), ", ".join(dup[:6])))
    shape = [n for n in allno if not NO_RE.match(n)]
    if shape:
        bad.append("사업NO 꼴이 `<연도>-<분야>-<순번>`이 아니다: %s" % ", ".join(shape[:6]))

    # ── ③ 연도 안 조인키 유일 ─────────────────────────────────────────────
    for y, rows in sorted(years.items()):
        ks = [r.get("key", "") for r in rows]
        d = sorted(set(k for k in ks if k and ks.count(k) > 1))
        if d:
            bad.append("%d년 조인키 중복 %d건 — 그 공연에 어느 사업비가 붙을지 미정이 된다: %s" % (y, len(d), ", ".join(d[:6])))

    # ── ④ 파생값 미저장 ───────────────────────────────────────────────────
    for y, rows in sorted(years.items()):
        for r in rows:
            hit = [k for k in BANNED if k in r]
            if hit:
                bad.append("%d년 `%s`에 파생값이 저장돼 있다(%s) — 화면이 세야 한다(값 이원화 금지)"
                           % (y, r.get("no", "?"), ", ".join(hit)))
                break

    # ── ⑤ 앱 정본 함수 각 1개 ─────────────────────────────────────────────
    for fn in CANON:
        n = len(re.findall(r"function\s+" + fn + r"\s*\(", idx_src))
        if n != 1:
            bad.append("정본 함수 `%s` 선언이 %d개 — 정확히 1개여야 한다(0=삭제 · 2+=집계가 두 벌)" % (fn, n))

    # ── ⑥ 인덱스 축 실존 ──────────────────────────────────────────────────
    m = re.search(r"var\s+_FIN_COLS\s*=\s*\[(.*?)\]", idx_src, re.S)
    if not m:
        bad.append("`_FIN_COLS`(시트 헤더 정본)가 없다")
    else:
        cols = m.group(1)
        for a in AXES:
            if ("'" + a + "'") not in cols and ('"' + a + '"') not in cols:
                bad.append("`_FIN_COLS`에 인덱스 축 `%s`가 없다 — 「no + 회계 분류 + 매달기」가 성립하지 않는다" % a)

    # ── ⑦ 권한 축 실존 ────────────────────────────────────────────────────
    if "{key:'회계여부'" not in idx_src.replace('"', "'"):
        bad.append("담당자 시트 컬럼 배열에 `회계여부`가 없다(SHEET_CONFIG.manager)")
    if "X-Acct-PIN" not in idx_src:
        bad.append("프론트가 `X-Acct-PIN` 헤더를 안 보낸다 — Worker가 회계를 판정할 수 없다")
    for lit, why in (("function checkAccountant", "Worker 회계 검증기"),
                     ("ACCT_WRITE_SHEETS", "회계 쓰기 허용 시트 목록"),
                     ("X-Acct-PIN", "회계 PIN 헤더 수신"),
                     ("\\uD68C\\uACC4\\uC5EC\\uBD80", "Worker가 보는 `회계여부` 열")):
        if lit not in wk_src and lit.replace("\\\\u", "\\u") not in wk_src:
            bad.append("Worker에 %s(`%s`)가 없다" % (why, lit))
    at = wk_src.find('url.pathname === "/api/ops"')
    blk = wk_src[at:wk_src.find("opsWriteSheet(token", at)] if at >= 0 else ""
    # ⚠ **주석을 먼저 지운다** — 이 자리를 설명하는 주석에 `request.json()`이라는 글자가 들어 있어서,
    #   지우지 않으면 게이트가 코드가 아니라 주석의 위치를 재고 순서가 뒤집혀도 통과한다(260812 킬테스트 5가
    #   정확히 그 이유로 한 번 새어나갔다 — 게이트를 고치고 재실증했다).
    blk = re.sub(r"//[^\n]*", "", blk)
    if not blk:
        bad.append("Worker `/api/ops` POST 블록을 못 찾았다")
    else:
        post_at = blk.find('request.method === "POST"')
        body_at, auth_at = blk.find("request.json()", post_at), blk.find("checkAdmin(", post_at)
        if post_at < 0 or body_at < 0 or auth_at < 0 or body_at > auth_at:
            bad.append("`/api/ops` POST가 body보다 auth를 먼저 읽는다 — 어느 시트인지 모르는 채로는 회계를 판정할 수 없다")
        if "ACCT_WRITE_SHEETS" not in blk:
            bad.append("`/api/ops` POST가 `ACCT_WRITE_SHEETS`를 안 본다 — 회계가 사업비를 저장할 길이 없다")

    # ── ⑧ NO 안정성 실증 ──────────────────────────────────────────────────
    #   「가운데 한 줄이 없던 이전본」으로 되돌려 빌드 → 살아남은 사업의 NO가 하나도 안 움직여야 한다.
    lines = seed_src.split("\n")
    body = [i for i, l in enumerate(lines) if ROW_RE.search(l)]
    if len(body) < 4:
        bad.append("NO 안정성 검사를 돌릴 만큼 씨앗 행이 없다(4건 미만)")
    else:
        drop = body[len(body) // 3]
        victim = json.loads(FLD_RE.findall(ROW_RE.search(lines[drop]).group(0))[0][1])
        prev = "\n".join(lines[:drop] + lines[drop + 1:])
        rc, out = run_builder_with_prev(prev)
        if rc != 0:
            bad.append("NO 안정성 검사에서 빌더가 rc=%d로 실패했다" % rc)
        else:
            before = {r["no"]: (y, r.get("key", "")) for y, rows in years.items() for r in rows}
            after = parse_seed(out)
            now = {(y, r.get("key", "")): r["no"] for y, rows in after.items() for r in rows}
            moved = []
            for no, (y, k) in before.items():
                if no == victim:
                    continue   # 일부러 지운 그 행만 새 번호를 받는 게 정상
                if now.get((y, k)) != no:
                    moved.append("%s→%s" % (no, now.get((y, k))))
            if moved:
                bad.append("이전본에서 한 줄이 빠졌을 뿐인데 **다른 사업 %d건의 NO가 밀렸다**: %s — "
                           "엑셀 중간에 줄을 끼우면 시트에 저장된 담당자 수정본이 엉뚱한 사업에 붙는다"
                           % (len(moved), ", ".join(moved[:6])))
            # ⚠ 지운 행이 **같은 번호를 되받는 것 자체는 사고가 아니다** — 그 행이 그 연도·분야의 마지막 번호였다면
            #   다음 빈 번호가 곧 그 번호다(2024·2026이 들어오며 실제로 그 경우가 걸려 오탐이 났다).
            #   이 검사가 지켜야 할 계약은 「**살아남은 행이 안 밀린다**」 하나뿐이고, 그건 바로 위 `moved`가 본다.

    # ══ ⑨~⑫ 사업 지표 입력 창 저장 계약 (260812-5 평의회5 · 260812-8 게이트 등재) ═══════════════════
    #   왜 여기 있나: #801에서 「조용히 덮어쓰던 경로」 넷을 고쳤는데 **게이트가 없어서 누가 되돌려도 안 잡혔다.**
    #   같은 상태(고쳤는데 안 잠금)를 전시 차트에서 이미 한 번 겪었다 — 고친 것은 반드시 잠근다.
    #   ⚠ 판정 전에 **주석을 걷는다** — 260812 킬테스트 ⑤가 주석 안 글자 때문에 새어나간 전례가 있다.
    def _strip(s):
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
        return re.sub(r"(?m)//[^\n]*", "", s)

    def _fnbody(s, head):
        i = s.find(head)
        if i < 0:
            return ""
        m = re.search(r"\n(?:async )?function ", s[i + 10:])
        return s[i: i + 10 + (m.start() if m else 4000)]

    FILL = ("bud", "vou", "fee", "rev", "paid", "inv")   # 「채웠나」를 묻는 금액·인원 6칸 — index.html `_FIN_FILL`·빌더 `_FILL`과 같은 목록
    code = _strip(idx_src)
    save = _fnbody(code, "async function _finInSave")
    paint = code[code.find("function _finInPaint"): code.find("async function _finInSave")]
    write = _fnbody(code, "async function _finWrite")

    if not save or not paint or not write:
        bad.append("⑨ 입력 창·쓰기 정본 함수(`_finInPaint`/`_finInSave`/`_finWrite`)를 못 찾았다 — 이름이 바뀌었으면 이 검사도 같이 고쳐라.")
    else:
        # ⑨ 그리는 칸 ⊇ 저장하는 칸 — 칸을 하나라도 안 그리면 `el.value`가 ''이라 그 열이 **0으로 시트에 박힌다**
        #    (문자칸이면 연결키가 통째로 날아가 자동 매칭으로 강등된다). 접힘·탭·조건부 숨김을 넣는 순간 터진다.
        painted = set(re.findall(r"\b(?:num|txt)\('([a-z]+)'", paint))
        patched = set(re.findall(r"patch\.([a-z]+)\s*=", save)) - {"blank"}
        m_arr = re.search(r"_FIN_FILL\.concat\(\[([^\]]*)\]\)", save)
        if m_arr:
            patched |= set(re.findall(r"'([a-z]+)'", m_arr.group(1)))
        patched |= set(FILL)
        miss = sorted(patched - painted)
        if miss:
            bad.append("⑨ 입력 창이 **안 그리는** 칸을 저장한다: %s — 그 열은 0/빈칸으로 시트에 박힌다."
                       % ", ".join("`%s`" % x for x in miss))
        if not painted:
            bad.append("⑨ `_finInPaint`에서 입력칸 빌더(num/txt)를 못 찾았다 — 폼 조립이 바뀌었으면 이 검사도 같이 고쳐라.")

        # ⑩ 돈 칸을 저장하면 **반드시 낙관적 잠금**을 건다 — 구판은 sig=null이라 창을 열어 둔 사이 남이 고친 값을
        #    조용히 덮었고, 시트를 못 읽어 씨앗만 보이던 화면이 **시트를 씨앗으로 되돌릴 수** 있었다.
        #    ⚠ 「돈 칸을 쓰는 저장인가」를 `'bud'` 같은 **리터럴 실존**으로 판정하면 안 된다 — 260812-8 킬테스트에서
        #      그 판정이 통째로 새어나갔다(`_FIN_FILL`로 묶는 리팩터를 하자 리터럴이 사라져 검사가 건너뛰어졌다).
        #      돈 칸을 쓰는 저장 = **이름으로 못 박는다**(`_finBind`는 연결키만 써서 대상 아님 = null이 정상).
        for head in ("async function _finInSave", "async function _finSave"):
            b = _fnbody(code, head)
            if not b:
                bad.append("⑩ `%s`를 못 찾았다 — 이름이 바뀌었으면 이 검사도 같이 고쳐라." % head.split()[-1])
                continue
            m = re.search(r"_finWrite\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^,]+),", b)
            if not m:
                bad.append("⑩ `%s`가 `_finWrite`를 안 부른다 — 쓰기 정본을 우회했다(유실 가드·수정자 스탬프가 통째로 빠진다)."
                           % head.split()[-1])
            elif m.group(1).strip() == "null":
                bad.append("⑩ `%s`가 sig=null로 저장한다 — 창을 연 뒤 남이 고친 값을 조용히 덮는다(돈 원장이라 복구가 "
                           "시트 이력뿐이다). 연 시점 행의 `_finSig(…)`를 넘겨라." % head.split()[-1])

        # ⑪ 같은 사업NO가 시트에 두 줄이면 멈춘다 — 화면(`_finRows`)은 **첫** 줄을 보여주는데 쓰기가 **마지막** 줄을
        #    고치면 「저장했는데 값이 그대로」가 된다. 씨앗 게이트 ②는 씨앗만 봐서 시트 중복을 못 잡는다.
        if "hits.length>1" not in write.replace(" ", ""):
            bad.append("⑪ `_finWrite`에 중복 사업NO 중단 가드가 없다 — 화면은 첫 줄, 쓰기는 다른 줄을 고를 수 있다.")

        # ⑫ 재진입 가드 — 지금 이중 제출을 막는 건 전면 오버레이 하나뿐이라, 버튼 스피너로 바꾸는 순간
        #    같은 fresh 스냅샷으로 두 요청이 각자 push해 **같은 사업NO가 두 줄** 생긴다(그러면 ⑪에 걸려 저장이 막힌다).
        #    ⚠ 낱말 `busy` 실존만 보면 샌다 — 가드를 지워도 `_finIn.busy=1`/`=0` 대입이 남아 통과한다(260812-8 킬테스트 실증).
        #      **되돌아가는 그 모양**(값을 읽어 즉시 return)을 직접 요구한다.
        if not re.search(r"if\(_finIn\.busy\)\s*return", save.replace(" ", "")):
            bad.append("⑫ `_finInSave`에 재진입 가드(`if(_finIn.busy)return;`)가 없다 — 이중 제출 시 같은 사업NO가 두 줄 생긴다.")
        if not re.search(r"_finIn\.busy\s*=\s*0", save):
            bad.append("⑫ `_finInSave`가 `_finIn.busy`를 0으로 안 되돌린다 — 한 번 저장하면 그 창은 영영 안 눌린다.")

    if bad:
        print("✗ check_finance 실패 %d건" % len(bad))
        for b in bad:
            print("   · " + b)
        return 1
    print("✅ check_finance 통과 — 씨앗 %d건/%d개 연도 · 사업NO 유일·정체성 고정(중간 삽입 무영향) · 조인키 유일 · "
          "파생값 미저장 · 정본 함수 %d종 각 1 · 인덱스 축(%s) · 회계 권한 축(프론트·Worker) 실존."
          % (total, len(years), len(CANON), "·".join(AXES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
