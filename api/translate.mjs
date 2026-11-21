/* POST /api/translate — 한국어 안전 문구를 노동자 언어로 번역한다.

   요청  { ko: 1~300자, lang: km|id|vi|ne|th, attempt: 0~2, hint?: ~600자 }
   응답  { text, model, attempt }   ← status(승인 상태)는 절대 넣지 않는다

   근거: A02 §5.2·§5.3 · SPEC-BE §2.1 · PRD-AD-03
   AI 결과는 언제나 waiting 으로 저장된다. 승인은 사람만 한다 (FR-AD-03-06). */

import {
  LANG_NAMES, MAX_KO, MAX_HINT, MAX_ATTEMPT,
  guard, parseJson, isAllowedLang, readConfig, takeDailyCall,
  callModel, json, fail, log, modelFail,
} from './_shared.mjs';
import { parseModelJson } from './_hazards.mjs';

export const config = { maxDuration: 30 }; // A02 §5.2

/** ★ 내보내는 이유는 하나다 — 제출본 빌드(`scripts/build-submission.mjs`)가
 *  이 함수를 그대로 불러 지시문을 **뽑아 간다** (C06 D-034 ②).
 *  두 곳에 손으로 베끼면 서버와 제출본의 AI 가 서로 다른 말을 하게 된다.
 *  Vercel 이 특별히 보는 것은 메서드 이름(GET·POST…)뿐이라 이 이름은 안전하다. */
export function systemText(langName, hint) {
  const base =
    `너는 산업안전 지시문 번역가다. 한국어 지시문을 ${langName}으로 번역한다. ` +
    '규칙: 1) 금지·부정(하지 마세요, 금지, 안 됩니다)을 반드시 보존한다. ' +
    '2) 기계·부위 이름은 현장 노동자가 쓰는 쉬운 말로 쓴다. ' +
    '3) 설명·따옴표·로마자 표기 없이 번역문 한 문장만 출력한다.';
  if (!hint) return base;
  // 재시도 — 앞 역번역을 붙여 무엇이 뒤집혔는지 알린다 (A02 §5.3)
  return base + ` 앞 번역을 한국어로 되돌렸더니 '${hint}'가 되어 뜻이 바뀌었다. 부정과 금지를 다시 확인하라.`;
}

/* 🆕 2026-11-17 문구 초안 (mode: 'draft') — 설비 종류와 위험유형을 주면 AI 가 한국어 안전 지시문 초안을 쓴다.
   ★ 응답에 status 를 넣지 않는다. 화면이 언제나 'waiting' 으로 저장하고, 승인은 운영자가 한다 (FR-AD-03-06).
   본문 상한 4KB 라 이미 있는 문구는 20개까지(같은 종류 것). 새 함수를 만들지 않고 여기에 둔다 — Vercel Hobby 함수 12개 제한 (11/12) */
export const DRAFT = { maxHazards: 12, perHazard: 2, maxExisting: 20, maxLabel: 30 };

export function draftSystemText() {
  return '너는 제조업 안전 지시문 작가다. 글을 잘 못 읽는 이주노동자가 듣고 바로 따라 할 문장을 쓴다.\n'
    + '규칙: 1) 한 문장, 40자 안팎, 쉬운 한국어, 「~하십시오」「~마십시오」로 끝낸다. '
    + `2) 위험유형마다 ${DRAFT.perHazard}개까지, 서로 다른 행동을 쓴다. `
    + '3) 이미 있는 문구와 뜻이 같은 것은 쓰지 않는다. '
    + '4) 산업안전보건기준에 관한 규칙·KOSHA 가이드에 맞는 일반적인 행동만 쓴다. 설비 고유 수치(압력·거리)는 지어내지 않는다. '
    + '5) 설명 없이 JSON 하나만: {"phrases":[{"ko":"...","hazard":"pinch"}]} — hazard 는 주어진 코드 중 하나.';
}

/** 요청을 읽는다. 잘못되면 null */
export function readDraft(body) {
  const kind = typeof body.kind === 'string' ? body.kind.trim().slice(0, DRAFT.maxLabel) : '';
  const hz = Array.isArray(body.hazards) ? body.hazards : [];
  const hazards = hz.filter((h) => h && typeof h.code === 'string' && /^[a-z]{2,12}$/.test(h.code) && typeof h.label === 'string')
    .slice(0, DRAFT.maxHazards).map((h) => ({ code: h.code, label: h.label.trim().slice(0, DRAFT.maxLabel) }));
  const existing = (Array.isArray(body.existing) ? body.existing : []).filter((s) => typeof s === 'string')
    .slice(0, DRAFT.maxExisting).map((s) => s.trim().slice(0, MAX_KO));
  if (!kind || !hazards.length || hazards.length !== hz.length) return null;
  return { kind, hazards, existing };
}

