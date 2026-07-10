#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""개선판 의뢰서 xlsm → 앱 생성기용 스크럽 템플릿 (260710)
입력 = 운영자 개선판(분류 그룹·구분→장소 드롭다운·첨부 VBA 포함, 실데이터 채워짐)
출력 = reference/ticketlink_template.xlsm (공개 레포 보관용)
스크럽 원칙 = 현행 공개 템플릿(ticketlink_template.xlsx)의 값 상태로 복원:
  1) 개인정보 제거: 휴대폰·이메일·티켓링크 계정 (셀 + sharedStrings 원본 텍스트까지)
  2) 생성 잔재 제거: 공연 값·좌석표·장르 Sel/체크 상태 → 초기화
  3) 공지문 헬퍼 잔재(AC15·AC16·AG15 깨진 참조 수식) 제거
  4) Claude Log 시트 = 완전 제거(분신술 감사5 B1 — veryHidden 은닉으론 부족: 공개 레포+NHN 제출물에
     AI 작업이력이 동봉됨) · 대응 VBA 문서 모듈(Sheet3)도 CFB 재조립으로 제거 · calcChain 제거(재계산 재구축)
사용법: python3 make_template.py 개선판.xlsm 출력.xlsm
"""
import re, struct, sys, zipfile
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from upgrade_ticketlink_xlsm import ovba_decompress, ovba_compress, cfb_write, Ent
import olefile, io

def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))

def cell_set(xml, ref, val):
    """<c r=ref>를 값으로 교체(스타일 보존). val=None → 빈 셀."""
    m = re.search(rf'<c r="{ref}"( [^>]*?)?(?:/>|>[\s\S]*?</c>)', xml)
    if not m:
        raise RuntimeError(f'셀 없음: {ref}')
    sm = re.search(r's="\d+"', m.group(1) or '')
    s = f' {sm.group(0)}' if sm else ''
    if val is None:
        rep = f'<c r="{ref}"{s}/>'
    else:
        rep = f'<c r="{ref}"{s} t="inlineStr"><is><t xml:space="preserve">{esc(val)}</t></is></c>'
    return xml[:m.start()] + rep + xml[m.end():]

def main(src, dst):
    zin = zipfile.ZipFile(src)
    files = {n: zin.read(n) for n in zin.namelist()}
    infos = {i.filename: i for i in zin.infolist()}
    zin.close()

    # ── ① 의뢰서(sheet2.xml) — 생성 잔재·개인정보 스크럽 ──
    s = files['xl/worksheets/sheet2.xml'].decode('utf-8')
    for ref in ('W3', 'G4', 'G5', 'G6', 'G7', 'G8', 'AA6', 'AB7', 'G21', 'E30', 'AA15',
                'AA39', 'AA40', 'E54', 'Q54', 'AA54',
                'E23', 'R23', 'Y23', 'E24', 'R24', 'Y24', 'AA24',
                'E25', 'J25', 'R25', 'Y25', 'J26', 'Y26', 'J27', 'Y27', 'J28', 'AA28'):
        s = cell_set(s, ref, None)
    s = cell_set(s, 'E33', '   ▣ 출연 : ')
    s = cell_set(s, 'O39', '사무실: 061-808-7003\n휴대폰: ')
    s = cell_set(s, 'O40', '사무실: 061-808-7007\n휴대폰: ')
    files['xl/worksheets/sheet2.xml'] = s.encode('utf-8')

    # ── ② 의뢰서 장르 드롭다운 초기화 (Sel 5→1) ──
    v1 = files['xl/drawings/vmlDrawing1.vml'].decode('utf-8')
    m = re.search(r'(<x:ClientData ObjectType="Drop">(?:(?!</x:ClientData>)[\s\S])*?<x:FmlaRange>\$AK\$2:\$AK\$10</x:FmlaRange>(?:(?!</x:ClientData>)[\s\S])*?<x:Sel>)\d+(</x:Sel>)', v1)
    if not m:
        raise RuntimeError('장르 드롭다운 못 찾음')
    v1 = v1[:m.start()] + m.group(1) + '1' + m.group(2) + v1[m.end():]
    files['xl/drawings/vmlDrawing1.vml'] = v1.encode('utf-8')
    cp9 = files['xl/ctrlProps/ctrlProp9.xml'].decode('utf-8')
    files['xl/ctrlProps/ctrlProp9.xml'] = re.sub(r'sel="\d+"', 'sel="1"', cp9).encode('utf-8')

    # ── ③ 공지문(sheet3.xml) — 생성 잔재·헬퍼 잔재 스크럽 ──
    s3 = files['xl/worksheets/sheet3.xml'].decode('utf-8')
    # D12·D13 = 좌석 2·3행(R24/R25)만 참조하는 잔재 가격 수식 — 좌석 구성에 따라 「0원」 오출력
    # (분신술 감사4 HIGH). 가격 표기 정본 = L11(가격요약) 한 줄 → 수식째 제거(빈 골격 행 유지).
    for ref in ('W6', 'O7', 'L8', 'L9', 'L10', 'L11', 'D12', 'D13', 'D22', 'AC15', 'AC16', 'AG15'):
        s3 = cell_set(s3, ref, None)
    s3 = cell_set(s3, 'I6', '해당 없음')
    # 수식 캐시 값 제거(<f> 보존) — 공연명 등 잔재 소거, 열 때 재계산(fullCalcOnLoad ⑤-b)
    s3, ncache = re.subn(r'(<f>[\s\S]*?</f>)<v[^>]*>[\s\S]*?</v>', r'\1', s3)
    print(f'공지문 수식 캐시 제거: {ncache}개')
    files['xl/worksheets/sheet3.xml'] = s3.encode('utf-8')

    # ── ③-b 의뢰서 개인 mailto 하이퍼링크 제거 (셀 스크럽분: AA39·AA40·E54) ──
    s = files['xl/worksheets/sheet2.xml'].decode('utf-8')
    rels = files['xl/worksheets/_rels/sheet2.xml.rels'].decode('utf-8')
    removed_rids = []
    for ref in ('AA39', 'AA40', 'E54'):
        m = re.search(rf'<hyperlink ref="{ref}" r:id="(rId\d+)"[^>]*/>', s)
        if not m:
            raise RuntimeError(f'하이퍼링크 없음: {ref}')
        removed_rids.append(m.group(1))
        s = s.replace(m.group(0), '', 1)
    for rid in removed_rids:
        rm = re.search(rf'<Relationship Id="{rid}" [^>]*TargetMode="External"/>', rels)
        if not rm or 'mailto:' not in rm.group(0):
            raise RuntimeError(f'mailto rel 확인 실패: {rid}')
        rels = rels.replace(rm.group(0), '', 1)
    files['xl/worksheets/sheet2.xml'] = s.encode('utf-8')
    files['xl/worksheets/_rels/sheet2.xml.rels'] = rels.encode('utf-8')

    # ── ④ 공지문 장르 체크박스 초기화 (클래식/무용 해제 — 즉시/일시선택·해당없음은 현상 유지) ──
    v2 = files['xl/drawings/vmlDrawing2.vml'].decode('utf-8')
    hits = 0
    def uncheck(mm):
        nonlocal hits
        body = mm.group(0)
        runs = ''.join(re.findall(r'<font[^>]*>([^<]*)</font>', body)).replace('&amp;', '&').replace(' ', '')
        if runs == '클래식/무용' and '<x:Checked>1</x:Checked>' in body:
            hits += 1
            return body.replace('<x:Checked>1</x:Checked>', '')
        return body
    v2 = re.sub(r'<v:shape id="[^"]+"[\s\S]*?</v:shape>', uncheck, v2)
    if hits != 1:
        raise RuntimeError(f'클래식/무용 체크 해제 {hits}건(1건이어야)')
    files['xl/drawings/vmlDrawing2.vml'] = v2.encode('utf-8')
    cp56 = files['xl/ctrlProps/ctrlProp56.xml'].decode('utf-8')
    if 'checked="Checked"' not in cp56:
        raise RuntimeError('ctrlProp56 체크 상태 아님 — 매핑 확인 필요')
    files['xl/ctrlProps/ctrlProp56.xml'] = cp56.replace(' checked="Checked"', '').encode('utf-8')

    # ── ⑤ workbook.xml — Claude Log 시트 완전 제거 + activeTab 의뢰서 ──
    wb = files['xl/workbook.xml'].decode('utf-8')
    old = '<sheet name="Claude Log" sheetId="9" r:id="rId1"/>'
    assert old in wb
    wb = wb.replace(old, '', 1)
    assert 'activeTab="2"' in wb
    wb = wb.replace('activeTab="2"', 'activeTab="0"', 1)  # 시트 삭제 후 의뢰서 = 0번
    # Print_Area localSheetId 재배열(시트 1개 삭제 → 인덱스 1·2 → 0·1)
    a = "<definedName name=\"_xlnm.Print_Area\" localSheetId=\"1\">'1.판매대행의뢰서'!"
    b = "<definedName name=\"_xlnm.Print_Area\" localSheetId=\"2\">'2.티켓오픈공지문'!"
    assert a in wb and b in wb
    wb = wb.replace(a, a.replace('localSheetId="1"', 'localSheetId="0"'), 1)
    wb = wb.replace(b, b.replace('localSheetId="2"', 'localSheetId="1"'), 1)
    # 시트 파트·rels·Content_Types·calcChain 연쇄 제거
    del files['xl/worksheets/sheet1.xml']
    rels = files['xl/_rels/workbook.xml.rels'].decode('utf-8')
    for pat in (r'<Relationship Id="rId1" [^>]*Target="worksheets/sheet1\.xml"/>',
                r'<Relationship Id="rId8" [^>]*Target="calcChain\.xml"/>'):
        rels, n = re.subn(pat, '', rels)
        assert n == 1, pat
    files['xl/_rels/workbook.xml.rels'] = rels.encode('utf-8')
    del files['xl/calcChain.xml']  # fullCalcOnLoad가 열 때 재구축(감사3 LOW: AG15 잔존 엔트리도 함께 해소)
    ct = files['[Content_Types].xml'].decode('utf-8')
    for pat in (r'<Override PartName="/xl/worksheets/sheet1\.xml"[^>]*/>',
                r'<Override PartName="/xl/calcChain\.xml"[^>]*/>'):
        ct, n = re.subn(pat, '', ct)
        assert n == 1, pat
    files['[Content_Types].xml'] = ct.encode('utf-8')
    # app.xml 시트 목록에서 제거(TitlesOfParts vector 6→5 · HeadingPairs 워크시트 4→3)
    app = files['docProps/app.xml'].decode('utf-8')
    assert '<vt:lpstr>Claude Log</vt:lpstr>' in app
    app = app.replace('<vt:lpstr>Claude Log</vt:lpstr>', '', 1)
    app = app.replace('<TitlesOfParts><vt:vector size="6"', '<TitlesOfParts><vt:vector size="5"', 1)
    app = app.replace('<vt:variant><vt:i4>4</vt:i4></vt:variant>', '<vt:variant><vt:i4>3</vt:i4></vt:variant>', 1)
    files['docProps/app.xml'] = app.encode('utf-8')

    # ── ⑤-0 VBA — Claude Log의 문서 모듈(Sheet3, 빈 모듈) 제거(고아 모듈 잔존 방지) ──
    ole = olefile.OleFileIO(io.BytesIO(files['xl/vbaProject.bin']))
    streams = {'/'.join(p): ole.openstream('/'.join(p)).read() for p in ole.listdir()}
    ole.close()
    dirdata = bytearray(ovba_decompress(streams['VBA/dir']))
    # dir에서 Sheet3 MODULE 레코드 블록(0x19 MODULENAME ~ 0x2B terminator) 제거 + PROJECTMODULES count 감소
    i = 0; s3_start = None; s3_end = None; modcount_pos = None
    while i < len(dirdata) - 6:
        rid, sz = struct.unpack('<HI', dirdata[i:i+6])
        if rid == 0x09: sz = 6
        data = bytes(dirdata[i+6:i+6+sz])
        if rid == 0x0F: modcount_pos = i + 6
        if rid == 0x19 and data == b'Sheet3': s3_start = i
        if rid == 0x2B and s3_start is not None and s3_end is None: s3_end = i + 6 + sz
        if rid == 0x10: break
        i += 6 + sz
    assert s3_start is not None and s3_end is not None and modcount_pos is not None
    n_mod = struct.unpack_from('<H', dirdata, modcount_pos)[0]
    struct.pack_into('<H', dirdata, modcount_pos, n_mod - 1)
    dirdata = dirdata[:s3_start] + dirdata[s3_end:]
    comp = ovba_compress(bytes(dirdata))
    assert ovba_decompress(comp) == bytes(dirdata)
    streams['VBA/dir'] = comp
    del streams['VBA/Sheet3']
    # PROJECT 스트림에서 Document=Sheet3·Workspace Sheet3 줄 제거
    proj = streams['PROJECT'].decode('cp949')
    proj, n1 = re.subn(r'Document=Sheet3/&H00000000\r\n', '', proj)
    proj, n2 = re.subn(r'Sheet3=\d+, \d+, \d+, \d+, [A-Z]?\r\n', '', proj)
    assert n1 == 1 and n2 == 1
    streams['PROJECT'] = proj.encode('cp949')
    # PROJECTwm 이름 맵에서 Sheet3 항목 제거
    wm = streams['PROJECTwm']
    entry = b'Sheet3\x00' + 'Sheet3'.encode('utf-16-le') + b'\x00\x00'
    assert wm.count(entry) == 1
    streams['PROJECTwm'] = wm.replace(entry, b'', 1)
    vba_children = [Ent(k.split('/', 1)[1], 2, v) for k, v in streams.items() if k.startswith('VBA/')]
    root = Ent('Root Entry', 5, children=[
        Ent('PROJECT', 2, streams['PROJECT']),
        Ent('PROJECTwm', 2, streams['PROJECTwm']),
        Ent('VBA', 1, children=vba_children)])
    new_bin = cfb_write(root)
    ole2 = olefile.OleFileIO(io.BytesIO(new_bin))
    for k, v in streams.items():
        assert ole2.openstream(k).read() == v, k
    assert not ole2.exists('VBA/Sheet3')
    ole2.close()
    files['xl/vbaProject.bin'] = new_bin
    print(f'VBA 모듈 {n_mod}→{n_mod - 1}개(Sheet3 제거)')
    # ⑤-a 로컬 저장 경로 메타(absPath — 사용자 경로 노출) 제거
    wb, nabs = re.subn(r'<mc:AlternateContent[^>]*>(?:(?!</mc:AlternateContent>)[\s\S])*?absPath[\s\S]*?</mc:AlternateContent>', '', wb)
    if nabs != 1:
        raise RuntimeError(f'absPath 블록 제거 {nabs}건(1건이어야)')
    # ⑤-b 열 때 전체 재계산 굽기 — 수식 캐시 제거(③)와 한 쌍
    if 'fullCalcOnLoad' not in wb:
        wb = wb.replace('<calcPr ', '<calcPr fullCalcOnLoad="1" ', 1)
    assert 'fullCalcOnLoad' in wb
    files['xl/workbook.xml'] = wb.encode('utf-8')

    # ── ⑤-c 문서 속성 — 작성자/수정자 = 현행 공개 템플릿과 동일 표기 ──
    core = files['docProps/core.xml'].decode('utf-8')
    core = re.sub(r'<dc:creator>[^<]*</dc:creator>', '<dc:creator>GS칼텍스 예울마루</dc:creator>', core)
    core = re.sub(r'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '<cp:lastModifiedBy>GS칼텍스 예울마루</cp:lastModifiedBy>', core)
    files['docProps/core.xml'] = core.encode('utf-8')

    # ── ⑥ sharedStrings 가비지 컬렉션 — 미참조 si 텍스트 전부 비움 ──
    # 셀 스크럽으로 참조가 끊긴 문자열(공연명·할인정보·휴대폰·이메일·티켓링크 계정 등)을
    # 원본 텍스트째 제거. 인덱스는 보존(<t/>로 대체)이라 남은 참조는 전부 유효.
    used = set()
    for name, data in files.items():
        if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
            x = data.decode('utf-8')
            for m in re.finditer(r'<c [^>]*t="s"[^>]*><v>(\d+)</v></c>', x):
                used.add(int(m.group(1)))
    ss = files['xl/sharedStrings.xml'].decode('utf-8')
    head_end = ss.index('<si>')
    tail_start = ss.rindex('</si>') + len('</si>')
    sis = re.findall(r'<si>[\s\S]*?</si>', ss[head_end:tail_start])
    blanked = 0
    for i in range(len(sis)):
        if i not in used and sis[i] != '<si><t/></si>':
            sis[i] = '<si><t/></si>'
            blanked += 1
    files['xl/sharedStrings.xml'] = (ss[:head_end] + ''.join(sis) + ss[tail_start:]).encode('utf-8')
    print(f'미참조 문자열 비움: {blanked}개 (참조 유지 {len(used)}개)')

    # ── zip 재작성 ──
    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for name in infos:
        if name not in files:
            continue  # 삭제 파트(sheet1.xml·calcChain.xml)
        zi = zipfile.ZipInfo(name, date_time=infos[name].date_time)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = infos[name].external_attr
        zout.writestr(zi, files[name])
    zout.close()

    # ── 자체 검증: 개인정보·공연 잔재 문자열 전무(전 파트·utf8+cp949) + 필수 자산 잔존 ──
    zc = zipfile.ZipFile(dst)
    blob = b''.join(zc.read(n) for n in zc.namelist() if not n.endswith('.png'))
    for p in ['ems1130', '황세웅', '010-3021', '010-4654', '010-5643', 'mingxi@', 'ep_park@',
              '브런치 콘서트', '열정과 고독사이', '기획자 지정석', 'C:\\Users',
              'Claude Log', 'Claude Code', 'Turn #']:
        if p.encode('utf-8') in blob or p.encode('cp949', 'ignore') in blob:
            raise RuntimeError(f'스크럽 실패 — 잔존: {p}')
    assert 'xl/worksheets/sheet1.xml' not in zc.namelist()
    assert 'xl/calcChain.xml' not in zc.namelist()
    for keep in ['구분목록', '장소_전시', 'GS칼텍스 예울마루 장도 전시실', '─ 구분 목록',
                 '해당 없음', '첨부']:
        if keep.encode('utf-8') not in blob:
            raise RuntimeError(f'필수 자산 소실: {keep}')
    ct = zc.read('[Content_Types].xml')
    if b'macroEnabled' not in ct or b'vbaProject' not in ct:
        raise RuntimeError('VBA/macroEnabled 콘텐츠 타입 소실')
    zc.close()
    print('스크럽 완료 →', dst)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
