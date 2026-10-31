/* 합치기 규칙 — 두 기기가 같은 키를 고쳤을 때 **무엇도 사라지지 않게** 섞는다.

   ★ 왜 "나중 것이 이긴다" 로 하지 않나
     노동자 두 명이 같은 교육을 동시에 풀면, 한 명의 기록이 통째로 사라진다.
     **미이수가 사라지는 것은 증빙이 사라지는 것**이다 (C05 P-4).
     그래서 덩어리째 덮어쓰지 않고 **행 단위(id)로** 섞는다 (A02 §14.4).

   ★ 사라지면 안 되는 것 / 사라져도 되는 것
     · 수강·검증 기록(progress), 글·댓글(posts), 지시(orders) → **행이 사라지면 안 된다**
     · 사업장 설정(setup) → 한 덩어리다. 행으로 쪼갤 수 없어 **판(version)으로 막는다**

   바깥을 부르지 않는 순수 계산이다 (DB·네트워크 없음) — 검사가 쉽다.

   근거: A02 §14.4 (표 14-3) · C05 P-4 · D06 §3.1 [8] */

/* 키마다 무엇을 기준으로 같은 행인지 (A02 §14.4) */
export const ROW_KEY = {
  courses: (r) => r && r.id,
  posts: (r) => r && r.id,
  orders: (r) => r && r.id,
  library: (r) => r && r.id,
  /* ★ 사람 하나 + 교육 하나가 한 행이다. workerId 만으로 묶으면
     한 사람이 들은 두 교육 중 하나가 사라진다. */
  progress: (r) => (r && r.workerId && r.courseId) ? (r.workerId + '|' + r.courseId) : null,
};

export const LIST_KEYS = ['courses', 'posts', 'orders', 'library', 'progress'];
export const DOC_KEYS = ['setup'];

function at(v) {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** 이 기록이 얼마나 "나중 것" 인가. 큰 쪽이 이긴다. */
function progressStamp(row) {
  if (!row) return 0;
  return Math.max(at(row.learnedAt), row.quiz ? at(row.quiz.at) : 0);
}

/* ── 문구 하나 합치기 (library) ─────────────────────────────────────
   ★ 언어별 판정은 **나중에 사람이 본 것**이 이긴다 (A02 §14.4).
     사람이 승인한 것을 AI 결과가 덮으면 검수가 무의미해진다. */

function mergePhrase(mine, theirs) {
  if (!mine) return theirs;
  if (!theirs) return mine;

  const out = { ...mine, ...theirs };
  const langs = new Set([
    ...Object.keys((mine.translations) || {}),
    ...Object.keys((theirs.translations) || {}),
  ]);
  const translations = {};
  langs.forEach((lang) => {
    const a = (mine.translations || {})[lang];
    const b = (theirs.translations || {})[lang];
    if (!a) { translations[lang] = b; return; }
    if (!b) { translations[lang] = a; return; }
    /* 사람이 본 시각 → 없으면 AI 가 본 시각으로 견준다 */
    const sa = Math.max(at(a.judged && a.judged.at), at(a.agent && a.agent.at));
    const sb = Math.max(at(b.judged && b.judged.at), at(b.agent && b.agent.at));
    translations[lang] = sb >= sa ? b : a;
  });
  out.translations = translations;
  return out;
}

/* ── 글 하나 합치기 (posts) ─────────────────────────────────────────
   ★ 댓글에는 id 가 없다. 쓴 사람 + 쓴 시각으로 같은 댓글인지 본다.
     합집합이다 — 한쪽에만 있는 댓글이 사라지면 안 된다. */

function mergePost(mine, theirs) {
  if (!mine) return theirs;
  if (!theirs) return mine;

  const out = { ...mine, ...theirs };
  const seen = new Set();
  const comments = [];
  [...(mine.comments || []), ...(theirs.comments || [])].forEach((c) => {
    if (!c) return;
    const id = (c.author || '') + '|' + (c.createdAt || '') + '|' + (c.body || '');
    if (seen.has(id)) return;
    seen.add(id);
    comments.push(c);
  });
  comments.sort((a, b) => at(a.createdAt) - at(b.createdAt));
  out.comments = comments;
  return out;
}

/** 같은 행 둘을 어떻게 합치나. 키마다 다르다. */
function mergeRow(key, mine, theirs) {
  if (key === 'library') return mergePhrase(mine, theirs);
  if (key === 'posts') return mergePost(mine, theirs);
  if (key === 'progress') {
    /* ★ 다시 푼 결과가 앞 결과를 덮어쓰되, **앞 결과가 더 나중이면 지킨다.**
       느린 기기가 옛 기록을 늦게 올려 새 기록을 지우는 일을 막는다. */
    return progressStamp(theirs) >= progressStamp(mine) ? { ...mine, ...theirs } : mine;
  }
  return theirs;      // courses · orders — 들어온 것이 이긴다 (담당자만 쓴다)
}

/**
 * 목록형 키를 합친다.
 *   base    서버에 있던 것
 *   incoming 기기가 보낸 것
 *   allow   (선택) 이 행을 받아도 되는지. 거짓이면 **조용히 버린다** (A02 §14.4)
 * 돌려주는 값: { list, dropped }
 */
export function mergeList(key, base, incoming, allow) {
  const idOf = ROW_KEY[key];
  const out = [];
  const index = new Map();
  let dropped = 0;

  (Array.isArray(base) ? base : []).forEach((row) => {
    const id = idOf(row);
    if (id === null || id === undefined) { out.push(row); return; }
    index.set(id, out.length);
    out.push(row);
  });

  (Array.isArray(incoming) ? incoming : []).forEach((row) => {
    const id = idOf(row);
    if (id === null || id === undefined) return;       // 모양이 깨진 행은 버린다
    if (allow && !allow(row)) { dropped += 1; return; } // 남의 행 — 서버가 버린다
    if (index.has(id)) {
      const i = index.get(id);
      out[i] = mergeRow(key, out[i], row);
    } else {
      index.set(id, out.length);
      out.push(row);
    }
  });

  return { list: out, dropped };
}

/** 한 덩어리 키(setup)는 판으로 막는다. 오래된 판이면 받지 않는다. */
export function canReplaceDoc(serverVersion, baseVersion) {
  return Number(baseVersion) === Number(serverVersion);
}
