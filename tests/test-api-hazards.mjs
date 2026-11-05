/* /api/hazards — 사진 위험 지점 제안 (T17 · PRD-AD-07).

   ★ 실제 Gemini·DB 를 부르지 않는다. **가짜 fetch · 가짜 sql** 을 끼운다 (A02 §14.8).
     실물 좌표 품질은 `scripts/measure-hazards.mjs` 로 사람이 잰다.

   이 묶음이 지키는 것
     1. ★★ 서버의 위험유형 6종이 화면(`Store.HAZARDS`)과 같다 — 어긋나면 여기서 깨진다
     2. ★★ 담당자만 부른다. 토큰 없음 401 · 노동자·운영자 403 (FR-13)
     3. ★ 사진 형식·크기를 서버에서 다시 본다 (FR-03)
     4. ★★ 모델에 보내는 것은 사진과 지시문뿐 — 계정 값이 섞이지 않는다 (FR-14)
     5. ★★ 6종 밖은 버리고 5개까지만, 버린 수를 돌려준다 (FR-04·05)
     6. ★★ 사람이 찍혔으면 지점을 하나도 돌려주지 않는다 (FR-20)
     7. ★ 실패·지연·한도는 이유와 함께 「직접 골라」로 안내한다 (FR-11 · AC-AD-07-04)
     8. ★★ 사진·이유 문장을 로그에 남기지 않는다 (FR-17)
     9. 키는 주소가 아니라 헤더로 · 응답에 키가 없다 (FR-15)

   근거: PRD-AD-07 §4 · §8 AC-AD-07-03·04·06 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report, ROOT } = require('./harness');

const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');
const authLib = await import('../api/_auth.mjs');
const H = await import('../api/_hazards.mjs');
const hazards = await import('../api/hazards.mjs');
const measure = await import('../scripts/measure-hazards.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const KEY = 'AIzaSyFAKE0000000000hazardtestkey';

function setEnv(extra) {
  for (const k of ['AI_MODEL_HAZARDS', 'AI_HAZARD_TIMEOUT_MS']) delete process.env[k];
  Object.assign(process.env, {
    ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '',
    VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0',
    DATABASE_URL: 'postgresql://fake/fake',
    GEMINI_API_KEY: KEY,
    AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite',
    AI_DAILY_LIMIT: '600',
  }, extra || {});
  shared.resetDailyCall();
}
setEnv();

/* ── 가짜 DB (토큰 → 계정만) ───────────────────────────────────────── */

const tokens = new Map();
let dbDown = false;
function sql(strings, ...vals) {
  if (dbDown) return Promise.reject(new Error('relation "sessions" connection refused'));
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) {
    return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  }
  throw new Error('가짜 DB가 모르는 질의: ' + q);
}
db.setSqlForTest(sql);

function login(token, row) { tokens.set(authLib.tokenHash(token), row); return token; }
const ADMIN = login('tok-admin', {
  id: 'a1', user_id: 'kim@daesung.co.kr', role: 'admin', name: '김현수',
  title: '', lang: null, process_id: null, workplace_id: 'wp-a', site_name: '대성정밀',
});
const WORKER = login('tok-w07', {
  id: 'a2', user_id: 'W-4821-07', role: 'worker', name: '', title: '',
  lang: 'km', process_id: 'p-press', workplace_id: 'wp-a', site_name: '대성정밀',
});
const OPER = login('tok-oper', {
  id: 'a4', user_id: 'oper@safety.kr', role: 'operator', name: '이수진',
  title: '', lang: null, process_id: null, workplace_id: null, site_name: null,
});

/* ── 가짜 모델 ─────────────────────────────────────────────────────── */

const calls = [];
function fakeReply(text) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
function fakeStatus(status, headers) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status, headers: headers || {} });
  };
}
function fakeHang() {
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    calls.push({ url: String(url), init });
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  });
}

/* ── 사진 · 부르기 ─────────────────────────────────────────────────── */

