#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""판매대행의뢰서 xlsm 업그레이드 (260710)
1) 시트 '1.판매대행의뢰서': 대분류/소분류 2단 행 아웃라인 그룹(기본 펼침) + 헬퍼 열 그룹
   + 구분(공연/전시/예술교육) 드롭다운(AH8) → 장소(G8) 목록 연동(INDIRECT + 정의이름)
2) 시트 '3.이미지 사이즈표': 더블클릭 VBA = OLE 임베드 → [첨부파일] 폴더 복사+하이퍼링크로 교체
   (vbaProject.bin: MS-OVBA 재압축 + CFB 재조립 — 나머지 스트림 바이트 보존)
3) Claude Log Turn 7 기록 + 사이즈표 G열 안내문구 갱신
zip은 엔트리 단위 외과수술 — 대상 외 파트는 바이트 그대로 복사(체크박스·서식·매크로 보존).
사용법: python3 upgrade_ticketlink_xlsm.py 원본.xlsm 출력.xlsm
"""
import re, struct, sys, zipfile
import olefile

# ══════════════════ MS-OVBA 압축 컨테이너 ══════════════════

def ovba_decompress(data):
    if data[0] != 0x01:
        raise ValueError('CompressedContainer 시그니처 아님')
    out = bytearray(); i = 1
    while i < len(data):
        hdr = struct.unpack('<H', data[i:i+2])[0]; i += 2
        size = (hdr & 0x0FFF) + 3
        compressed = (hdr & 0x8000) != 0
        chunk_end = i + size - 2
        chunk_start_out = len(out)
        if not compressed:
            out += data[i:i+4096]; i += 4096
        else:
            while i < chunk_end:
                flags = data[i]; i += 1
                for bit in range(8):
                    if i >= chunk_end:
                        break
                    if flags & (1 << bit):
                        tok = struct.unpack('<H', data[i:i+2])[0]; i += 2
                        pos = len(out) - chunk_start_out
                        bc = 4
                        while (1 << bc) < pos:
                            bc += 1
                        lenbits = 16 - bc
                        length = (tok & ((1 << lenbits) - 1)) + 3
                        offset = (tok >> lenbits) + 1
                        for _ in range(length):
                            out.append(out[len(out) - offset])
                    else:
                        out.append(data[i]); i += 1
    return bytes(out)

def _ovba_compress_chunk(chunk):
    """청크 1개(<=4096B) 압축. (compressed_bytes | None) — None이면 압축 실패(팽창)."""
    out = bytearray(); i = 0; n = len(chunk)
    while i < n:
        flags = 0; flag_pos = len(out); out.append(0)
        for bit in range(8):
            if i >= n:
                break
            # 현재 위치 기준 bitcount (디컴프레서와 동일식)
            pos = i
            bc = 4
            while (1 << bc) < pos:
                bc += 1
            lenbits = 16 - bc
            max_len = ((1 << lenbits) - 1) + 3
            max_off = 1 << bc
            best_len = 0; best_off = 0
            if pos > 0:
                start = max(0, pos - max_off)
                for cand in range(start, pos):
                    l = 0
                    off = pos - cand
                    while (i + l < n and l < max_len and chunk[cand + (l % off)] == chunk[i + l]):
                        l += 1
                    if l >= 3 and l > best_len:
                        best_len = l; best_off = off
            if best_len >= 3:
                tok = ((best_off - 1) << lenbits) | (best_len - 3)
                out += struct.pack('<H', tok)
                flags |= (1 << bit)
                i += best_len
            else:
                out.append(chunk[i]); i += 1
        out[flag_pos] = flags
        if len(out) >= 4096:
            return None
    return bytes(out)

def ovba_compress(data):
    out = bytearray(b'\x01')
    for cs in range(0, len(data), 4096):
        chunk = data[cs:cs+4096]
        comp = _ovba_compress_chunk(chunk)
        if comp is None:
            if len(chunk) != 4096:
                raise ValueError('마지막 청크 팽창 — 지원 안 함(텍스트 소스에선 발생 불가)')
            hdr = (4098 - 3) | 0x3000  # raw
            out += struct.pack('<H', hdr) + chunk
        else:
            hdr = (len(comp) + 2 - 3) | 0x3000 | 0x8000
            out += struct.pack('<H', hdr) + comp
    return bytes(out)

# ══════════════════ CFB(복합 파일) 라이터 ══════════════════

ENDOFCHAIN = 0xFFFFFFFE
FATSECT    = 0xFFFFFFFD
FREESECT   = 0xFFFFFFFF
NOSTREAM   = 0xFFFFFFFF

class Ent:
    def __init__(self, name, typ, data=b'', clsid=b'\x00'*16, children=None):
        self.name, self.typ, self.data, self.clsid = name, typ, data, clsid
        self.children = children if children is not None else []
        self.sid = None; self.left = NOSTREAM; self.right = NOSTREAM; self.child = NOSTREAM
        self.start = ENDOFCHAIN; self.size = 0

def _build_tree(children):
    """형제들을 (이름길이, 대문자) 정렬 후 balanced BST — 서브트리 루트 SID 반환."""
    if not children:
        return NOSTREAM
    kids = sorted(children, key=lambda e: (len(e.name), e.name.upper()))
    def build(lo, hi):
        if lo > hi:
            return NOSTREAM
        mid = (lo + hi) // 2
        node = kids[mid]
        node.left = build(lo, mid - 1)
        node.right = build(mid + 1, hi)
        return node.sid
    return build(0, len(kids) - 1)

def cfb_write(root):
    """root = Ent('Root Entry', 5, children=[...]). 모든 스트림 < 4096B 가정(미니스트림)."""
    # 1) 엔트리 평탄화(SID 부여 — 루트 먼저, 이후 DFS)
    entries = []
    def flatten(e):
        e.sid = len(entries); entries.append(e)
        for c in e.children:
            flatten(c)
    flatten(root)
    for e in entries:
        if e.typ in (1, 5):
            e.child = _build_tree(e.children)
        if e.typ == 2 and len(e.data) >= 4096:
            raise ValueError(f'{e.name}: 4096B 이상 스트림은 미구현')
    # 2) 미니스트림 조립
    mini = bytearray(); minifat = []
    for e in entries:
        if e.typ != 2:
            continue
        e.size = len(e.data)
        if e.size == 0:
            e.start = ENDOFCHAIN; continue
        nsec = (e.size + 63) // 64
        e.start = len(minifat)
        for k in range(nsec):
            minifat.append(e.start + k + 1 if k < nsec - 1 else ENDOFCHAIN)
        mini += e.data + b'\x00' * (nsec * 64 - e.size)
    # 3) 섹터 배치: [dir][minifat][ministream][fat]
    ndir = (len(entries) * 128 + 511) // 512
    nminifat = (len(minifat) * 4 + 511) // 512
    nmini = (len(mini) + 511) // 512
    base = ndir + nminifat + nmini
    nfat = 1
    while ((base + nfat) * 4 + 511) // 512 > nfat:
        nfat += 1
    total = base + nfat
    dir_first = 0
    minifat_first = ndir if nminifat else ENDOFCHAIN
    mini_first = ndir + nminifat if nmini else ENDOFCHAIN
    root.start = mini_first if nmini else ENDOFCHAIN
    root.size = len(mini)
    # 4) FAT
    fat = [FREESECT] * (nfat * 128)
    for k in range(ndir):
        fat[dir_first + k] = dir_first + k + 1 if k < ndir - 1 else ENDOFCHAIN
    for k in range(nminifat):
        fat[minifat_first + k] = minifat_first + k + 1 if k < nminifat - 1 else ENDOFCHAIN
    for k in range(nmini):
        fat[mini_first + k] = mini_first + k + 1 if k < nmini - 1 else ENDOFCHAIN
    for k in range(nfat):
        fat[base + k] = FATSECT
    # 5) 헤더
    hdr = bytearray(512)
    hdr[0:8] = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
    struct.pack_into('<HHHHH', hdr, 24, 0x003E, 0x0003, 0xFFFE, 0x0009, 0x0006)
    struct.pack_into('<I', hdr, 44, nfat)
    struct.pack_into('<I', hdr, 48, dir_first)
    struct.pack_into('<I', hdr, 56, 4096)
    struct.pack_into('<I', hdr, 60, minifat_first if nminifat else ENDOFCHAIN)
    struct.pack_into('<I', hdr, 64, nminifat)
    struct.pack_into('<I', hdr, 68, ENDOFCHAIN)  # DIFAT 체인 없음
    struct.pack_into('<I', hdr, 72, 0)
    for k in range(109):
        struct.pack_into('<I', hdr, 76 + k * 4, base + k if k < nfat else FREESECT)
    # 6) 디렉토리 섹터
    dirbytes = bytearray()
    for e in entries:
        raw = bytearray(128)
        nm = e.name.encode('utf-16-le') + b'\x00\x00'
        if len(nm) > 64:
            raise ValueError('이름 과길이')
        raw[0:len(nm)] = nm
        struct.pack_into('<H', raw, 64, len(nm))
        raw[66] = e.typ
        raw[67] = 1  # black
        struct.pack_into('<III', raw, 68, e.left, e.right, e.child)
        raw[80:96] = e.clsid
        struct.pack_into('<I', raw, 116, e.start if e.typ in (2, 5) else 0)
        struct.pack_into('<Q', raw, 120, e.size if e.typ in (2, 5) else 0)
        dirbytes += raw
    dirbytes += b'\x00' * (ndir * 512 - len(dirbytes))
    # 빈 자리 = 미사용 엔트리 표식(type 0, sibling NOSTREAM)
    for k in range(len(entries), ndir * 4):
        off = k * 128
        struct.pack_into('<III', dirbytes, off + 68, NOSTREAM, NOSTREAM, NOSTREAM)
    # 7) 본문 조립
    body = bytearray()
    body += dirbytes
    mf = bytearray()
    for v in minifat:
        mf += struct.pack('<I', v)
    mf += b'\xff' * (nminifat * 512 - len(mf))
    body += mf
    body += mini + b'\x00' * (nmini * 512 - len(mini))
    fb = bytearray()
    for v in fat:
        fb += struct.pack('<I', v)
    body += fb
    assert len(body) == total * 512
    return bytes(hdr) + bytes(body)

# ══════════════════ vbaProject.bin 재조립 ══════════════════

NEW_SHEET4_CODE = '''Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
    ' G열(7) 4~14행 더블클릭 = 파일 첨부
    ' 통합 문서 옆 [첨부파일] 폴더에 "NN_항목_원본이름"으로 복사하고 셀에 링크를 건다.
    ' 링크 클릭 = 그 파일 열기. 같은 항목 재첨부 = 기존 첨부 교체.
    If Target.Column <> 7 Or Target.Row < 4 Or Target.Row > 14 Then Exit Sub
    Cancel = True
    On Error GoTo Fail
    If ThisWorkbook.Path = "" Then
        MsgBox "먼저 통합 문서를 저장해 주세요." & vbCrLf & _
               "저장된 위치 옆에 [첨부파일] 폴더를 만들어 관리합니다.", vbExclamation, "파일 첨부"
        Exit Sub
    End If
    Dim itemName As String
    itemName = Trim(CStr(Me.Cells(Target.Row, 2).Value))
    If itemName = "" Then itemName = "기타"
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    fd.AllowMultiSelect = False
    fd.Title = "첨부할 파일 선택 - " & itemName
    If fd.Show <> -1 Then Exit Sub
    Dim srcPath As String
    srcPath = fd.SelectedItems(1)
    Dim sep As String
    sep = Application.PathSeparator
    Dim dstDir As String
    dstDir = ThisWorkbook.Path & sep & "첨부파일"
    If Dir(dstDir, vbDirectory) = "" Then MkDir dstDir
    Dim seq As String
    seq = Format(Target.Row - 3, "00")   ' 01~11 = 사이즈표 항목 순번
    ' 항목명에서 파일명 금지 문자 제거
    Dim safeItem As String, badChars As Variant, k As Long
    safeItem = itemName
    badChars = Array("\\", "/", ":", "*", "?", """", "<", ">", "|")
    For k = LBound(badChars) To UBound(badChars)
        safeItem = Replace(safeItem, badChars(k), "-")
    Next k
    ' 같은 순번의 기존 첨부 수집 후 삭제(= 교체)
    Dim olds(0 To 30) As String, nOld As Long, f As String
    f = Dir(dstDir & sep & seq & "_*")
    Do While f <> "" And nOld <= 30
        olds(nOld) = f
        nOld = nOld + 1
        f = Dir()
    Loop
    On Error Resume Next
    For k = 0 To nOld - 1
        Kill dstDir & sep & olds(k)
    Next k
    On Error GoTo Fail
    Dim baseName As String
    baseName = Mid(srcPath, InStrRev(srcPath, sep) + 1)
    Dim dstName As String
    dstName = seq & "_" & safeItem & "_" & baseName
    FileCopy srcPath, dstDir & sep & dstName
    Me.Hyperlinks.Add Anchor:=Target, Address:="첨부파일" & sep & dstName, _
        TextToDisplay:=dstName
    Exit Sub
