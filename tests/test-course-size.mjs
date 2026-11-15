/* 교육 1건 크기 상한 — `src/assets/limits.js` 와 `api/_courses.mjs` (C06 D-048).

   왜 이 묶음이 있나
     동기화 한 덩어리 상한은 512KB 인데 (`api/store.mjs`), 11/12 실측 교육 1건은
     약 530KB 였다 — **교육을 하나도 못 올리는 크기**였고 넘는 것을 막는 검사도 없었다.
     이제 화면이 발급 전에 막고 서버가 저장할 때 다시 본다.
     상한·해상도는 담당자 화면에서 실제로 재서 정했다 (limits.js 머리말의 표).

   이 묶음이 지키는 것
     1. ★★ **두 곳의 숫자가 같다** — `limits.js` 와 `api/_courses.mjs` 는 한 파일이
        아니다 (`src/` 는 ES 모듈 금지, C05 T-2). 한쪽만 고치면 여기서 깨진다
     2. ★★ **같은 교육에 같은 답을 준다** — 화면이 통과시킨 것을 서버가 막으면
        담당자는 이유를 알 수 없다
     3. ★★ 상한 안의 교육은 **막지 않는다** (막는 쪽으로 기울면 발급이 안 된다)
     4. ★ 상한을 넘으면 **무엇이 큰지**를 먼저 말한다 — 보기 그림 장수 → 한 장 크기
        → 설비 사진 → 합계 순
     5. ★ 상한 × 4건이 512KB 안에 든다 (교육 3건 이상 시연 — 07 11/15 블록)
     6. ★ 서버의 교육 검사(`courseProblem`)가 **크기부터** 본다
     7. ★ 한글은 글자당 3바이트로 센다 (`length` 로 세면 상한을 넘겨 통과한다)
     8. ★ `limits.js` 는 브라우저 규칙을 지킨다 — fetch·ES 모듈·localStorage 없음

   근거: C06 D-048 · A02 §14.5 · D07 STC-E25-020~022 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report, ROOT } = require('./harness');

const limitsSrc = fs.readFileSync(path.join(ROOT, 'src/assets/limits.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'api/_courses.mjs'), 'utf8');
const L = vm.runInNewContext(limitsSrc + '\nLimits;', { TextEncoder });
const { courseSizeProblem: serverProblem, courseProblem } = await import('../api/_courses.mjs');

const MAX_SYNC_BYTES = 512 * 1024;

/** 그 바이트 수만큼 되는 data: 그림 한 장 (실제 그림일 필요는 없다 — 재는 것은 크기다) */
const pic = (bytes) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.max(0, bytes - 23));

/** 상한 안에 드는 평범한 교육 — 11/12 실측 교육(위치 짚기 5 + 그림 고르기 5 ·
 *  보기 그림 12장 · 설비 사진 1장)을 상한대로 줄인 모양이다 */
function course(over) {
  const quiz = [];
  const picsPerQuestion = [3, 3, 2, 2, 2];     // 합계 12장 = MAX_PICS
  for (let i = 0; i < 5; i += 1) {
    quiz.push({ id: 'h' + i, type: 'hotspot', prompt: '위험한 곳을 짚으세요', answer: { x: 0.4, y: 0.5 } });
    quiz.push({
      id: 'c' + i, type: 'choice', subtype: 'picture', prompt: '안전하게 일하는 그림을 고르세요',
      pics: Array.from({ length: picsPerQuestion[i] }, () => pic(3000)), answer: 0
    });
  }
  return {
    id: 'course-1', title: '프레스 안전교육', equipmentId: 'eq-1',
    quiz: quiz, photo: pic(20 * 1024),
    hazards: [{ id: 'o1', equipmentId: 'eq-1', part: '금형', hazard: '끼임' }],
    ...over
  };
}

/* ===================================================================
   1. 두 곳의 숫자가 같다 (★★ 1)
   =================================================================== */
{
  const num = (src, name) => {
    const m = new RegExp(name + '\\s*=\\s*([0-9*\\s]+);').exec(src);
    return m ? Function('return ' + m[1])() : null;
  };
  ['MAX_COURSE_BYTES', 'MAX_PICS', 'PIC_MAX_BYTES', 'PHOTO_MAX_BYTES'].forEach((name) => {
    const a = num(limitsSrc, name);
    const b = num(serverSrc, name);
    ok(`★★ ${name} 이 화면·서버에서 같다 (${a})`, a !== null && a === b);
  });
  eq('화면이 내보내는 값도 같다', L.MAX_COURSE_BYTES, num(serverSrc, 'MAX_COURSE_BYTES'));
}

