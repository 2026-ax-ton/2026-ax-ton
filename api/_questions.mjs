/* 위험요소 → 평가문항 자동 생성·선정 (2026-11-11 요청 「AI 가 문항 수·유형·난이도를 정하고 담당자는 검토·승인·발급만」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.
   바깥을 부르지 않는 순수 계산만 둔다 — 같은 입력이면 같은 결과다 (검사가 고정한다).

   ★ 규칙의 원본은 docs/documentations/20_기술명세/SAFETY_QUESTION_GENERATION_RULES.md 다.
     아래 RULES 는 그 문서 §11 json 블록과 같아야 한다 — tests/test-rules-md.mjs 가 맞춰 본다.
     알고리즘(§7)·검증(§8)·제외 이유 이름(§9.1)·발급 막기(§9.4)도 문서 그대로다. 규칙을 고칠 때는 문서를 먼저 고친다.

   넘지 않는 선
     · 정답은 검수 문구가 맞으면 그 문구를 그대로 쓴다 (answerFrom 'phrase:<id>'). 아니면 AI 가 쓴 것이고
       aiWritten 으로 표시해 담당자가 검토·승인한다 (사용자 결정 2026-11-11)
     · AI 는 칸마다 문장 후보만 쓴다. 고르고 버리는 것은 코드다
     · 좌표를 지어내지 않는다 — 위치 문항은 사진 위치 찾기(/api/hazards)가 준 좌표가 있을 때만
     · AI 가 준 글은 믿을 수 없는 문자열이다. 여기서 HTML 을 만들지 않는다 */

/* SAFETY_QUESTION_GENERATION_RULES.md §11 */
export const RULES = {
  version: '2026-11-22',
  count: {
    min: 3, max: 8, perHazardMax: 2,
    /* §12.3 교육 종류별 최소·최대 — 키는 src/assets/curriculum.js TRAININGS id. 종류가 없으면 위 min·max */
    byKind: {
      'daily-hire': { min: 3, max: 6 },
      'job-change': { min: 3, max: 8 },
      special: { min: 6, max: 12 },
      regular: { min: 3, max: 8 },
    },
  },
  /* §12.3 지난 회차 첫 시도 오답 위험을 먼저 내는 교육 종류 */
  missedFirstKinds: ['regular'],
  /* §12.5 유형 섞기 — 넘으면 담당자 화면 경고만 (발급은 막지 않는다). 계획(plan.mix)에 실어 화면이 다시 만든 뒤에도 센다
     textOnlyMax 글 보기만 있는 문항 비율 상한 · oxMax OX 문항 수 상한 · sameTypeRunMax 같은 유형이 잇따라도 되는 수 */
  mix: { textOnlyMax: 0.4, oxMax: 1, sameTypeRunMax: 3 },
  typeMix: { location: 0.4, action: 0.3, ox: 0.1, situation: 0.2 },
  difficulty: { easy: 0.5, medium: 0.3, hard: 0.2 },
  weights: { official: 3, specific: 2, general: 1 },
  severity: { pinch: 3, shock: 3, fire: 3, fall: 3, choke: 3, chemical: 2, unknown: 1 },
  requiredTopics: ['hazard', 'prevention', 'emergency'],
  options: { min: 2, max: 4, lengthRatioMax: 2 },
  duplicateMaxOverlap: 0.6,
  bannedPhrases: ['모두 정답', '모두 맞', '모두 틀', '위의 모든', '보기 모두', '정답 없음', '아닌 것은', '않은 것은', '틀린 것은', '무조건', '면책', '책임지지'],
};

