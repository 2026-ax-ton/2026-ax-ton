/* POST /api/hazards — 담당자가 찍은 설비 사진 1장에서 위험 지점을 **제안**받는다 (T17 · PRD-AD-07).

   요청  { image: base64 (data URL 머리는 있어도 된다), mime: image/jpeg|png|webp }
   응답  { person: false, points: [{x,y,r,hazard,why}], dropped: {hazard,range,shape,over},
           overlaps, model }
         사람·이름표가 찍혔으면 { person: true, points: [], … } — 지점을 보이지 않는다 (FR-20)

   ★ AI 는 제안만 한다. 이 함수는 아무것도 저장하지 않는다 —
     확정은 담당자가 화면에서, 저장은 교육 만들기(AD-04) 승인 때만 (FR-08·10, AC-AD-07-02).
   ★ 사진을 저장하지도, 로그에 남기지도 않는다 (FR-17 · Q1 B안 · A05 §3.1).
     로그에는 크기·지점 수·걸린 시간만 남는다.
   ★ 담당자(`admin`)만 부른다. 누구인지는 **토큰으로만** 안다 (A02 §14.6).
     노동자 화면은 이 함수를 부르지 않는다 (FR-13).
   ★ 보내는 것은 사진 사본과 지시문뿐이다. 계정·진도·신고 데이터를 붙이지 않는다 (FR-14).
     토큰에서 꺼낸 계정은 역할 확인에만 쓰고 모델에 넘기지 않는다.

   근거: PRD-AD-07 §4 FR-03·04·05·11~17·20 · C06 D-027·D-028 · A02 §5.2·§5.6 */

import {
  guardBasic, parseJson, readConfig, takeDailyCall, callModel,
  json, fail, log, modelFail,
} from './_shared.mjs';
import { getSql, authed, withDb } from './_db.mjs';
import {
  HAZARD_CODES, systemText, USER_TEXT, parseModelJson, filterPoints, overlapCount,
} from './_hazards.mjs';

export const config = { maxDuration: 45 };

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

/* 사진 사본 상한 (FR-03 「사본 크기 상한은 개발자가 정한다」).
   화면은 긴 변 1024px JPEG 로 줄여 보낸다 — 보통 150~300KB 다.
   1.5MB 는 줄이기가 실패한 경우를 막는 천장이다. base64 는 1.34배라
   본문 상한은 2MB 로 둔다 (Vercel 본문 상한 4.5MB 안). */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MIN_IMAGE_BYTES = 1024;   // 이보다 작으면 사진이 아니다
export const MAX_BODY = 2 * 1024 * 1024;
export const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/* 사진은 글보다 오래 걸린다 (번역 20초, 실측 도구 30초) — scripts/measure-hazards.mjs 와 같게 */
export const DEFAULT_HAZARD_TIMEOUT_MS = 30000;
/* 지점 5개 × (좌표 + 이유 120자) JSON 이 번역 한 문장(600자)보다 길다 */
const MAX_OUTPUT_TOKENS = 1200;
const MAX_TEXT = 4000;

/* 모델 이름 — 따로 두지 않으면 번역 모델을 그대로 쓴다 (C06 D-028 「lite 유지」).
   AI_MODEL_HAZARDS 는 상위 모델로 올릴 때만 넣는다 (D-028 상향 조건). */
const MODEL_ENVS = ['AI_MODEL_HAZARDS', 'AI_MODEL_TRANSLATE'];

/* 실패 안내 — 손 흐름(도해에서 직접 고르기)으로 이어진다는 것을 함께 말한다 (FR-11) */
const MESSAGES = {
  model: 'AI 가 사진을 읽지 못했습니다. 그림에서 직접 골라 주세요.',
  timeout: 'AI 가 제시간에 답하지 못했습니다. 그림에서 직접 골라 주세요.',
  limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 하거나 그림에서 직접 골라 주세요.',
};

