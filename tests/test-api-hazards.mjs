/* /api/hazards — 사진 위험 지점 제안 (T17 · C06 D-027).

   ★ 실제 DB 도 실제 Gemini 도 부르지 않는다. **가짜 `sql`** 과 **가짜 `fetch`** 를
     끼운다 (`test-api-reports.mjs`·`test-api.mjs` 와 같은 방식).

   이 묶음이 지키는 것 (PRD-AD-07 §8 수용 기준)
     1. ★★ **담당자(admin) 토큰만** 받는다 — 노동자·운영자·토큰 없음은 막는다
     2. ★★ 응답에 **승인 상태(status)가 없다**. 저장도 하지 않는다 (AC-02)
     3. ★★ 6종 밖 위험유형·5개 초과는 버리고 **몇 개 버렸는지** 돌려준다 (AC-03 · Q4)
     4. ★★ 사람·이름표가 찍히면 **지점을 아예 돌려주지 않고** 다시 찍게 한다 (FR-20)
     5. ★ 실패·지연·한도면 이유를 담아 돌려준다 — 화면은 손 흐름으로 간다 (AC-04)
     6. ★ AI 가 뱉은 글(`<script>` 포함)을 응답에 그대로 흘리지 않는다 (AC-06)
     7. ★ 사진이 너무 크거나 모양이 틀리면 거절한다 (FR-03)
     8. ★ 키를 응답·로그에 내지 않는다 (AC-08 계열 · STC-E19-001)
     9. ★ 공급사에 보내는 것은 **사진과 지시문뿐**이다 (FR-14)

   근거: PRD-AD-07 §4·§7·§8 · C06 D-027·D-028 · A02 §5.2~§5.6 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');

const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');
const hz = await import('../api/hazards.mjs');
const authLib = await import('../api/_auth.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const WP_A = 'wp-a';
const KEY = 'AIzaSyFAKE0000000000테스트용가짜키';

Object.assign(process.env, {
  ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '',
  VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0',
  DATABASE_URL: 'postgresql://fake/fake',
  GEMINI_API_KEY: KEY, AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite',
  AI_MODEL_PHOTO: '', AI_PHOTO_DAILY_LIMIT: '',
});

/* ── 가짜 DB — 토큰으로 계정을 찾는 질의 하나만 안다 ──────────────── */

const tokens = new Map();
function login(token, row) {
  tokens.set(authLib.tokenHash(token), row);
  return token;
}
function sql(strings, ...vals) {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) {
    return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  }
  throw new Error('가짜 DB가 모르는 질의: ' + q);
}
sql.query = () => Promise.resolve([]);
db.setSqlForTest(sql);

const ADMIN = login('tok-admin', {
  id: 'a1', user_id: 'kim@daesung.co.kr', role: 'admin', name: '김현수',
  title: '', lang: null, process_id: null, workplace_id: WP_A, site_name: '대성정밀',
});
const WORKER = login('tok-worker', {
  id: 'a2', user_id: 'W-4821-07', role: 'worker', name: '',
  title: '', lang: 'km', process_id: 'p-press', workplace_id: WP_A, site_name: '대성정밀',
});
const OPER = login('tok-oper', {
  id: 'a4', user_id: 'oper@safety.kr', role: 'operator', name: '이수진',
  title: '', lang: null, process_id: null, workplace_id: null, site_name: null,
});

/* ── 가짜 Gemini ───────────────────────────────────────────────────── */

const sent = [];            // 공급사로 보낸 요청을 모아 둔다
let reply = null;           // 다음 호출에 돌려줄 것

const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  sent.push({ url: String(url), opts });
  if (typeof reply === 'function') return reply();
  const body = reply;
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({
      candidates: [{ content: { parts: [{ text: typeof body === 'string' ? body : JSON.stringify(body) }] } }],
    }),
  });
};

function answer(body) { reply = body; }
function rawAnswer(text) { reply = text; }
function httpFail(status) {
  reply = () => Promise.resolve({ ok: false, status, headers: { get: () => null }, json: () => Promise.resolve({}) });
}

/* ── 부르기 ────────────────────────────────────────────────────────── */

const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');

function req(body, token, method = 'POST') {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = 'Bearer ' + token;
  return new Request('https://x/api/hazards', {
    method, headers,
    body: method === 'GET' ? undefined : JSON.stringify(body === undefined ? {} : body),
  });
}
async function call(body, token, method) {
  shared.resetDailyCall();
  const res = await hz.handle(req(body, token, method));
  let data; try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
  return { status: res.status, data };
}
const photo = (token = ADMIN, extra = {}) => call({ image: IMG, mime: 'image/jpeg', ...extra }, token);

