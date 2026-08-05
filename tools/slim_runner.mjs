#!/usr/bin/env node
/**
 * slim_runner.mjs — 용량 줄이기의 **러너 절반**(PDF · 구형 .hwp 전용).
 *
 * 앱(index.html ▸ 콘텐츠 제작 ▸ 용량 줄이기)의 두 갈래 중 ②. 나머지 7종
 * (.xlsx/.xlsm/.xltx/.docx/.dotx/.pptx/.potx/.hwpx)은 **브라우저가 직접 처리**하고 여기 오지 않는다 —
 * 그쪽은 전부 ZIP 컨테이너라 JSZip+캔버스로 끝나기 때문이다. 이 스크립트가 맡는 둘만 ZIP이 아니다:
 *
 *   · PDF  = XObject 구조 → Ghostscript(`-dPDFSETTINGS`)로 이미지 다운샘플. 글자는 글자로 남는다
 *            (페이지를 사진으로 굽는 방식이 아니다 — 공문에서 본문 검색·복사가 죽으면 못 쓴다).
 *   · .hwp = CFB 복합문서(HWP 5.0) → `cfb`로 컨테이너를 열고 `BinData/` 스트림의 사진만 바꿔 다시 쓴다.
 *
 * ⚠ 왜 claude -p 를 안 쓰나: 압축은 결정적 처리다. 판단할 게 없으므로 에이전트를 태울 이유가 없다
 *   (오피스문서 편집·한글문서 편집과 갈리는 지점 — 계정 체인·쿼터를 전혀 안 쓴다).
 *
 * ⚠ 두 가지 불변식 — 어기면 남의 공문을 망가뜨린다:
 *   ① **절대 안 키운다.** 결과가 원본 이상이면 원본을 그대로 내보낸다(이미 최적화된 파일 = 무접촉).
 *   ② **포맷을 안 바꾼다.** .hwp 의 BinData 이름(`BIN0001.jpg`)과 DocInfo 의 형식 문자열이 맞물려 있어
 *      jpg→png 같은 전환은 문서를 깨뜨린다. 같은 포맷으로 축소·재인코딩만 한다.
 *      (브라우저 쪽 OOXML 은 `.rels`·`[Content_Types].xml`을 따라 고칠 수 있어 전환을 허용한다 — 그쪽만의 특권.)
 *
 * 사용:  node tools/slim_runner.mjs --in <파일> --out <파일> --level screen|std|hq
 * 출력:  stdout 에 JSON 한 줄 {ok, from, to, kept, log[], note}
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';

// 세기 3단 — dim·q 는 index.html `_SL_LV` 와 **같은 값**이어야 한다(화면에서 고른 세기가 여기서 그대로 적용).
// dpi/mono = PDF 전용(길이 px 상한이라는 개념이 없어 해상도로 환산한 짝).
const LEVELS = {
  screen: { dim: 1200, q: 75, dpi: 72,  mono: 300 },
  std:    { dim: 1600, q: 82, dpi: 150, mono: 600 },
  hq:     { dim: 2400, q: 88, dpi: 220, mono: 900 },
};

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const IN = arg('in');
const OUT = arg('out');
const LV = LEVELS[arg('level', 'std')] || LEVELS.std;
if (!IN || !OUT) { console.error('usage: slim_runner.mjs --in <f> --out <f> [--level screen|std|hq]'); process.exit(2); }

const done = (o) => { console.log(JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };

// ── PDF — Ghostscript ────────────────────────────────────────────────────────
// ⚠ `-dPDFSETTINGS=/ebook` 같은 프리셋에 기대지 마라 — **사진을 안 줄인다**(260805 실측).
//   gs 는 `PassThroughJPEGImages`가 기본 참이라 JPEG 를 손대지 않고 통과시키고, 프리셋의
//   DownsampleThreshold(1.5)까지 겹쳐 290dpi 사진이 /ebook·/printer 에서 **그대로 나왔다**
//   (1.24MB → 1.24MB · 오히려 +2KB). 아래처럼 다운샘플 파라미터를 직접 지정해야 실제로 줄어든다
//   (같은 파일 1.24MB → 152KB/398KB). 프리셋으로 되돌리지 말 것.
// 글자는 글자로 남는다 — 페이지를 사진으로 굽지 않으므로 본문 검색·복사가 살아 있다(실측: 추출 글자수 보존).
function slimPdf(src, dst) {
  const tmp = dst + '.gs.pdf';
  execFileSync('gs', [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dSAFER',
    '-dDetectDuplicateImages=true',   // 같은 사진이 여러 쪽에 박힌 문서(공문 머리글 로고)에서 크게 먹는다
    '-dPassThroughJPEGImages=false',  // ← 이게 없으면 JPEG 가 무손질 통과한다(위 각주)
    '-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic',
    '-dColorImageResolution=' + LV.dpi, '-dColorImageDownsampleThreshold=1.0',
    '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic',
    '-dGrayImageResolution=' + LV.dpi, '-dGrayImageDownsampleThreshold=1.0',
    '-dDownsampleMonoImages=true', '-dMonoImageDownsampleType=/Subsample',
    '-dMonoImageResolution=' + LV.mono,   // 흑백 스캔은 글자획이 뭉개지므로 훨씬 높게 잡는다
    '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode',
    '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
    '-dJPEGQ=' + LV.q,
    '-sOutputFile=' + tmp, src,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return tmp;
}

// ── .hwp — CFB 컨테이너의 BinData 사진만 교체 ────────────────────────────────
// BinData 스트림의 압축 여부는 파일 헤더 플래그만으로 못 정한다 — DocInfo 의 HWPTAG_BIN_DATA 가
// 항목별로 「스토리지 기본 / 무조건 압축 / 무조건 무압축」을 따로 갖는다. DocInfo 를 파싱하는 대신
// **풀어보고 되는 쪽을 쓴다**(inflateRaw 성공 = 압축본 · 실패 = 원문). 되돌릴 때 원래 상태로 되돌려 놓는다.
function readBin(content) {
  const buf = Buffer.from(content);
  try {
    const raw = zlib.inflateRawSync(buf);
    if (imgKind(raw)) return { data: raw, deflated: true };
  } catch (e) { /* 압축이 아니었다 */ }
  if (imgKind(buf)) return { data: buf, deflated: false };
  return null;   // 사진으로 안 보이면 손대지 않는다
}
function imgKind(b) {
  if (b.length < 4) return null;
  if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  return null;   // BMP·GIF·EMF 등은 대상 밖(sharp 출력 미지원 · 벡터는 훼손 위험)
}

