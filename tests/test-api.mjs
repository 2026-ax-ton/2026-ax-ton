/* /api 함수 두 개 — 가짜 fetch 로 경계를 고정한다.

   실제 Gemini 는 부르지 않는다. 실물 확인은 미리보기 배포에서 한다 (STC-E16-008, T4).
   케이스: D07 §3.2 9) STC-E19-003 ~ STC-E19-008
   근거:   A02 §5.2~§5.5 · SPEC-BE §2.2·§2.4 · PRD-AD-03 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report, ROOT } = require('./harness');

const translate = await import('../api/translate.mjs');
const backtranslate = await import('../api/backtranslate.mjs');
const shared = await import('../api/_shared.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
/* 통과 문구는 HTTP 헤더로 간다 → ASCII 만 쓸 수 있다 (A02 §5.6) */
const PASS = 'agent-pass-2026';
const KEY = 'AIzaSyFAKE0000000000테스트용가짜키';

/* ── 환경과 가짜 fetch ─────────────────────────────────────────────── */

function setEnv(extra) {
  Object.assign(process.env, {
    ALLOWED_ORIGIN: ORIGIN,
    /* 아래 셋은 Vercel 이 자동으로 넣어 주는 주소다 (손으로 넣지 않는다) */
    VERCEL_URL: '',                        // 이 배포만의 주소
    VERCEL_BRANCH_URL: '',                 // 브랜치 주소
    VERCEL_PROJECT_PRODUCTION_URL: '',     // 운영 주소
    ALLOW_FILE_ORIGIN: '0',
    AGENT_PASS: PASS,
    GEMINI_API_KEY: KEY,
    AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite',
    AI_MODEL_BACK: 'gemini-3.8-flash',
    AI_TIMEOUT_MS: '20000',
    AI_DAILY_LIMIT: '600',
  }, extra || {});
  shared.resetDailyCall();
}

const calls = [];
const logs = [];
const realLog = console.log;

/** 모델이 이 문장을 돌려준 것처럼 꾸민다. */
function fakeReply(text) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

function fakeRaw(bodyObj, status) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(bodyObj), {
      status: status || 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

/** 영영 답하지 않는 모델 — AbortController 가 끊어야 한다. */
function fakeHang() {
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    calls.push({ url: String(url), init });
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
}

function req(path, opts) {
  const o = opts || {};
  const method = o.method || 'POST';
  const origin = 'origin' in o ? o.origin : ORIGIN;
  const pass = 'pass' in o ? o.pass : PASS;
  const headers = {};
  if (origin !== null) headers.origin = origin;
  if (pass !== null) headers['x-agent-pass'] = pass;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://2026-ax-ton.vercel.app' + path, {
    method,
    headers,
    body: o.body === undefined ? undefined
      : (typeof o.body === 'string' ? o.body : JSON.stringify(o.body)),
  });
}

const KO = '회전 중인 롤러에 손을 넣지 마세요.';
const okBody = { ko: KO, lang: 'km', attempt: 0 };

async function read(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return { __raw: txt }; }
}

/* 로그를 모은다 — 키·문구 원문이 섞이는지 보기 위해서다 */
console.log = function () { logs.push([].slice.call(arguments).join(' ')); };

/* =================================================================
   1. 메서드 — STC-E19-003
   ================================================================= */
{
  setEnv();
  const res = await translate.handle(req('/api/translate', { method: 'GET' }));
  eq('GET 은 405', res.status, 405);
  eq('error 코드가 method', (await read(res)).error, 'method');

  const d = await translate.handle(req('/api/translate', { method: 'DELETE' }));
  eq('DELETE 도 405', d.status, 405);
}