const logs = [];
const realLog = console.log;
console.log = (...a) => logs.push(a.join(' '));

/* ===================================================================
   1. 담당자만 쓸 수 있다
   =================================================================== */
{
  answer({ person: false, points: [] });
  eq('토큰 없으면 401', (await photo(null)).status, 401);
  eq('모르는 토큰도 401', (await photo('tok-nobody')).status, 401);
  eq('★★ 노동자는 403 (노동자는 이 기능을 쓰지 않는다)', (await photo(WORKER)).status, 403);
  eq('★ 운영자도 403 (문구 검수자이지 교육 담당자가 아니다)', (await photo(OPER)).status, 403);
  eq('★★ 담당자는 200', (await photo(ADMIN)).status, 200);
}

/* ===================================================================
   2. 출처·메서드 — 번역 함수와 같은 울타리
   =================================================================== */
{
  answer({ person: false, points: [] });
  const other = new Request('https://x/api/hazards', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  });
  eq('다른 출처는 403', (await hz.handle(other)).status, 403);

  const res = await hz.handle(req(undefined, ADMIN, 'GET'));
  eq('★ POST 만 받는다 (플랫폼 405 가 아니라 우리 JSON)', res.status, 405);
  const body = JSON.parse(await res.text());
  eq('405 에도 우리 모양이 있다', body.error, 'method');
}

/* ===================================================================
   3. 사진 모양·크기 (FR-03)
   =================================================================== */
{
  answer({ person: false, points: [] });
  eq('사진이 없으면 400', (await call({ mime: 'image/jpeg' }, ADMIN)).status, 400);
  eq('mime 이 없으면 400', (await call({ image: IMG }, ADMIN)).status, 400);
  eq('★ 받지 않는 형식은 400 (gif)', (await call({ image: IMG, mime: 'image/gif' }, ADMIN)).status, 400);
  eq('★ pdf 를 사진이라고 해도 400', (await call({ image: IMG, mime: 'application/pdf' }, ADMIN)).status, 400);

  /* ★ data: URL 머리를 붙여 보내는 실수는 **고쳐 주지 않고 거절**한다 —
     조용히 고쳐 주면 화면이 계속 그렇게 보낸다 */
  const dataUrl = 'data:image/jpeg;base64,' + IMG;
  eq('★★ data: URL 머리가 붙어 오면 400 (고쳐 주지 않는다)',
    (await call({ image: dataUrl, mime: 'image/jpeg' }, ADMIN)).status, 400);

  eq('base64 가 아니면 400', (await call({ image: '!!!not base64!!!', mime: 'image/jpeg' }, ADMIN)).status, 400);

  /* 750KB 상한 — base64 로는 약 1MB 다. 본문 상한(1MB)에 먼저 걸릴 수 있으니
     둘 중 어느 쪽으로 막히든 **413** 이면 된다 */
  const big = 'A'.repeat(760 * 1024 * 4 / 3);
  const r = await call({ image: big, mime: 'image/jpeg' }, ADMIN);
  eq('★ 사진이 너무 크면 413', r.status, 413);
  ok('★ 다시 찍으라고 알려 준다', /다시 찍/.test(r.data.message));
}

/* ===================================================================
   4. 공급사에 보내는 것 — 사진과 지시문뿐 (FR-14)
   =================================================================== */
{
  sent.length = 0;
  answer({ person: false, points: [{ x: 50, y: 40, r: 8, hazard: 'pinch', why: '회전부' }] });
  await photo(ADMIN);

  eq('한 번만 부른다', sent.length, 1);
  const body = JSON.parse(sent[0].opts.body);
  const parts = body.contents[0].parts;
  eq('★ 보내는 조각은 둘뿐이다 (사진 + 지시 한 줄)', parts.length, 2);
  eq('★ 사진을 inline_data 로 보낸다', parts[0].inline_data.mime_type, 'image/jpeg');
  eq('★ 사진 내용은 우리가 받은 그대로', parts[0].inline_data.data, IMG);

  const whole = JSON.stringify(body);
  ok('★★ 노동자·진도·신고 데이터를 함께 보내지 않는다',
    !/W-4821-07|progress|reports|kim@daesung/.test(whole));
  ok('★★ 사업장 이름·계정도 보내지 않는다', !/대성정밀|workplace/.test(whole));
  ok('★ 위험유형 6종을 지시문에 박아 준다', /pinch, shock, fire, fall, choke, chemical/.test(whole));

  ok('★★ 키를 주소가 아니라 헤더로 보낸다',
    sent[0].url.indexOf(KEY) === -1 && sent[0].opts.headers['x-goog-api-key'] === KEY);
  ok('★ 공급사 주소로만 부른다', /generativelanguage\.googleapis\.com/.test(sent[0].url));
}