/* ── 입력 다듬기 ───────────────────────────────────────────────────── */

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** 사진을 꺼낸다. 돌려주는 값: { mime, data, bytes } 또는 null */
export function readImage(body) {
  if (!body || typeof body.image !== 'string') return null;
  let data = body.image.trim();
  let mime = typeof body.mime === 'string' ? body.mime.trim().toLowerCase() : '';

  /* 화면이 canvas.toDataURL() 을 그대로 보내도 받는다 — 머리의 형식이 우선이다 */
  const m = /^data:([a-z/+.-]+);base64,/i.exec(data);
  if (m) { mime = m[1].toLowerCase(); data = data.slice(m[0].length); }

  if (MIMES.indexOf(mime) === -1) return null;
  if (!data || data.length % 4 !== 0 || !BASE64.test(data)) return null;

  const pad = data.endsWith('==') ? 2 : (data.endsWith('=') ? 1 : 0);
  const bytes = (data.length / 4) * 3 - pad;
  if (bytes < MIN_IMAGE_BYTES || bytes > MAX_IMAGE_BYTES) return { mime, data, bytes, size: false };
  return { mime, data, bytes, size: true };
}

function noDrops() {
  return { hazard: 0, range: 0, shape: 0, over: 0 };
}

/* ── 함수 ──────────────────────────────────────────────────────────── */

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['POST'], maxBytes: MAX_BODY });
  if (g.done) return g.done;
  const { cors, text } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);

  /* ★ 누구인지는 토큰으로만 안다. 본문에 역할을 적어 보내도 안 먹는다 */
  const account = await authed(sql, request);
  if (!account) return fail(401, 'unauthorized', '다시 로그인해 주세요.', cors);
  if (account.role !== 'admin') {
    return fail(403, 'forbidden', '담당자 계정만 쓸 수 있습니다.', cors);
  }

  const img = readImage(parseJson(text));
  if (!img) return fail(400, 'bad_request', '사진을 읽을 수 없습니다. JPEG·PNG·WebP 로 다시 찍어 주세요.', cors);
  if (!img.size) return fail(413, 'too_large', '사진이 너무 크거나 작습니다. 다시 찍어 주세요.', cors);

  let cfg = null;
  for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
  if (!cfg) {
    log({ route: 'hazards', ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }
  cfg = { ...cfg, timeoutMs: Number(process.env.AI_HAZARD_TIMEOUT_MS) || DEFAULT_HAZARD_TIMEOUT_MS };

  if (!takeDailyCall(cfg.dailyLimit)) {
    log({ route: 'hazards', ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', MESSAGES.limit, cors);
  }

  const r = await callModel(cfg, systemText(HAZARD_CODES), [
    { inline_data: { mime_type: img.mime, data: img.data } },
    { text: USER_TEXT },
  ], { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT });

  if (r.error) {
    const f = modelFail(r, cors, MESSAGES);
    log({ route: 'hazards', kb: Math.round(img.bytes / 1024), ms: Date.now() - started, status: f.status, err: r.error, why: r.why || '' });
    return f.response;
  }

  const out = parseModelJson(r.text);
  if (!out) {
    log({ route: 'hazards', kb: Math.round(img.bytes / 1024), ms: Date.now() - started, status: 502, err: 'model', why: 'JSON 이 아님' });
    return fail(502, 'model', MESSAGES.model + ' (응답 모양이 틀림)', cors);
  }

  /* ★ 사람이 찍혔으면 지점을 **하나도** 돌려주지 않는다 — 화면이 실수로라도
     그 사진 위에 제안을 그리지 못하게 (FR-20). 사진은 원래 남기지 않는다 */
  if (out.person === true) {
    log({ route: 'hazards', kb: Math.round(img.bytes / 1024), ms: Date.now() - started, status: 200, err: '', person: true });
    return json(200, { person: true, points: [], dropped: noDrops(), overlaps: 0, model: cfg.model }, cors);
  }

  const { points, dropped } = filterPoints(out.points, HAZARD_CODES);
  log({ route: 'hazards', kb: Math.round(img.bytes / 1024), ms: Date.now() - started, status: 200, err: '', n: points.length });
  return json(200, {
    person: false, points, dropped, overlaps: overlapCount(points), model: cfg.model,
  }, cors);
}

export const handle = withDb('hazards', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음).
   POST 밖의 메서드도 받아서 우리 405 JSON 을 돌려준다 (A02 §5.2) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
