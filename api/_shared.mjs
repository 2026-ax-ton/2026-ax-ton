/* /api 함수 두 개가 함께 쓰는 부분 — 출처·통과 문구·입력 검사·모델 호출.
   두 곳에 복사하지 않는다 (SPEC-BE §2.3).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   근거: A02 §5.2~§5.6 · SPEC-BE §2.2 · PRD-AD-03
   넘지 않는 선: 응답에 status(승인 상태)를 넣지 않는다 (FR-AD-03-06).
                키·문구 원문을 로그에 남기지 않는다 (A02 §5.2). */

/* ── 결정에 걸린 값 (A02 §5.2·§5.3·§5.5) ───────────────────────────── */

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
  'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Pass',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
   함수는 상태가 없다. 인스턴스 메모리 계산이라 근사치다 — 정확히 세려면
   KV 저장소가 필요하다(후보). 최악의 비용은 4층(공급사 예산)이 막는다. */

let countDay = '';
let countUsed = 0;

export function takeDailyCall(limit) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== countDay) {
    countDay = today;
    countUsed = 0;
  }
  if (countUsed >= limit) return false;
  countUsed += 1;
  return true;
}

/** 검사에서만 쓴다. 상한 계산이 묶음 사이로 새지 않게 한다. */
export function resetDailyCall() {
  countDay = '';
  countUsed = 0;
}

/* ── 같은 출처로 볼 주소 (A02 §5.2) ─────────────────────────────────
   ALLOWED_ORIGIN 은 운영 주소다. 거기에 **이 배포 자신의 주소**를 더한다 —
   Vercel 이 VERCEL_URL 로 알려 준다.

   미리보기 주소는 배포마다 달라져서(`2026-ax-abc123-….vercel.app`) 손으로 적은
   값 하나로는 맞출 수 없다. 자기 자신을 허용하는 것은 "같은 출처"의 정의 그대로라
   막는 힘이 줄지 않는다. 남은 방어는 통과 문구·일일 상한·공급사 예산이다 (§5.6). */

export function allowedOrigins() {
  const list = [];
  const fixed = process.env.ALLOWED_ORIGIN || '';
  if (fixed) list.push(fixed);
  const self = process.env.VERCEL_URL || '';
  if (self) list.push('https://' + self);
  return list;
}

/* ── 들어오는 요청 검사 (A02 §5.2) ──────────────────────────────────
   돌려주는 값: { done: Response } 면 여기서 끝난 것이고,
                { cors, text } 면 통과한 것이다. */

export async function guard(request) {
  const origin = request.headers.get('origin');
  const allowFile = process.env.ALLOW_FILE_ORIGIN === '1';

  /* 제출 HTML 을 file:// 로 열면 브라우저가 Origin: null 을 보낸다 (C08 §7).
     막는 힘이 약해서 시연 기간에만 켠다 (A02 §5.2, C06 D-019). */
  const nullOrigin = origin === 'null' && allowFile;
  const sameOrigin = !!origin && allowedOrigins().indexOf(origin) !== -1;
  const cors = nullOrigin ? CORS_NULL : undefined;

  if (request.method === 'OPTIONS') {
    // 사전 요청은 모델을 부르지 않고 상한에도 세지 않는다
    if (!sameOrigin && !nullOrigin) return { done: fail(403, 'origin', '허용되지 않은 출처입니다.') };
    return { done: new Response(null, { status: 204, headers: { ...CORS_NULL, 'Cache-Control': 'no-store' } }) };
  }

  if (request.method !== 'POST') {
    return { done: fail(405, 'method', 'POST 만 받습니다.', cors) };
  }

  if (!sameOrigin && !nullOrigin) {
    return { done: fail(403, 'origin', '허용되지 않은 출처입니다.') };
  }

  /* ★ 통과 문구는 X-Agent-Pass 헤더로 온다. HTTP 헤더 값은 ASCII 만 담을 수
     있어서 한글 문구를 쓰면 브라우저가 요청을 만들지 못한다 (A02 §5.6). */
  const pass = process.env.AGENT_PASS || '';
  if (!pass || request.headers.get('x-agent-pass') !== pass) {
    return { done: fail(401, 'pass_required', '운영자 통과 문구를 입력하세요.', cors) };
  }

  const text = await request.text();
  if (byteLength(text) > MAX_BODY_BYTES) {
    return { done: fail(413, 'too_large', '보낸 내용이 너무 깁니다.', cors) };
  }

  return { cors, text };
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
  const key = process.env.GEMINI_API_KEY || '';
  const model = process.env[modelEnvName] || '';
  // 키 값은 어디에도 내지 않는다 (STC-E19-001)
  if (!key || !model) return null;
  return {
    key,
    model,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    dailyLimit: Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT,
  };
}

/** 모델을 한 번 부르고 문장 하나를 돌려준다.
 *  돌려주는 값: { text } 또는 { error: 'model' | 'timeout' } */
export async function callModel({ key, model, timeoutMs }, systemText, userText) {
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
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        // temperature 를 보내지 않는다 — 최신 모델은 무시하고 경고를 낸다 (A02 §5.3)
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
      signal: ac.signal,
    });
  } catch (e) {
    return { error: ac.signal.aborted ? 'timeout' : 'model' };
  } finally {
    clearTimeout(timer);
  }

  if (!res || !res.ok) return { error: 'model' };

  let data;
  try {
    data = await res.json();
  } catch {
    return { error: 'model' };
  }

  if (data && data.promptFeedback && data.promptFeedback.blockReason) return { error: 'model' };

  const parts = data && data.candidates && data.candidates[0]
    && data.candidates[0].content && data.candidates[0].content.parts;
  const out = parts && parts[0] && typeof parts[0].text === 'string' ? parts[0].text.trim() : '';

  // 빈 출력·길이 초과는 모델 오류로 본다 (A02 §5.3). HTML 이 섞여 있어도
  // 문자열 그대로 돌려준다 — 보여 주는 쪽이 textContent 를 쓴다 (SPEC-BE §2.2)
  if (out.length < 1 || out.length > MAX_TEXT) return { error: 'model' };

  return { text: out };
}

/* ── 로그 (A02 §5.2) ────────────────────────────────────────────────
   한 줄 JSON. 문구 원문·키·IP 를 남기지 않는다. */

export function log(fields) {
  console.log(JSON.stringify(fields));
}

export const MODEL_ERRORS = {
  model: [502, '번역 모델이 응답하지 못했습니다.'],
  timeout: [504, '번역 모델이 제시간에 답하지 못했습니다.'],
};