/* =================================================================
   2. 출처 — STC-E19-004
   ================================================================= */
{
  setEnv();
  const other = await translate.handle(req('/api/translate', { origin: 'https://evil.example', body: okBody }));
  eq('다른 출처는 403', other.status, 403);
  eq('error 코드가 origin', (await read(other)).error, 'origin');

  const noOrigin = await translate.handle(req('/api/translate', { origin: null, body: okBody }));
  eq('Origin 이 아예 없어도 403', noOrigin.status, 403);

  const nullOff = await translate.handle(req('/api/translate', { origin: 'null', body: okBody }));
  eq('null 출처는 허용이 꺼져 있으면 403', nullOff.status, 403);
  ok('403 에는 CORS 허용 헤더를 붙이지 않는다',
    nullOff.headers.get('access-control-allow-origin') === null);

  /* ★ 미리보기 주소는 배포마다 바뀐다 → 이 배포 자신의 주소(VERCEL_URL)도 통과시킨다 */
  setEnv({ ALLOWED_ORIGIN: 'https://2026-ax-ton.vercel.app', VERCEL_URL: '2026-ax-abc123-a-636a.vercel.app' });
  fakeReply('កុំដាក់ដៃ');
  const preview = await translate.handle(req('/api/translate', {
    origin: 'https://2026-ax-abc123-a-636a.vercel.app', body: okBody,
  }));
  eq('이 배포 자신의 주소는 같은 출처다', preview.status, 200);
  ok('자기 주소로 통과해도 CORS 헤더는 내지 않는다',
    preview.headers.get('access-control-allow-origin') === null);

  setEnv({ VERCEL_URL: '2026-ax-abc123-a-636a.vercel.app' });
  const otherDeploy = await translate.handle(req('/api/translate', {
    origin: 'https://2026-ax-zzz999-a-636a.vercel.app', body: okBody,
  }));
  eq('다른 배포 주소는 여전히 403', otherDeploy.status, 403);

  /* 브랜치 주소·운영 주소도 Vercel 이 알려 준다 (ALLOWED_ORIGIN 없이도 맞는다) */
  setEnv({ ALLOWED_ORIGIN: '', VERCEL_BRANCH_URL: '2026-ax-ton-git-feat-x-a-636a.vercel.app' });
  fakeReply('កុំដាក់ដៃ');
  const branch = await translate.handle(req('/api/translate', {
    origin: 'https://2026-ax-ton-git-feat-x-a-636a.vercel.app', body: okBody,
  }));
  eq('★ 브랜치 주소도 같은 출처다 (ALLOWED_ORIGIN 없이)', branch.status, 200);

  setEnv({ ALLOWED_ORIGIN: '', VERCEL_PROJECT_PRODUCTION_URL: '2026-ax-ton.vercel.app' });
  fakeReply('កុំដាក់ដៃ');
  const prod = await translate.handle(req('/api/translate', {
    origin: 'https://2026-ax-ton.vercel.app', body: okBody,
  }));
  eq('★ 운영 주소도 같은 출처다 (ALLOWED_ORIGIN 없이)', prod.status, 200);

  setEnv({ ALLOWED_ORIGIN: '' });
  const nothing = await translate.handle(req('/api/translate', { body: okBody }));
  eq('허용 주소가 하나도 없으면 아무것도 통과하지 못한다', nothing.status, 403);

  /* 시연 기간에만 켠다 (A02 §5.2 · C06 D-019) */
  setEnv({ ALLOW_FILE_ORIGIN: '1' });
  fakeReply('កុំដាក់ដៃ');
  const nullOn = await translate.handle(req('/api/translate', { origin: 'null', body: okBody }));
  eq('허용을 켜면 null 출처가 통과', nullOn.status, 200);
  eq('CORS 허용 출처가 null', nullOn.headers.get('access-control-allow-origin'), 'null');
  eq('CORS 허용 헤더에 X-Agent-Pass · Authorization', nullOn.headers.get('access-control-allow-headers'), 'Content-Type, X-Agent-Pass, Authorization');
  eq('CORS 허용 메서드', nullOn.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  eq('Vary: Origin', nullOn.headers.get('vary'), 'Origin');
}

/* =================================================================
   3. 사전 요청(OPTIONS) — 모델을 부르지 않는다
   ================================================================= */
{
  setEnv({ ALLOW_FILE_ORIGIN: '1' });
  calls.length = 0;
  const pre = await translate.handle(req('/api/translate', { method: 'OPTIONS', origin: 'null', pass: null }));
  eq('OPTIONS 는 204', pre.status, 204);
  eq('OPTIONS 에도 CORS 헤더', pre.headers.get('access-control-allow-origin'), 'null');
  eq('OPTIONS 는 모델을 부르지 않는다', calls.length, 0);

  const bad = await translate.handle(req('/api/translate', { method: 'OPTIONS', origin: 'https://evil.example' }));
  eq('출처가 틀린 OPTIONS 는 403', bad.status, 403);
}

/* =================================================================
   4. 통과 문구 — STC-E19-005
   ================================================================= */
{
  setEnv();
  const none = await translate.handle(req('/api/translate', { pass: null, body: okBody }));
  eq('통과 문구가 없으면 401', none.status, 401);
  eq('error 코드가 pass_required', (await read(none)).error, 'pass_required');

  const wrong = await translate.handle(req('/api/translate', { pass: 'wrong-pass', body: okBody }));
  eq('통과 문구가 틀리면 401', wrong.status, 401);

  /* 서버에 문구가 없는 것은 사람이 틀린 것이 아니라 설정이 덜 된 것이다 */
  setEnv({ AGENT_PASS: '' });
  const unset = await translate.handle(req('/api/translate', { pass: 'anything', body: okBody }));
  eq('★ 서버에 문구가 없으면 401 이 아니라 500 config', unset.status, 500);
  eq('error 코드가 config', (await read(unset)).error, 'config');

  /* Vercel 환경변수 칸에 줄바꿈·공백이 섞여도 통과해야 한다 */
  setEnv({ AGENT_PASS: PASS + '\n  ' });
  fakeReply('កុំដាក់ដៃ');
  const padded = await translate.handle(req('/api/translate', { body: okBody }));
  eq('서버 쪽 문구의 앞뒤 공백은 무시한다', padded.status, 200);
}

/* =================================================================
   5. 입력 — STC-E19-006
   ================================================================= */
{
  setEnv();
  const big = await translate.handle(req('/api/translate', {
    body: JSON.stringify({ ko: '가'.repeat(5000), lang: 'km', attempt: 0 }),
  }));
  eq('본문 4KB 초과는 413', big.status, 413);
  eq('error 코드가 too_large', (await read(big)).error, 'too_large');

  const notJson = await translate.handle(req('/api/translate', { body: '{이건 JSON 이 아니다' }));
  eq('JSON 이 아니면 400', notJson.status, 400);
  eq('error 코드가 bad_request', (await read(notJson)).error, 'bad_request');

  const badLang = await translate.handle(req('/api/translate', { body: { ko: '손을 넣지 마세요', lang: 'xx', attempt: 0 } }));
  eq('허용 목록 밖 언어는 400', badLang.status, 400);

  const koLang = await translate.handle(req('/api/translate', { body: { ko: '가', lang: 'ko', attempt: 0 } }));
  eq('ko 는 번역 대상 언어가 아니다 — 400', koLang.status, 400);

  const tooLong = await translate.handle(req('/api/translate', { body: { ko: '가'.repeat(301), lang: 'km', attempt: 0 } }));
  eq('ko 301자는 400', tooLong.status, 400);

  const empty = await translate.handle(req('/api/translate', { body: { ko: '   ', lang: 'km', attempt: 0 } }));
  eq('ko 가 공백뿐이면 400', empty.status, 400);

  const attempt3 = await translate.handle(req('/api/translate', { body: { ko: '손을 넣지 마세요', lang: 'km', attempt: 3 } }));
  eq('attempt 3 은 400', attempt3.status, 400);

  const backLong = await backtranslate.handle(req('/api/backtranslate', { body: { text: '가'.repeat(601), lang: 'km' } }));
  eq('역번역 text 601자는 400', backLong.status, 400);

  /* 입력에서 막힌 요청은 모델을 부르지 않는다 */
  calls.length = 0;
  await translate.handle(req('/api/translate', { body: { ko: '가', lang: 'xx', attempt: 0 } }));
  eq('400 이면 모델을 부르지 않는다', calls.length, 0);
}

/* =================================================================
   6. 일일 상한 — STC-E19-007
   ================================================================= */
{
  setEnv({ AI_DAILY_LIMIT: '2' });
  fakeReply('កុំដាក់ដៃ');
  const a = await translate.handle(req('/api/translate', { body: okBody }));
  const b = await backtranslate.handle(req('/api/backtranslate', { body: { text: 'កុំដាក់ដៃ', lang: 'km' } }));
  const c = await translate.handle(req('/api/translate', { body: okBody }));
  eq('상한 안에서는 통과 (1)', a.status, 200);
  eq('상한 안에서는 통과 (2)', b.status, 200);
  eq('★ 상한을 넘으면 429', c.status, 429);
  eq('error 코드가 limit', (await read(c)).error, 'limit');
  ok('상한은 두 함수가 함께 센다 — 같은 크레딧을 쓴다', b.status === 200 && c.status === 429);
}

/* =================================================================
   7. 설정 없음 — 키 값을 내지 않는다
   ================================================================= */
{
  setEnv({ GEMINI_API_KEY: '' });
  const res = await translate.handle(req('/api/translate', { body: okBody }));
  eq('키가 없으면 500', res.status, 500);
  const body = await read(res);
  eq('error 코드가 config', body.error, 'config');
  ok('★ 응답에 키가 없다', JSON.stringify(body).indexOf('AIza') === -1);

  setEnv({ AI_MODEL_TRANSLATE: '' });
  const noModel = await translate.handle(req('/api/translate', { body: okBody }));
  eq('모델 이름이 없어도 500', noModel.status, 500);
}

/* =================================================================
   8. 모델 이상 — STC-E19-008
   ================================================================= */
{
  setEnv();
  fakeRaw({ candidates: [] });
  const empty = await translate.handle(req('/api/translate', { body: okBody }));
  eq('후보가 없으면 502', empty.status, 502);
  eq('error 코드가 model', (await read(empty)).error, 'model');

  /* ★ 모델이 왜 못 했는지를 메시지에 붙인다 — 모델 이름이 틀린 것(404)과
     한도(429)와 공급사 장애(5xx)를 구분할 수 있어야 한다 */
  setEnv();
  fakeRaw({ error: { message: 'model not found' } }, 404);
  const notFound = await translate.handle(req('/api/translate', { body: okBody }));
  eq('없는 모델도 502', notFound.status, 502);
  ok('★ 메시지에 모델이 돌려준 상태가 붙는다',
    (await read(notFound)).message.indexOf('404') !== -1);

  setEnv();
  fakeRaw({ error: { message: '비밀이 섞인 본문 AIzaSyFAKE0000000000테스트용가짜키' }, secret: 'AIza' }, 403);
  const leaky = await translate.handle(req('/api/translate', { body: okBody }));
  ok('★ 공급사 응답 본문은 우리 응답에 옮기지 않는다',
    JSON.stringify(await read(leaky)).indexOf('AIza') === -1);

  setEnv();
  fakeRaw({ promptFeedback: { blockReason: 'SAFETY' } });
  const blocked = await translate.handle(req('/api/translate', { body: okBody }));
  eq('모델이 막으면 502', blocked.status, 502);

  setEnv();
  fakeRaw({ error: { message: '…' } }, 500);
  const upstream = await translate.handle(req('/api/translate', { body: okBody }));
  eq('모델이 500 이면 502', upstream.status, 502);

  /* ★ 공급사가 한도라고 하면 「한도」로 전한다 — 고장이 아니다 (2026-10-31 실측) */
  setEnv();
  fakeRaw({ error: { message: 'Quota exceeded' } }, 429);
  const upLimit = await translate.handle(req('/api/translate', { body: okBody }));
  eq('★★ 공급사 429 는 우리도 429', upLimit.status, 429);
  const limitBody = await read(upLimit);
  eq('error 코드가 limit', limitBody.error, 'limit');
  ok('★ 기다리면 풀린다고 알려 준다', /잠시 뒤/.test(limitBody.message));
  ok('★ 직접 입력으로 이어 갈 수 있다고 알려 준다', /직접 입력/.test(limitBody.message));
  ok('고장(모델)과 섞이지 않는다', limitBody.error !== 'model');

  /* 공급사가 「언제 다시 오라」고 하면 그대로 전한다 */
  setEnv();
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ error: {} }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '37' },
    });
  };
  const withAfter = await translate.handle(req('/api/translate', { body: okBody }));
  eq('여전히 429', withAfter.status, 429);
  ok('★ 얼마나 기다려야 하는지 전한다', /37초 뒤/.test((await read(withAfter)).message));

  setEnv();
  fakeRaw({ error: { message: '비밀 AIzaSyFAKE0000000000테스트용가짜키' } }, 429);
  const leak429 = await translate.handle(req('/api/translate', { body: okBody }));
  ok('★ 한도 응답에서도 공급사 본문을 옮기지 않는다',
    JSON.stringify(await read(leak429)).indexOf('AIza') === -1);

  setEnv();
  fakeReply('   ');
  const blank = await translate.handle(req('/api/translate', { body: okBody }));
  eq('빈 출력은 502', blank.status, 502);

  setEnv();
  fakeReply('가'.repeat(601));
  const long = await translate.handle(req('/api/translate', { body: okBody }));
  eq('601자 출력은 502', long.status, 502);

  setEnv({ AI_TIMEOUT_MS: '20' });
  fakeHang();
  const slow = await translate.handle(req('/api/translate', { body: okBody }));
  eq('★ 시간 초과는 504', slow.status, 504);
  eq('error 코드가 timeout', (await read(slow)).error, 'timeout');
}

