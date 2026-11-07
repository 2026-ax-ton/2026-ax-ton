/* POST /api/hazards — 설비 사진 1장에서 위험 지점을 **제안**받는다 (T17).

   요청  { image: <base64, 줄인 사본>, mime: image/jpeg|png|webp }
   응답  { person, retake, points: [{x,y,r,hazard,why}], dropped, overlaps, model }
         ← status(승인 상태)는 절대 넣지 않는다. 저장도 하지 않는다

   넘지 않는 선 (PRD-AD-07 §7 · C06 D-027)
     · **AI 는 제안만 한다.** 이 함수는 `courses` 에 아무것도 쓰지 않는다 (AC-02)
     · 위험유형은 6종 안에서만 받고, 넘치는 지점은 5개까지만 (AC-03 · §11 Q4)
     · **안전 문구를 만들지 않는다** — 문구는 검수된 라이브러리에서 고른다 (FR-09)
     · 사진을 **저장하지 않는다**. 분석하고 버린다 (FR-17 · A05 §3.1)
     · 사람·이름표가 찍히면 **지점을 돌려주지 않고** 다시 찍게 한다 (FR-20)
     · 실패·지연·한도면 이유를 담아 돌려준다 — 화면은 손 흐름으로 간다 (FR-11)
     · 노동자는 이 함수를 부르지 않는다. **담당자(admin) 토큰만** 받는다

   ★ 누구인지는 토큰으로만 안다 (A02 §14.6). 번역 함수와 달리 운영자 통과 문구를
     쓰지 않는다 — 부르는 사람이 **운영자가 아니라 담당자**다.

   근거: PRD-AD-07 §4·§7·§8 · C06 D-027 (방식 (a) Gemini) · D-028 (모델) · A02 §5.2~§5.6 */

import {
  guardBasic, parseJson, readConfig, takeDailyCallFor,
  callModelParts, json, fail, log, modelFail,
} from './_shared.mjs';
import { getSql, authed, withDb } from './_db.mjs';
import {
  HAZARDS, MAX_POINTS, systemText, parseModelJson, filterPoints, overlapCount,
} from './_hazards.mjs';

export const config = { maxDuration: 60 }; // 사진은 글보다 오래 걸린다 (번역은 30)

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

/** 본문 상한. base64 는 원본보다 약 4/3 커지므로 사진 750KB ≈ 본문 1MB 다.
 *  화면은 그보다 훨씬 작게 줄여 보낸다 (`src/assets/photo.js` 목표 300KB) —
 *  이 값은 "그래도 이것보다 크면 거절한다" 는 울타리다 (FR-AD-07-03). */
const MAX_BODY_BYTES = 1024 * 1024;

/** 디코드한 사진 자체의 상한 (FR-AD-07-03 「사본 크기 상한은 개발자가 정한다」). */
const MAX_IMAGE_BYTES = 750 * 1024;

/** 사진 응답은 JSON 이라 번역문(600자)보다 길다. 지점 5개 + 이유면 넉넉하다. */
const MAX_OUTPUT_TOKENS = 1200;
const MAX_ANSWER_CHARS = 4000;

/** 사진은 번역보다 비싸서 통을 따로 쓴다 (`_shared.takeDailyCallFor`).
 *  값은 Gemini 예산 월 5,000원(A04 6-1) 안에서 넉넉히 잡은 것이다. */
