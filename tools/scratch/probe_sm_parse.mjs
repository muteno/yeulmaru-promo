// 검색 모니터링 순수 파서 실측 — src/index.js에서 sm* 함수를 그대로 뽑아 돌린다(복제본 아님 = 드리프트 0).
import { readFileSync } from 'node:fs';
const SRC = readFileSync('src/index.js', 'utf8');
const PURE = ['smText','smHash','smUnwrapGoogle','smParseAtom','smFeedTitle','smXmlBlocks','smXmlVal','smNaverDate','smKopisRows','smKopisDetailParse'];
let code = 'function __name(){}\n';
for (const n of PURE) {
  const i = SRC.indexOf('\nfunction ' + n + '(');
  const j = SRC.indexOf('__name(' + n + ', "' + n + '");', i);
  if (i < 0 || j < 0) throw new Error('추출 실패: ' + n);
  code += SRC.slice(i, j) + '\n';
}
code += 'return {' + PURE.join(',') + '};';
const F = new Function(code)();

let fail = 0;
const eq = (got, want, msg) => { const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('✗ ' + msg + '\n   got  ' + g + '\n   want ' + w); } else console.log('✓ ' + msg); };

// ① 엔티티·태그·CDATA
eq(F.smText('<b>예울마루</b> &amp; 공연 &lt;A&gt;'), '예울마루 & 공연 <A>', 'smText 태그·엔티티');
eq(F.smText('<![CDATA[ 여수 예울마루 ]]>'), '여수 예울마루', 'smText CDATA');
eq(F.smText('&lt;b&gt;예울마루&lt;/b&gt; 개관'), '예울마루 개관', 'smText 엔티티로 온 강조태그 제거(회귀)');
eq(F.smText('조건 &lt;A&gt; 성립'), '조건 <A> 성립', 'smText 진짜 꺾쇠 글자는 보존');
// ② 구글 리다이렉트 해제
eq(F.smUnwrapGoogle('https://www.google.com/url?rct=j&sa=t&url=https://news.example.com/a%3Fid%3D7&ct=ga'),
   'https://news.example.com/a?id=7', 'smUnwrapGoogle 진짜 주소');
eq(F.smUnwrapGoogle('https://plain.example.com/x'), 'https://plain.example.com/x', 'smUnwrapGoogle 비-리다이렉트 통과');
// ③ 피드 제목 = 검색어 (봇에겐 'Google Alert', 브라우저엔 'Google 알리미' — 둘 다 받아야 한다)
const liveEmpty = readFileSync(process.env.SCRATCH + '/galert.xml', 'utf8');
eq(F.smFeedTitle(liveEmpty), '예울마루', 'smFeedTitle 실피드(Alert 접두어)');
eq(F.smFeedTitle('<feed><title>Google 알리미 - 예울마루 공연</title><entry><title>딴 기사</title></entry></feed>'),
   '예울마루 공연', 'smFeedTitle 한글 접두어 + entry 제목 오인 없음');