const PHOTO = Buffer.alloc(4000, 7).toString('base64');   // 4KB 짜리 가짜 사진
const ok5 = (n) => Array.from({ length: n }, (_, i) => ({
  x: 10 + i * 15, y: 40, r: 6, hazard: 'pinch', why: '램이 내려오는 자리' + i,
}));

function req(body, opts) {
  const o = opts || {};
  const headers = { 'content-type': 'application/json' };
  if (o.origin !== null) headers.origin = o.origin || ORIGIN;
  if (o.token) headers.authorization = 'Bearer ' + o.token;
  return new Request('https://x/api/hazards', {
    method: o.method || 'POST', headers,
    body: (o.method || 'POST') === 'GET' ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body === undefined ? {} : body)),
  });
}
async function call(body, opts) {
  const res = await hazards.handle(req(body, opts));
  const raw = await res.text();
  let data; try { data = JSON.parse(raw); } catch (e) { data = null; }
  return { status: res.status, data, raw };
}
const send = (body, token) => call(body, { token: token === undefined ? ADMIN : token });
const photo = (extra) => ({ image: PHOTO, mime: 'image/jpeg', ...(extra || {}) });

const logs = [];
const realLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };

/* =================================================================
   1. 위험유형 6종 — 서버 사본이 화면과 같다
   ================================================================= */
{
  eq('★★ 서버의 6종이 화면 Store.HAZARDS 와 같다 (어긋나면 FR-05 가 틀린 유형을 버린다)',
    H.HAZARD_CODES.join(','), measure.readHazards(ROOT).join(','));
  ok('★ 실측 도구와 서버가 같은 거르기 함수를 쓴다',
    measure.filterPoints === H.filterPoints && measure.systemText === H.systemText);
}

/* =================================================================
   2. 누가 부를 수 있나
   ================================================================= */
{
  fakeReply(JSON.stringify({ person: false, points: ok5(2) }));
  eq('★★ 토큰 없으면 401', (await send(photo(), null)).status, 401);
  eq('★ 틀린 토큰이면 401', (await send(photo(), 'tok-nobody')).status, 401);
  eq('★★ 노동자는 403 — 노동자 화면은 이 함수를 부르지 않는다 (FR-13)', (await send(photo(), WORKER)).status, 403);
  eq('★ 운영자도 403 — 사업장 설비 사진은 담당자 몫이다', (await send(photo(), OPER)).status, 403);
  eq('★ 본문에 role: admin 을 적어도 안 먹는다', (await send(photo({ role: 'admin' }), WORKER)).status, 403);
  eq('★ 남의 출처는 403', (await call(photo(), { token: ADMIN, origin: 'https://evil.example' })).status, 403);
  eq('GET 은 405', (await call(undefined, { token: ADMIN, method: 'GET' })).status, 405);
  ok('막힌 요청은 모델을 부르지 않았다', calls.length === 0);
  eq('담당자는 200', (await send(photo())).status, 200);
}

/* =================================================================
   3. 사진 형식 · 크기 (FR-03)
   ================================================================= */
{
  calls.length = 0;
  fakeReply(JSON.stringify({ person: false, points: ok5(1) }));
  eq('사진이 없으면 400', (await send({ mime: 'image/jpeg' })).status, 400);
  eq('★ 허용 밖 형식(gif)은 400', (await send(photo({ mime: 'image/gif' }))).status, 400);
  eq('★ base64 가 아니면 400', (await send(photo({ image: '<svg onload=x>' }))).status, 400);
  eq('JSON 이 아니면 400', (await send('사진')).status, 400);
  eq('★ 너무 작으면(1KB 아래) 413', (await send(photo({ image: Buffer.alloc(100).toString('base64') }))).status, 413);

  const big = Buffer.alloc(Math.ceil(hazards.MAX_IMAGE_BYTES) + 3000, 1).toString('base64');
  const r = await send(photo({ image: big }));
  ok('★ 상한(1.5MB)을 넘으면 413', r.status === 413, r.status);
  ok('형식·크기에서 막힌 것은 모델을 부르지 않았다', calls.length === 0, calls.length);

  const d = await send({ image: 'data:image/png;base64,' + PHOTO });
  eq('★ canvas.toDataURL() 모양(data: 머리)도 받는다', d.status, 200);
  const sent = JSON.parse(calls[0].init.body);
  eq('머리의 형식(png)을 그대로 모델에 전한다', sent.contents[0].parts[0].inline_data.mime_type, 'image/png');
  eq('★ 머리는 떼고 사진 값만 보낸다', sent.contents[0].parts[0].inline_data.data, PHOTO);
}

