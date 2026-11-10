/* POST /api/questions — 위험요소로 평가문항을 자동 생성·선정한다 (2026-11-11 요청 · SAFETY_QUESTION_GENERATION_RULES.md).

   요청  { equipment: { id, kind, name },
           hazards: [{ id, part, hazard, risk, official?, specific?, sources[{title,url,host}], answer?{x,y,r} }],
           phrases: [{ id, ko }],            — 그 설비 종류의 검수 문구 (화면이 Store.phrasesFor 로 고른 것)
           slots?: [{ slot, hazardId, type, difficulty }],   — 다시 만들기: 이 칸만 (계획은 그대로)
           avoid?: ["앞에 나온 문항 글", ...] }
   응답  { equipment:{id,kind}, plan:{count,slots,reasons,rulesVersion}, quiz:[...], excluded:[...], missing:[slot],
           issuable:{ok, why[]}, rulesVersion, model }   — issuable.ok 가 거짓이면 화면이 발급을 막는다 (규칙 §9.4)

   ★ 문항 수·유형·난이도는 코드(_questions.mjs planQuiz)가 규칙으로 정한다. AI 는 칸을 채우기만 한다.
   ★ AI 가 쓴 문항은 aiWritten 으로 표시된다. 담당자가 검토·승인해야 발급된다. 이 함수는 아무것도 저장하지 않는다.
   ★ 빈 칸은 그 칸만 한 번 더 묻는다 (규칙 §9.3 — 자동은 칸당 1회).
   ★ 담당자(`admin`)만 부른다. 보내는 것은 설비 이름·위험요소·문구뿐이다. */

import {
  guardBasic, parseJson, readConfig, takeDailyCall, callModel,
  json, fail, log, modelFail,
} from './_shared.mjs';
import { getSql, requireAdmin, withDb } from './_db.mjs';
import { parseModelJson, HAZARD_CODES } from './_hazards.mjs';
import { EQUIPMENT_KINDS } from './_official.mjs';
import {
  RULES, TYPES, cleanHazards, cleanPhrases, planQuiz, systemText, userText, selectQuiz, needsModel,
} from './_questions.mjs';

export const config = { maxDuration: 60 };

const MAX_BODY = 64 * 1024;
const MAX_OUTPUT_TOKENS = 8000;
const MAX_TEXT = 24000;
export const DEFAULT_QUESTIONS_TIMEOUT_MS = 40000;
const MODEL_ENVS = ['AI_MODEL_RESEARCH', 'AI_MODEL_TRANSLATE'];
const MESSAGES = {
  model: 'AI 가 문항을 만들지 못했습니다. 잠시 뒤 다시 만들어 주세요.',
  timeout: 'AI 가 제시간에 답하지 못했습니다. 다시 만들어 주세요.',
  limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 만들어 주세요.',
};

function readSlots(list, hazards) {
  const ids = new Set(hazards.map((h) => h.id));
  return (Array.isArray(list) ? list : []).slice(0, RULES.count.max).map((s) => (s && Number.isInteger(s.slot) && ids.has(s.hazardId)
    && TYPES.indexOf(s.type) !== -1 && ['easy', 'medium', 'hard'].indexOf(s.difficulty) !== -1
    ? { slot: s.slot, hazardId: s.hazardId, type: s.type, difficulty: s.difficulty, required: false } : null)).filter(Boolean);
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

  const body = parseJson(text) || {};
  const e = body.equipment && typeof body.equipment === 'object' ? body.equipment : {};
  const equipment = {
    id: typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(e.id) ? e.id : '',
    kind: EQUIPMENT_KINDS.indexOf(e.kind) !== -1 ? e.kind : '',
    name: typeof e.name === 'string' ? e.name.replace(/[\r\n"`{}<>]/g, ' ').slice(0, 60) : '',
  };
  if (!equipment.id) return fail(400, 'bad_request', '설비를 골라 주세요.', cors);
  const hazards = cleanHazards(body.hazards, HAZARD_CODES);
  if (!hazards.length) return fail(400, 'bad_request', '문항을 만들 위험요소가 없습니다.', cors);
  const phrases = cleanPhrases(body.phrases);

  const plan = planQuiz(hazards);
  const merged = plan.hazards;   // 부위가 겹쳐 합친 뒤의 위험요소 (규칙 §7 ①)
  const regen = body.slots !== undefined;
  const slots = regen ? readSlots(body.slots, merged) : plan.slots;
  if (regen && !slots.length) return fail(400, 'bad_request', '다시 만들 칸을 읽을 수 없습니다.', cors);
  const work = { ...plan, slots };

  let raw = { questions: [] };
  let model = '';
  if (needsModel(slots)) {
    let cfg = null;
    for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
    if (!cfg) return fail(500, 'config', '서버 설정 오류입니다.', cors);
    cfg = { ...cfg, timeoutMs: Number(process.env.AI_QUESTIONS_TIMEOUT_MS) || DEFAULT_QUESTIONS_TIMEOUT_MS };
    model = cfg.model;
    if (!takeDailyCall(cfg.dailyLimit)) return fail(429, 'limit', MESSAGES.limit, cors);
    const avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 20).map((a) => String(a).slice(0, 160));
    const user = userText(equipment, merged, slots.filter((s) => s.type !== 'location'), phrases)
      + (avoid.length ? '\n\n아래 문항과 다르게 만든다:\n' + avoid.map((a) => '- ' + a).join('\n') : '');
    const r = await callModel(cfg, systemText(), user, { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT });
    if (r.error) {
      const f = modelFail(r, cors, MESSAGES);
      log({ route: 'questions', ms: Date.now() - started, status: f.status, err: r.error });
      return f.response;
    }
    raw = parseModelJson(r.text) || { questions: [] };
  }

  let out = selectQuiz(work, merged, raw, phrases);
  /* 빈 칸은 그 칸만 한 번 더 — 떨어진 후보 글을 피할 글로 (규칙 §9.3, 시간이 남을 때) */
  const needAgain = slots.filter((s) => out.missing.indexOf(s.slot) !== -1 && s.type !== 'location');
  if (needAgain.length && model && Date.now() - started < 25000) {
    let cfg = null;
    for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
    if (cfg && takeDailyCall(cfg.dailyLimit)) {
      const avoid2 = out.excluded.filter((x) => needAgain.some((s) => s.slot === x.slot) && x.prompt).map((x) => '- ' + x.prompt);
      const r2 = await callModel({ ...cfg, timeoutMs: 25000 }, systemText(),
        userText(equipment, merged, needAgain, phrases) + (avoid2.length ? '\n\n아래 문항과 다르게 만든다:\n' + avoid2.join('\n') : ''),
        { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT });
      const raw2 = !r2.error && parseModelJson(r2.text);
      if (raw2 && Array.isArray(raw2.questions)) out = selectQuiz(work, merged, { questions: raw.questions.concat(raw2.questions) }, phrases);
    }
  }

  log({ route: 'questions', ms: Date.now() - started, status: 200, err: '', n: out.quiz.length, plan: slots.length, ex: out.excluded.length, miss: out.missing.length, regen });
  const { hazards: _drop, ...planOut } = work;
  return json(200, { equipment: { id: equipment.id, kind: equipment.kind }, plan: planOut, ...out, rulesVersion: RULES.version, model }, cors);
}

export const handle = withDb('questions', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
