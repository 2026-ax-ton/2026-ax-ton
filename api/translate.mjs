/* POST /api/translate — 한국어 안전 문구를 노동자 언어로 번역한다.

   요청  { ko: 1~300자, lang: km|id|vi|ne|th, attempt: 0~2, hint?: ~600자 }
   응답  { text, model, attempt }   ← status(승인 상태)는 절대 넣지 않는다

   근거: A02 §5.2·§5.3 · SPEC-BE §2.1 · PRD-AD-03
   AI 결과는 언제나 waiting 으로 저장된다. 승인은 사람만 한다 (FR-AD-03-06). */

import {
  LANG_NAMES, MAX_KO, MAX_HINT, MAX_ATTEMPT,
  guard, parseJson, isAllowedLang, readConfig, takeDailyCall,
  callModel, json, fail, log, MODEL_ERRORS,
} from './_shared.mjs';

export const config = { maxDuration: 30 }; // A02 §5.2

function systemText(langName, hint) {
  const base =
    `너는 산업안전 지시문 번역가다. 한국어 지시문을 ${langName}으로 번역한다. ` +
    '규칙: 1) 금지·부정(하지 마세요, 금지, 안 됩니다)을 반드시 보존한다. ' +
    '2) 기계·부위 이름은 현장 노동자가 쓰는 쉬운 말로 쓴다. ' +
    '3) 설명·따옴표·로마자 표기 없이 번역문 한 문장만 출력한다.';
  if (!hint) return base;
  // 재시도 — 앞 역번역을 붙여 무엇이 뒤집혔는지 알린다 (A02 §5.3)
  return base + ` 앞 번역을 한국어로 되돌렸더니 '${hint}'가 되어 뜻이 바뀌었다. 부정과 금지를 다시 확인하라.`;
}

export async function handle(request) {
  const started = Date.now();
  const g = await guard(request);
  if (g.done) return g.done;
  const { cors, text: raw } = g;

  const body = parseJson(raw);
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

  if (!takeDailyCall(cfg.dailyLimit)) {
    log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', '오늘 AI 사용 한도를 넘었습니다.', cors);
  }

  const r = await callModel(cfg, systemText(LANG_NAMES[lang], attempt > 0 ? hint : ''), ko);
  if (r.error) {
    const [status, message] = MODEL_ERRORS[r.error];
    log({ route: 'translate', lang, attempt, ms: Date.now() - started, status, err: r.error });
    return fail(status, r.error, message, cors);
  }

  log({ route: 'translate', lang, attempt, ms: Date.now() - started, status: 200, err: '' });
  return json(200, { text: r.text, model: cfg.model, attempt }, cors);
}

/* Vercel 이 Web Handler 를 어떻게 집는지는 미리보기 배포에서 확인한다 (T4).
   이름 있는 메서드 내보내기와 기본 내보내기 둘 다 같은 handle 을 부른다. */
export default handle;
export const POST = handle;
export const OPTIONS = handle;
