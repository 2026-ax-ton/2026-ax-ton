/* /api 함수 두 개가 함께 쓰는 부분 — 출처·통과 문구·입력 검사·모델 호출.
   두 곳에 복사하지 않는다 (SPEC-BE §2.3).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   근거: A02 §5.2~§5.6 · SPEC-BE §2.2 · PRD-AD-03
   넘지 않는 선: 응답에 status(승인 상태)를 넣지 않는다 (FR-AD-03-06).
                키·문구 원문을 로그에 남기지 않는다 (A02 §5.2). */

/* ── 결정에 걸린 값 (A02 §5.2·§5.3·§5.5) ───────────────────────────── */

import { callOpenAI } from './_openai.mjs';

export const MAX_BODY_BYTES = 4096;      // A02 §5.2 본문 상한
export const MAX_KO = 300;               // A02 §5.3 ko 1~300자
export const MAX_TEXT = 600;             // A02 §5.4 text·모델 출력 1~600자
export const MAX_HINT = 600;             // A02 §5.3 hint
export const MAX_ATTEMPT = 2;            // A02 §5.3 attempt 0~2
export const DEFAULT_TIMEOUT_MS = 20000; // A02 §5.2 모델 호출 20초
export const DEFAULT_DAILY_LIMIT = 600;  // A02 §5.5 AI_DAILY_LIMIT
export const MAX_OUTPUT_TOKENS = 600;    // A02 §5.3 generationConfig
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/* 언어명은 서버의 고정 표에서 가져온다. 요청값을 프롬프트에 그대로 넣지 않는다 (A02 §5.3). */
export const LANG_NAMES = {
  km: '크메르어',
  id: '인도네시아어',
  vi: '베트남어',
  ne: '네팔어',
  th: '태국어',
};

const CORS_NULL = {
  'Access-Control-Allow-Origin': 'null',
  // Authorization — 로그인 토큰 (T11). file:// 시연에서도 로그인이 되어야 한다
  'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Pass, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Vary': 'Origin',
};

/* ── 응답 ──────────────────────────────────────────────────────────── */

export function json(status, body, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(cors || {}),
    },
  });
}

export function fail(status, code, message, cors) {
  return json(status, { error: code, message }, cors);
}

/* ── 일일 상한 (A02 §5.6 3층) ───────────────────────────────────────
   ★ DB(`ai_usage`, 날짜 한 줄)에서 센다. AI 함수 7개가 한 숫자를 함께 더한다.
     인스턴스 메모리로 세면 함수마다·인스턴스마다 0부터 다시 세서 상한이 안 됐다 (2026-11-15).
   ★ 더하기와 상한 검사를 한 문장으로 한다 → 동시에 와도 넘지 않는다.
   ★ DB가 없으면(로컬·`DATABASE_URL` 없음) 메모리로 센다.
   ★ DB 질의가 실패하면 **막는다** — 돈이 나가는 쪽으로 열지 않는다.
   최악의 비용은 4층(공급사 예산·자동 충전 끄기)이 막는다. */

let countDay = '';
const countUsed = {};      // 쓰임새(bucket)별 메모리 횟수 — DB 가 없을 때와 쓰임새 울타리에 쓴다
let memoryOnly = false;

function takeMemory(bucket, limit) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== countDay) {
    countDay = today;
    Object.keys(countUsed).forEach((k) => { delete countUsed[k]; });
  }
  const used = countUsed[bucket] || 0;
  if (used >= limit) return false;
  countUsed[bucket] = used + 1;
  return true;
}

