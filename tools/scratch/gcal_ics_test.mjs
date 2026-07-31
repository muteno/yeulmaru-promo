// Worker의 ICS 파서·전개기만 떼어와 검증 (src/index.js에서 함수 블록 추출 → 평가)
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../src/index.js', import.meta.url),'utf8');
const a = src.indexOf('var GCAL_TTL');
const b = src.indexOf('__name(gcalDays, "gcalDays");');
if(a<0||b<0) throw new Error('블록 못 찾음');
let block = src.slice(a, b);
// KV·fetch 의존 함수(gcalRaw)만 스텁으로 치환
block = block.replace(/async function gcalRaw[\s\S]*?\n}\n__name\(gcalRaw, "gcalRaw"\);/, 'async function gcalRaw(){ return globalThis.__ICS; }');
const mod = new Function('__name', block + '\nreturn {gcalDays, icsEvents, icsDate, icsExpand, _kstKey};')( (f)=>f );

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:single@yeulmaru
SUMMARY:여수시립합창단 정기연주회
LOCATION:GS칼텍스 예울마루 대극장
DTSTART;TZID=Asia/Seoul:20260805T193000
DTEND;TZID=Asia/Seoul:20260805T213000
END:VEVENT
BEGIN:VEVENT
UID:allday@yeulmaru
SUMMARY:전남교육청 학생예술제
LOCATION:소극장
DTSTART;VALUE=DATE:20260812
DTEND;VALUE=DATE:20260815
END:VEVENT
BEGIN:VEVENT
UID:weekly@yeulmaru
SUMMARY:주말 대관 리허설
DTSTART;TZID=Asia/Seoul:20260801T100000
DTEND;TZID=Asia/Seoul:20260801T120000
RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=4
EXDATE;TZID=Asia/Seoul:20260815T100000
END:VEVENT
BEGIN:VEVENT
UID:folded@yeulmaru
SUMMARY:아주 긴 제목이 접혀서 내려온 대관 공연 이름 
 뒷부분
DTSTART:20260820T100000Z
DTEND:20260820T120000Z
END:VEVENT
BEGIN:VEVENT
UID:cancelled@yeulmaru
SUMMARY:취소된 대관
STATUS:CANCELLED
DTSTART;VALUE=DATE:20260810
END:VEVENT
END:VCALENDAR`.replace(/\n/g,'\r\n');
globalThis.__ICS = ICS;
const r = await mod.gcalDays({}, '2026-08-01','2026-08-31', false);
console.log('count =', r.count);
for(const d of r.days) console.log(' ', d.d, d.allday?'[종일]':(d.st+'~'+d.et), '|', d.title, '|', d.place||'-');