/* =================================================================
   9. 정상 — 응답에 status 가 없다 (FR-AD-03-06)
   ================================================================= */
{
  setEnv();
  fakeReply('កុំដាក់ដៃទៅក្នុងរ៉ូលេ');
  const res = await translate.handle(req('/api/translate', { body: okBody }));
  const body = await read(res);
  eq('정상은 200', res.status, 200);
  eq('번역문을 돌려준다', body.text, 'កុំដាក់ដៃទៅក្នុងរ៉ូលេ');
  eq('모델 이름을 돌려준다', body.model, 'gemini-3.1-flash-lite');
  eq('몇 번째 시도인지 돌려준다', body.attempt, 0);
  ok('★ 응답에 status(승인 상태) 필드가 없다', !('status' in body));
  eq('JSON 으로 내려준다', res.headers.get('content-type'), 'application/json; charset=utf-8');
  eq('저장하지 않는다', res.headers.get('cache-control'), 'no-store');
  ok('같은 출처면 CORS 헤더를 내지 않는다', res.headers.get('access-control-allow-origin') === null);

  setEnv();
  fakeReply('롤러에 손을 넣지 마세요');
  const back = await backtranslate.handle(req('/api/backtranslate', { body: { text: 'កុំដាក់ដៃ', lang: 'km' } }));
  const backBody = await read(back);
  eq('역번역도 200', back.status, 200);
  eq('역번역문을 back 으로 돌려준다', backBody.back, '롤러에 손을 넣지 마세요');
  eq('★ 역번역은 다른 모델을 쓴다', backBody.model, 'gemini-3.8-flash');
  ok('★ 역번역 응답에도 status 가 없다', !('status' in backBody));

  /* HTML 이 섞여 와도 글자 그대로 돌려준다 — 보여 주는 쪽이 textContent (STC-E16-003) */
  setEnv();
  fakeReply('<img src=x onerror=alert(1)>');
  const evil = await translate.handle(req('/api/translate', { body: okBody }));
  eq('HTML 을 지우거나 바꾸지 않는다', (await read(evil)).text, '<img src=x onerror=alert(1)>');
}