const DEFAULT_PHOTO_DAILY_LIMIT = 60;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/* base64 만 받는다. data: URL 머리(`data:image/jpeg;base64,`)가 붙어 오면
   화면 쪽 실수이므로 **고쳐 주지 않고 거절한다** — 조용히 고쳐 주면 다음에도
   그렇게 보낸다. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function base64Bytes(s) {
  const pad = s.endsWith('==') ? 2 : (s.endsWith('=') ? 1 : 0);
  return Math.floor((s.length * 3) / 4) - pad;
}

/* ── 본체 ──────────────────────────────────────────────────────────── */

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['POST'], maxBytes: MAX_BODY_BYTES });
  if (g.done) return g.done;
  const { cors, text: raw } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);

  const account = await authed(sql, request);
  if (!account) return fail(401, 'unauthorized', '다시 로그인해 주세요.', cors);
  if (account.role !== 'admin') {
    log({ route: 'hazards', role: account.role, ms: Date.now() - started, status: 403, err: 'role' });
    return fail(403, 'forbidden', '담당자만 쓸 수 있습니다.', cors);
  }

  const body = parseJson(raw);
  const image = body && typeof body.image === 'string' ? body.image.trim() : '';
  const mime = body && typeof body.mime === 'string' ? body.mime.trim() : '';

  if (!image || ALLOWED_MIME.indexOf(mime) === -1 || !BASE64.test(image)) {
    return fail(400, 'bad_request', '사진을 읽을 수 없습니다. 다시 찍어 주세요.', cors);
  }
  if (base64Bytes(image) > MAX_IMAGE_BYTES) {
    return fail(413, 'too_large', '사진이 너무 큽니다. 다시 찍어 주세요.', cors);
  }

  /* 모델 이름은 `AI_MODEL_PHOTO` 가 있으면 그것, 없으면 번역과 같은 모델을 쓴다.
     ★ 환경변수를 새로 넣지 않아도 돌게 해 둔다 — 설정 변경은 사용자 몫이고
       (A04), 모델을 따로 올리고 싶을 때만 넣으면 된다 (D-028 상향 조건). */
  const cfg = readConfig('AI_MODEL_PHOTO') || readConfig('AI_MODEL_TRANSLATE');
  if (!cfg) {
    log({ route: 'hazards', ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }

  const dailyLimit = Number(process.env.AI_PHOTO_DAILY_LIMIT) || DEFAULT_PHOTO_DAILY_LIMIT;
  if (!takeDailyCallFor('photo', dailyLimit)) {
    log({ route: 'hazards', ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', '오늘 사진 분석 한도를 넘었습니다. 직접 만드실 수 있습니다.', cors);
  }

  const r = await callModelParts(cfg, systemText(HAZARDS), [
    { inline_data: { mime_type: mime, data: image } },
    { text: '이 설비 사진의 위험 지점을 찾아라.' },
  ], MAX_OUTPUT_TOKENS);

  if (r.error) {
    const f = modelFail(r, cors);
    log({ route: 'hazards', ms: Date.now() - started, status: f.status, err: r.error, why: r.why || '' });
    return f.response;
  }
  if (r.text.length > MAX_ANSWER_CHARS) {
    log({ route: 'hazards', ms: Date.now() - started, status: 502, err: 'model', why: '출력이 너무 김' });
    return fail(502, 'model', 'AI 응답을 읽을 수 없습니다. 직접 만드실 수 있습니다.', cors);
  }

  const answer = parseModelJson(r.text);
  if (!answer) {
    /* ★ 받은 글을 응답에 담지 않는다 — 모델이 무엇을 뱉었는지는 로그에도
       남기지 않는다(사진 설명이 섞일 수 있다). 화면은 손 흐름으로 간다 (FR-11). */
    log({ route: 'hazards', ms: Date.now() - started, status: 502, err: 'model', why: 'JSON 이 아님' });
    return fail(502, 'model', 'AI 응답을 읽을 수 없습니다. 직접 만드실 수 있습니다.', cors);
  }

  /* ★ 사람·이름표가 찍혔으면 **지점을 돌려주지 않는다** (FR-AD-07-20).
     화면에서 가리는 것으로 두지 않고 서버에서 비운다 — 화면이 실수로
     보여 줄 수 있는 길 자체를 없앤다. 사진은 어차피 저장하지 않는다. */
  if (answer.person === true) {
    log({ route: 'hazards', ms: Date.now() - started, status: 200, err: '', person: 1 });
    return json(200, {
      person: true, retake: true, points: [], dropped: null, overlaps: 0, model: cfg.model,
    }, cors);
  }

  const { points, dropped } = filterPoints(answer.points, HAZARDS, MAX_POINTS);

  log({
    route: 'hazards', ms: Date.now() - started, status: 200, err: '',
    n: points.length, dropped: dropped.hazard + dropped.range + dropped.shape + dropped.over,
  });

  return json(200, {
    person: false,
    retake: false,
    points,
    dropped,                       // 몇 개를 왜 버렸는지 화면에 적는다 (FR-05)
    overlaps: overlapCount(points), // 겹친 쌍 — 합쳐 보여야 한다 (FR-21)
    model: cfg.model,
  }, cors);
}

export const handle = withDb('hazards', run);

/* ★ default 를 내보내지 않는다 — Vercel 이 옛 Node 방식(req, res)으로 불러
   `request.headers.get` 이 없다며 터진다 (2차에서 실물로 겪었다). */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
