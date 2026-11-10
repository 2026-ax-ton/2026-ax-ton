/* 위험요소 → 평가문항 자동 생성·선정 (2026-11-11 요청 「AI 가 문항 수·유형·난이도를 정하고 담당자는 검토·승인·발급만」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.
   바깥을 부르지 않는 순수 계산만 둔다 — 같은 입력이면 같은 결과다 (검사가 고정한다).

   규칙의 원본은 docs/documentations/20_기술명세/SAFETY_QUESTION_GENERATION_RULES.md 의 json 블록이다.
   아래 RULES 는 그것과 같아야 한다 — tests/test-rules-md.mjs 가 맞춰 본다. 규칙을 고칠 때는 문서를 먼저 고친다.

   흐름
     ① planQuiz      — 위험요소마다 가중치(공식 문서 > 기계 고유 > 일반 × 위험유형 중대성)를 매겨
                        문항 수·위험별 배분·유형·난이도를 정한다 (코드, 결정적)
     ② generate      — 사진 위치가 있는 칸은 코드가 위치 문항을 만든다. 나머지 칸은 AI 에게 칸마다 후보 2개를 받는다
     ③ validate      — 모양·선택지 수·정답 하나·금지어·선택지 길이 균형·중복·출처를 코드가 본다. 떨어지면 이유를 남긴다
     ④ selectQuiz    — 칸마다 통과한 첫 후보. 정답 자리는 칸 번호로 돌려 한쪽에 몰리지 않게 한다

   넘지 않는 선
     · 정답은 검수 문구가 맞으면 그 문구를 그대로 쓴다 (answerFrom 'phrase:<id>'). 아니면 AI 가 쓴 것이고
       aiWritten 으로 표시해 담당자가 검토·승인한다 (사용자 결정 2026-11-11)
     · AI 가 준 글은 믿을 수 없는 문자열이다. 여기서 HTML 을 만들지 않는다
     · 좌표를 지어내지 않는다 — 위치 문항은 사진 위치 찾기(/api/hazards)가 준 좌표가 있을 때만 */

/* ★ 임시 값 — 규칙 문서(SAFETY_QUESTION_GENERATION_RULES.md)의 json 블록으로 바꾼다 */
export const RULES = {
  version: '2026-11-11',
  count: { min: 5, max: 12, perHazardMax: 2 },
  typeMix: { location: 0.4, action: 0.3, ox: 0.15, situation: 0.15 },
  difficulty: { easy: 0.3, medium: 0.5, hard: 0.2 },
  weights: { official: 3, specific: 2, general: 1 },
  severity: { pinch: 3, shock: 3, fire: 2, fall: 3, choke: 3, chemical: 2, unknown: 1 },
  requiredTopics: ['official'],
  options: { min: 2, max: 4, lengthRatioMax: 2.5 },
  duplicateMaxOverlap: 0.6,
  bannedPhrases: ['면책', '모두 정답', '모두 맞다', '위의 것 모두', '모두 틀리다', '정답 없음'],
};

export const TYPES = ['location', 'action', 'ox', 'situation'];
export const LIMITS = { prompt: 160, option: 80, why: 200, prevention: 160, part: 40, risk: 160, title: 120 };
const OX = ['O (맞다)', 'X (틀리다)'];

/* ── 입력 다듬기 ─────────────────────────────────────────────────────── */

function clip(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
const ID = /^[A-Za-z0-9_-]{1,20}$/;

/** 화면이 보낸 위험요소 — 모양이 틀린 것은 버린다 */
export function cleanHazards(list, hazardCodes) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map((h) => {
    if (!h || !ID.test(String(h.id)) || !clip(h.part, LIMITS.part)) return null;
    const box = h.answer && typeof h.answer.x === 'number' && typeof h.answer.y === 'number'
      ? { x: +h.answer.x, y: +h.answer.y, r: +h.answer.r || 10 } : null;
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
      answer: box && box.x >= 0 && box.x <= 100 && box.y >= 0 && box.y <= 100 ? box : null,
    };
  }).filter(Boolean);
}

export function cleanPhrases(list) {
  return (Array.isArray(list) ? list : []).slice(0, 60)
    .filter((p) => p && ID.test(String(p.id)) && clip(p.ko, 200))
    .map((p) => ({ id: String(p.id), ko: clip(p.ko, 200) }));
}

/* ── ① 계획 ──────────────────────────────────────────────────────────── */

export function tierOf(h) { return h.official ? 'official' : h.specific ? 'specific' : 'general'; }
export function scoreOf(h, rules = RULES) { return (rules.weights[tierOf(h)] || 1) * (rules.severity[h.hazard] || rules.severity.unknown || 1); }