/** 쓰임새(bucket)별 하루 울타리 (2026-11-07 사진용 → 🆕 2026-11-16 DB 로).
 *
 *  ★ 왜 가르나 — 사진 한 장은 번역 한 줄보다 훨씬 비싸다 (이미지 토큰).
 *    한 통에 같이 세면 사진 몇 장이 그날의 번역 예산을 먹는다. 번역은 운영자가 하루에
 *    수십 번, 사진은 담당자가 가끔 한다 — 서로의 한도를 깎지 않게 통을 나눈다 (A02 §5.6).
 *  ★ `ai_usage_bucket(day, bucket)` 한 줄에서 `takeDailyCall` 과 같은 한 문장(더하기 + 상한 검사)으로 센다.
 *    서버 인스턴스가 꺼지거나 여럿이어도 숫자가 0 으로 돌아가지 않는다.
 *  ★ 전체 상한은 여전히 `takeDailyCall`(ai_usage) 이 쥔다 — 이 함수와 **같이** 쓴다.
 *  ★ DB 가 없으면 메모리로 센다. DB 질의가 실패하면 막는다(돈 쪽으로 열지 않는다).
 *    다만 **표가 아직 없으면**(migration 을 운영 DB 에 적용하기 전, Postgres 42P01) 예전처럼 메모리로 센다 —
 *    배포와 표 만들기의 순서가 꼬여도 사진 분석이 통째로 막히지 않게. 그 일은 로그에 남긴다.
 *    마지막 방어는 여전히 공급사 예산 상한이다 (A04 6-1). */
export async function takeDailyCallFor(bucket, limit) {
  if (memoryOnly) return takeMemory(bucket, limit);
  const { getSql } = await import('./_db.mjs');
  const sql = await getSql();
  if (!sql) return takeMemory(bucket, limit);
  try {
    const rows = await sql`
      insert into ai_usage_bucket (day, bucket, used) values (current_date, ${bucket}, 1)
      on conflict (day, bucket) do update set used = ai_usage_bucket.used + 1
       where ai_usage_bucket.used < ${limit}
      returning used`;
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    const missing = (e && e.code === '42P01') || /ai_usage_bucket.*does not exist|relation .* does not exist/i.test(String(e && e.message || ''));
    log({ route: 'daily-limit', err: missing ? 'no-table' : 'db', bucket, why: String(e && e.message || '').slice(0, 120) });
    return missing ? takeMemory(bucket, limit) : false;
  }
}

export async function takeDailyCall(limit) {
  if (memoryOnly) return takeMemory('ai', limit);
  /* 동적 import — _db.mjs 가 이 파일을 불러서, 맨 위에서 서로 부르면 순환이 된다 */
  const { getSql } = await import('./_db.mjs');
  const sql = await getSql();
  if (!sql) return takeMemory('ai', limit);
  try {
    const rows = await sql`
      insert into ai_usage (day, used) values (current_date, 1)
      on conflict (day) do update set used = ai_usage.used + 1
       where ai_usage.used < ${limit}
      returning used`;
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    log({ route: 'daily-limit', err: 'db', why: String(e && e.message || '').slice(0, 120) });
    return false;
  }
}

/** 검사에서만 쓴다. 숫자를 0으로 돌리고 메모리로 센다 (가짜 sql 을 건드리지 않게).
 *  `{ db: true }` 면 DB 경로를 검사한다. */
export function resetDailyCall(opts) {
  countDay = '';
  Object.keys(countUsed).forEach((k) => { delete countUsed[k]; });
  memoryOnly = !(opts && opts.db);
}

/* ── 같은 출처로 볼 주소 (A02 §5.2) ─────────────────────────────────
   손으로 적는 ALLOWED_ORIGIN 에 더해, **Vercel 이 알려 주는 이 프로젝트 자신의
   주소 세 가지**를 허용한다. 전부 이 배포·이 프로젝트의 주소라 "같은 출처"의
   정의 그대로다 — 막는 힘이 줄지 않는다.

     VERCEL_URL                     이 배포만의 주소 (2026-ax-abc123-….vercel.app)
     VERCEL_BRANCH_URL              브랜치 주소 (…-git-<브랜치>-….vercel.app)
     VERCEL_PROJECT_PRODUCTION_URL  운영 주소 (2026-ax-ton.vercel.app)

   미리보기 주소는 배포마다 바뀐다. 손으로 적은 값 하나로는 맞출 수 없어서
   2026-10-31 미리보기에서 403 을 맞고 이렇게 고쳤다.
   남은 방어는 통과 문구·일일 상한·공급사 예산이다 (§5.6). */

