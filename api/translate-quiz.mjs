/* POST /api/translate-quiz — AI 가 만든 평가문항을 노동자의 언어로 번역한다 (2026-11-11).

   요청  { equipment: { id, name }, lang: 'km', items: [{ id, prompt, options?, results?, why?, prevention? }] }
   응답  { equipment:{id}, lang, i18n: { [id]: {...} }, failed: [{ id, why[] }], model }

   ★ 담당자(admin)만. 아무것도 저장하지 않는다 — 담당자 화면이 문항 i18n 에 넣고, 다 채워져야 발급된다.
   ★ 번역은 _quiztrans.mjs 가 거른다(개수·빈 칸·한국어 글자). 걸린 문항은 failed 로 돌려준다 (다시 시도). */

import {
  guardBasic, parseJson, readConfig, takeDailyCall, callModel, json, fail, log, modelFail, LANG_NAMES,
} from './_shared.mjs';
import { getSql, requireAdmin, withDb } from './_db.mjs';
import { parseModelJson } from './_hazards.mjs';
import { cleanItems, systemText, userText, readTranslations } from './_quiztrans.mjs';

export const config = { maxDuration: 60 };
const MODEL_ENVS = ['AI_MODEL_TRANSLATE'];
const MESSAGES = {
  model: 'AI 가 번역하지 못했습니다. 다시 시도해 주세요.',
  timeout: 'AI 가 제시간에 답하지 못했습니다. 다시 시도해 주세요.',
  limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.',
};

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['POST'], maxBytes: 64 * 1024 });
  if (g.done) return g.done;
  const { cors, text } = g;
  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);
  const who = await requireAdmin(sql, request, cors);
  if (who.done) return who.done;

  const body = parseJson(text) || {};
  const lang = typeof body.lang === 'string' && LANG_NAMES[body.lang] ? body.lang : '';
  if (!lang) return fail(400, 'bad_request', '번역할 언어를 골라 주세요.', cors);
  const e = body.equipment && typeof body.equipment === 'object' ? body.equipment : {};
  const equipment = { id: typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(e.id) ? e.id : '' };
  const eqName = typeof e.name === 'string' ? e.name.slice(0, 60) : '';
  const items = cleanItems(body.items);
  if (!items.length) return fail(400, 'bad_request', '번역할 문항이 없습니다.', cors);

  let cfg = null;
  for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
  if (!cfg) return fail(500, 'config', '서버 설정 오류입니다.', cors);
  cfg = { ...cfg, timeoutMs: 45000 };
  if (!takeDailyCall(cfg.dailyLimit)) return fail(429, 'limit', MESSAGES.limit, cors);

  const r = await callModel(cfg, systemText(LANG_NAMES[lang]), userText(items), { maxOutputTokens: 12000, maxText: 40000 });
  if (r.error) {
    const f = modelFail(r, cors, MESSAGES);
    log({ route: 'translate-quiz', lang, ms: Date.now() - started, status: f.status, err: r.error });
    return f.response;
  }
  const out = readTranslations(parseModelJson(r.text), items, [eqName]);
  log({ route: 'translate-quiz', lang, ms: Date.now() - started, status: 200, err: '', n: items.length, ok: Object.keys(out.i18n).length, failed: out.failed.length });
  return json(200, { equipment, lang, ...out, model: cfg.model }, cors);
}

export const handle = withDb('translate-quiz', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