/** 몫을 비율대로 나눈다 (큰 나머지 순) — 같은 입력이면 같은 결과 */
function apportion(n, mix) {
  const keys = Object.keys(mix);
  const raw = keys.map((k) => n * mix[k]);
  const out = {};
  keys.forEach((k, i) => { out[k] = Math.floor(raw[i]); });
  let left = n - keys.reduce((a, k) => a + out[k], 0);
  keys.map((k, i) => [k, raw[i] - Math.floor(raw[i]), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2])
    .forEach(([k]) => { if (left > 0) { out[k] += 1; left -= 1; } });
  return out;
}

/** 문항 계획 — { count, slots:[{ slot, hazardId, type, difficulty, required }], reasons } */
export function planQuiz(hazards, rules = RULES) {
  const reasons = [];
  if (!hazards.length) return { count: 0, slots: [], reasons: ['위험요소가 없어 문항을 만들 수 없습니다'] };
  const ranked = hazards.map((h, i) => ({ h, i, s: scoreOf(h, rules) }))
    .sort((a, b) => (b.h.official ? 1 : 0) - (a.h.official ? 1 : 0) || b.s - a.s || a.i - b.i);
  const required = ranked.filter((r) => r.h.official && rules.requiredTopics.indexOf('official') !== -1);
  /* 위험 수만큼(최소~최대 사이), 위험이 적으면 위험당 최대 문항까지. 필수 위험은 반드시 칸을 받는다 */
  let count = Math.min(rules.count.max, Math.max(rules.count.min, hazards.length), hazards.length * rules.count.perHazardMax);
  count = Math.max(count, Math.min(required.length, rules.count.max));
  reasons.push('위험요소 ' + hazards.length + '개 → 문항 ' + count + '개 (규칙: 최소 ' + rules.count.min + ' · 최대 ' + rules.count.max + ' · 위험당 최대 ' + rules.count.perHazardMax + ')');

  /* 위험마다 한 칸씩 점수 순으로, 남으면 점수 높은 위험에 둘째 칸 */
  const picks = [];
  ranked.forEach((r) => { if (picks.length < count) picks.push(r); });
  for (let round = 1; picks.length < count && round < rules.count.perHazardMax; round += 1) {
    ranked.forEach((r) => { if (picks.length < count) picks.push(r); });
  }
  const left = ranked.length - new Set(picks.map((p) => p.h.id)).size;
  if (left > 0) reasons.push('점수가 낮은 위험 ' + left + '개는 문항에서 뺐습니다 (교육 자료로는 남습니다)');

  /* 유형 — 사진 위치가 있는 위험의 첫 칸은 위치 문항(몫 안에서), 나머지는 몫이 남은 유형을 차례로 */
  const quota = apportion(count, rules.typeMix);
  const photoable = picks.filter((p, k) => p.h.answer && picks.findIndex((q) => q.h.id === p.h.id) === k).length;
  if (quota.location > photoable) {
    const spare = quota.location - photoable;
    quota.location = photoable;
    const others = apportion(spare, { action: rules.typeMix.action, situation: rules.typeMix.situation, ox: rules.typeMix.ox });
    Object.keys(others).forEach((k) => { quota[k] += others[k]; });
    reasons.push('사진 위치가 있는 위험이 ' + photoable + '개뿐이라 위치 문항 ' + spare + '개를 다른 유형으로 돌렸습니다');
  }
  const order = ['action', 'situation', 'ox'];
  const seen = {};
  const slots = picks.map((p, k) => {
    const nth = (seen[p.h.id] = (seen[p.h.id] || 0) + 1);
    let type = '';
    if (nth === 1 && p.h.answer && quota.location > 0) type = 'location';
    else {
      for (let j = 0; j < order.length && !type; j += 1) {
        const t = order[(k + j) % order.length];
        if (quota[t] > 0) type = t;
      }
      type = type || 'action';
    }
    if (quota[type] > 0) quota[type] -= 1;
    return { slot: k + 1, hazardId: p.h.id, type, difficulty: '', required: !!p.h.official && nth === 1 };
  });

  /* 난이도 — 몫대로. 위치는 쉬움부터, 상황판단은 어려움부터, 나머지는 보통 */
  const dq = apportion(count, rules.difficulty);
  const take = (d) => { if (dq[d] > 0) { dq[d] -= 1; return d; } return ''; };
  slots.forEach((s) => { s.difficulty = (s.type === 'location' && take('easy')) || (s.type === 'situation' && take('hard')) || take('medium'); });
  slots.forEach((s) => { if (!s.difficulty) s.difficulty = take('easy') || take('hard') || take('medium') || 'medium'; });
  return { count, slots, reasons, rulesVersion: rules.version };
}

