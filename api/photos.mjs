/* POST /api/photos — 조사가 끝난 위험 항목마다 **참고 사진**을 찾아 돌려준다 (2026-11-10 사용자 요청
   「위험에 각각 사진까지, 유튜브 캡처라도」).

   요청  { equipment: { id, kind, name, maker?, model? },
           items: [{ id, part, partEn?, sources: [{ url, host, tier }] }] }   (항목 30개까지)
   응답  { equipment: { id, kind }, images: { [itemId]: { data, page, host, alt, kind: 'page'|'video', license } } }
         사진을 못 찾은 항목은 images 에 없다.

   ★ 모델에게는 「사진이 있는 페이지·유튜브 영상」만 묻는다 (_images.mjs findPhotoHints). 그림 주소는 묻지 않는다.
   ★ 브라우저는 제3자 주소를 부르지 않는다 — 서버가 받아 data URL 로 돌려준다.
   ★ 남의 사진이다 — license 가 '확인 필요' 면 교육에 넣기 전에 사람이 조건을 확인한다. 실제 점검 사진과 섞지 않는다.
   ★ 담당자(`admin`)만 부른다. 보내는 것은 설비 정보와 부위 이름뿐이다 (계정·사업장 값 없음).
   ★ 하루 한도는 모델 질문(5항목 묶음)마다 하나씩 센다. 한도가 다 차면 남은 묶음은 출처 페이지에서만 찾는다. */

import {
  guardBasic, parseJson, readConfig, takeDailyCall, callModel,
  json, fail, log, modelFail,
} from './_shared.mjs';
import { getSql, requireAdmin, withDb } from './_db.mjs';
import { attachImages, findPhotoHints, safeUrl, PHOTO_BATCH } from './_images.mjs';
import { parseModelJson } from './_hazards.mjs';
import { cleanField } from './_research.mjs';
import { readEquipment } from './research.mjs';

export const config = { maxDuration: 60 };

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

const MAX_BODY = 64 * 1024;        // 항목 30개 × 출처 4개 주소
export const MAX_ITEMS = 30;
const MAX_SOURCES = 4;
const MODEL_TIMEOUT_MS = 40000;    // 모델 상한. 그림 받기는 남은 시간(함수 60초 안)
const DEADLINE_MS = 55000;
/* 모델 — research 와 같은 것을 쓴다 */
const MODEL_ENVS = ['AI_MODEL_RESEARCH', 'AI_MODEL_TRANSLATE'];

const MESSAGES = {
  model: 'AI 가 사진을 찾지 못했습니다. 잠시 뒤 다시 해 주세요.',
  timeout: 'AI 가 제시간에 답하지 못했습니다. 잠시 뒤 다시 해 주세요.',
  limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 해 주세요.',
};

function hostName(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}

/** 요청의 항목만 꺼내 다듬는다. 그 밖의 필드는 버린다. 모양이 틀린 항목은 뺀다 */
export function readItems(body) {
  const list = body && Array.isArray(body.items) ? body.items : [];
  const seen = new Set();
  const out = [];
  for (const it of list) {
    if (out.length >= MAX_ITEMS) break;
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !/^[A-Za-z0-9_-]{1,10}$/.test(it.id) || seen.has(it.id)) continue;
    const part = cleanField(it.part, 80);
    if (!part) continue;
    seen.add(it.id);
    const sources = (Array.isArray(it.sources) ? it.sources : [])
      .filter((s) => s && typeof s.url === 'string' && s.url.length <= 600 && safeUrl(s.url))
      .slice(0, MAX_SOURCES)
      /* host 는 보낸 값을 믿지 않고 주소에서 다시 뽑는다 */
      .map((s) => ({ url: s.url, host: hostName(s.url), tier: [1, 2, 3, 4].indexOf(s.tier) !== -1 ? s.tier : 3 }));
    out.push({ id: it.id, part, partEn: cleanField(it.partEn, 80), sources });
  }
  return out;
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
  const items = readItems(body);
  if (!eq || !items.length) return fail(400, 'bad_request', '설비 이름과 위험 항목을 보내 주세요.', cors);

  let cfg = null;
  for (const name of MODEL_ENVS) { cfg = readConfig(name); if (cfg) break; }
  if (!cfg) {
    log({ route: 'photos', ms: Date.now() - started, status: 500, err: 'config' });
    return fail(500, 'config', '서버 설정 오류입니다.', cors);
  }
  cfg = { ...cfg, timeoutMs: MODEL_TIMEOUT_MS };

  /* 묶음마다 하루 한도를 하나씩. 하나도 못 받으면 429 */
  const batches = Math.ceil(items.length / PHOTO_BATCH);
  let calls = 0;
  while (calls < batches && takeDailyCall(cfg.dailyLimit)) calls += 1;
  if (!calls) {
    log({ route: 'photos', ms: Date.now() - started, status: 429, err: 'limit' });
    return fail(429, 'limit', MESSAGES.limit, cors);
  }

  const h = await findPhotoHints(callModel, cfg, eq, items, parseModelJson, calls);
  const out = await attachImages({ items }, { budgetMs: DEADLINE_MS - (Date.now() - started), eqName: eq.name, hints: h.hints });
  const images = {};
  out.items.forEach((it) => { if (it.image) images[it.id] = it.image; });
  const n = Object.keys(images).length;

  /* 질문이 전부 실패하고 사진도 하나 없으면 실패로 알린다 (일부 실패는 있는 것만 돌려준다) */
  const errs = h.error ? h.error.split(',') : [];
  if (!n && errs.length === h.calls) {
    const r = { error: MESSAGES[errs[0]] ? errs[0] : 'model' };
    const f = modelFail(r, cors, MESSAGES);
    log({ route: 'photos', ms: Date.now() - started, status: f.status, err: r.error });
    return f.response;
  }

  log({
    route: 'photos', ms: Date.now() - started, status: 200, err: h.error || '', n: items.length, calls: h.calls, img: n,
    video: Object.values(images).filter((i) => i.kind === 'video').length,
  });
  return json(200, { equipment: { id: eq.id, kind: eq.kind }, images }, cors);
}

export const handle = withDb('photos', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (research.mjs 와 같다) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