const SELF_URL_ENVS = ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];

export function allowedOrigins() {
  const list = [];
  const fixed = process.env.ALLOWED_ORIGIN || '';
  if (fixed) list.push(fixed);
  SELF_URL_ENVS.forEach((name) => {
    const host = process.env[name] || '';
    if (host && list.indexOf('https://' + host) === -1) list.push('https://' + host);
  });
  return list;
}

/* ── 들어오는 요청 검사 (A02 §5.2) ──────────────────────────────────
   돌려주는 값: { done: Response } 면 여기서 끝난 것이고,
                { cors, text } 면 통과한 것이다. */

/** 통과 문구는 보지 않는 기본 검사 — 출처·메서드·본문 크기만 본다.
 *  `/api/auth/*` 처럼 **로그인하기 전**에 부르는 함수가 쓴다 (T11).
 *  `beforeBody` 를 주면 본문을 읽기 전에 한 번 더 막을 기회를 준다. */
export async function guardBasic(request, opts) {
  const beforeBody = opts && opts.beforeBody;
  const maxBytes = (opts && opts.maxBytes) || MAX_BODY_BYTES;
  /* 받을 메서드. 기본은 POST 하나다. 동기화(T12)는 GET·PUT 도 받는다 */
  const methods = (opts && opts.methods) || ['POST'];
  const origin = request.headers.get('origin');
  const allowFile = process.env.ALLOW_FILE_ORIGIN === '1';

  /* 제출 HTML 을 file:// 로 열면 브라우저가 Origin: null 을 보낸다 (C08 §7).
     ★ 2026-11-04 — **이 스위치를 켜지 않는다.** 11/3 개정 공지가 「팀에서 직접
       운영하는 백엔드 서버와 통신하는 방식은 불가」로 정해, 제출본은 우리 서버를
       부르면 실격이다 (C06 D-034, C08 §7.1, A04 7-6). 스위치는 되돌릴 수 있게
       남겨 두지만 값은 언제나 0 이다 — 막는 힘이 약하기도 하다 (A02 §5.2). */
  const nullOrigin = origin === 'null' && allowFile;
  const sameOrigin = !!origin && allowedOrigins().indexOf(origin) !== -1;
  const cors = nullOrigin ? CORS_NULL : undefined;

  if (request.method === 'OPTIONS') {
    // 사전 요청은 모델을 부르지 않고 상한에도 세지 않는다
    if (!sameOrigin && !nullOrigin) return { done: fail(403, 'origin', '허용되지 않은 출처입니다.') };
    return { done: new Response(null, { status: 204, headers: { ...CORS_NULL, 'Cache-Control': 'no-store' } }) };
  }

  if (methods.indexOf(request.method) === -1) {
    return { done: fail(405, 'method', methods.join('·') + ' 만 받습니다.', cors) };
  }

  if (!sameOrigin && !nullOrigin) {
    return { done: fail(403, 'origin', '허용되지 않은 출처입니다.') };
  }

  /* ★ 통과 문구는 X-Agent-Pass 헤더로 온다. HTTP 헤더 값은 ASCII 만 담을 수
     있어서 한글 문구를 쓰면 브라우저가 요청을 만들지 못한다 (A02 §5.6).

     서버에 문구가 아예 없는 것과 사람이 틀리게 넣은 것은 **다른 일**이다.
     앞은 서버 설정이 덜 된 것(500)이고 뒤는 사람이 다시 넣으면 되는 것(401)이다.
     둘을 같이 401 로 내면 "환경변수를 Preview 에 안 넣었다" 를 영영 모른다
     (2026-10-31 설정 중에 겪음). 어느 쪽이든 문구 값은 내지 않는다. */
  if (beforeBody) {
    const stop = beforeBody(cors, request);
    if (stop) return { done: stop };
  }

  /* GET 에는 본문이 없다 */
  const text = request.method === 'GET' ? '' : await request.text();
  if (byteLength(text) > maxBytes) {
    return { done: fail(413, 'too_large', '보낸 내용이 너무 깁니다.', cors) };
  }

  return { cors, text };
}