Fail:
    MsgBox "첨부 실패: " & Err.Description, vbCritical, "파일 첨부"
End Sub
'''

def rebuild_vba(bin_bytes):
    import io
    ole = olefile.OleFileIO(io.BytesIO(bin_bytes))
    streams = {'/'.join(p): ole.openstream('/'.join(p)).read() for p in ole.listdir()}
    # 원본 CLSID 전부 빈 값 확인됨(사전 실측) — 0으로 재작성
    ole.close()

    # ── Sheet4 소스 교체 ──
    dirdata = bytearray(ovba_decompress(streams['VBA/dir']))
    # dir 레코드 걷기 — Sheet4의 MODULEOFFSET 레코드 위치 찾기
    i = 0; cur_name = None; sheet4_off = None; sheet4_offpos = None
    while i < len(dirdata) - 6:
        rid, sz = struct.unpack('<HI', dirdata[i:i+6])
        if rid == 0x09:
            sz = 6  # PROJECTVERSION 고정 크기
        data = bytes(dirdata[i+6:i+6+sz])
        if rid == 0x19:
            cur_name = data.decode('cp949')
        elif rid == 0x31 and cur_name == 'Sheet4':
            sheet4_off = struct.unpack('<I', data)[0]
            sheet4_offpos = i + 6
        elif rid == 0x10:
            break
        i += 6 + sz
    if sheet4_off is None:
        raise RuntimeError('dir에서 Sheet4 MODULEOFFSET 못 찾음')

    old_stream = streams['VBA/Sheet4']
    old_src = ovba_decompress(old_stream[sheet4_off:]).decode('cp949')
    # Attribute 헤더 보존 + 코드부 교체
    attr_lines = [l for l in old_src.split('\r\n') if l.startswith('Attribute ')]
    if not attr_lines:
        raise RuntimeError('Sheet4 Attribute 헤더 못 찾음')
    new_src = '\r\n'.join(attr_lines) + '\r\n' + NEW_SHEET4_CODE.replace('\n', '\r\n')
    new_bytes = new_src.encode('cp949')
    comp = ovba_compress(new_bytes)
    if ovba_decompress(comp) != new_bytes:
        raise RuntimeError('OVBA 압축 라운드트립 실패')
    streams['VBA/Sheet4'] = comp             # 성능 캐시 없음 → TextOffset 0
    struct.pack_into('<I', dirdata, sheet4_offpos, 0)
    dircomp = ovba_compress(bytes(dirdata))
    if ovba_decompress(dircomp) != bytes(dirdata):
        raise RuntimeError('dir 재압축 라운드트립 실패')
    streams['VBA/dir'] = dircomp
    # _VBA_PROJECT 버전 워드(오프셋 2~3) 무효화 → 열 때 전 모듈 소스 재컴파일 강제
    # (교체된 Sheet4에 낡은 p-code 캐시가 절대 못 붙게 — 시그니처 0x61CC는 유지)
    vp = bytearray(streams['VBA/_VBA_PROJECT'])
    assert vp[0:2] == b'\xcc\x61'
    vp[2:4] = b'\xff\xff'
    streams['VBA/_VBA_PROJECT'] = bytes(vp)

    # ── CFB 재조립 (트리 = 원본과 동일 구성) ──
    vba_children = [Ent(n.split('/', 1)[1], 2, streams[n])
                    for n in streams if n.startswith('VBA/')]
    root = Ent('Root Entry', 5, children=[
        Ent('PROJECT', 2, streams['PROJECT']),
        Ent('PROJECTwm', 2, streams['PROJECTwm']),
        Ent('VBA', 1, children=vba_children),
    ])
    out = cfb_write(root)

    # 자체 검증: 재파싱 + 스트림 일치
    import io
    ole2 = olefile.OleFileIO(io.BytesIO(out))
    for name, want in streams.items():
        got = ole2.openstream(name).read()
        if got != want:
            raise RuntimeError(f'CFB 재조립 검증 실패: {name}')
    ole2.close()
    return out, old_src, new_src

# ══════════════════ XML 수술 ══════════════════

def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

class SST:
    """sharedStrings 관리 — 재사용 or append."""
    def __init__(self, xml):
        self.xml = xml
        self.items = re.findall(r'<si>(.*?)</si>', xml, re.S)
        self.appended = []
        self.ref_added = 0
    def idx(self, text):
        for i, s in enumerate(self.items):
            m = re.fullmatch(r'<t(?: xml:space="preserve")?>([^<]*)</t>(?:<phoneticPr[^>]*/>)?', s)
            if m and m.group(1) == text:
                self.ref_added += 1
                return i
        for j, t in enumerate(self.appended):
            if t == text:
                self.ref_added += 1
                return len(self.items) + j
        self.appended.append(text)
        self.ref_added += 1
        return len(self.items) + len(self.appended) - 1
    def replace_si(self, i, text):
        old = '<si>' + self.items[i] + '</si>'
        new = '<si><t>' + esc(text) + '</t></si>'
        assert old in self.xml, 'si 원문 불일치'
        self.xml = self.xml.replace(old, new, 1)
        self.items[i] = '<t>' + esc(text) + '</t>'
    def dump(self):
        m = re.search(r'<sst([^>]*)count="(\d+)"([^>]*)uniqueCount="(\d+)"', self.xml)
        cnt, uc = int(m.group(2)), int(m.group(4))
        xml = self.xml
        add = ''.join('<si><t' + (' xml:space="preserve"' if t != t.strip() else '') + '>'
                      + esc(t) + '</t></si>' for t in self.appended)
        xml = xml.replace('</sst>', add + '</sst>')
        xml = xml.replace(m.group(0),
                          f'<sst{m.group(1)}count="{cnt + self.ref_added}"{m.group(3)}uniqueCount="{uc + len(self.appended)}"', 1)
        return xml

def cell_xml(ref, si=None, num=None, style=None):
    s = f' s="{style}"' if style is not None else ''
    if si is not None:
        return f'<c r="{ref}"{s} t="s"><v>{si}</v></c>'
    return f'<c r="{ref}"{s}><v>{num}</v></c>'

def col_num(ref):
    m = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in m:
        n = n * 26 + (ord(ch) - 64)
    return n

def insert_cells_in_row(sheet_xml, row_num, new_cells):
    """행 안에 셀들을 열 순서에 맞게 삽입. new_cells = [(ref, xml)] 열 오름차순."""
    m = re.search(rf'(<row r="{row_num}"[^>]*>)(.*?)(</row>)', sheet_xml, re.S)
    if not m:
        raise RuntimeError(f'row {row_num} 없음')
    head, body, tail = m.group(1), m.group(2), m.group(3)
    cells = re.findall(r'<c r="([A-Z]+\d+)"[^>]*(?:/>|>.*?</c>)', body)
    parts = re.findall(r'<c r="[A-Z]+\d+"[^>]*(?:/>|>.*?</c>)', body)
    assert ''.join(parts) == body, f'row {row_num} 셀 외 콘텐츠 존재'
    result = []
    ni = 0
    for p, ref in zip(parts, cells):
        while ni < len(new_cells) and col_num(new_cells[ni][0]) < col_num(ref):
            result.append(new_cells[ni][1]); ni += 1
        if ni < len(new_cells) and col_num(new_cells[ni][0]) == col_num(ref):
            raise RuntimeError(f'셀 충돌: {new_cells[ni][0]}')
        result.append(p)
    while ni < len(new_cells):
        result.append(new_cells[ni][1]); ni += 1
    return sheet_xml.replace(m.group(0), head + ''.join(result) + tail, 1)

def upgrade(src_path, dst_path):
    zin = zipfile.ZipFile(src_path)
    files = {n: zin.read(n) for n in zin.namelist()}
    infos = {i.filename: i for i in zin.infolist()}
    zin.close()

    sst = SST(files['xl/sharedStrings.xml'].decode('utf-8'))

    # ── ① 시트1(의뢰서) = sheet2.xml ──
    s = files['xl/worksheets/sheet2.xml'].decode('utf-8')

    # outlinePr (summaryBelow=0: 토글이 섹션 머리행 / summaryRight=0: 열 토글이 그룹 왼쪽)
    old = '<sheetPr codeName="Sheet1"><pageSetUpPr fitToPage="1"/></sheetPr>'
    assert old in s
    s = s.replace(old, '<sheetPr codeName="Sheet1"><outlinePr summaryBelow="0" summaryRight="0"/><pageSetUpPr fitToPage="1"/></sheetPr>', 1)

    # sheetFormatPr에 최대 아웃라인 레벨
    old = '<sheetFormatPr defaultColWidth="9" defaultRowHeight="23.25" customHeight="1" x14ac:dyDescent="0.4"/>'
    assert old in s
    s = s.replace(old, '<sheetFormatPr defaultColWidth="9" defaultRowHeight="23.25" customHeight="1" outlineLevelRow="2" outlineLevelCol="1" x14ac:dyDescent="0.4"/>', 1)

    # cols: AG 폭 확대(라벨 '구분'), AJ=열 그룹 토글 자리(collapsed), AK~AN 숨김 그룹
    repl = [
        ('<col min="33" max="33" width="3.8984375" style="1" customWidth="1"/>',
         '<col min="33" max="33" width="5.59765625" style="1" customWidth="1"/>'),
        ('<col min="34" max="36" width="9" style="1"/>',
         '<col min="34" max="35" width="9" style="1"/><col min="36" max="36" width="9" style="1" collapsed="1"/>'),
        ('<col min="37" max="38" width="9" style="1" hidden="1" customWidth="1"/>',
         '<col min="37" max="38" width="9" style="1" hidden="1" customWidth="1" outlineLevel="1"/>'),
        ('<col min="39" max="16384" width="9" style="1"/>',
         '<col min="39" max="40" width="9" style="1" hidden="1" outlineLevel="1"/><col min="41" max="16384" width="9" style="1"/>'),
    ]
    for a, b in repl:
        assert a in s, a
        s = s.replace(a, b, 1)

    # 행 아웃라인 레벨 (기본 펼침 — hidden 없음)
    L1 = ({9, 11, 20, 21, 22, 29, 30, 31, 34} | set(range(39, 44))
          | set(range(46, 53)) | {54} | set(range(58, 63)))
    L2 = (set(range(5, 9)) | {10} | set(range(12, 20)) | set(range(23, 29))
          | {32, 33} | set(range(35, 38)))
    def add_level(m):
        r = int(m.group(1))
        lvl = 2 if r in L2 else (1 if r in L1 else 0)
        if lvl == 0:
            return m.group(0)
        assert 'outlineLevel' not in m.group(0)
        return m.group(0)[:-1] + f' outlineLevel="{lvl}">'
    s = re.sub(r'<row r="(\d+)"[^>]*>', add_level, s)

    # 헬퍼 셀: AH8 구분 선택 + AK12~AN14 목록 (AK2:AK10 장르 리스트 아래 빈 구역)
    si = {t: sst.idx(t) for t in (
        '구분', '공연', '전시', '예술교육',
        'GS칼텍스 예울마루 대극장', 'GS칼텍스 예울마루 소극장',
        'GS칼텍스 예울마루 7층 전시실', 'GS칼텍스 예울마루 장도 전시실',
        '─ 구분 목록', '장소(공연)', '장소(전시)', '장소(예술교육)')}
    s = insert_cells_in_row(s, 8, [
        ('AG8', cell_xml('AG8', si=si['구분'], style=1)),
        ('AH8', cell_xml('AH8', si=si['공연'], style=1)),
    ])
    s = insert_cells_in_row(s, 12, [
        ('AK12', cell_xml('AK12', si=si['─ 구분 목록'], style=1)),
        ('AL12', cell_xml('AL12', si=si['장소(공연)'], style=1)),
        ('AM12', cell_xml('AM12', si=si['장소(전시)'], style=1)),
        ('AN12', cell_xml('AN12', si=si['장소(예술교육)'], style=1)),
    ])
    s = insert_cells_in_row(s, 13, [
        ('AK13', cell_xml('AK13', si=si['공연'], style=1)),
        ('AL13', cell_xml('AL13', si=si['GS칼텍스 예울마루 대극장'], style=1)),
        ('AM13', cell_xml('AM13', si=si['GS칼텍스 예울마루 7층 전시실'], style=1)),
        ('AN13', cell_xml('AN13', si=si['GS칼텍스 예울마루 소극장'], style=1)),
    ])
    s = insert_cells_in_row(s, 14, [
        ('AK14', cell_xml('AK14', si=si['전시'], style=1)),
        ('AL14', cell_xml('AL14', si=si['GS칼텍스 예울마루 소극장'], style=1)),
        ('AM14', cell_xml('AM14', si=si['GS칼텍스 예울마루 장도 전시실'], style=1)),
    ])
    s = insert_cells_in_row(s, 15, [
        ('AK15', cell_xml('AK15', si=si['예술교육'], style=1)),
    ])

    # 데이터 검증 2건 (phoneticPr 뒤 = CT_Worksheet 순서 준수)
    dv = ('<dataValidations count="2">'
          '<dataValidation type="list" errorStyle="warning" allowBlank="1" showInputMessage="1" showErrorMessage="1"'
          ' promptTitle="구분 선택" prompt="공연·전시·예술교육 중 선택 — 왼쪽 G8 장소 목록이 이 값에 귀속돼요." sqref="AH8">'
          '<formula1>구분목록</formula1></dataValidation>'
          '<dataValidation type="list" errorStyle="warning" allowBlank="1" showInputMessage="1" showErrorMessage="1"'
          ' promptTitle="장소 선택" prompt="구분(AH8)에 맞는 장소 목록이 떠요. 목록 밖 장소도 직접 입력 가능(경고 후 계속)." sqref="G8">'
          '<formula1>INDIRECT(&quot;장소_&quot;&amp;$AH$8)</formula1></dataValidation>'
          '</dataValidations>')
    m = re.search(r'<phoneticPr[^>]*/>', s)
    assert m
    s = s.replace(m.group(0), m.group(0) + dv, 1)

    # dimension 확장 (AL → AN)
    s = s.replace('<dimension ref="A1:AL62"/>', '<dimension ref="A1:AN62"/>', 1)
    files['xl/worksheets/sheet2.xml'] = s.encode('utf-8')

    # ── ② workbook.xml 정의이름 ──
    wb = files['xl/workbook.xml'].decode('utf-8')
    sheet_ref = "'1.판매대행의뢰서'"
    names = ('<definedName name="구분목록">{0}!$AK$13:$AK$15</definedName>'
             '<definedName name="장소_공연">{0}!$AL$13:$AL$14</definedName>'
             '<definedName name="장소_전시">{0}!$AM$13:$AM$14</definedName>'
             '<definedName name="장소_예술교육">{0}!$AN$13:$AN$13</definedName>').format(sheet_ref)
    assert '<definedNames>' in wb
    wb = wb.replace('<definedNames>', '<definedNames>' + names, 1)
    files['xl/workbook.xml'] = wb.encode('utf-8')

    # ── ③ 사이즈표 G열 안내문구 (si 238 공유 — G4:G14 일괄) ──
    x4 = files['xl/worksheets/sheet4.xml'].decode('utf-8')
    g_si = int(re.search(r'<c r="G4"[^>]*t="s"><v>(\d+)</v></c>', x4).group(1))
    sst.replace_si(g_si, '더블클릭 → 파일 선택 → 자동 첨부(폴더 복사+링크)')

    # ── ④ Claude Log Turn 7 ──
    x1 = files['xl/worksheets/sheet1.xml'].decode('utf-8')
    last_turn = max(int(v) for v in re.findall(r'<c r="A\d+"><v>(\d+)</v></c>', x1))
    lr = last_turn + 1
    date_serial = re.search(r'<c r="B\d+" s="(\d+)"><v>(\d+)</v></c>(?!.*<c r="B)', x1, re.S)
    b_style, b_val = date_serial.group(1), date_serial.group(2)
    log = {
        'C': '분류별 행·열 구분(접이식 그룹) + 구분(공연/전시/예술교육)별 장소 드롭다운 연동 + 첨부를 폴더 복사+링크로 개선 요청',
        'D': '시트1을 대분류/소분류 2단 행 그룹으로 정리(기본 펼침, 좌측 [1][2][3]·+/− 토글), AH8 구분 선택 → G8 장소 목록 연동(정의이름+INDIRECT), 사이즈표 더블클릭 매크로를 [첨부파일] 폴더 복사+하이퍼링크로 교체',
        'E': '행 그룹: 상품상세(5~37, 소분류 6개 L2)·기획사(39~43)·수수료(46~52)·관리자(54)·유의사항(58~62). 헬퍼 열 AK~AN 숨김 그룹(토글 AJ). 장소: 공연=대·소극장 / 전시=7층·장도 전시실 / 예술교육=소극장(목록 밖 직접 입력 허용—경고 후 계속). 첨부: 첨부파일₩NN_항목_원본명 복사 후 셀 링크, 재첨부=교체',
        'F': 'Claude Code에서 XML·VBA 직접 수정. 재파싱·값 무결성·LibreOffice 렌더 검증 통과. 열 때 [콘텐츠 사용] 눌러 매크로 활성화 필요',
    }
    row8 = (f'<row r="{lr + 1}" spans="1:6" x14ac:dyDescent="0.4">'
            + f'<c r="A{lr + 1}"><v>{lr}</v></c>'
            + f'<c r="B{lr + 1}" s="{b_style}"><v>{b_val}</v></c>'
            + ''.join(f'<c r="{c}{lr + 1}" t="s"><v>{sst.idx(t)}</v></c>' for c, t in log.items())
            + '</row>')
    x1 = x1.replace('</sheetData>', row8 + '</sheetData>', 1)
    x1 = re.sub(r'<dimension ref="A1:F\d+"/>', f'<dimension ref="A1:F{lr + 1}"/>', x1)
    files['xl/worksheets/sheet1.xml'] = x1.encode('utf-8')

    files['xl/sharedStrings.xml'] = sst.dump().encode('utf-8')

    # ── ⑤ VBA ──
    new_bin, old_src, new_src = rebuild_vba(files['xl/vbaProject.bin'])
    files['xl/vbaProject.bin'] = new_bin

    # ── zip 재작성 (원본 엔트리 순서 유지) ──
    zout = zipfile.ZipFile(dst_path, 'w', zipfile.ZIP_DEFLATED)
    for name in infos:
        zi = zipfile.ZipInfo(name, date_time=infos[name].date_time)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = infos[name].external_attr
        zout.writestr(zi, files[name])
    zout.close()
    return old_src, new_src

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    old_src, new_src = upgrade(src, dst)
    print('=== 기존 Sheet4 코드 (교체 전) ===')
    print(old_src[:400])
    print('=== 완료 →', dst)