/* =================================================================
   4. 모델에 무엇이 가나 (FR-14·15)
   ================================================================= */
{
  calls.length = 0;
  fakeReply(JSON.stringify({ person: false, points: ok5(2) }));
  await send(photo({ note: 'W-4821-07 신고 사진', workplace: 'wp-a' }));
  const c = calls[0];
  const body = c.init.body;
  ok('★★ 계정 값(아이디·이름·사업장)이 모델 요청에 없다',
    !/kim@daesung|김현수|wp-a|대성정밀|W-4821-07/.test(body));
  ok('★ 본문의 다른 필드(note)는 모델에 넘기지 않는다', !/신고 사진/.test(body));
  ok('★ 키는 주소에 없다', !c.url.includes(KEY) && !/key=/.test(c.url));
  eq('★ 키는 헤더로 간다', c.init.headers['x-goog-api-key'], KEY);
  has('지시문에 6종이 박혀 있다', body, 'pinch, shock, fire, fall, choke, chemical');
  has('★ 기본은 번역 모델(lite)을 쓴다 (C06 D-028)', c.url, 'gemini-3.1-flash-lite');

  calls.length = 0;
  setEnv({ AI_MODEL_HAZARDS: 'gemini-3.8-flash' });
  await send(photo());
  has('★ AI_MODEL_HAZARDS 가 있으면 그것으로 올린다 (D-028 상향 조건)', calls[0].url, 'gemini-3.8-flash');
  setEnv();
}

/* =================================================================
   5. 거르기 — 6종 밖 · 상한 · 좌표 (FR-04·05 · AC-AD-07-03)
   ================================================================= */
{
  fakeReply('```json\n' + JSON.stringify({
    person: false,
    points: [
      ...ok5(5),
      { x: 90, y: 90, r: 5, hazard: 'pinch', why: '여섯 번째' },
      { x: 50, y: 50, r: 5, hazard: 'noise', why: '6종 밖' },
      { x: 640, y: 480, r: 30, hazard: 'shock', why: '픽셀 좌표' },
      { x: 50, y: 50, r: 5, hazard: 'fire', why: '<script>alert(1)</script>' },
    ],
  }) + '\n```');
  const r = await send(photo());
  eq('200', r.status, 200);
  eq('★★ 5개까지만 남는다 (§11 Q4)', r.data.points.length, 5);
  eq('★★ 6종 밖 1개를 버렸다고 센다 (FR-05)', r.data.dropped.hazard, 1);
  eq('★ 퍼센트가 아닌 좌표 1개를 버렸다', r.data.dropped.range, 1);
  eq('★ 상한을 넘은 것 2개', r.data.dropped.over, 2);
  ok('★★ 남은 것은 전부 6종 안이다',
    r.data.points.every((p) => H.HAZARD_CODES.indexOf(p.hazard) !== -1));
  eq('person 은 false', r.data.person, false);
  ok('겹친 쌍 수를 함께 준다 (FR-21 — 합치는 것은 화면 몫)', typeof r.data.overlaps === 'number');
  ok('★ 응답에 승인 상태(status)를 넣지 않는다 — 확정은 사람이 한다', !('status' in r.data));
  ok('★ 응답에 키가 없다', !r.raw.includes(KEY));

  fakeReply(JSON.stringify({ person: false, points: [{ x: 50, y: 50, r: 5, hazard: 'fire', why: '<img src=x onerror=alert(1)>' }] }));
  const x = await send(photo());
  eq('★ HTML 같은 이유도 문자열 그대로 — 그리는 쪽이 textContent 로 쓴다 (AC-AD-07-06)',
    x.data.points[0].why, '<img src=x onerror=alert(1)>');
}