/* =================================================================
   10. 모델에 무엇을 보내나 — 키는 헤더로, 역번역에 원문은 주지 않는다
   ================================================================= */
{
  setEnv();
  calls.length = 0;
  fakeReply('កុំដាក់ដៃ');
  await translate.handle(req('/api/translate', { body: okBody }));
  const call = calls[0];
  const sent = JSON.parse(call.init.body);

  ok('Gemini generateContent 를 부른다',
    /generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/.test(call.url));
  ok('★ 키를 URL 에 넣지 않는다', call.url.indexOf('AIza') === -1 && call.url.indexOf('key=') === -1);
  eq('★ 키는 x-goog-api-key 헤더로 보낸다', call.init.headers['x-goog-api-key'], KEY);
  ok('temperature 를 보내지 않는다', !('temperature' in sent.generationConfig));
  eq('생각 토큰을 낮춘다', sent.generationConfig.thinkingConfig.thinkingLevel, 'low');
  ok('언어명은 서버 표에서 가져온다', sent.system_instruction.parts[0].text.indexOf('크메르어') !== -1);
  ok('부정·금지를 보존하라고 지시한다', sent.system_instruction.parts[0].text.indexOf('금지') !== -1);
  eq('번역할 문장만 사용자 입력으로 보낸다', sent.contents[0].parts[0].text, KO);

  /* 재시도면 앞 역번역을 붙인다 (A02 §5.3) */
  setEnv();
  calls.length = 0;
  fakeReply('កុំដាក់ដៃ');
  await translate.handle(req('/api/translate', { body: { ko: KO, lang: 'km', attempt: 1, hint: '롤러에 손을 넣으세요' } }));
  const retry = JSON.parse(calls[0].init.body).system_instruction.parts[0].text;
  ok('재시도에는 앞 역번역을 알려 준다', retry.indexOf('롤러에 손을 넣으세요') !== -1);

  setEnv();
  calls.length = 0;
  fakeReply('កុំដាក់ដៃ');
  await translate.handle(req('/api/translate', { body: { ko: KO, lang: 'km', attempt: 0, hint: '롤러에 손을 넣으세요' } }));
  ok('첫 시도에는 hint 를 쓰지 않는다',
    JSON.parse(calls[0].init.body).system_instruction.parts[0].text.indexOf('롤러에 손을 넣으세요') === -1);

  /* ★ 역번역에 한국어 원문을 주면 모델이 원문에 맞춰 고쳐서 대조가 무의미해진다 */
  setEnv();
  calls.length = 0;
  fakeReply('롤러에 손을 넣지 마세요');
  await backtranslate.handle(req('/api/backtranslate', { body: { text: 'កុំដាក់ដៃ', lang: 'km' } }));
  const backSent = JSON.stringify(JSON.parse(calls[0].init.body));
  ok('★ 역번역 요청에 한국어 원문이 들어가지 않는다', backSent.indexOf(KO) === -1);
  eq('역번역에는 번역문만 보낸다',
    JSON.parse(calls[0].init.body).contents[0].parts[0].text, 'កុំដាក់ដៃ');
}