/* ===================================================================
   2. 상한 × 4건이 동기화 한 덩어리에 든다 (★ 5)
   =================================================================== */
eq('교육 4건이 512KB 안에 든다', L.MAX_COURSE_BYTES * 4 <= MAX_SYNC_BYTES, true);
ok('시연에 필요한 교육 3건은 여유가 있다 (07 11/15 블록)', L.MAX_COURSE_BYTES * 3 < MAX_SYNC_BYTES * 0.8);

/* ===================================================================
   2-1. 목표(줄일 때 겨누는 크기)가 상한 안에서 앞뒤가 맞는다
        — 2026-11-15 실측에서 나온 몫이다. 여기가 어긋나면 그림을 다 줄여도
          합계가 상한을 넘어 **발급이 막힌다**
   =================================================================== */
{
  ok('보기 그림 목표는 한 장 상한보다 작다', L.PIC_TARGET_BYTES < L.PIC_MAX_BYTES);
  ok('설비 사진 목표는 사진 상한보다 작다', L.PHOTO_TARGET_BYTES < L.PHOTO_MAX_BYTES);
  /* 그림 12장 + 설비 사진 1장을 목표대로 줄였을 때, **줄일 수 없는 것**이 들어갈
     자리가 남아야 한다 — 문항 글·위험요소·출처 23KB + 문항 번역 5개 언어 23KB
     (2026-11-15 실측). 여기가 모자라면 번역을 켜는 순간 발급이 막힌다 */
  const images = L.MAX_PICS * L.PIC_TARGET_BYTES + L.PHOTO_TARGET_BYTES;
  const left = L.MAX_COURSE_BYTES - images;
  ok(`그림을 목표대로 줄이면 글·번역 자리가 ${L.kb(left)} 남는다 (그림 ${L.kb(images)})`, left >= 46 * 1024);

  const autogen = fs.readFileSync(path.join(ROOT, 'src/admin/autogen.js'), 'utf8');
  const ladder = /PIC_QUALITIES = \[([^\]]+)\]/.exec(autogen);
  ok('보기 그림 품질 사다리가 0.4 아래까지 내려간다 (11/15 실측 — 0.4 에서 멈추면 목표에 못 든다)',
    !!ladder && Function('return [' + ladder[1] + ']')().some((q) => q < 0.4));
  ok('설비 사진으로 보내는 `shrink()` 의 사다리는 그대로다 (0.7~0.4)',
    /var QUALITIES = \[0\.7, 0\.55, 0\.4\]/.test(fs.readFileSync(path.join(ROOT, 'src/assets/photo.js'), 'utf8')));
}

/* ===================================================================
   3. 상한 안의 교육은 막지 않는다 (★★ 3)
   =================================================================== */
{
  const c = course();
  eq('줄인 교육 1건은 상한 안이다', L.courseSizeProblem(c), '');
  eq('서버도 같은 교육을 통과시킨다', serverProblem(c), '');
  ok('그 교육은 상한보다 작다 (' + L.kb(L.courseBytes(c)) + ')', L.courseBytes(c) <= L.MAX_COURSE_BYTES);
  eq('그림이 하나도 없는 교육도 통과한다', L.courseSizeProblem({ id: 'c2', quiz: [], photo: '' }), '');
  eq('교육이 아닌 값에는 문제를 만들지 않는다', L.courseSizeProblem(null) + L.courseSizeProblem('x'), '');
}

