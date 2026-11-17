/* POST /api/research — 설비 정보로 공개 자료를 찾아 **출처가 붙은 주의사항 목록**을 제안한다
   (PRD-AD-08 S2 · S4 일부).

   요청  { equipment: { name, maker?, model?, year? } }
   응답  { overview, general, items: [{id, part, hazard, risk, sources[{title,url,host,tier}],
           unverifiedSources, conflict, needsPhoto, specific, official?, status: 'ok'|'check', reasons[]}],
           officialDocs, noOfficial, docNumbers, limits, dropped, sourceCount, thin, images, model }
   항목의 image = { data(data URL), page, host, alt } — 출처 페이지에서 찾은 참고 사진 (없으면 없음)
   ★ 확인된 공식 문서 항목(_official.mjs, id o1…)이 맨 앞이고, 그 뒤가 AI 항목(r1…)이다.
     AI 에는 질문을 둘 보낸다 — 기본 조사와 「이 기계에만 있는 위험」(specific: true).

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
import { attachImages } from './_images.mjs';
import { parseModelJson } from './_hazards.mjs';
import {
  systemText, specificSystemText, userText, cleanField, cleanResult, mergeRaw, mergeGrounding, withOfficial,
  readVerify, verifySystemText, verifyUserText, cleanVerify,
} from './_research.mjs';
import { EQUIPMENT_KINDS } from './_official.mjs';

export const config = { maxDuration: 60 };

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

const MAX_BODY = 8192;   // 2026-11-16 등록 정보 검수(verify)가 항목·분류 목록·메모를 함께 보낸다
/* 검색을 몇 번 하고 읽느라 번역보다 오래 걸린다 */
export const DEFAULT_RESEARCH_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 8000;   // 2026-11-09 경험 글까지 찾게 하자 4000 에서 JSON 이 잘렸다 (GPT 는 추론 토큰도 여기서 센다)
const MAX_TEXT = 24000;
const IMAGE_BUDGET_MS = 12000;   // 참고 사진 찾기에 쓰는 시간 상한 (모델 두 질문 뒤)
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
  /* 🆕 2026-11-11 설비 id·종류 — 응답에 그대로 돌려줘 화면이 「고른 설비의 결과인가」를 맞춰 본다 */
  const id = typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(e.id) ? e.id : '';
  const kind = EQUIPMENT_KINDS.indexOf(e.kind) !== -1 ? e.kind : '';
  return { id, kind, name, maker: cleanField(e.maker, 60), model: cleanField(e.model, 60), year };
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

  const body = parseJson(text);
  const eq = readEquipment(body);
  if (!eq) return fail(400, 'bad_request', '설비 이름을 적어 주세요.', cors);
  /* 🆕 2026-11-16 verify 가 있으면 조사가 아니라 등록 정보 검수 (질문 하나) */
  const wantsVerify = !!body && body.verify !== undefined;
  const verify = wantsVerify ? readVerify(body) : null;
  if (wantsVerify && !verify) return fail(400, 'bad_request', '확인할 항목이 없습니다.', cors);

  let cfg = null;
  for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
  if (!cfg) {
    log({ route: 'research', ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }
  cfg = { ...cfg, timeoutMs: Number(process.env.AI_RESEARCH_TIMEOUT_MS) || DEFAULT_RESEARCH_TIMEOUT_MS };

  if (!(await takeDailyCall(cfg.dailyLimit))) {
    log({ route: 'research', ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', MESSAGES.limit, cors);
  }

  if (verify) {
    const r = await callModel(cfg, verifySystemText(), verifyUserText(eq, verify), { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT, tools: TOOLS });
    if (r.error) {
      const f = modelFail(r, cors, MESSAGES);
      log({ route: 'research', mode: 'verify', ms: Date.now() - started, status: f.status, err: r.error, why: r.why || '' });
      return f.response;
    }
    const raw = parseModelJson(r.text);
    if (!raw) {
      log({ route: 'research', mode: 'verify', ms: Date.now() - started, status: 502, err: 'model', why: 'JSON 이 아님' });
      return fail(502, 'model', MESSAGES.model + ' (응답 모양이 틀림)', cors);
    }
    const out = cleanVerify(raw, r.grounding, eq, verify);
    log({ route: 'research', mode: 'verify', ms: Date.now() - started, status: 200, err: '',
      n: out.checks.length, ok: out.checks.filter((c) => c.verdict === 'ok').length, add: out.missing.length });
    return json(200, { verify: out, equipment: { id: eq.id, kind: eq.kind }, model: cfg.model }, cors);
  }

  /* 두 질문을 나란히 — ① 기본 조사 ② 이 기계에만 있는 위험 (같은 모델, 차례로 하면 60초를 넘는다).
     ②는 하루 한도를 하나 더 쓴다. 한도에 걸리거나 실패하면 ①만 쓴다 */
  const opts = { maxOutputTokens: MAX_OUTPUT_TOKENS, maxText: MAX_TEXT, tools: TOOLS };
  const second = await takeDailyCall(cfg.dailyLimit);
  const [r, r2] = await Promise.all([
    callModel(cfg, systemText(), userText(eq), opts),
    second ? callModel(cfg, specificSystemText(), userText(eq), opts) : Promise.resolve(null),
  ]);

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

  const raw2 = r2 && !r2.error ? parseModelJson(r2.text) : null;
  const merged = mergeRaw(raw, raw2);
  if (!raw2) merged.limits = merged.limits.concat('이 기계 고유 위험 추가 조사가 실패해 기본 조사만 보입니다');
  /* 항목 참고 사진 — 확인된 출처 페이지에서만 (_images.mjs). 함수 상한 60초 안에서 남은 시간만 쓴다 */
  const out = await attachImages(withOfficial(cleanResult(merged, mergeGrounding(r.grounding, r2 && r2.grounding), eq), eq),
    { budgetMs: Math.min(IMAGE_BUDGET_MS, 55000 - (Date.now() - started)), eqName: eq.name });
  log({
    route: 'research', ms: Date.now() - started, status: 200, err: '',
    n: out.items.length, ok: out.items.filter((i) => i.status === 'ok').length, src: out.sourceCount,
    off: out.items.filter((i) => i.official).length, spec: out.items.filter((i) => i.specific).length, second: !!raw2, img: out.images || 0,
  });
  return json(200, { ...out, equipment: { id: eq.id, kind: eq.kind }, model: cfg.model }, cors);
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
