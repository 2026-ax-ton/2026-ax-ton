/* POST /api/research — 설비 정보로 공개 자료를 찾아 **출처가 붙은 주의사항 목록**을 제안한다
   (PRD-AD-08 S2 · S4 일부).

   요청  { equipment: { name, maker?, model?, year? } }
   응답  { overview, general, items: [{id, part, hazard, risk, sources[{title,url,host,tier}],
           unverifiedSources, conflict, needsPhoto, status: 'ok'|'check', reasons[]}],
           dropped, sourceCount, thin, model }

   ★ AI 는 제안만 한다. 이 함수는 아무것도 저장하지 않는다 — 확정은 담당자, 저장은 승인 때만.
   ★ 출처는 **검색 근거에 실제로 있는 것만** 인정한다. 모델이 적은 주소를 그대로 믿지 않는다.
   ★ 담당자(`admin`)만 부른다. 누구인지는 토큰으로만 안다 (A02 §14.6).
   ★ 보내는 것은 설비 정보와 지시문뿐이다. 계정·사업장 이름·노동자 데이터를 붙이지 않는다.

   근거: PRD-AD-08 §4 FR-03~08·13 · §7 */

import {
  guardBasic, parseJson, readConfig, takeDailyCall, callModel,
  json, fail, log, modelFail,
} from './_shared.mjs';
import { getSql, requireAdmin, withDb } from './_db.mjs';
import { parseModelJson } from './_hazards.mjs';
import { systemText, userText, cleanField, cleanResult } from './_research.mjs';

export const config = { maxDuration: 60 };

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

const MAX_BODY = 2048;
/* 검색을 몇 번 하고 읽느라 번역보다 오래 걸린다 */
export const DEFAULT_RESEARCH_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 8000;   // 2026-11-09 경험 글까지 찾게 하자 4000 에서 JSON 이 잘렸다 (GPT 는 추론 토큰도 여기서 센다)
const MAX_TEXT = 24000;
/* 모델 — 따로 두지 않으면 번역 모델을 쓴다 (C06 D-028). 품질이 모자라면 AI_MODEL_RESEARCH 로 올린다 */
const MODEL_ENVS = ['AI_MODEL_RESEARCH', 'AI_MODEL_TRANSLATE'];
const TOOLS = [{ google_search: {} }];

const MESSAGES = {
  model: 'AI 가 자료를 찾지 못했습니다. 주의사항을 직접 적어 주세요.',
  timeout: 'AI 가 제시간에 답하지 못했습니다. 잠시 뒤 다시 하거나 직접 적어 주세요.',
  limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 하거나 직접 적어 주세요.',
};

/** 요청에서 설비 정보만 꺼낸다. 그 밖의 필드는 버린다 */
export function readEquipment(body) {
  const e = body && body.equipment;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const name = cleanField(e.name, 60);
  if (!name) return null;
  const year = Number.isInteger(e.year) && e.year >= 1950 && e.year <= 2100 ? e.year : null;
  return { name, maker: cleanField(e.maker, 60), model: cleanField(e.model, 60), year };
}

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['POST'], maxBytes: MAX_BODY });
  if (g.done) return g.done;
  const { cors, text } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);

  const who = await requireAdmin(sql, request, cors);
  if (who.done) return who.done;

  const eq = readEquipment(parseJson(text));
  if (!eq) return fail(400, 'bad_request', '설비 이름을 적어 주세요.', cors);

  let cfg = null;
  for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
  if (!cfg) {
    log({ route: 'research', ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }
  cfg = { ...cfg, timeoutMs: Number(process.env.AI_RESEARCH_TIMEOUT_MS) || DEFAULT_RESEARCH_TIMEOUT_MS };

  if (!takeDailyCall(cfg.dailyLimit)) {
    log({ route: 'research', ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', MESSAGES.limit, cors);
  }

  const r = await callModel(cfg, systemText(), userText(eq),
    { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT, tools: TOOLS });

  if (r.error) {
    const f = modelFail(r, cors, MESSAGES);
    log({ route: 'research', ms: Date.now() - started, status: f.status, err: r.error, why: r.why || '' });
    return f.response;
  }

  const raw = parseModelJson(r.text);
  if (!raw) {
    log({ route: 'research', ms: Date.now() - started, status: 502, err: 'model', why: 'JSON 이 아님' });
    return fail(502, 'model', MESSAGES.model + ' (응답 모양이 틀림)', cors);
  }

  const out = cleanResult(raw, r.grounding, eq);
  log({
    route: 'research', ms: Date.now() - started, status: 200, err: '',
    n: out.items.length, ok: out.items.filter((i) => i.status === 'ok').length, src: out.sourceCount,
  });
  return json(200, { ...out, model: cfg.model }, cors);
}

export const handle = withDb('research', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