/** AI 함수(`/api/translate`·`/api/backtranslate`)용 검사 — 기본 검사 + 통과 문구. */
export async function guard(request) {
  return guardBasic(request, { beforeBody: passCheck });
}

function passCheck(cors, request) {
  const pass = (process.env.AGENT_PASS || '').trim();
  if (!pass) return fail(500, 'config', '서버 설정 오류입니다.', cors);
  if ((request.headers.get('x-agent-pass') || '').trim() !== pass) {
    return fail(401, 'pass_required', '운영자 통과 문구를 입력하세요.', cors);
  }
  return null;
}

export function byteLength(s) {
  return new TextEncoder().encode(s).length;
}

export function parseJson(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function isAllowedLang(lang) {
  return typeof lang === 'string' && Object.prototype.hasOwnProperty.call(LANG_NAMES, lang);
}

/* ── 모델 호출 (A02 §5.3) ──────────────────────────────────────────── */

export function readConfig(modelEnvName) {
  const limits = {
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    dailyLimit: Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT,
  };
  /* 🆕 개인 사본 선택지 — AI_PROVIDER=openai 면 GPT (api/_openai.mjs). 기본은 Gemini (C06 D-018).
     모델은 OPENAI_MODEL 하나만 본다 — Gemini 모델 이름(AI_MODEL_*)을 GPT 에 넘기지 않는다 */
  if (process.env.AI_PROVIDER === 'openai') {
    const okey = process.env.OPENAI_API_KEY || '';
    const omodel = process.env.OPENAI_MODEL || '';
    if (!okey || !omodel) return null;
    return { provider: 'openai', key: okey, model: omodel, ...limits };
  }
  const key = process.env.GEMINI_API_KEY || '';
  const model = process.env[modelEnvName] || '';
  // 키 값은 어디에도 내지 않는다 (STC-E19-001)
  if (!key || !model) return null;
  return { key, model, ...limits };
}

/** 모델을 한 번 부르고 문장 하나를 돌려준다.
 *  돌려주는 값: { text } 또는 { error: 'model' | 'timeout' }
 *
 *  `userText` 에 **배열**을 주면 그대로 `parts` 로 보낸다 — 사진(`inline_data`)을
 *  함께 보낼 때 쓴다 (T17 `api/hazards.mjs`). 문자열이면 지금처럼 글 한 조각이다.
 *  `opts.maxOutputTokens`·`opts.maxText` 로 상한을 바꿀 수 있다 — 지점 5개짜리 JSON 은
 *  번역문 한 문장보다 길다. 주지 않으면 번역용 기본값 그대로다. */
export async function callModel(cfg, systemText, userText, opts) {
  if (cfg && cfg.provider === 'openai') return callOpenAI(cfg, systemText, userText, opts);
  const { key, model, timeoutMs } = cfg;
  const maxOut = (opts && opts.maxOutputTokens) || MAX_OUTPUT_TOKENS;
  const maxText = (opts && opts.maxText) || MAX_TEXT;
  const userParts = Array.isArray(userText) ? userText : [{ text: userText }];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        // 키는 URL 쿼리가 아니라 헤더로 보낸다. URL 은 로그에 남기 쉽다 (A02 §5.3)
        'x-goog-api-key': key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: userParts }],
        // temperature 를 보내지 않는다 — 최신 모델은 무시하고 경고를 낸다 (A02 §5.3)
        generationConfig: {
          maxOutputTokens: maxOut,
          thinkingConfig: { thinkingLevel: 'low' },
        },
        // 검색 근거(google_search) 같은 도구 — 리서치(PRD-AD-08 S2)만 쓴다
        ...(opts && opts.tools ? { tools: opts.tools } : {}),
      }),
      signal: ac.signal,
    });
  } catch (e) {
    if (ac.signal.aborted) return { error: 'timeout', why: timeoutMs + 'ms 초과' };
    return { error: 'model', why: '모델에 닿지 못함' };
  } finally {
    clearTimeout(timer);
  }

  /* 모델이 왜 못 했는지를 한 마디 붙인다. 모델 이름이 틀렸는지(404) · 한도인지(429)
     · 공급사가 아픈지(5xx)를 이것 없이는 구분할 수 없다 (2026-10-31 실측에서 겪음).
     ★ 공급사 응답 본문은 넣지 않는다 — 키나 문구가 섞여 나올 수 있다. */
  if (!res) return { error: 'model', why: '응답 없음' };
  /* ★ 공급사가 한도라고 하면 그대로 「한도」로 전한다 (2026-10-31 실측).
     이것을 502 「모델이 응답하지 못했습니다」로 뭉개면 운영자는 고장인 줄 알고
     계속 다시 누른다 — 한도는 기다리면 풀리는 것이고 고장은 아니다.
     10문구 × 5언어 실측에서 실패 18건 중 대부분이 이것이었다. */
  if (res.status === 429) {
    /* 공급사가 「언제 다시 오라」고 알려 주면 그대로 전한다 (헤더만 읽는다 —
       응답 본문에는 키나 계정 정보가 섞일 수 있어 옮기지 않는다).
       운영자가 "잠시 뒤" 가 1분인지 내일인지 알아야 손 입력으로 갈지 정한다. */
    var after = res.headers && res.headers.get && res.headers.get('retry-after');
    return { error: 'limit', why: after ? '공급사 한도 · ' + after + '초 뒤 다시' : '공급사 한도' };
  }
  if (!res.ok) return { error: 'model', why: '모델 응답 ' + res.status };

  let data;
  try {
    data = await res.json();
  } catch {
    return { error: 'model', why: 'JSON 이 아님' };
  }

  if (data && data.promptFeedback && data.promptFeedback.blockReason) {
    return { error: 'model', why: '모델이 막음' };
  }

  const cand = data && data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  /* 도구를 쓰면 답이 여러 조각으로 올 수 있어 글 조각을 이어 붙인다.
     도구가 없으면 지금까지처럼 첫 조각만 본다 (번역 동작을 바꾸지 않는다) */
  const out = opts && opts.tools
    ? (Array.isArray(parts) ? parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim() : '')
    : (parts && parts[0] && typeof parts[0].text === 'string' ? parts[0].text.trim() : '');

  // 빈 출력·길이 초과는 모델 오류로 본다 (A02 §5.3). HTML 이 섞여 있어도
  // 문자열 그대로 돌려준다 — 보여 주는 쪽이 textContent 를 쓴다 (SPEC-BE §2.2)
  if (out.length < 1 || out.length > maxText) {
    return { error: 'model', why: out.length < 1 ? '빈 출력' : '출력이 너무 김' };
  }

  /* 검색 근거 — 모델이 실제로 본 출처 목록. 리서치가 「지어낸 출처」를 거르는 데 쓴다 */
  return opts && opts.tools ? { text: out, grounding: (cand && cand.groundingMetadata) || null } : { text: out };
}

/* ── 로그 (A02 §5.2) ────────────────────────────────────────────────
   한 줄 JSON. 문구 원문·키·IP 를 남기지 않는다. */

export function log(fields) {
  console.log(JSON.stringify(fields));
}

const MODEL_ERRORS = {
  model: [502, '번역 모델이 응답하지 못했습니다.'],
  timeout: [504, '번역 모델이 제시간에 답하지 못했습니다.'],
  limit: [429, 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 받거나 직접 입력해 주세요.'],
};

/** 모델 실패를 HTTP 응답으로 바꾼다. why 는 공급사 본문이 아니라 우리가 지은 한 마디다.
 *  `messages` 를 주면 안내 문장만 바꾼다 (상태 코드는 그대로) — 번역이 아닌 함수가 쓴다. */
export function modelFail(r, cors, messages) {
  const status = MODEL_ERRORS[r.error][0];
  const message = (messages && messages[r.error]) || MODEL_ERRORS[r.error][1];
  return {
    status,
    response: fail(status, r.error, r.why ? message + ' (' + r.why + ')' : message, cors),
  };
}