/* =================================================================
   11. 로그 — 키도 문구 원문도 남기지 않는다 (A02 §5.2)
   ================================================================= */
{
  setEnv();
  logs.length = 0;
  fakeReply('កុំដាក់ដៃ');
  await translate.handle(req('/api/translate', { body: okBody }));
  const all = logs.join('\n');
  ok('로그를 한 줄 JSON 으로 남긴다', logs.length === 1 && JSON.parse(logs[0]).route === 'translate');
  ok('★ 로그에 키가 없다', all.indexOf('AIza') === -1);
  ok('★ 로그에 문구 원문이 없다', all.indexOf(KO) === -1);
  const line = JSON.parse(logs[0]);
  ok('언어·시도·지연·상태만 남는다',
    ['route', 'lang', 'attempt', 'ms', 'status', 'err'].every((k) => k in line));
}

/* =================================================================
   12. 소스에 키가 박혀 있지 않다 — STC-E19-001
   ================================================================= */
{
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(ROOT, 'api');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  ok('api 폴더에 함수 파일이 있다', files.length >= 2);
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    ok(f + ': 키 문자열이 없다', !/AIza[0-9A-Za-z_-]{10,}/.test(code));
    ok(f + ': 승인 상태를 만들지 않는다', !/['"]reviewed['"]/.test(code));
  });
}

/* =================================================================
   13. 내보내기 모양 — Vercel 이 Web 시그니처로 부르게 둔다

   default 를 내보내면 Vercel 이 옛 Node 방식(req, res)으로 불러서 터진다
   (2026-10-31 미리보기에서 FUNCTION_INVOCATION_FAILED 로 확인).
   ================================================================= */
{
  [['translate', translate], ['backtranslate', backtranslate]].forEach(([name, mod]) => {
    ok(name + ': ★ default 를 내보내지 않는다', mod.default === undefined);
    ok(name + ': POST 를 받는다', mod.POST === mod.handle);
    ok(name + ': OPTIONS 를 받는다', mod.OPTIONS === mod.handle);
    ok(name + ': GET 도 받아서 우리 405 를 돌려준다', mod.GET === mod.handle);
    eq(name + ': maxDuration 30초', mod.config.maxDuration, 30);
  });
}

console.log = realLog;
report('/api — AI 번역·역번역 함수');