/* ===================================================================
   5. 거르기 — 6종 밖·5개 상한·퍼센트 (AC-03 · §11 Q4)
   =================================================================== */
{
  const good = { x: 50, y: 40, r: 8, hazard: 'pinch', why: '회전부에 손이 닿는다' };
  answer({
    person: false,
    points: [
      good,
      { ...good, hazard: 'explosion' },        // 6종 밖
      { ...good, x: 640, y: 480 },             // 픽셀
      { ...good, hazard: 'fire', x: 20, y: 20 },
    ],
  });
  const r = await photo(ADMIN);
  eq('★★ 쓸 수 있는 것만 남는다', r.data.points.length, 2);
  eq('★★ 6종 밖을 몇 개 버렸는지 돌려준다', r.data.dropped.hazard, 1);
  eq('★★ 좌표 범위 밖도 센다', r.data.dropped.range, 1);
  ok('★ 남은 것은 전부 6종 안이다',
    r.data.points.every((p) => ['pinch', 'shock', 'fire', 'fall', 'choke', 'chemical'].indexOf(p.hazard) !== -1));

  answer({ person: false, points: Array.from({ length: 9 }, (_, i) => ({ ...good, x: 10 + i * 9 })) });
  const many = await photo(ADMIN);
  eq('★★ 사진 1장당 5개까지만 (§11 Q4)', many.data.points.length, 5);
  eq('★ 넘친 개수를 따로 센다', many.data.dropped.over, 4);
  ok('★ 겹친 쌍도 알려 준다 (합쳐 보여야 한다, FR-21)', typeof many.data.overlaps === 'number');
}

/* ===================================================================
   6. 사람·이름표가 찍혔을 때 (FR-20)
   =================================================================== */
{
  answer({
    person: true,
    points: [{ x: 50, y: 40, r: 8, hazard: 'pinch', why: '사람 옆' }],
  });
  const r = await photo(ADMIN);
  eq('200 으로 돌려준다 (오류가 아니다)', r.status, 200);
  eq('★★ 사람이 찍혔다고 알려 준다', r.data.person, true);
  eq('★★ 다시 찍으라고 한다', r.data.retake, true);
  eq('★★ 지점을 **아예 돌려주지 않는다** (화면에서 가리는 것으로 두지 않는다)',
    r.data.points.length, 0);
}

