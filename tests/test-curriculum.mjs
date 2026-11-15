/* 법정 교육 항목 목록 (src/assets/curriculum.js) — 수빈 「영상 제작용 교육 항목 정리」(2026-11-14)를 옮긴 데이터.
   지키는 것: 개수가 문서와 같다 · 태그가 겹치지 않는다 · 권장 분 합계가 문서 표와 같다 ·
             정기교육이 다시 쓰는 B 태그가 실제로 있다 · 브라우저 규칙(fetch·ES 모듈 없음) */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report, ROOT } = require('./harness');

const src = fs.readFileSync(path.join(ROOT, 'src/assets/curriculum.js'), 'utf8');
const C = vm.runInNewContext(src + '\nCurriculum;', {});

eq('교육 종류는 4가지다', C.TRAININGS.map((t) => t.id).join(','), 'daily-hire,job-change,special,regular');
eq('기본 사항은 법정 11개 + 인트로 + 이주노동자 추가', C.BASIC.filter((b) => b.legal).length + '/' + C.BASIC.length, '11/13');

const basicItems = C.BASIC.flatMap((b) => b.items);
eq('기본 11개 세부 항목은 56개다', basicItems.length, 56);
eq('★ MSDS(11번)만 법정 세부 항목 6개', C.BASIC.find((b) => b.no === 11).items.length, 6);
const sum = (k) => C.BASIC.reduce((s, b) => s + b.minutes[k], 0);
eq('채용 시 권장 분 합계 45분', sum('hire'), 45);
eq('변경 시 권장 분 합계 45분', sum('change'), 45);

eq('정기교육 사항은 8개다', C.REGULAR.length, 8);
eq('정기교육 반기 권장 분 합계 720분 (12시간)', C.REGULAR.reduce((s, r) => s + r.minutes, 0), 720);
const regItems = C.REGULAR.flatMap((r) => r.items);
eq('정기교육에서 더할 세부 항목은 23개다', regItems.length, 23);
const reuseBad = regItems.filter((j) => j.reuse && !C.find(j.of)).map((j) => j.tag);
eq('정기교육이 다시 쓰는 B 장면은 실제로 있다', reuseBad.join(','), '');
ok('J1~J6 은 같은 번호의 B 사항과 겹친다, J7·J8 은 정기교육만',
  C.REGULAR.every((r) => (r.no <= 6 ? r.overlaps === r.no : r.overlaps === null)));

eq('특별교육 대표 작업은 12개다 (결정 2026-11-13)', C.SPECIAL.map((s) => s.no).sort((a, b) => a - b).join(','), '3,11,13,14,17,19,25,26,34,36,38,39');
const spItems = C.SPECIAL.flatMap((s) => s.items);
eq('특별교육 개별 사항은 56개다', spItems.length, 56);
ok('특별교육 태그는 「작업 번호-순번」이다', C.SPECIAL.every((s) => s.items.every((it, i) => it.tag === s.no + '-' + (i + 1))));
eq('나머지 작업은 27개다 — 대표 12개와 합쳐 39종', C.SPECIAL_LATER.length + C.SPECIAL.length, 39);
ok('대표 작업과 나머지 작업이 겹치지 않는다',
  C.SPECIAL_LATER.every((l) => !C.SPECIAL.some((s) => s.no === l.no)));

const all = basicItems.concat(regItems, spItems);
eq('★ 태그가 겹치지 않는다', all.length - new Set(all.map((i) => i.tag)).size, 0);
ok('세부 항목마다 내용·꼭 나올 단어·근거가 있다', all.every((i) => i.title && i.must && i.words.length && i.basis));
ok('근거가 「우리 제안」이면 ours 로 표시된다', all.filter((i) => /우리 제안/.test(i.basis)).every((i) => i.ours));
eq('find 로 태그를 찾는다', C.find('11-2').title, '방호장치 종류와 취급');

ok('★ 데이터만 — fetch·ES 모듈·innerHTML 이 없다', !/fetch\(|^\s*(import|export)\s|innerHTML/m.test(src));
ok('오프라인 목록(sw.js)에 들어 있다', fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8').includes("'assets/curriculum.js'"));

report('법정 교육 항목 목록');
