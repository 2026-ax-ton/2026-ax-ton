/* 평가문항 번역 — AI 가 만든 문항을 노동자의 언어로 (2026-11-11 요청 「크메르어를 고르면 한국어가 섞이지 않게」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 바깥을 부르지 않는 순수 계산만 둔다.

   ★ 노동자 화면은 문항 번역이 하나라도 빠지면 한국어를 띄우지 않고 막는다(worker/quiz.js ready).
     그래서 담당자 화면이 발급 전에 이 번역을 채우고, 다 채워져야 발급된다.
   ★ 번역을 믿지 않는다 — 선택지·결과 개수가 한국어와 같아야 하고(정답 인덱스), 빈 칸이 없어야 하고,
     한국어 글자가 남으면 안 된다(설비 이름 같은 고유명사는 뺀다). 걸리면 그 문항은 「번역 실패」로 남는다.
   ★ 정답이 검수 문구에서 온 문항(answerFrom 'phrase:<id>')은 그 문구의 **검수된 번역**을 정답 선택지에 쓴다 —
     화면(autogen.js)이 한다. 여기서는 모델 번역만 거른다. */

export const TRANS_FIELDS = ['prompt', 'why', 'prevention'];
export const TRANS_ARRAYS = ['options', 'results'];
const HANGUL = /[가-힣]/;

function clip(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }

/** 화면이 보낸 문항 — 번역할 칸만 남긴다 */
export function cleanItems(list) {
  return (Array.isArray(list) ? list : []).slice(0, 20).map((q) => {
    if (!q || !/^[A-Za-z0-9_-]{1,20}$/.test(String(q.id)) || !clip(q.prompt, 200)) return null;
    const out = { id: String(q.id), prompt: clip(q.prompt, 200) };
    ['why', 'prevention'].forEach((f) => { if (clip(q[f], 300)) out[f] = clip(q[f], 300); });
    TRANS_ARRAYS.forEach((f) => { if (Array.isArray(q[f]) && q[f].length) out[f] = q[f].slice(0, 6).map((s) => clip(s, 300)); });
    return out;
  }).filter(Boolean);
}

export function systemText(langName) {
  return '너는 산업안전 교육 번역가다. 한국어 평가문항을 ' + langName + '로 번역한다. 듣는 사람은 글을 잘 못 읽는 이주노동자다.\n'
    + '규칙:\n'
    + '1) 뜻을 바꾸지 않는다. 더하거나 빼지 않는다. 쉬운 말로 짧게.\n'
    + '2) options·results 는 개수와 순서를 그대로 둔다 (정답 번호가 순서로 정해진다).\n'
    + '3) 한국어 글자를 하나도 남기지 않는다. 설비 부위 이름도 ' + langName + '로 옮긴다. 제조사·모델명 같은 고유명사만 원문 그대로.\n'
    + '4) 「O (맞다)」「X (틀리다)」 선택지는 O·X 기호를 그대로 두고 괄호 안만 옮긴다.\n'
    + '5) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"items": [{"id": "q1", "prompt": "...", "options": ["..."], "results": ["..."], "why": "...", "prevention": "..."}]}';
}

export function userText(items) {
  return JSON.stringify({ items });
}

/** 모델 답 → { i18n: { id: {prompt, options?, results?, why?, prevention?} }, failed: [{id, why}] } */
export function readTranslations(raw, items, keepWords) {
  const keep = (Array.isArray(keepWords) ? keepWords : []).filter(Boolean);
  const strip = (s) => keep.reduce((t, w) => t.split(w).join(''), String(s));
  const byId = new Map(((raw && Array.isArray(raw.items)) ? raw.items : []).filter((x) => x && x.id).map((x) => [String(x.id), x]));
  const i18n = {};
  const failed = [];
  items.forEach((q) => {
    const t = byId.get(q.id);
    const why = [];
    if (!t) { failed.push({ id: q.id, why: ['번역이 오지 않음'] }); return; }
    const out = {};
    TRANS_FIELDS.forEach((f) => {
      if (q[f] === undefined) return;
      const v = clip(t[f], 400);
      /* prevention 은 노동자 화면에 나가지 않는다 — 비면 빼고 실패로 보지 않는다 (2026-11-11 실측: 크메르어에서 자주 비었다) */
      if (!v && f === 'prevention') return;
      if (!v) why.push(f + ' 빈 칸');
      out[f] = v;
    });
    TRANS_ARRAYS.forEach((f) => {
      if (q[f] === undefined) return;
      const v = Array.isArray(t[f]) ? t[f].map((s) => clip(s, 400)) : [];
      if (v.length !== q[f].length) why.push(f + ' 개수가 다름 (' + v.length + '/' + q[f].length + ')');
      if (v.some((s) => !s)) why.push(f + ' 빈 칸');
      out[f] = v;
    });
    const all = TRANS_FIELDS.map((f) => out[f] || '').concat(...TRANS_ARRAYS.map((f) => out[f] || [])).join(' ');
    if (HANGUL.test(strip(all))) why.push('한국어 글자가 남음');
    /* 2026-11-11 실측 — 크메르어 번역에 깨진 글자(U+FFFD)가 한 번 섞여 왔다 */
    if (/�/.test(all)) why.push('깨진 글자');
    if (why.length) failed.push({ id: q.id, why });
    else i18n[q.id] = out;
  });
  return { i18n, failed };
}