/* =================================================================
   6. 사람이 찍혔으면 (FR-20)
   ================================================================= */
{
  fakeReply(JSON.stringify({ person: true, points: ok5(3) }));
  const r = await send(photo());
  eq('200 으로 답한다 (고장이 아니라 다시 찍을 일이다)', r.status, 200);
  eq('★★ person: true', r.data.person, true);
  eq('★★ 모델이 지점을 줬어도 하나도 돌려주지 않는다', r.data.points.length, 0);
  ok('★ 그 사진의 이유 문장도 응답에 없다', !/램이 내려오는/.test(r.raw));

  fakeReply(JSON.stringify({ person: 'yes', points: ok5(1) }));
  eq('person 이 true 가 아니면(문자열 등) 사람 없음으로 본다 — 모양 틀린 값으로 막지 않는다',
    (await send(photo())).data.person, false);
}

/* =================================================================
   7. 실패 · 지연 · 한도 (FR-11 · AC-AD-07-04)
   ================================================================= */
{
  fakeReply('위험해 보입니다');
  let r = await send(photo());
  eq('★ JSON 이 아니면 502', r.status, 502);
  eq('오류 코드 model', r.data.error, 'model');
  has('★ 손 흐름으로 가라고 안내한다', r.data.message, '직접 골라');

  fakeReply('');
  eq('빈 출력은 502', (await send(photo())).status, 502);

  fakeStatus(429, { 'retry-after': '30' });
  r = await send(photo());
  eq('★ 공급사 한도는 429 (고장 502 로 뭉개지 않는다)', r.status, 429);
  has('한도 안내도 손 흐름으로', r.data.message, '직접 골라');
  has('공급사가 알려 준 대기 시간을 전한다', r.data.message, '30초');

  fakeStatus(500);
  eq('공급사 5xx 는 502', (await send(photo())).status, 502);

  setEnv({ AI_HAZARD_TIMEOUT_MS: '30' });
  fakeHang();
  r = await send(photo());
  eq('★ 시간을 넘기면 504', r.status, 504);
  has('지연도 손 흐름으로', r.data.message, '직접 골라');

  setEnv({ AI_DAILY_LIMIT: '1' });
  fakeReply(JSON.stringify({ person: false, points: ok5(1) }));
  eq('첫 호출은 된다', (await send(photo())).status, 200);
  r = await send(photo());
  eq('★ 일일 상한을 넘으면 429', r.status, 429);
  eq('오류 코드 limit', r.data.error, 'limit');

  setEnv({ GEMINI_API_KEY: '' });
  r = await send(photo());
  eq('★ 키가 없으면 500 config (사람이 틀린 것과 구분)', r.status, 500);
  eq('오류 코드 config', r.data.error, 'config');
  setEnv();

  dbDown = true;
  r = await send(photo());
  eq('★ DB 가 아프면 날것의 500 이 아니라 503 JSON', r.status, 503);
  ok('DB 오류 원문을 내보내지 않는다', !/relation|sessions/.test(r.raw));
  dbDown = false;
}

/* =================================================================
   8. 로그 (FR-17)
   ================================================================= */
{
  const all = logs.join('\n');
  ok('★★ 사진 값이 로그에 없다', !all.includes(PHOTO.slice(0, 40)));
  ok('★ 이유 문장이 로그에 없다', !/램이 내려오는/.test(all));
  ok('★ 키가 로그에 없다', !all.includes(KEY));
  ok('로그에 route 와 크기는 남는다 (몇 KB 를 보냈는지 알아야 상한을 정한다)',
    /"route":"hazards"/.test(all) && /"kb":/.test(all));
}

console.log = realLog;
report('사진 위험 지점 제안 — /api/hazards (T17)');
