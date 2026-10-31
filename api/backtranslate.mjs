/* POST /api/backtranslate — 번역문을 한국어로 되돌린다 (역번역 대조용).

   요청  { text: 1~600자, lang: km|id|vi|ne|th }
   응답  { back, model }            ← status(승인 상태)는 절대 넣지 않는다

   ★ 역번역 쪽에는 원래 한국어 문장을 주지 않는다. 주면 모델이 원문에 맞춰
     "고쳐서" 대조가 무의미해진다 (A02 §5.4).
   ★ 번역과 다른 모델을 쓴다 — 같은 오류를 같이 놓치지 않게 (R-03, A01 질문 3).

   근거: A02 §5.2·§5.4 · SPEC-BE §2.1 */

import {
  LANG_NAMES, MAX_TEXT,
  guard, parseJson, isAllowedLang, readConfig, takeDailyCall,
  callModel, json, fail, log, MODEL_ERRORS,
} from './_shared.mjs';

export const config = { maxDuration: 30 }; // A02 §5.2

function systemText(langName) {
  return `다음 ${langName} 문장을 한국어로 직역한다. 원문을 추측해 고치지 말고 쓰인 그대로 옮긴다. `
    + '부정은 부정으로, 긍정은 긍정으로 옮긴다. 한국어 문장 하나만 출력한다.';
}

export async function handle(request) {
  const started = Date.now();
  const g = await guard(request);
  if (g.done) return g.done;
  const { cors, text: raw } = g;

  const body = parseJson(raw);
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  const lang = body ? body.lang : undefined;

  if (!body || text.length < 1 || text.length > MAX_TEXT || !isAllowedLang(lang)) {
    return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);
  }

  const cfg = readConfig('AI_MODEL_BACK');
  if (!cfg) {
    log({ route: 'backtranslate', lang, attempt: 0, ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }

  if (!takeDailyCall(cfg.dailyLimit)) {
    log({ route: 'backtranslate', lang, attempt: 0, ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', '오늘 AI 사용 한도를 넘었습니다.', cors);
  }

  const r = await callModel(cfg, systemText(LANG_NAMES[lang]), text);
  if (r.error) {
    const [status, message] = MODEL_ERRORS[r.error];
    log({ route: 'backtranslate', lang, attempt: 0, ms: Date.now() - started, status, err: r.error });
    return fail(status, r.error, message, cors);
  }

  log({ route: 'backtranslate', lang, attempt: 0, ms: Date.now() - started, status: 200, err: '' });
  return json(200, { back: r.text, model: cfg.model }, cors);
}

export default handle;
export const POST = handle;
export const OPTIONS = handle;