/* ===================================================================
   7. 저장하지 않는다 · 승인 상태를 만들지 않는다 (AC-02)
   =================================================================== */
{
  answer({
    person: false,
    /* 모델이 승인된 척 끼워 보내도 그대로 흘리지 않는다 */
    status: 'reviewed',
    approved: true,
    points: [{ x: 10, y: 10, r: 5, hazard: 'fire', why: '기름', status: 'reviewed' }],
  });
  const r = await photo(ADMIN);
  const whole = JSON.stringify(r.data);
  ok('★★ 응답에 승인 상태가 없다', !/reviewed|approved/.test(whole));
  eq('★ 지점에도 우리가 정한 칸만 남는다',
    Object.keys(r.data.points[0]).sort().join(','), 'hazard,r,why,x,y');

  const src = require('fs').readFileSync(
    require('path').join(require('path').dirname(require('url').fileURLToPath(import.meta.url)), '../api/hazards.mjs'),
    'utf8',
  );
  /* 주석을 뺀 **실제 코드**만 본다 — 주석에는 "courses 에 쓰지 않는다" 같은
     약속이 적혀 있어서, 글자만 찾으면 약속을 위반으로 세게 된다 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('★★ 이 함수는 아무것도 저장하지 않는다 (insert·update 가 없다)',
    !/insert into|update .* set/i.test(code));
  ok('★★ `courses` 를 코드에서 건드리지 않는다 (AD-04 승인 전에는 아무것도 안 들어간다)',
    !/courses/.test(code));
  ok('★ 사진을 파일로 쓰지 않는다', !/writeFile/.test(code));
}

/* ===================================================================
   8. 악성 출력 — 그대로 흘리지 않는다 (AC-06)
   =================================================================== */
{
  answer({
    person: false,
    points: [{ x: 10, y: 10, r: 5, hazard: 'fire', why: '<script>alert(1)</script>' }],
  });
  const r = await photo(ADMIN);
  eq('★ 글자는 고치지 않고 그대로 둔다 (보여 주는 쪽이 textContent 를 쓴다)',
    r.data.points[0].why, '<script>alert(1)</script>');

  rawAnswer('죄송합니다. 이 사진은 분석할 수 없습니다. <script>x</script>');
  const bad = await photo(ADMIN);
  eq('★★ JSON 이 아니면 502', bad.status, 502);
  ok('★★ 모델이 뱉은 글을 응답에 담지 않는다',
    !/script|죄송/.test(JSON.stringify(bad.data)));
  ok('★ 손으로 만들 수 있다고 알려 준다', /직접 만드/.test(bad.data.message));
}

/* ===================================================================
   9. 실패·한도 — 버튼이 조용히 사라지지 않는다 (AC-04)
   =================================================================== */
{
  httpFail(500);
  const broke = await photo(ADMIN);
  eq('★ 공급사가 아프면 502', broke.status, 502);
  ok('★ 이유를 적어 준다', /(응답하지|읽을 수)/.test(broke.data.message));

  httpFail(429);
  const over = await photo(ADMIN);
  eq('★ 공급사 한도는 429 로 그대로 전한다 (고장이 아니다)', over.status, 429);
  ok('★ 직접 입력하라고 알려 준다', /직접 입력|직접 만드/.test(over.data.message));

  reply = () => Promise.reject(new Error('boom'));
  const gone = await photo(ADMIN);
  eq('★ 닿지 못하면 502', gone.status, 502);

  /* 우리 하루 상한 — 번역과 **다른 통**이다 (사진이 번역 예산을 먹지 않는다) */
  answer({ person: false, points: [] });
  shared.resetDailyCall();
  process.env.AI_PHOTO_DAILY_LIMIT = '2';
  const a = await hz.handle(req({ image: IMG, mime: 'image/jpeg' }, ADMIN));
  const b = await hz.handle(req({ image: IMG, mime: 'image/jpeg' }, ADMIN));
  const c = await hz.handle(req({ image: IMG, mime: 'image/jpeg' }, ADMIN));
  eq('상한 안에서는 된다', a.status + ',' + b.status, '200,200');
  eq('★★ 하루 상한을 넘으면 429', c.status, 429);
  ok('★ 번역 통은 그대로 남아 있다 (사진이 번역 예산을 먹지 않는다)',
    shared.takeDailyCall(1) === true);
  process.env.AI_PHOTO_DAILY_LIMIT = '';
  shared.resetDailyCall();
}

/* ===================================================================
   10. 키·설정 — 어디에도 내지 않는다
   =================================================================== */
{
  answer({ person: false, points: [] });
  const r = await photo(ADMIN);
  ok('★★ 응답에 키가 없다', JSON.stringify(r.data).indexOf('AIza') === -1);
  ok('★★ 로그에 키가 없다', logs.join('\n').indexOf('AIza') === -1);
  ok('★ 로그에 사진 내용이 없다', logs.join('\n').indexOf(IMG) === -1);

  const noKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  const cfg = await photo(ADMIN);
  eq('★ 키가 없으면 500 (사람이 다시 넣으면 되는 401 과 다른 일이다)', cfg.status, 500);
  ok('★ 500 에도 키 값이 없다', JSON.stringify(cfg.data).indexOf('AIza') === -1);
  process.env.GEMINI_API_KEY = noKey;

  /* 모델 이름은 AI_MODEL_PHOTO 가 있으면 그것, 없으면 번역과 같은 모델 */
  answer({ person: false, points: [] });
  const fallback = await photo(ADMIN);
  eq('★ 환경변수를 새로 넣지 않아도 번역 모델로 돈다', fallback.data.model, 'gemini-3.1-flash-lite');
  process.env.AI_MODEL_PHOTO = 'gemini-3.8-flash';
  answer({ person: false, points: [] });
  const picked = await photo(ADMIN);
  eq('★ AI_MODEL_PHOTO 를 넣으면 그것을 쓴다 (D-028 상향 조건)', picked.data.model, 'gemini-3.8-flash');
  process.env.AI_MODEL_PHOTO = '';
}

console.log = realLog;
globalThis.fetch = realFetch;

report('/api/hazards — 사진 위험 지점 제안 (담당자만 · 제안만 · 저장 없음)');