/* ===================================================================
   4. 넘으면 무엇이 큰지 먼저 말한다 (★★ 4) — 그리고 화면·서버가 같은 말을 한다 (★★ 2)
   =================================================================== */
{
  const cases = [
    ['보기 그림 장수', course({ quiz: [{ id: 'q1', type: 'choice', pics: Array.from({ length: L.MAX_PICS + 1 }, () => pic(500)) }] }), '보기 그림이'],
    ['보기 그림 한 장 크기', course({ quiz: [{ id: 'q1', type: 'choice', pics: [pic(L.PIC_MAX_BYTES + 1024)] }] }), '보기 그림이'],
    ['설비 사진', course({ quiz: [], photo: pic(L.PHOTO_MAX_BYTES + 1024) }), '설비 사진이'],
    ['교육 합계', course({ hazards: [{ id: 'o1', note: '가'.repeat(L.MAX_COURSE_BYTES) }] }), '교육 1건이']
  ];
  cases.forEach(([name, c, head]) => {
    const why = L.courseSizeProblem(c);
    ok(`★★ ${name} 이 넘으면 막는다`, why !== '');
    ok(`${name} — 무엇이 큰지 먼저 말한다`, why.indexOf(head) === 0 || why.indexOf('번째 문항의 ' + head) !== -1);
    eq(`★★ ${name} — 서버가 화면과 같은 말을 한다`, serverProblem(c), why);
  });

  const second = course({ quiz: [{ id: 'q1', type: 'choice', pics: [pic(500)] }, { id: 'q2', type: 'choice', pics: [pic(L.PIC_MAX_BYTES + 1024)] }] });
  ok('몇 번째 문항인지 말한다', L.courseSizeProblem(second).indexOf('2번째 문항') === 0);
}

/* ===================================================================
   5. 서버의 교육 검사가 크기부터 본다 (★ 6)
   =================================================================== */
{
  /* 설비가 정해지지 않았고(기존 문제) 크기도 넘는 교육 — 크기를 먼저 말해야
     담당자가 그림을 줄일 수 있다 */
  const c = course({ equipmentId: '', photo: pic(L.PHOTO_MAX_BYTES + 1024) });
  ok('크기 문제를 설비 문제보다 먼저 말한다', courseProblem(c, null).indexOf('설비 사진이') === 0);
  eq('크기가 괜찮으면 기존 검사가 그대로 돈다', courseProblem(course({ equipmentId: '' }), null), '설비가 정해지지 않았습니다');
}

/* ===================================================================
   6. 한글은 3바이트로 센다 (★ 7)
   =================================================================== */
eq('한글 한 글자는 3바이트다', L.bytesOf('가'), 3);
eq('객체도 JSON 으로 잰다', L.bytesOf({ a: '가' }), 11);        // {"a":"가"} — ascii 8 + 한글 3
ok('길이로 세지 않는다', L.bytesOf('가'.repeat(100)) === 300);

/* ===================================================================
   7. 브라우저 규칙 (★ 8)
   =================================================================== */
{
  /* 주석은 뺀다 — 「localStorage 를 부르지 않는다」 같은 설명이 주석에 적혀 있다 */
  const code = limitsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('fetch 를 부르지 않는다', !/\bfetch\s*\(/.test(code));
  ok('ES 모듈이 아니다', !/^\s*(import|export)\s/m.test(code));
  ok('localStorage 를 부르지 않는다', !/localStorage/.test(code));
  ok('캔버스를 부르지 않는다 (줄이는 일은 photo.js 가 한다)', !/canvas|toDataURL/i.test(code));
}

/* ===================================================================
   8. 화면이 상한을 실제로 쓴다 — 발급 자리와 검토 칸 (★★ 3)
   =================================================================== */
{
  const autogen = fs.readFileSync(path.join(ROOT, 'src/admin/autogen.js'), 'utf8');
  ok('검토 단계에 「교육 크기」 칸이 있다', /'교육 크기'/.test(autogen));
  ok('발급 직전에 상한을 본다', /Limits\.courseSizeProblem\(course\)/.test(autogen));
  ok('검토 칸과 발급이 같은 교육을 본다 (buildCourse 하나)', (autogen.match(/function buildCourse/g) || []).length === 1);
  ok('그림을 상한에 맞게 줄인다', /Photo\.shrinkDataUrl\(/.test(autogen));
  ok('설비 사진 원본은 건드리지 않는다 (사본을 줄인다)', /state\.coursePhoto/.test(autogen));

  const html = fs.readFileSync(path.join(ROOT, 'src/admin/autogen.html'), 'utf8');
  ok('화면이 limits.js 를 싣는다', html.indexOf('assets/limits.js') !== -1);
  ok('화면이 photo.js 를 limits.js 보다 먼저 싣는다', html.indexOf('assets/photo.js') < html.indexOf('assets/limits.js'));

  const sw = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8');
  ok('오프라인 목록에 limits.js 가 있다', sw.indexOf("'assets/limits.js'") !== -1);
}

report('교육 1건 크기 상한 — 그림을 줄이고, 넘으면 발급 전에 막는다');