async function slimHwp(src, dst) {
  const CFB = (await import('cfb')).default ?? (await import('cfb'));
  const sharp = (await import('sharp')).default;
  const cf = CFB.read(fs.readFileSync(src), { type: 'buffer' });
  const log = [];

  for (let i = 0; i < cf.FullPaths.length; i++) {
    const p = cf.FullPaths[i], e = cf.FileIndex[i];
    if (e.type !== 2 || !/\/BinData\//i.test(p)) continue;
    const got = readBin(e.content);
    if (!got) { log.push({ p, from: e.content.length, to: e.content.length, kept: true }); continue; }

    const kind = imgKind(got.data);
    let out;
    try {
      const pipe = sharp(got.data, { failOn: 'none' })
        .resize({ width: LV.dim, height: LV.dim, fit: 'inside', withoutEnlargement: true });
      // ② 포맷 불변 — 들어온 그대로 내보낸다
      out = await (kind === 'jpeg'
        ? pipe.jpeg({ quality: LV.q, mozjpeg: true }).toBuffer()
        : pipe.png({ compressionLevel: 9, palette: true }).toBuffer());
    } catch (err) { log.push({ p, from: e.content.length, to: e.content.length, kept: true }); continue; }

    const packed = got.deflated ? zlib.deflateRawSync(out, { level: 9 }) : out;
    if (packed.length >= e.content.length) {   // ① 절대 안 키운다
      log.push({ p, from: e.content.length, to: e.content.length, kept: true });
      continue;
    }
    log.push({ p, from: e.content.length, to: packed.length, kept: false });
    e.content = packed;
    e.size = packed.length;
  }

  const buf = CFB.write(cf, { type: 'buffer' });
  fs.writeFileSync(dst, buf);
  return log;
}

// ── 진입 ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(IN)) done({ ok: false, error: '원본을 찾지 못했어요' });
  const from = fs.statSync(IN).size;
  const ext = (path.extname(IN) || '').toLowerCase();
  let log = [], produced = null;

  try {
    if (ext === '.pdf') produced = slimPdf(IN, OUT);
    else if (ext === '.hwp') { await slimHwp(IN, OUT); produced = OUT; }
    else done({ ok: false, error: '이 스크립트는 .pdf · .hwp 만 처리해요(나머지는 브라우저가 직접 줄여요)' });
  } catch (e) {
    done({ ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }

  const made = fs.existsSync(produced) ? fs.statSync(produced).size : 0;
  // ① 절대 안 키운다 — 파일 전체 수준에서도 한 번 더. 줄지 않았으면 원본을 그대로 결과로 놓는다.
  if (!made || made >= from) {
    fs.copyFileSync(IN, OUT);
    if (produced !== OUT) { try { fs.unlinkSync(produced); } catch (e) {} }
    done({ ok: true, from, to: from, kept: true, log, note: '이미 충분히 작아 원본을 그대로 뒀어요' });
  }
  if (produced !== OUT) fs.renameSync(produced, OUT);
  done({ ok: true, from, to: fs.statSync(OUT).size, kept: false, log });
})();
