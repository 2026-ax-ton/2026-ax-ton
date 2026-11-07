/* scripts/measure-hazards.mjs — 사진 위험 지점 실측 도구의 **거르는 규칙** (T17 준비).

   왜 측정 도구에 검사를 붙이나

     이 파일이 지키는 함수들(`systemText`·`parseModelJson`·`filterPoints`)은
     **T17 서버 함수의 원안**이다. 실측으로 모양을 다듬고 나면 그대로 `api/` 로
     옮겨 간다. 그래서 「6종 밖은 버린다」·「5개까지만」·「퍼센트가 아니면 버린다」
     같은 경계를 **지금 고정**해 둔다 — 옮길 때 조용히 느슨해지지 않게.

     실제 Gemini 는 부르지 않는다. 가짜 응답 문자열만 넣는다
     (`tests/test-agent-boundary.js` 와 같은 방식).

   이 묶음이 지키는 것
     1. ★★ 위험유형 6종은 화면(`Store.HAZARDS`)에서 읽어 온다 — 두 곳에 베끼지 않는다
     2. ★★ 6종 밖 위험유형은 버리고, **몇 개를 버렸는지 센다** (FR-AD-07-05)
     3. ★★ 지점은 사진 1장당 **5개까지만** (§11 Q4 결정)
     4. ★ 퍼센트가 아닌 좌표(픽셀·음수·100 초과)는 버린다
     5. ★ 모델이 울타리(```json)나 군말을 붙여도 JSON 을 꺼낸다. 못 꺼내면 null
     6. ★ 「이유」는 참고용이라 길이를 자르고, 문구로 쓰지 않는다 (FR-AD-07-09)
     7. ★ 사람·이름표 여부를 같은 응답에서 받는다 (FR-AD-07-20)
     8. ★ 겹치는 지점 쌍을 센다 (FR-AD-07-21)
     9. 키가 없으면 돌지 않고, 키 값을 화면에 찍지 않는다

   근거: PRD-AD-07 §4 FR-04·05·09·12·20·21 · §11 Q4·Q5·Q8 · C06 D-027 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ok, eq, has, report, ROOT } = require('./harness');

const SCRIPT = path.join(ROOT, 'scripts/measure-hazards.mjs');
const M = await import('../scripts/measure-hazards.mjs');

const HAZARDS = M.readHazards(ROOT);

/* =================================================================
   1. 위험유형 6종을 화면에서 읽어 온다
   ================================================================= */
{
  eq('★★ 6종을 화면(Store.HAZARDS)에서 그대로 읽는다',
    HAZARDS.join(','), 'pinch,shock,fire,fall,choke,chemical');

  const src = fs.readFileSync(SCRIPT, 'utf8');
  ok('★ 6종을 스크립트에 베껴 적지 않았다',
    !/['"]pinch['"]\s*,\s*['"]shock['"]/.test(src));
  ok('★ 화면 파일을 읽어서 쓴다', /assets\/store\.js/.test(src));
}

/* =================================================================
   2. 지시문 — 모델에게 무엇을 못 하게 하나
   ================================================================= */
{
  const sys = M.systemText(HAZARDS);
  has('★ 6종을 지시문에 박아 준다', sys, 'pinch, shock, fire, fall, choke, chemical');
  has('★ 상한 5개를 말해 준다', sys, '5개까지만');
  has('★ 퍼센트로 달라고 한다', sys, '퍼센트');
  has('★ 사람·이름표 여부를 함께 묻는다 (추가 호출 없음)', sys, 'person');
  ok('★★ 안전 수칙·지시문을 쓰게 하지 않는다 (문구는 라이브러리에서 고른다)',
    /지시문이나 안전 수칙을 쓰지 않는다/.test(sys));
  has('★ JSON 하나만 내라고 한다', sys, 'JSON 하나만');
}

/* =================================================================
   3. 응답 꺼내기 — 모델은 군말을 붙인다
   ================================================================= */
{
  const body = { person: false, points: [] };
  eq('맨 JSON 을 읽는다', JSON.stringify(M.parseModelJson(JSON.stringify(body))), JSON.stringify(body));

  const fenced = '```json\n' + JSON.stringify(body) + '\n```';
  ok('★ 코드 울타리를 벗긴다', M.parseModelJson(fenced) !== null);

  const chatty = '네, 분석했습니다.\n' + JSON.stringify(body) + '\n도움이 되었길 바랍니다.';
  ok('★ 앞뒤 군말이 붙어도 꺼낸다', M.parseModelJson(chatty) !== null);

  eq('★ JSON 이 아니면 null (조용히 빈 값으로 넘기지 않는다)', M.parseModelJson('위험해 보입니다'), null);
  eq('★ 배열은 받지 않는다 (모양이 다르다)', M.parseModelJson('[1,2,3]'), null);
  eq('★ 문자열이 아니면 null', M.parseModelJson(undefined), null);
}

/* =================================================================
   4. 거르기 — 6종 밖·상한·퍼센트
   ================================================================= */
{
  const good = { x: 50, y: 40, r: 8, hazard: 'pinch', why: '회전부에 손이 닿는다' };

  {
    const r = M.filterPoints([good], HAZARDS);
    eq('정상 지점은 남는다', r.points.length, 1);
    eq('좌표를 그대로 둔다', JSON.stringify(r.points[0]), JSON.stringify(good));
  }

  {
    /* ★★ 6종 밖 — PRD 가 "버리고 몇 개를 버렸는지 화면에 적는다"고 했다 */
    const r = M.filterPoints([
      good,
      { ...good, hazard: 'explosion' },
      { ...good, hazard: '끼임' },        // 라벨(한국어)을 준 경우도 코드가 아니다
      { ...good, hazard: 'PINCH' },       // 대문자도 다른 값이다
    ], HAZARDS);
    eq('★★ 6종 밖은 버린다', r.points.length, 1);
    eq('★★ 몇 개를 버렸는지 센다', r.dropped.hazard, 3);
  }

  {
    /* ★★ §11 Q4 — 사진 1장당 5개 */
    const many = Array.from({ length: 9 }, (_, i) => ({ ...good, x: 10 + i * 9 }));
    const r = M.filterPoints(many, HAZARDS);
    eq('★★ 5개까지만 남는다', r.points.length, M.MAX_POINTS);
    eq('★ 넘친 개수를 따로 센다', r.dropped.over, 4);
  }

  {
    /* ★ 픽셀을 주는 사고가 가장 흔하다 — 퍼센트가 아니면 버린다 */
    const r = M.filterPoints([
      { ...good, x: 640, y: 480 },     // 픽셀
      { ...good, x: -5 },              // 음수
      { ...good, y: 101 },             // 100 초과
      { ...good, r: 0 },               // 반지름 0
      { ...good, r: 120 },             // 반지름이 사진보다 크다
    ], HAZARDS);
    eq('★ 퍼센트가 아닌 좌표는 전부 버린다', r.points.length, 0);
    eq('★ 범위 밖으로 센다', r.dropped.range, 5);
  }

  {
    const r = M.filterPoints([
      null, 'pinch', 42,
      { hazard: 'pinch' },                       // 좌표 없음
      { x: 1, y: 1, r: 1 },                      // 위험유형 없음
      { x: '50', y: '40', r: '8', hazard: 'pinch' },  // 숫자가 아니라 글자
    ], HAZARDS);
    eq('★ 모양이 틀린 것은 버린다', r.points.length, 0);
    /* 좌표를 먼저 본다 — 좌표가 숫자가 아니면 위험유형이 멀쩡해도 「모양 틀림」이다.
       그래서 글자 좌표를 준 마지막 줄은 「6종 밖」이 아니라 모양으로 센다. */
    eq('★ 좌표는 멀쩡한데 위험유형이 없는 것만 「6종 밖」으로 센다', r.dropped.hazard, 1);
    eq('★ 나머지 5개는 「모양 틀림」으로 센다 (null·글자·숫자·좌표없음·글자좌표)',
      r.dropped.shape, 5);
  }

  {
    eq('응답에 points 가 없어도 터지지 않는다', M.filterPoints(undefined, HAZARDS).points.length, 0);
    eq('points 가 배열이 아니어도 터지지 않는다', M.filterPoints({ a: 1 }, HAZARDS).points.length, 0);
  }

  {
    /* ★ 이유는 참고용이다 — 길이를 자른다. 문구로 저장하지 않는다 (FR-09) */
    const long = { ...good, why: '가'.repeat(400) };
    const r = M.filterPoints([long], HAZARDS);
    eq('★ 이유를 120자로 자른다', r.points[0].why.length, 120);
    const noWhy = M.filterPoints([{ x: 1, y: 1, r: 1, hazard: 'fire' }], HAZARDS);
    eq('★ 이유가 없으면 빈 문자열', noWhy.points[0].why, '');
  }

  {
    /* ★ 악성 출력도 글자 그대로 남긴다 — 보여 주는 쪽이 textContent 를 쓴다 (FR-12) */
    const evil = { ...good, why: '<img src=x onerror=alert(1)>' };
    const r = M.filterPoints([evil], HAZARDS);
    eq('★ 출력을 고치지 않고 글자 그대로 둔다 (보여 주는 쪽이 textContent)',
      r.points[0].why, '<img src=x onerror=alert(1)>');
    const src = fs.readFileSync(SCRIPT, 'utf8');
    ok('★ 거르는 자리에서 HTML 을 만들지 않는다', !/innerHTML/.test(src));
  }
}

/* =================================================================
   5. 겹치는 지점 세기 (FR-21)
   ================================================================= */
{
  const p = (x, y, r) => ({ x, y, r, hazard: 'pinch', why: '' });
  eq('멀리 떨어진 둘은 겹치지 않는다', M.overlapCount([p(10, 10, 5), p(80, 80, 5)]), 0);
  eq('★ 가까운 둘은 겹친 쌍으로 센다', M.overlapCount([p(50, 50, 10), p(55, 50, 10)]), 1);
  eq('세 개가 다 가까우면 3쌍', M.overlapCount([p(50, 50, 20), p(52, 50, 20), p(54, 50, 20)]), 3);
  eq('지점이 하나면 0쌍', M.overlapCount([p(50, 50, 10)]), 0);
}

/* =================================================================
   6. 키·사진이 없으면 돌지 않는다
   ================================================================= */
{
  const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hz-'));
  const noKey = spawnSync(process.execPath, [SCRIPT, 'x.jpg'], {
    cwd: empty,
    env: { ...process.env, GEMINI_API_KEY: '', GEMINI_HACKATHON_KEY: '' },
    encoding: 'utf8',
  });
  ok('★ 키가 없으면 돌지 않는다', noKey.status !== 0);
  has('★ 무엇을 해야 하는지 알려 준다', noKey.stderr, 'GEMINI_API_KEY');

  const FAKE = 'AIza' + 'TESTONLYnotarealkey_0123456789';
  const noFile = spawnSync(process.execPath, [SCRIPT], {
    cwd: empty,
    env: { ...process.env, GEMINI_API_KEY: FAKE },
    encoding: 'utf8',
  });
  ok('★ 사진을 안 주면 돌지 않는다', noFile.status !== 0);
  has('★ 설비만 찍으라고 알려 준다', noFile.stderr, '설비만');
  ok('★★ 키 값을 화면에 찍지 않는다',
    (noFile.stdout + noFile.stderr + noKey.stdout + noKey.stderr).indexOf(FAKE) === -1);
  fs.rmSync(empty, { recursive: true, force: true });

  const src = fs.readFileSync(SCRIPT, 'utf8');
  ok('★ 저장하지 않는다 — 화면에 찍기만 한다 (판정은 사람이 한다)',
    !/writeFileSync|appendFileSync/.test(src));
  ok('★ 키를 주소가 아니라 헤더로 보낸다',
    /x-goog-api-key/.test(src) && !/key=/.test(src.replace(/GEMINI_[A-Z_]*KEY/g, '')));
}

report('사진 위험 지점 실측 — 거르는 규칙 (T17 원안)');