// ④ Atom entry
const atom = `<feed><title>Google Alert - 예울마루</title>
<entry><title type="html">여수 &lt;b&gt;예울마루&lt;/b&gt; 개관</title>
<link href="https://www.google.com/url?rct=j&amp;url=https://a.example.com/1&amp;ct=ga"/>
<published>2026-08-06T01:02:03Z</published></entry>
<entry><title>두번째</title><link href="https://b.example.com/2"/><updated>2026-08-05T00:00:00Z</updated></entry></feed>`;
eq(F.smParseAtom(atom), [
  { title: '여수 예울마루 개관', link: 'https://a.example.com/1', date: '2026-08-06' },
  { title: '두번째', link: 'https://b.example.com/2', date: '2026-08-05' }
], 'smParseAtom 2건(published/updated 폴백·리다이렉트 해제)');
eq(F.smParseAtom(liveEmpty), [], 'smParseAtom 빈 피드 = 0건');
// ⑤ 네이버 날짜
eq(F.smNaverDate({ postdate: '20260805' }), '2026-08-05', 'smNaverDate 블로그 postdate');
eq(F.smNaverDate({ pubDate: 'Wed, 05 Aug 2026 12:00:00 +0900' }), '2026-08-05', 'smNaverDate 뉴스 pubDate');
eq(F.smNaverDate({}), '', 'smNaverDate 없음');
// ⑥ KOPIS — 시설명 필터가 남의 공연을 버리는지
const kopis = `<dbs>
<db><mt20id>PF1</mt20id><prfnm>로미오와 줄리엣</prfnm><prfpdfrom>2026.08.29</prfpdfrom><prfpdto>2026.08.29</prfpdto><fcltynm>GS칼텍스 예울마루</fcltynm><genrenm>서양음악(클래식)</genrenm><prfstate>공연예정</prfstate></db>
<db><mt20id>PF2</mt20id><prfnm>남의 공연</prfnm><prfpdfrom>2026.09.01</prfpdfrom><fcltynm>세종문화회관</fcltynm><prfstate>공연중</prfstate></db>
</dbs>`;
const rows = F.smKopisRows(kopis, '예울마루');
eq(rows.length, 1, 'smKopisRows 시설 필터 = 1건만');
eq(rows[0].title, '로미오와 줄리엣', 'smKopisRows 제목');
eq(rows[0].date, '2026-08-29', 'smKopisRows 날짜 점→하이픈');
eq(rows[0].extra, 'GS칼텍스 예울마루 · 공연예정', 'smKopisRows 부가');
eq(F.smKopisRows(kopis, '').length, 2, 'smKopisRows 필터 없으면 전건');
// ⑦ 해시 = 중복 판정의 근간
eq(F.smHash('https://a/1') === F.smHash('https://a/1'), true, 'smHash 동일 링크 동일');
eq(F.smHash('https://a/1') === F.smHash('https://a/2'), false, 'smHash 다른 링크 다름');
const hs = new Set(Array.from({length: 5000}, (_, i) => F.smHash('https://x.example.com/post/' + i)));
eq(hs.size >= 4990, true, 'smHash 5000건 충돌 ≤10 (실제 ' + (5000 - hs.size) + ')');

// ⑧ 공연상세 — 명세 예제(PF132236) 그대로: 가격·예매처·런타임이 뽑히는지
const det = `<dbs><db><mt20id>PF132236</mt20id><prfnm>우리 연애할까?</prfnm>
<prfruntime>1시간 30분</prfruntime><prfage>만 12세 이상</prfage>
<pcseguidance>전석 30,000원</pcseguidance><poster>http://www.kopis.or.kr/upload/p.gif</poster>
<prfcast>김세연, 신성진</prfcast><dtguidance>화요일 ~ 금요일(20:00)</dtguidance>
<relates><relate><relatenm>티켓링크</relatenm><relateurl>http://www.ticketlink.co.kr/product/14015</relateurl></relate>
<relate><relateurl>http://www.playticket.co.kr/ticketDetail.html?idx=266</relateurl></relate></relates>
</db></dbs>`;
const d = F.smKopisDetailParse(det);
eq(d.price, '전석 30,000원', 'smKopisDetailParse 가격');
eq(d.runtime, '1시간 30분', 'smKopisDetailParse 런타임');
eq(d.vendors, [{nm:'티켓링크',url:'http://www.ticketlink.co.kr/product/14015'},{nm:'',url:'http://www.playticket.co.kr/ticketDetail.html?idx=266'}], 'smKopisDetailParse 예매처 2건(이름 없는 것 포함)');
eq(F.smKopisDetailParse('<dbs></dbs>'), null, 'smKopisDetailParse 빈 응답 = null');
eq(rows[0].id, 'PF1', 'smKopisRows id 동반');

console.log(fail ? `\n실패 ${fail}건` : '\n전건 통과');
process.exit(fail ? 1 : 0);
