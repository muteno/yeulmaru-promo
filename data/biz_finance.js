// [기계산출물 — 손편집 금지] tools/build_biz_finance.py가 「<연도>년 예술사업 대시보드.xlsx」(운영자 업로드)에서 생성.
//   값 수정 = 원본 xlsx 교체 후 `python3 tools/build_biz_finance.py` 재실행. 이 파일을 손으로 고치지 마라.
//   ⚠ 이건 **씨앗(seed) + 폴백**이다. 정본은 시트 `운영_사업비` — 같은 (연도, 사업NO) 행이 시트에 있으면
//     시트가 이긴다(index.html `_finIdx`). 담당자가 앱에서 고친 값을 이 파일이 되돌리는 일은 없다.
// 단위 = **원**(정수). 25교육 요약표는 원본이 천원이라 빌더가 세부표(원)에서 합산·환산했다.
// 파생값(차액·수익율·계·비율)은 담지 않는다 — 화면이 센다: 차액=rev-vou · 수익율=rev/(vou+fee)*100 · 계=paid+inv.
// 필드: no 사업NO(고유 인덱스) · cat 분야 · acct 회계구분(거르기 축) · name 사업명 · key 조인키(_uName)
//       mon 진행월 · cnt 횟수 · bud 예산 · vou 전표실적(a) · fee 판매수수료 · rev 정산서매출(b) · paid 유료 · inv 초대
//       blank 원천이 **빈칸이던** 칸 이름(`|` 구분) — 파생값이 아니라 원천 사실이라 담는다.
//         이게 없으면 「아직 안 적었다(0)」와 「0원이 맞다」가 화면에서 같아진다. 실측 260812 = 0인 99칸 중
//         진짜 미입력 72 · 담당자가 적은 0 17 · 원천에 열 없음 9 · 못 읽음 1. 분야에 열 자체가 없는 칸은
//         「해당 없음」이라 여기 안 적는다(교육 inv). 화면 판정 = index.html `_finBlank`.
var BIZ_FIN={ver:1,unit:'원',years:{
 2024:{src:{"공연": "수정", "전시": "원문#3"},rows:[
  {no:"2024-공연-01",cat:"공연",acct:"예술성",name:"신년음악회",key:"신년음악회",mon:"1월",cnt:1,bud:45000000,vou:44892870,fee:1129910,rev:33740500,paid:673,inv:85,blank:""},
  {no:"2024-공연-02",cat:"공연",acct:"예술성",name:"브런치 콘서트",key:"브런치콘서트",mon:"3/6/9/12월",cnt:4,bud:34000000,vou:32894700,fee:1242387,rev:41468000,paid:2876,inv:84,blank:""},
  {no:"2024-공연-03",cat:"공연",acct:"예술성",name:"야외페스티벌(예울마루 위크, 공연)",key:"야외페스티벌예울마루위크공연",mon:"5월",cnt:3,bud:60000000,vou:60000000,fee:0,rev:0,paid:0,inv:1480,blank:"paid"},
  {no:"2024-공연-04",cat:"공연",acct:"예술성",name:"공모사업 (별별GPT, 무풍 소극장)",key:"공모사업별별gpt무풍소극장",mon:"연중",cnt:5,bud:20000000,vou:15971820,fee:563684,rev:9772464,paid:821,inv:189,blank:""},
  {no:"2024-공연-05",cat:"공연",acct:"예술성",name:"헬로오페라",key:"헬로오페라",mon:"8월",cnt:2,bud:60000000,vou:51773990,fee:535964,rev:15940000,paid:553,inv:44,blank:""},
  {no:"2024-공연-06",cat:"공연",acct:"예술성",name:"클래식시리즈 1 (조재혁)",key:"클래식시리즈1조재혁",mon:"9월",cnt:1,bud:40000000,vou:28992700,fee:318769,rev:9468000,paid:173,inv:125,blank:""},
  {no:"2024-공연-07",cat:"공연",acct:"예술성",name:"클래식시리즈2 (양성원)",key:"클래식시리즈2양성원",mon:"10월",cnt:5,bud:151000000,vou:150587560,fee:451583,rev:13550000,paid:473,inv:418,blank:""},
  {no:"2024-공연-08",cat:"공연",acct:"예술성",name:"클래식공연 3 (3테너)",key:"클래식공연33테너",mon:"11월",cnt:1,bud:49000000,vou:47859709,fee:620917,rev:18376000,paid:339,inv:67,blank:""},
  {no:"2024-공연-09",cat:"공연",acct:"예술성",name:"발레 (호두까기인형)",key:"발레호두까기인형",mon:"12월",cnt:2,bud:60000000,vou:43488000,fee:2059704,rev:54097450,paid:1846,inv:18,blank:""},
  {no:"2024-공연-10",cat:"공연",acct:"상업성",name:"협력사업 (썸데이, 소극장)",key:"협력사업썸데이소극장",mon:"5월",cnt:8,bud:26000000,vou:24069815,fee:1297730,rev:34694000,paid:1748,inv:53,blank:""},
  {no:"2024-공연-11",cat:"공연",acct:"상업성",name:"아동극시리즈 1 (폴리팝)",key:"아동극시리즈1폴리팝",mon:"5월",cnt:10,bud:70000000,vou:68256930,fee:4558092,rev:131748000,paid:3622,inv:139,blank:""},
  {no:"2024-공연-12",cat:"공연",acct:"상업성",name:"아동극시리즈 2 (친구의 전설)",key:"아동극시리즈2친구의전설",mon:"7월",cnt:6,bud:30000000,vou:28973480,fee:1212090,rev:36117000,paid:2378,inv:90,blank:""},
  {no:"2024-공연-13",cat:"공연",acct:"상업성",name:"뮤지컬 1 (노트르담드파리)",key:"뮤지컬1노트르담드파리",mon:"7월",cnt:4,bud:180000000,vou:176970150,fee:9480067,rev:245311000,paid:3634,inv:63,blank:""},
  {no:"2024-공연-14",cat:"공연",acct:"상업성",name:"뮤지컬 2 (젠틀맨스가이드)",key:"뮤지컬2젠틀맨스가이드",mon:"11월",cnt:4,bud:180000000,vou:170405940,fee:5374633,rev:143195000,paid:2149,inv:69,blank:""},
  {no:"2024-공연-15",cat:"공연",acct:"상업성",name:"청소년뮤지컬 (오즈의 의류수거함)",key:"청소년뮤지컬오즈의의류수거함",mon:"11월",cnt:6,bud:50000000,vou:43870530,fee:2370566,rev:70896000,paid:2244,inv:92,blank:""},
  {no:"2024-공연-16",cat:"공연",acct:"상업성",name:"연극 (시간을 파는 상점, 소극장)",key:"연극시간을파는상점소극장",mon:"12월",cnt:12,bud:50000000,vou:47227000,fee:3814966,rev:115006500,paid:3467,inv:50,blank:""},
  {no:"2024-공연-17",cat:"공연",acct:"상업성",name:"크리스마스(윤한)",key:"크리스마스윤한",mon:"12월",cnt:1,bud:39000000,vou:38496245,fee:420255,rev:12270000,paid:285,inv:98,blank:""},
  {no:"2024-공연-18",cat:"공연",acct:"상업성",name:"크리스마스 2(라 보엠)",key:"크리스마스2라보엠",mon:"12월",cnt:1,bud:11000000,vou:10576980,fee:71214,rev:2677000,paid:151,inv:18,blank:""},
  {no:"2024-전시-01",cat:"전시",acct:"",name:"어린이 미술전 <파르르 파르르>/연계 워크숍",key:"어린이미술전파르르파르르/연계워크숍",mon:"",cnt:0,bud:77200000,vou:74663151,fee:368725,rev:11172400,paid:2724,inv:345,blank:""},
  {no:"2024-전시-02",cat:"전시",acct:"",name:"5기 입주작가 프리뷰전",key:"5기입주작가프리뷰전",mon:"",cnt:0,bud:17900000,vou:17843339,fee:98505,rev:2985000,paid:995,inv:89,blank:""},
  {no:"2024-전시-03",cat:"전시",acct:"",name:"예울마루 위크 <장도 나라의 앨리스>",key:"예울마루위크장도나라의앨리스",mon:"",cnt:0,bud:10000000,vou:9898656,fee:0,rev:0,paid:0,inv:6015,blank:""},
  {no:"2024-전시-04",cat:"전시",acct:"",name:"앙리 마티스",key:"앙리마티스",mon:"",cnt:0,bud:133136849,vou:132790840,fee:1204038,rev:37828300,paid:6457,inv:279,blank:""},
  {no:"2024-전시-05",cat:"전시",acct:"",name:"5기 단기 입주작가전 <이미경>",key:"5기단기입주작가전이미경",mon:"",cnt:0,bud:8572000,vou:8571727,fee:31581,rev:957000,paid:319,inv:89,blank:""},
  {no:"2024-전시-06",cat:"전시",acct:"",name:"장도 기획전시 <댕댕이의 하루>",key:"장도기획전시댕댕이의하루",mon:"",cnt:0,bud:41800000,vou:39698059,fee:100056,rev:3032000,paid:758,inv:86,blank:""},
  {no:"2024-전시-07",cat:"전시",acct:"",name:"5기 장기 입주작가전 <김용원, 김용현, 이연숙>",key:"5기장기입주작가전김용원김용현이연숙",mon:"",cnt:0,bud:51200000,vou:49388341,fee:89474,rev:2710000,paid:1355,inv:168,blank:""},
  {no:"2024-전시-08",cat:"전시",acct:"",name:"지역작가 초대전 <김상선>",key:"지역작가초대전김상선",mon:"",cnt:0,bud:21900000,vou:20317467,fee:74151,rev:2247000,paid:749,inv:250,blank:""},
  {no:"2024-전시-09",cat:"전시",acct:"",name:"크리스마스 기획전 <홍범>",key:"크리스마스기획전홍범",mon:"",cnt:0,bud:3650000,vou:3611200,fee:0,rev:0,paid:0,inv:0,blank:""}
 ]},
 2025:{src:{"공연": "25공연_260319수정", "전시": "25전시", "교육": "25교육"},rows:[
  {no:"2025-공연-01",cat:"공연",acct:"예술성",name:"신년음악회",key:"신년음악회",mon:"1월",cnt:1,bud:45500000,vou:45208740,fee:743474,rev:23108000,paid:464,inv:40,blank:""},
  {no:"2025-공연-02",cat:"공연",acct:"예술성",name:"클래식 시리즈1(백건우와 모차르트)",key:"클래식시리즈1백건우와모차르트",mon:"3월",cnt:1,bud:40500000,vou:40223740,fee:1123227,rev:31545000,paid:811,inv:10,blank:""},
  {no:"2025-공연-03",cat:"공연",acct:"예술성",name:"협력사업2(아파나도르)",key:"협력사업2아파나도르",mon:"4월",cnt:2,bud:276000000,vou:275842232,fee:1470249,rev:42609000,paid:546,inv:211,blank:""},
  {no:"2025-공연-04",cat:"공연",acct:"예술성",name:"공모사업(창작발레갓,꽃의비밀,쇼팽)",key:"공모사업창작발레갓꽃의비밀쇼팽",mon:"5/7/9월",cnt:4,bud:26480000,vou:20853000,fee:2479598,rev:72517000,paid:2861,inv:101,blank:""},
  {no:"2025-공연-05",cat:"공연",acct:"예술성",name:"문화나눔콘서트(예울마루 위크)",key:"문화나눔콘서트예울마루위크",mon:"5월",cnt:1,bud:118020000,vou:117953320,fee:0,rev:0,paid:0,inv:900,blank:""},
  {no:"2025-공연-06",cat:"공연",acct:"예술성",name:"헬로 시리즈",key:"헬로시리즈",mon:"11월",cnt:1,bud:63000000,vou:61660580,fee:249194,rev:9073000,paid:428,inv:30,blank:""},
  {no:"2025-공연-07",cat:"공연",acct:"예술성",name:"클래식시리즈2(실내악 페스티벌)",key:"클래식시리즈2실내악페스티벌",mon:"10월",cnt:5,bud:150500000,vou:149504000,fee:662288,rev:21688000,paid:1038,inv:294,blank:""},
  {no:"2025-공연-08",cat:"공연",acct:"예술성",name:"연극(내일은 내일에게, 청소년)",key:"연극내일은내일에게청소년",mon:"11월",cnt:6,bud:43000000,vou:42096540,fee:3560239,rev:107707500,paid:3568,inv:155,blank:""},
  {no:"2025-공연-09",cat:"공연",acct:"예술성",name:"크리스마스 1(발레-호두까기인형)",key:"크리스마스1발레호두까기인형",mon:"12월",cnt:2,bud:50500000,vou:44196540,fee:1635045,rev:44200750,paid:1408,inv:34,blank:""},
  {no:"2025-공연-10",cat:"공연",acct:"예술성",name:"브런치 콘서트",key:"브런치콘서트",mon:"3/5/7/9/12월",cnt:5,bud:44000000,vou:42406040,fee:5464724,rev:45740000,paid:2500,inv:131,blank:""},
  {no:"2025-공연-11",cat:"공연",acct:"상업성",name:"아동극시리즈1 (넌 특별하단다)",key:"아동극시리즈1넌특별하단다",mon:"5월",cnt:7,bud:63500000,vou:62586320,fee:3014220,rev:89778000,paid:2756,inv:97,blank:""},
  {no:"2025-공연-12",cat:"공연",acct:"상업성",name:"뮤지컬1(명성황후)",key:"뮤지컬1명성황후",mon:"6월",cnt:4,bud:176000000,vou:175988780,fee:9221140,rev:247663250,paid:3636,inv:45,blank:""},
  {no:"2025-공연-13",cat:"공연",acct:"상업성",name:"아동극시리즈2 (넘버블록스)",key:"아동극시리즈2넘버블록스",mon:"8월",cnt:6,bud:6000000,vou:5053160,fee:5465688,rev:21447419,paid:2921,inv:79,blank:""},
  {no:"2025-공연-14",cat:"공연",acct:"상업성",name:"아동극시리즈3(설민석의한국사대모험)",key:"아동극시리즈3설민석의한국사대모험",mon:"9월",cnt:6,bud:71500000,vou:71270940,fee:3927586,rev:113412200,paid:3042,inv:136,blank:""},
  {no:"2025-공연-15",cat:"공연",acct:"상업성",name:"협력사업1(뮤지컬 시카고)",key:"협력사업1뮤지컬시카고",mon:"2월",cnt:4,bud:10100000,vou:10082720,fee:2212220,rev:52751000,paid:3808,inv:76,blank:""},
  {no:"2025-공연-16",cat:"공연",acct:"상업성",name:"뮤지컬2 (킹키부츠)",key:"뮤지컬2킹키부츠",mon:"11월",cnt:4,bud:197900000,vou:196748440,fee:10107530,rev:242499500,paid:3280,inv:30,blank:""},
  {no:"2025-공연-17",cat:"공연",acct:"상업성",name:"청소년뮤지컬 (김종욱찾기)",key:"청소년뮤지컬김종욱찾기",mon:"12월",cnt:10,bud:55500000,vou:54444400,fee:2828843,rev:104732500,paid:2732,inv:68,blank:""},
  {no:"2025-전시-01",cat:"전시",acct:"",name:"어린이 미술전 <냠냠>",key:"어린이미술전냠냠",mon:"",cnt:0,bud:80000000,vou:73299453,fee:1087878,rev:32936000,paid:5271,inv:589,blank:""},
  {no:"2025-전시-02",cat:"전시",acct:"",name:"6기 프리뷰전",key:"6기프리뷰전",mon:"",cnt:0,bud:14300000,vou:13643591,fee:80718,rev:2446000,paid:1063,inv:96,blank:""},
  {no:"2025-전시-03",cat:"전시",acct:"",name:"장도 기획전시 <HELLO, 고래야>",key:"장도기획전시hello고래야",mon:"",cnt:0,bud:46000000,vou:45321178,fee:315810,rev:9570000,paid:3190,inv:111,blank:""},
  {no:"2025-전시-04",cat:"전시",acct:"",name:"예울마루 위크",key:"예울마루위크",mon:"",cnt:0,bud:8600000,vou:8577400,fee:0,rev:0,paid:0,inv:27358,blank:"fee"},
  {no:"2025-전시-05",cat:"전시",acct:"",name:"여름방학 공동 기획전시",key:"여름방학공동기획전시",mon:"",cnt:0,bud:107000000,vou:104915924,fee:545160,rev:16692000,paid:3295,inv:202,blank:""},
  {no:"2025-전시-06",cat:"전시",acct:"",name:"6기 단기 입주작가전",key:"6기단기입주작가전",mon:"",cnt:0,bud:12000000,vou:11001442,fee:18282,rev:554000,paid:277,inv:83,blank:""},
  {no:"2025-전시-07",cat:"전시",acct:"",name:"금호 협력기획전",key:"금호협력기획전",mon:"",cnt:0,bud:24000000,vou:23508800,fee:0,rev:0,paid:0,inv:1916,blank:""},
  {no:"2025-전시-08",cat:"전시",acct:"",name:"6기 입주작가전",key:"6기입주작가전",mon:"",cnt:0,bud:40750000,vou:19468310,fee:0,rev:2272000,paid:1136,inv:218,blank:"fee"},
  {no:"2025-전시-09",cat:"전시",acct:"",name:"지역작가 공모전",key:"지역작가공모전",mon:"",cnt:0,bud:25030000,vou:16851480,fee:0,rev:3213000,paid:1071,inv:159,blank:"fee"},
  {no:"2025-교육-01",cat:"교육",acct:"클래스",name:"화요살롱",key:"화요살롱",mon:"",cnt:0,bud:15700000,vou:15700000,fee:614543,rev:21315957,paid:697,inv:0,blank:""},
  {no:"2025-교육-02",cat:"교육",acct:"클래스",name:"아트스쿨",key:"아트스쿨",mon:"",cnt:0,bud:68000000,vou:65783570,fee:1481289,rev:47861211,paid:70,inv:0,blank:""},
  {no:"2025-교육-03",cat:"교육",acct:"클래스",name:"아트클럽",key:"아트클럽",mon:"",cnt:0,bud:22680000,vou:22556200,fee:260172,rev:12042828,paid:80,inv:0,blank:""},
  {no:"2025-교육-04",cat:"교육",acct:"클래스",name:"공통예산",key:"공통예산",mon:"",cnt:0,bud:19620000,vou:18721400,fee:0,rev:0,paid:0,inv:0,blank:"paid"},
  {no:"2025-교육-05",cat:"교육",acct:"공모사업",name:"희망에너지교실",key:"희망에너지교실",mon:"",cnt:0,bud:3000000,vou:550000,fee:198000,rev:5802000,paid:50,inv:0,blank:""},
  {no:"2025-교육-06",cat:"교육",acct:"공모사업",name:"새롬교실",key:"새롬교실",mon:"",cnt:0,bud:2000000,vou:786200,fee:49500,rev:1450500,paid:20,inv:0,blank:""}
 ]},
 2026:{src:{"공연": "26공연", "정산서매출": "2026년 기획사업 정산서 매출.xlsx"},rows:[
  {no:"2026-공연-01",cat:"공연",acct:"예술성",name:"신년음악회",key:"신년음악회",mon:"1월",cnt:1,bud:48500000,vou:48326820,fee:1203170,rev:38284950,paid:908,inv:10,blank:""},
  {no:"2026-공연-02",cat:"공연",acct:"예술성",name:"클래식1(실내악페스티벌)",key:"클래식1실내악페스티벌",mon:"4월",cnt:4,bud:150500000,vou:150441377,fee:431486,rev:14795000,paid:502,inv:337,blank:""},
  {no:"2026-공연-03",cat:"공연",acct:"예술성",name:"공모사업(김영욱,춘자씨,그때도오늘)",key:"공모사업김영욱춘자씨그때도오늘",mon:"5/10/11월",cnt:5,bud:32000000,vou:4835810,fee:127496,rev:3938500,paid:179,inv:30,blank:""},
  {no:"2026-공연-04",cat:"공연",acct:"예술성",name:"클래식2(한국페스티발앙상블)",key:"클래식2한국페스티발앙상블",mon:"5월",cnt:1,bud:22500000,vou:0,fee:146009,rev:5314500,paid:176,inv:34,blank:"vou"},
  {no:"2026-공연-05",cat:"공연",acct:"예술성",name:"협력사업1(국립심포니오케스트라)",key:"협력사업1국립심포니오케스트라",mon:"5월",cnt:1,bud:116500000,vou:0,fee:0,rev:11514000,paid:0,inv:0,blank:"vou|fee|paid|inv"},
  {no:"2026-공연-06",cat:"공연",acct:"예술성",name:"연극2(노인의 꿈)",key:"연극2노인의꿈",mon:"6월",cnt:4,bud:0,vou:0,fee:0,rev:31922000,paid:0,inv:0,blank:"bud|vou|fee|paid|inv"},
  {no:"2026-공연-07",cat:"공연",acct:"예술성",name:"헬로시리즈",key:"헬로시리즈",mon:"6/11월",cnt:4,bud:61500000,vou:0,fee:0,rev:17269000,paid:0,inv:0,blank:"vou|fee|paid|inv"},
  {no:"2026-공연-08",cat:"공연",acct:"예술성",name:"클래식3(조재혁 리사이틀)",key:"클래식3조재혁리사이틀",mon:"9월",cnt:1,bud:16400000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-09",cat:"공연",acct:"예술성",name:"국립현대무용단",key:"국립현대무용단",mon:"10월",cnt:1,bud:0,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"bud|vou|fee|rev|paid|inv"},
  {no:"2026-공연-10",cat:"공연",acct:"예술성",name:"피아노&피아노",key:"피아노&피아노",mon:"10월",cnt:1,bud:0,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"bud|vou|fee|rev|paid|inv"},
  {no:"2026-공연-11",cat:"공연",acct:"예술성",name:"클래식4(피아노&피아노)",key:"클래식4피아노&피아노",mon:"10월",cnt:1,bud:139500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-12",cat:"공연",acct:"예술성",name:"연극1(소극장, 미정)",key:"연극1소극장미정",mon:"12월",cnt:10,bud:61500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-13",cat:"공연",acct:"예술성",name:"문화나눔콘서트(재단20주년 음악회)",key:"문화나눔콘서트재단20주년음악회",mon:"",cnt:0,bud:106500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-14",cat:"공연",acct:"예술성",name:"뮤지컬1(미세스 다웃파이어)",key:"뮤지컬1미세스다웃파이어",mon:"2월",cnt:4,bud:215500000,vou:214423700,fee:9615860,rev:243206500,paid:3286,inv:46,blank:""},
  {no:"2026-공연-15",cat:"공연",acct:"상업성",name:"브런치콘서트",key:"브런치콘서트",mon:"4,6,9,12월",cnt:4,bud:50000000,vou:11236500,fee:346302,rev:11722000,paid:581,inv:42,blank:""},
  {no:"2026-공연-16",cat:"공연",acct:"상업성",name:"아동극1(100층짜리 집)",key:"아동극1100층짜리집",mon:"5월",cnt:6,bud:66500000,vou:65292500,fee:4166809,rev:119328300,paid:3185,inv:174,blank:""},
  {no:"2026-공연-17",cat:"공연",acct:"상업성",name:"뮤지컬2(그날들)",key:"뮤지컬2그날들",mon:"9월",cnt:4,bud:170300000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-18",cat:"공연",acct:"상업성",name:"아동극2(미정)",key:"아동극2미정",mon:"10월",cnt:6,bud:61500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-19",cat:"공연",acct:"상업성",name:"청소년 뮤지컬(러커스 더 스쿨)",key:"청소년뮤지컬러커스더스쿨",mon:"11월",cnt:6,bud:66500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-공연-20",cat:"공연",acct:"상업성",name:"크리스마스1(호두까기)",key:"크리스마스1호두까기",mon:"12월",cnt:2,bud:56500000,vou:0,fee:0,rev:0,paid:0,inv:0,blank:"vou|fee|rev|paid|inv"},
  {no:"2026-전시-01",cat:"전시",acct:"",name:"GS칼텍스 예울마루 어린이 미술전 <우리 SUM 타볼래?>",key:"gs칼텍스예울마루어린이미술전우리sum타볼래?",mon:"",cnt:0,bud:0,vou:0,fee:0,rev:21055500,paid:0,inv:0,blank:"bud|vou|fee|paid|inv"},
  {no:"2026-전시-02",cat:"전시",acct:"",name:"GS칼텍스 예울마루 창작스튜디오 '창작스튜디오 7기 입주작가 프리뷰전'",key:"gs칼텍스예울마루창작스튜디오창작스튜디오7기입주작가프리뷰전",mon:"",cnt:0,bud:0,vou:0,fee:0,rev:1656000,paid:0,inv:0,blank:"bud|vou|fee|paid|inv"},
  {no:"2026-전시-03",cat:"전시",acct:"",name:"(장도)GS칼텍스 예울마루 기획전시 '섬냥이 in 장도'",key:"장도gs칼텍스예울마루기획전시섬냥이in장도",mon:"",cnt:0,bud:0,vou:0,fee:0,rev:9024000,paid:0,inv:0,blank:"bud|vou|fee|paid|inv"},
  {no:"2026-교육-01",cat:"교육",acct:"",name:"2026 화요살롱 이낙준(한산이가) - 여수",key:"2026화요살롱이낙준한산이가",mon:"",cnt:0,bud:0,vou:0,fee:0,rev:4236750,paid:0,inv:0,blank:"bud|vou|fee|paid"}
 ]}
}};