/* ── ② 생성 지시문 ───────────────────────────────────────────────────── */

export function systemText(rules = RULES) {
  return '너는 산업안전 교육 평가문항 출제자다. 글을 잘 못 읽는 이주노동자가 음성으로 듣고 푸는 문항을 만든다.\n'
    + '규칙:\n'
    + '1) 칸(slot)마다 문항 후보를 2개 쓴다. 칸의 위험요소·유형·난이도를 지킨다.\n'
    + '2) 유형: action = 「어떻게 해야 하나」 올바른 행동 고르기 (선택지 3~' + rules.options.max + '개), '
    + 'situation = 작업 장면을 한두 문장으로 보여 주고 바른 판단 고르기 (선택지 3~' + rules.options.max + '개), '
    + 'ox = 맞거나 틀린 문장 하나 (statement 와 truth 만 쓴다).\n'
    + '3) 정답은 하나뿐이다. 오답은 현장에서 실제로 하기 쉬운 잘못된 행동으로 쓴다. 말이 안 되는 오답, 「모두 정답」·「위의 것 모두」 같은 선택지는 쓰지 않는다.\n'
    + '4) 선택지 길이를 비슷하게 맞춘다. 정답만 길거나 자세하면 안 된다.\n'
    + '5) 검수 문구 목록에 이 칸의 정답과 뜻이 같은 문구가 있으면 answerPhraseId 에 그 id 를 쓰고 정답 선택지에 그 문구를 그대로 쓴다.\n'
    + '6) why 는 정답 해설(왜 그런지) 한두 문장, prevention 은 관련 안전수칙·예방조치 한 문장이다.\n'
    + '7) 근거는 그 위험요소의 출처에 있는 내용만 쓴다. 출처에 없는 수치·법 조항을 지어내지 않는다. sourceUrls 에는 그 위험요소 출처 주소만 쓴다.\n'
    + '8) 「면책」이라는 말을 쓰지 않는다. 쉬운 한국어로 짧게 쓴다 (문항 ' + LIMITS.prompt + '자, 선택지 ' + LIMITS.option + '자 이내).\n'
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

/* ── ③ 검증 ──────────────────────────────────────────────────────────── */

function grams(t) {
  const s = String(t || '').replace(/[^가-힣A-Za-z0-9]/g, '');
  const g = new Set();
  for (let i = 0; i < s.length - 1; i += 1) g.add(s.substr(i, 2));
  return g;
}
/** 두 문장이 얼마나 겹치나 (0~1, 짧은 쪽 기준) */
export function overlap(a, b) {
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let n = 0;
  ga.forEach((k) => { if (gb.has(k)) n += 1; });
  return n / Math.min(ga.size, gb.size);
}

/** 모델 후보 하나를 문항 모양으로 — 틀리면 { reasons } 만 */
export function normalizeCandidate(c, slot, hazard, phrases, rules = RULES) {
  const reasons = [];
  if (!c || typeof c !== 'object') return { reasons: ['모양이 틀림'] };
  if (c.hazardId !== slot.hazardId) reasons.push('다른 위험요소를 가리킴');
  let prompt, options, answer, answerFrom = 'ai';
  if (slot.type === 'ox') {
    prompt = clip(c.statement || c.prompt, LIMITS.prompt);
    if (typeof c.truth !== 'boolean') reasons.push('OX 정답이 없음');
    options = OX.slice();
    answer = c.truth === false ? 1 : 0;
  } else {
    prompt = clip(c.prompt, LIMITS.prompt);
    options = (Array.isArray(c.options) ? c.options : []).map((o) => clip(o, LIMITS.option));
    answer = Number.isInteger(c.answer) ? c.answer : -1;
    if (options.length < Math.max(3, rules.options.min) || options.length > rules.options.max) reasons.push('선택지 수가 규칙 밖 (' + options.length + '개)');
    if (answer < 0 || answer >= options.length) reasons.push('정답 번호가 틀림');
    if (options.some((o) => !o)) reasons.push('빈 선택지');
    if (new Set(options.map((o) => o.replace(/\s/g, ''))).size !== options.length) reasons.push('같은 선택지가 둘');
    const lens = options.map((o) => o.length).filter(Boolean);
    if (lens.length && Math.max(...lens) / Math.min(...lens) > rules.options.lengthRatioMax) reasons.push('선택지 길이가 너무 다름 (정답 티가 남)');
    /* 검수 문구를 정답으로 썼다면 글자 그대로여야 한다 */
    const ph = c.answerPhraseId ? phrases.find((p) => p.id === c.answerPhraseId) : null;
    if (ph && answer >= 0 && answer < options.length) { options[answer] = clip(ph.ko, LIMITS.option); answerFrom = 'phrase:' + ph.id; }
  }
  if (!prompt) reasons.push('문항 글이 없음');
  const why = clip(c.why, LIMITS.why);
  const prevention = clip(c.prevention, LIMITS.prevention);
  if (!why) reasons.push('해설이 없음');
  const all = [prompt, why, prevention].concat(options).join(' ');
  rules.bannedPhrases.forEach((b) => { if (all.indexOf(b) !== -1) reasons.push('금지어 「' + b + '」'); });
  /* 출처 — 그 위험요소의 출처 안에 있는 것만. 없으면 위험요소 출처를 그대로 단다 */
  const own = new Map(hazard.sources.map((s) => [s.url, s]));
  const refs = (Array.isArray(c.sourceUrls) ? c.sourceUrls : []).map(String).filter((u) => own.has(u)).map((u) => own.get(u));
  return {
    reasons,
    q: { prompt, options, answer, why, prevention, answerFrom, sources: (refs.length ? refs : hazard.sources).map((s) => ({ title: s.title, url: s.url })) },
  };
}

/* ── ④ 선정 ──────────────────────────────────────────────────────────── */

/** 탐지 근거 — 담당자가 「왜 이 위험이 나왔나」를 보는 한 줄 */
export function evidenceOf(h) {
  return [h.official ? '공식 문서 ' + h.official.code + ' ' + h.official.section : '',
    h.sources.length ? '출처 ' + h.sources.length + '곳 (' + Array.from(new Set(h.sources.map((s) => s.host).filter(Boolean))).join(', ') + ')' : '',
    h.answer ? '설비 사진에서 위치 확인' : '사진 위치 없음'].filter(Boolean).join(' · ');
}

/** 정답 자리를 고르기 문항 순서대로 돌린다 — 늘 1번이면 외워서 푼다 (편향 방지) */
function rotate(q, nth) {
  if (q.options.length < 3) return q;
  const at = nth % q.options.length;
  const opts = q.options.slice();
  const right = opts.splice(q.answer, 1)[0];
  opts.splice(at, 0, right);
  return { ...q, options: opts, answer: at };
}

/** 계획 + 모델 후보 → 최종 문항. { quiz, excluded:[{slot, why}], missing:[slot] } */
export function selectQuiz(plan, hazards, raw, phrases, rules = RULES) {
  const byId = new Map(hazards.map((h) => [h.id, h]));
  const cands = raw && Array.isArray(raw.questions) ? raw.questions : [];
  const quiz = [];
  const excluded = [];
  const missing = [];
  let nth = 0;   // 몇 번째 고르기 문항인가 — 정답 자리 돌리기
  plan.slots.forEach((s) => {
    const h = byId.get(s.hazardId);
    let made = null;
    if (s.type === 'location') {
      made = {
        prompt: '사진에서 「' + h.part + '」을(를) 누르세요', answer: { ...h.answer }, figure: 'photo',
        why: h.risk, prevention: '', answerFrom: 'photo', sources: h.sources.map((x) => ({ title: x.title, url: x.url })),
      };
    } else {
      cands.filter((c) => c && Number(c.slot) === s.slot).forEach((c) => {
        if (made) return;
        const n = normalizeCandidate(c, s, h, phrases, rules);
        const dup = n.q && quiz.find((q) => overlap(q.prompt, n.q.prompt) >= rules.duplicateMaxOverlap);
        if (dup) n.reasons.push('앞 문항(' + dup.id + ')과 너무 비슷함');
        if (n.reasons.length) { excluded.push({ slot: s.slot, hazardId: s.hazardId, prompt: (n.q && n.q.prompt) || '', why: n.reasons }); return; }
        made = rotate(n.q, nth);
        nth += 1;
      });
    }
    if (!made) { missing.push(s.slot); return; }
    const id = 'q' + (quiz.length + 1);
    const item = {
      id,
      slot: s.slot,   // 다시 만들기가 같은 칸을 갈아 끼울 때 쓴다
      type: s.type === 'location' ? 'hotspot' : 'choice',
      subtype: s.type,
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
      i18n: {},
    };
    if (item.type === 'hotspot') { item.answer = made.answer; item.figure = 'photo'; }
    else {
      item.options = made.options;
      item.answer = made.answer;
      /* 오답을 고르면 「그대로 하면 생기는 일」(위험 설명), 정답이면 해설 */
      item.results = made.options.map((_, i) => (i === made.answer ? made.why : (h.risk || made.why)));
    }
    quiz.push(item);
  });
  return { quiz, excluded, missing };
}

/** 이 칸들은 AI 가 필요 없나 (전부 위치 문항) */
export function needsModel(slots) { return slots.some((s) => s.type !== 'location'); }