export const TYPES = ['location', 'action', 'ox', 'situation'];
/* §4.1 유형 → 주제, §4.3 유형 → 난이도 */
export const TOPIC_OF = { location: 'hazard', ox: 'hazard', action: 'prevention', situation: 'emergency' };
export const LEVEL_OF = { location: 'easy', ox: 'easy', action: 'medium', situation: 'hard' };
const TIE = ['location', 'action', 'situation', 'ox'];      // §4.2 소수 부분이 같을 때 순서
const FILL = ['action', 'situation', 'ox'];                  // §7 ⑤-2 나머지 칸 순서 (location 다음)
export const LIMITS = { prompt: 160, option: 80, why: 200, prevention: 160, part: 40, risk: 160, title: 120 };
const OX = ['O (맞다)', 'X (틀리다)'];
const DISCLAIM = ['면책', '책임지지'];

/* ── 입력 다듬기 ─────────────────────────────────────────────────────── */

function clip(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
const ID = /^[A-Za-z0-9_-]{1,20}$/;

/** 화면이 보낸 위험요소 — 모양이 틀린 것은 버린다 */
export function cleanHazards(list, hazardCodes) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map((h) => {
    if (!h || !ID.test(String(h.id)) || !clip(h.part, LIMITS.part)) return null;
    const a = h.answer;
    const ans = a && typeof a.x === 'number' && typeof a.y === 'number' && a.x >= 0 && a.x <= 100 && a.y >= 0 && a.y <= 100
      ? { x: a.x, y: a.y, r: typeof a.r === 'number' ? a.r : 10 } : null;
    return {
      id: String(h.id),
      part: clip(h.part, LIMITS.part),
      hazard: hazardCodes.indexOf(h.hazard) !== -1 ? h.hazard : 'unknown',
      risk: clip(h.risk, LIMITS.risk),
      official: h.official && typeof h.official === 'object' ? { code: clip(h.official.code, 40), section: clip(h.official.section, 40) } : null,
      specific: h.specific === true,
      sources: (Array.isArray(h.sources) ? h.sources : []).slice(0, 5)
        .filter((s) => s && /^https?:\/\//i.test(String(s.url)))
        .map((s) => ({ title: clip(s.title, LIMITS.title), url: String(s.url).slice(0, 500), host: clip(s.host, 80) })),
      answer: ans,
      /* 🆕 2026-11-22 지난 회차 첫 시도에 이 위험의 문항을 틀린 사람 수 (화면이 progress 에서 센다, §12.3 정기교육) */
      missed: Number.isInteger(h.missed) && h.missed > 0 ? Math.min(h.missed, 9999) : 0,
    };
  }).filter(Boolean);
}

export function cleanPhrases(list) {
  return (Array.isArray(list) ? list : []).slice(0, 60)
    .filter((p) => p && ID.test(String(p.id)) && clip(p.ko, 200))
    .map((p) => ({ id: String(p.id), ko: clip(p.ko, 200) }));
}

/* ── 글자 2-gram 자카드 (§9.2) ───────────────────────────────────────── */

function norm(t) { return String(t || '').toLowerCase().replace(/[\s.,!?·~"'“”‘’()[\]{}:;/-]/g, ''); }
function grams(t) {
  const s = norm(t);
  const g = new Set();
  for (let i = 0; i < s.length - 1; i += 1) g.add(s.substr(i, 2));
  return g;
}
/** 자카드 유사도 |A∩B| ÷ |A∪B| */
export function similarity(a, b) {
  const ga = grams(a), gb = grams(b);
  if (!ga.size && !gb.size) return 0;
  let n = 0;
  ga.forEach((k) => { if (gb.has(k)) n += 1; });
  return n / (ga.size + gb.size - n);
}

/* ── 1단계 계획 (§7 ①~⑦) ─────────────────────────────────────────────── */

export function tierOf(h) { return h.official ? 'official' : h.specific ? 'specific' : 'general'; }
export function scoreOf(h, rules = RULES) { return (rules.severity[h.hazard] || rules.severity.unknown) * rules.weights[tierOf(h)]; }

/** ① 같은 위험유형이고 부위 이름이 겹치면 하나로 — 출처 등급이 높은 쪽을 남기고 좌표는 있는 쪽 것을 옮긴다 */
export function mergeHazards(hazards, rules = RULES) {
  const out = [];
  const rank = (h) => rules.weights[tierOf(h)];
  hazards.forEach((h) => {
    const at = out.findIndex((o) => o.hazard === h.hazard && similarity(o.part, h.part) > rules.duplicateMaxOverlap);
    if (at === -1) { out.push({ ...h }); return; }
    const same = out[at];
    const keep = rank(h) > rank(same) ? { ...h } : same;
    if (!keep.answer) keep.answer = same.answer || h.answer;
    keep.missed = (same.missed || 0) + (h.missed || 0);
    keep.merged = (same.merged || []).concat(keep === same ? h.id : same.id);
    out[at] = keep;
  });
  return out;
}

/** §4.2 최대 나머지 방식 — 소수 부분이 같으면 location → action → situation → ox */
export function quotas(n, mix) {
  const q = {};
  TIE.forEach((t) => { q[t] = Math.floor((mix[t] || 0) * n + 1e-9); });
  let left = n - TIE.reduce((a, t) => a + q[t], 0);
  TIE.map((t, i) => [t, (mix[t] || 0) * n - q[t], i]).sort((a, b) => (b[1] - a[1] > 1e-9 ? 1 : a[1] - b[1] > 1e-9 ? -1 : a[2] - b[2]))
    .forEach(([t]) => { if (left > 0) { q[t] += 1; left -= 1; } });
  return q;
}

/** §12.3 교육 종류 → { kind, min, max }. 모르는 종류면 기본값 (kind '') */
export function countRange(eduKind, rules = RULES) {
  const by = rules.count.byKind || {};
  const k = typeof eduKind === 'string' && Object.prototype.hasOwnProperty.call(by, eduKind) ? eduKind : '';
  const r = k ? by[k] : rules.count;
  return { kind: k, min: r.min, max: r.max };
}

/** 어느 교육 종류에서도 넘지 않는 문항 수 (다시 만들기 요청 칸 수 상한) */
export function maxCount(rules = RULES) {
  return Object.values(rules.count.byKind || {}).reduce((m, r) => Math.max(m, r.max), rules.count.max);
}

/** §3.2 · §12.3 — 위험요소마다 위치 1 + 바른 행동 1 (perHazardMax), 교육 종류의 최대까지 */
export function countFor(h, rules = RULES, eduKind = '') {
  if (h <= 0) return 0;
  return Math.min(countRange(eduKind, rules).max, h * rules.count.perHazardMax);
}

/** 문항 계획 — { count, eduKind, min, max, slots:[{ slot, hazardId, type, difficulty, required, topic }], reasons, warnings, rulesVersion, hazards(합친 뒤) } */
export function planQuiz(input, rules = RULES, eduKind = '') {
  const hazards = mergeHazards(input, rules);
  const reasons = [];
  const range = countRange(eduKind, rules);
  const N = countFor(hazards.length, rules, range.kind);
  const base = { eduKind: range.kind, min: range.min, max: range.max, mix: rules.mix, rulesVersion: rules.version, hazards };
  if (!N) return { count: 0, slots: [], reasons: ['위험요소가 없어 문항을 만들지 않습니다'], warnings: [], ...base };
  /* §12.3 위험요소가 적어 그 교육의 최소에 못 미치면 경고만 — 발급 막기는 §9.4 (최소와 N 중 작은 값) */
  const warnings = N < range.min ? ['위험요소가 ' + hazards.length + '개라 문항이 ' + N + '개입니다 (이 교육의 최소 ' + range.min + '개) — 위험요소 조사를 보강하세요'] : [];
  if (hazards.length < input.length) reasons.push('부위가 겹치는 위험 ' + (input.length - hazards.length) + '개를 합쳤습니다');

  /* ② 점수 내림차순 → 공식 먼저 → 좌표 있는 것 먼저 → 입력 순서.
     🆕 §12.3 정기교육(missedFirstKinds)은 그 앞에 「지난 첫 시도에 틀린 사람이 많은 위험」 — 공식 위험의 필수 칸(④)은 그대로 */
  const missedFirst = (rules.missedFirstKinds || []).indexOf(range.kind) !== -1;
  const miss = (h) => (missedFirst ? h.missed || 0 : 0);
  const ranked = hazards.map((h, i) => ({ h, i, s: scoreOf(h, rules) }))
    .sort((a, b) => miss(b.h) - miss(a.h) || b.s - a.s || (b.h.official ? 1 : 0) - (a.h.official ? 1 : 0) || (b.h.answer ? 1 : 0) - (a.h.answer ? 1 : 0) || a.i - b.i)
    .map((r) => r.h);
  reasons.push('위험 ' + hazards.length + '개 → ' + N + '문항 (규칙' + (range.kind ? ' ' + range.kind : '') + ': 최소 ' + range.min + ' · 최대 ' + range.max + ' · 위험당 ' + rules.count.perHazardMax + ')');
  const missedN = hazards.filter((h) => miss(h) > 0).length;
  if (missedN) reasons.push('지난 회차 첫 시도에 틀린 위험 ' + missedN + '개를 먼저 넣었습니다');

  /* ④ 칸 배정 — 공식은 위치 몫을 남기고 먼저, 나머지 위험당 1칸, 남으면 둘째 칸 */
  const q = quotas(N, rules.typeMix);
  const L = ranked.some((h) => h.answer) ? q.location : 0;
  const req = [];
  const rest = [];
  const taken = {};
  ranked.filter((h) => h.official).forEach((h) => { if (req.length < N - L) { req.push(h); taken[h.id] = 1; } });
  ranked.forEach((h) => { if (!taken[h.id] && req.length + rest.length < N) { rest.push(h); taken[h.id] = 1; } });
  for (let round = 2; req.length + rest.length < N && round <= rules.count.perHazardMax; round += 1) {
    ranked.forEach((h) => { if (req.length + rest.length < N && (taken[h.id] || 0) < round) { rest.push(h); taken[h.id] = round; } });
  }
  const dropped = hazards.length - Object.keys(taken).length;
  if (dropped > 0) reasons.push('점수가 낮은 위험 ' + dropped + '개는 문항에서 뺐습니다 (교육 자료로는 남습니다)');
  const slots = req.map((h) => ({ h, required: true })).concat(rest.map((h) => ({ h, required: false })))
    .map((o, k) => ({ slot: k + 1, hazardId: o.h.id, type: '', difficulty: '', required: o.required, topic: '', _h: o.h }));

  /* ⑤ 유형 — 필수 주제 먼저(몫보다 앞선다), 그다음 몫대로. 같은 위험의 두 칸은 유형이 달라야 한다 */
  const use = (t) => { if (q[t] > 0) q[t] -= 1; };
  const topics = rules.requiredTopics.slice(0, N);
  const untyped = () => slots.filter((s) => !s.type);
  if (topics.indexOf('hazard') !== -1) {
    const s = slots.find((x) => x._h.answer) || slots[0];
    s.type = s._h.answer ? 'location' : 'ox';
    use(s.type);
  }
  if (topics.indexOf('prevention') !== -1 && untyped().length) { const s = untyped()[0]; s.type = 'action'; use('action'); }
  if (topics.indexOf('emergency') !== -1 && untyped().length) {
    const top = Math.max(...untyped().map((x) => rules.severity[x._h.hazard] || 0));
    const s = untyped().find((x) => (rules.severity[x._h.hazard] || 0) === top);
    s.type = 'situation'; use('situation');
  }
  slots.forEach((s) => {
    if (s.type) return;
    const other = slots.filter((x) => x !== s && x.hazardId === s.hazardId && x.type).map((x) => x.type);
    const order = [];
    if (s._h.answer && q.location > 0) order.push('location');
    FILL.forEach((t) => { if (q[t] > 0) order.push(t); });
    order.push('action', 'situation', 'ox');
    s.type = order.find((t) => other.indexOf(t) === -1) || 'action';
    use(s.type);
  });

  /* ⑥ 난이도 · ⑦ 기록 */
  slots.forEach((s) => { s.difficulty = LEVEL_OF[s.type]; s.topic = TOPIC_OF[s.type]; delete s._h; });
  return { count: N, slots, reasons, warnings, ...base };
}

/* ── 2단계 지시문 ─────────────────────────────────────────────────────── */

export function systemText(rules = RULES) {
  return '너는 산업안전 교육 평가문항 출제자다. 글을 잘 못 읽는 이주노동자가 음성으로 듣고 푸는 문항을 만든다.\n'
    + '규칙:\n'
    + '1) 칸(slot)마다 문항 후보를 2개 쓴다. 칸의 위험요소·유형·난이도를 지킨다. 문항은 그 위험요소의 내용으로만 만든다.\n'
    + '2) 유형: action = 「○○할 때 어떻게 합니까」 올바른 예방 행동 고르기 (선택지 3개), '
    + 'situation = 「작업 중 ○○가 일어났습니다. 먼저 무엇을 합니까」 이상 상황에서 먼저 할 일 고르기 (선택지 3개), '
    + 'ox = 위험에 대한 사실 한 문장 (statement 와 truth 만 쓴다). 문장은 애매하지 않게 절대적으로 맞거나 틀려야 한다.\n'
    + '3) 정답은 하나뿐이다. 오답은 그 위험에서 노동자가 실제로 하기 쉬운 잘못된 행동으로 쓴다. 「모두 정답」·「위의 모든」 같은 선택지, 「아닌 것은」·「틀린 것은」 같은 부정 발문, 「무조건」 같은 절대어를 쓰지 않는다.\n'
    + '4) 선택지 길이를 비슷하게 맞춘다 (가장 긴 것이 가장 짧은 것의 ' + rules.options.lengthRatioMax + '배를 넘지 않게). 정답만 길거나 자세하면 안 된다.\n'
    + '5) 검수 문구 목록에 이 칸의 정답과 뜻이 같은 문구가 있으면 answerPhraseId 에 그 id 를 쓰고 정답 선택지에 그 문구를 그대로 쓴다.\n'
    /* 2026-11-11 실측 — action 발문을 「~합니다. 어떻게 합니까?」 두 문장으로 써서 필수 칸이 비었다 → 한 문장 예를 준다 */
    + '6) 발문 문장 수: action·ox 는 반드시 한 문장이다 — 「가드를 연 뒤 작업을 다시 시작할 때 어떻게 합니까?」처럼 상황과 질문을 한 문장에 넣고 마침표로 나누지 않는다. '
    + 'situation 만 장면 한 문장 + 질문 한 문장까지. why 는 정답 해설 한두 문장, prevention 은 관련 안전수칙·예방조치 한 문장.\n'
    + '7) 근거는 그 위험요소의 출처에 있는 내용만 쓴다. 출처에 없는 수치·법 조항을 지어내지 않는다. sourceUrls 에는 그 위험요소 출처 주소만 쓴다.\n'
    + '8) 「면책」·「책임지지」라는 말을 쓰지 않는다. 쉬운 한국어로 쓴다 (발문 ' + LIMITS.prompt + '자, 선택지 ' + LIMITS.option + '자 이내).\n'
    + '9) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"questions": [{"slot": 1, "hazardId": "r1", "type": "action", "prompt": "...", "options": ["...", "...", "..."], "answer": 0, '
    + '"answerPhraseId": "", "why": "...", "prevention": "...", "sourceUrls": ["https://..."]}, '
    + '{"slot": 2, "hazardId": "o1", "type": "ox", "statement": "...", "truth": false, "why": "...", "prevention": "...", "sourceUrls": []}]}';
}

export function userText(eq, hazards, slots, phrases) {
  const byId = new Map(hazards.map((h) => [h.id, h]));
  const lines = ['설비: ' + clip(eq && eq.name, 60), '', '위험요소:'];
  const used = new Set(slots.map((s) => s.hazardId));
  hazards.filter((h) => used.has(h.id)).forEach((h) => {
    lines.push('- ' + h.id + ' | ' + h.part + ' | ' + h.hazard + ' | ' + h.risk
      + (h.official ? ' | 공식 문서 ' + h.official.code + ' ' + h.official.section : '')
      + (h.sources.length ? ' | 출처: ' + h.sources.map((s) => s.url).join(' , ') : ''));
  });
  lines.push('', '만들 칸:');
  slots.forEach((s) => lines.push('- slot ' + s.slot + ': hazardId ' + s.hazardId + ' (' + (byId.get(s.hazardId) || {}).part + '), type ' + s.type + ', 난이도 ' + s.difficulty));
  lines.push('', '검수 문구 (정답으로 쓸 수 있는 것):');
  if (!phrases.length) lines.push('- (없음)');
  phrases.forEach((p) => lines.push('- ' + p.id + ': ' + p.ko));
  return lines.join('\n');
}

/* ── 검증 (§8 · 제외 이유 이름은 §9.1) ────────────────────────────────── */

/** 문장 수 — 문장 끝(. ? ! 또는 「~다·~요·~까」 뒤 공백)을 센다 */
function sentences(t) {
  const s = String(t).trim().replace(/[.?!。？！]+$/, '');
  return 1 + (s.match(/(?:[.?!。？！]|니다|어요|에요|세요|니까|까요)\s+(?=\S)/g) || []).length;
}
function hasAny(text, list) { return list.filter((b) => text.indexOf(b) !== -1); }

/** 모델 후보 하나 → { reasons, warnings, q } */
export function normalizeCandidate(c, slot, hazard, phrases, rules = RULES) {
  const reasons = [];
  const warnings = [];
  if (!c || typeof c !== 'object') return { reasons: ['선택지 수 (모양이 틀림)'], warnings };
  if (c.hazardId !== slot.hazardId) reasons.push('다른 위험요소');
  let prompt, options, answer, answerFrom = 'ai', phraseAt = -1;
  if (slot.type === 'ox') {
    prompt = clip(c.statement || c.prompt, LIMITS.prompt);
    if (typeof c.truth !== 'boolean') reasons.push('정답 번호 (OX 참·거짓이 없음)');
    options = OX.slice();
    answer = c.truth === false ? 1 : 0;
  } else {
    prompt = clip(c.prompt, LIMITS.prompt);
    options = (Array.isArray(c.options) ? c.options : []).map((o) => clip(o, LIMITS.option));
    answer = Number.isInteger(c.answer) ? c.answer : -1;
    if (options.length < rules.options.min || options.length > rules.options.max || options.some((o) => !o)) reasons.push('선택지 수 (' + options.length + '개)');
    if (answer < 0 || answer >= options.length) reasons.push('정답 번호');
    const ph = c.answerPhraseId ? phrases.find((p) => p.id === c.answerPhraseId) : null;
    if (ph && answer >= 0 && answer < options.length) { options[answer] = clip(ph.ko, LIMITS.option); answerFrom = 'phrase:' + ph.id; phraseAt = answer; }
    if (new Set(options.map(norm)).size !== options.length) reasons.push('같은 선택지');
    const lens = options.map((o) => o.replace(/\s/g, '').length).filter(Boolean);
    if (lens.length > 1 && Math.max(...lens) / Math.min(...lens) > rules.options.lengthRatioMax) reasons.push('길이 쏠림');
    if (options.length >= 3 && answer >= 0 && answer < options.length) {
      const L = options.map((o) => o.replace(/\s/g, '').length);
      if (L[answer] === Math.max(...L) && L.filter((x) => x === L[answer]).length === 1) warnings.push('정답만 가장 김');
    }
  }
  if (!prompt) reasons.push('발문 문장 (비어 있음)');
  else if (sentences(prompt) > (slot.type === 'situation' ? 2 : 1)) reasons.push('발문 문장');
  const why = clip(c.why, LIMITS.why);
  const prevention = clip(c.prevention, LIMITS.prevention);
  if (!why) reasons.push('해설 없음');
  /* 금지어 — 노동자에게 보이는 글 전부. 검수 문구에서 그대로 온 정답 선택지는 사람이 이미 검수해 보지 않는다 */
  const shown = [prompt, why, prevention].concat(options.filter((_, i) => i !== phraseAt)).join(' ');
  const disc = hasAny(shown, DISCLAIM);
  if (disc.length) reasons.push('면책 (「' + disc.join('」 「') + '」)');
  const banned = hasAny(shown, rules.bannedPhrases.filter((b) => DISCLAIM.indexOf(b) === -1));
  if (banned.length) reasons.push('금지어 (「' + banned.join('」 「') + '」)');
  const own = new Map(hazard.sources.map((s) => [s.url, s]));
  const refs = (Array.isArray(c.sourceUrls) ? c.sourceUrls : []).map(String).filter((u) => own.has(u)).map((u) => own.get(u));
  return {
    reasons, warnings,
    q: { prompt, options, answer, why, prevention, answerFrom, sources: (refs.length ? refs : hazard.sources).map((s) => ({ title: s.title, url: s.url })) },
  };
}

/* ── 3단계 선정 (§7 ⑧~⑪) ────────────────────────────────────────────── */

export function evidenceOf(h) {
  return [h.official ? '공식 문서 ' + h.official.code + ' ' + h.official.section : '',
    h.sources.length ? '출처 ' + h.sources.length + '곳 (' + Array.from(new Set(h.sources.map((s) => s.host).filter(Boolean))).join(', ') + ')' : '',
    h.answer ? '설비 사진에서 위치 확인' : '사진 위치 없음'].filter(Boolean).join(' · ');
}

/** ⑨ 정답 자리 = (slot − 1) mod k — 칸마다 돌린다 (S19 지침 20). ox 는 참 0 · 거짓 1 그대로 */
function placeAnswer(q, slotNo) {
  if (q.options.length === 2 && q.options[0] === OX[0]) return q;
  const at = (slotNo - 1) % q.options.length;
  const opts = q.options.slice();
  const right = opts.splice(q.answer, 1)[0];
  opts.splice(at, 0, right);
  return { ...q, options: opts, answer: at };
}

/** §9.2 중복 — 발문 자카드 > 0.6, 또는 같은 위험요소에 같은 정답 */
function duplicateOf(quiz, item, rules) {
  return quiz.find((q) => similarity(q.prompt, item.prompt) > rules.duplicateMaxOverlap
    || (q.hazardId === item.hazardId && q.options && item.options && norm(q.options[q.answer]) === norm(item.options[item.answer])));
}

/** §9.4 발급 막기 — 이유가 하나라도 있으면 담당자는 승인·발급할 수 없다 */
export function issuable(plan, quiz, missing, rules = RULES) {
  const why = [];
  if (!plan.count) why.push('위험요소가 없어 문항이 없습니다');
  const least = Math.min(typeof plan.min === 'number' ? plan.min : rules.count.min, plan.count);
  if (quiz.length < least) why.push('채운 문항이 ' + quiz.length + '개로 최소 ' + least + '개보다 적습니다');
  const reqMissing = plan.slots.filter((s) => s.required && missing.indexOf(s.slot) !== -1);
  if (reqMissing.length) why.push('필수(공식 문서) 칸 ' + reqMissing.map((s) => s.slot).join(', ') + '이(가) 비었습니다');
  const need = rules.requiredTopics.slice(0, plan.count);
  const have = new Set(quiz.map((q) => TOPIC_OF[q.subtype]));
  const lack = need.filter((t) => !have.has(t));
  if (lack.length) why.push('필수 주제가 빠졌습니다: ' + lack.join(', '));
  return { ok: !why.length, why };
}

/** 계획 + 모델 후보 → { quiz, excluded:[{slot, hazardId, prompt, why[]}], missing:[slot], issuable } */
export function selectQuiz(plan, hazards, raw, phrases, rules = RULES) {
  const byId = new Map((plan.hazards || hazards).map((h) => [h.id, h]));
  const cands = raw && Array.isArray(raw.questions) ? raw.questions : [];
  const quiz = [];
  const excluded = [];
  const missing = [];
  plan.slots.forEach((s) => {
    const h = byId.get(s.hazardId);
    let made = null;
    let alt = null;
    if (!h) { missing.push(s.slot); return; }
    if (s.type === 'location') {
      made = { prompt: '사진에서 「' + h.part + '」을(를) 누르세요', answer: { ...h.answer }, why: h.risk || h.part, prevention: '', answerFrom: 'photo', warnings: [],
        sources: h.sources.map((x) => ({ title: x.title, url: x.url })) };
    } else {
      cands.filter((c) => c && Number(c.slot) === s.slot).forEach((c) => {
        if (alt) return;
        const n = normalizeCandidate(c, s, h, phrases, rules);
        if (made) {
          /* 🆕 §12.8 · §12.9 ⑧ 다시 풀기용 대체 문항 — 같은 칸(위험·주제·유형)에서 검증을 통과한 **다음** 후보 하나.
             같은 목표라 정답이 같아도 되지만, 발문은 본 문항·앞 문항들과 겹치지 않아야 한다. 떨어진 것은 제외 목록에 남기지 않는다 */
          if (n.reasons.length) return;
          const p2 = placeAnswer(n.q, s.slot + 1);
          const near = similarity(p2.prompt, made.prompt) > rules.duplicateMaxOverlap
            || quiz.some((x) => similarity(x.prompt, p2.prompt) > rules.duplicateMaxOverlap);
          if (!near) alt = { ...p2, warnings: n.warnings };
          return;
        }
        if (!n.reasons.length) {
          const placed = placeAnswer(n.q, s.slot);
          const dup = duplicateOf(quiz, { ...placed, hazardId: h.id }, rules);
          if (dup) n.reasons.push('중복 (' + dup.id + ')');
          else { made = { ...placed, warnings: n.warnings }; return; }
        }
        excluded.push({ slot: s.slot, hazardId: s.hazardId, prompt: (n.q && n.q.prompt) || '', why: n.reasons });
      });
    }
    if (!made) { missing.push(s.slot); return; }
    const item = itemOf('q' + (quiz.length + 1), s, h, made);
    if (alt) item.alt = [{ ...itemOf(item.id + '-alt', s, h, alt), variantOf: item.id }];
    quiz.push(item);
  });
  return { quiz, excluded, missing, issuable: issuable(plan, quiz, missing, rules) };
}

/** 고른 후보 → 노동자 화면이 읽는 문항 모양 (본 문항·대체 문항 같은 모양) */
function itemOf(id, s, h, made) {
  const item = {
    id,
    slot: s.slot,   // 다시 만들기가 같은 칸을 갈아 끼울 때 쓴다 (발급 때 뗀다)
    type: s.type === 'location' ? 'hotspot' : 'choice',
    subtype: s.type,
    topic: TOPIC_OF[s.type],
    hazard: h.hazard === 'unknown' ? '' : h.hazard,
    hazardId: h.id,
    difficulty: s.difficulty,
    prompt: made.prompt,
    why: made.why,
    prevention: made.prevention,
    sources: made.sources,
    evidence: evidenceOf(h),
    answerFrom: made.answerFrom,
    aiWritten: s.type !== 'location',
    warnings: made.warnings,
    i18n: {},
  };
  if (item.type === 'hotspot') { item.answer = made.answer; item.figure = 'photo'; }
  else {
    item.options = made.options;
    item.answer = made.answer;
    /* ⑩ 오답을 고르면 그 위험요소의 risk 를 들려준다, 정답이면 해설 */
    item.results = made.options.map((_, i) => (i === made.answer ? made.why : (h.risk || made.why)));
  }
  return item;
}

/** 이 칸들은 AI 가 필요 없나 (전부 위치 문항) */
export function needsModel(slots) { return slots.some((s) => s.type !== 'location'); }