/** 모델 답을 거른다 — 주어진 위험 코드·길이·중복만 통과. status 는 만들지 않는다 */
export function cleanDraft(text, req) {
  let obj = null;
  try { obj = JSON.parse(String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return []; }
  const codes = new Set(req.hazards.map((h) => h.code));
  const seen = new Set(req.existing);
  const count = {};
  return (obj && Array.isArray(obj.phrases) ? obj.phrases : []).filter((p) => {
    const ko = p && typeof p.ko === 'string' ? p.ko.trim() : '';
    if (!ko || ko.length > 120 || !codes.has(p.hazard) || seen.has(ko)) return false;
    count[p.hazard] = (count[p.hazard] || 0) + 1;
    if (count[p.hazard] > DRAFT.perHazard) return false;
    seen.add(ko);
    return true;
  }).map((p) => ({ ko: p.ko.trim(), hazard: p.hazard }));
}

async function handleDraft(body, cors, started) {
  const req = readDraft(body);
  if (!req) return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);
  const cfg = readConfig('AI_MODEL_TRANSLATE');
  if (!cfg) return fail(500, 'config', '서버 설정 오류입니다.', cors);
  if (!(await takeDailyCall(cfg.dailyLimit))) return fail(429, 'limit', '오늘 AI 사용 한도를 넘었습니다.', cors);
  const user = '설비 종류: ' + req.kind + '\n위험유형:\n' + req.hazards.map((h) => '- ' + h.code + ': ' + h.label).join('\n')
    + '\n이미 있는 문구:\n' + (req.existing.map((s) => '- ' + s).join('\n') || '(없음)');
  const r = await callModel(cfg, draftSystemText(), user);
  if (r.error) {
    const f = modelFail(r, cors);
    log({ route: 'translate', mode: 'draft', ms: Date.now() - started, status: f.status, err: r.error });
    return f.response;
  }
  const phrases = cleanDraft(r.text, req);
  log({ route: 'translate', mode: 'draft', ms: Date.now() - started, status: 200, err: '', n: phrases.length });
  return json(200, { phrases, model: cfg.model }, cors);
}

export async function handle(request) {
  const started = Date.now();
  const g = await guard(request);
  if (g.done) return g.done;
  const { cors, text: raw } = g;

  const body = parseJson(raw);
  if (body && body.mode === 'draft') return handleDraft(body, cors, started);
  const ko = body && typeof body.ko === 'string' ? body.ko.trim() : '';
  const lang = body ? body.lang : undefined;
  const attempt = body && body.attempt === undefined ? 0 : body && body.attempt;
  const hint = body && typeof body.hint === 'string' ? body.hint.trim().slice(0, MAX_HINT) : '';

  if (!body
    || ko.length < 1 || ko.length > MAX_KO
    || !isAllowedLang(lang)
    || !Number.isInteger(attempt) || attempt < 0 || attempt > MAX_ATTEMPT) {
    return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);
  }

  const cfg = readConfig('AI_MODEL_TRANSLATE');
  if (!cfg) {
    log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }

  if (!(await takeDailyCall(cfg.dailyLimit))) {
    log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', '오늘 AI 사용 한도를 넘었습니다.', cors);
  }

  const r = await callModel(cfg, systemText(LANG_NAMES[lang], attempt > 0 ? hint : ''), ko);
  if (r.error) {
    const f = modelFail(r, cors);
    log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: f.status, err: r.error, why: r.why || '' });
    return f.response;
  }

  log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: 200, err: '' });
  return json(200, { text: r.text, model: cfg.model, attempt }, cors);
}

/* ★ Vercel 은 이름 있는 메서드 내보내기가 있으면 Web 시그니처(Request → Response)로
   부르고, `default` 가 있으면 옛 Node 방식(req, res)으로 부른다. 둘을 같이 내보내면
   default 가 이겨서 `request.headers.get` 이 없다며 터진다 (2026-10-31 미리보기에서
   FUNCTION_INVOCATION_FAILED 로 확인). **default 를 내보내지 않는다.**

   POST 밖의 메서드도 받아서 우리 405 JSON 을 돌려준다 — 플랫폼이 내는 405 에는
   `{error:'method'}` 가 없다 (A02 §5.2). */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
