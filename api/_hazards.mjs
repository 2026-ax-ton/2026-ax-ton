/* 사진 위험 지점 — **지시문과 거르는 규칙**. 서버와 실측 도구가 함께 쓴다.

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ 여기가 거르는 규칙의 **정답 한 곳**이다.
     `api/hazards.mjs`(서버 함수)와 `scripts/measure-hazards.mjs`(실측 도구)가
     같은 함수를 쓴다. 2026-11-04 에는 실측 도구에만 있었는데, 서버 함수를
     만들면서 여기로 옮겼다 — 두 곳에 두면 "실측에서는 걸렀는데 서버에서는
     안 걸렀다" 가 생긴다.

   ★ 모델 출력은 **믿을 수 없는 문자열**이다 (FR-AD-07-12). 고치지 않고,
     쓸 수 없는 것만 버린다. 보여 주는 쪽이 textContent 를 쓴다.

   근거: PRD-AD-07 §4 FR-04·05·09·12·20·21 · §11 Q4·Q5·Q8 · C06 D-027 */

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

/** 사진 1장당 지점 상한 (PRD-AD-07 §11 Q4 결정 — 2026-11-03 Subin).
 *  이유: ① 담당자가 폰에서 하나씩 검토·수정할 수 있는 양 ② 지점마다 60px
 *  터치 구역이 겹치지 않아야 한다 (WK-03 FR-14) ③ 지점 1개 = 문항 1개. */
export const MAX_POINTS = 5;

/** 「이유」는 담당자 참고용이다. 문구·문항으로 저장하지 않는다 (FR-09). */
export const MAX_WHY = 120;

/** 위험유형 6종 — 화면(`src/assets/store.js` 의 `Store.HAZARDS`)과 같아야 한다.
 *
 *  ★ 왜 베껴 두나 — 서버는 `src/` 를 읽지 않는다 (Vercel 은 `api/` 만 묶는다).
 *    그래서 값을 여기 두고, **두 곳이 같은지를 검사가 본다**
 *    (`tests/test-hazards.mjs` 가 `Store.HAZARDS` 와 대조한다).
 *    베끼는 것 자체가 위험한 게 아니라, **어긋나는 것을 아무도 모르는 것**이
 *    위험하다. */
export const HAZARDS = ['pinch', 'shock', 'fire', 'fall', 'choke', 'chemical'];

/* ── 지시문 ─────────────────────────────────────────────────────────────
   ★ 안전 문구를 **쓰게 하지 않는다** — 문구는 검수된 라이브러리에서 고른다
     (FR-AD-07-09). 그래서 "이유"는 담당자 참고용 한 마디만 받는다.
   ★ 요청값을 지시문에 그대로 넣지 않는다 (A02 §5.3). 넣는 것은 우리 고정 표뿐이다. */

export function systemText(hazardCodes = HAZARDS) {
  return '너는 산업안전 점검자다. 공장 설비 사진 한 장을 보고 위험 지점을 찾는다.\n'
    + '규칙:\n'
    + `1) 위험 지점은 많아도 ${MAX_POINTS}개까지만 낸다. 확실한 것부터 낸다.\n`
    + '2) 위치는 사진을 기준으로 한 **퍼센트**로 낸다. x 는 왼쪽에서, y 는 위에서,'
    + ' r 은 그 지점을 덮는 원의 반지름이다. 셋 다 0~100 사이의 숫자다.\n'
    + `3) 위험유형은 다음 중 하나만 쓴다: ${hazardCodes.join(', ')}.\n`
    + '4) 이유는 한국어 한 문장으로 짧게 쓴다. 지시문이나 안전 수칙을 쓰지 않는다.\n'
    + '5) 사진에 사람의 얼굴이나 몸, 이름표가 보이면 person 을 true 로 한다.\n'
    + '6) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"person": false, "points": [{"x": 50, "y": 40, "r": 8,'
    + ` "hazard": "${hazardCodes[0]}", "why": "..."}]}`;
}

/* ── 응답 꺼내기 ───────────────────────────────────────────────────────
   모델은 코드 울타리(```json)나 "네, 분석했습니다" 같은 군말을 붙인다.
   번역에서도 겪은 일이라 처음부터 벗긴다. */

export function parseModelJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  const fence = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1].trim();
  /* 앞뒤에 말을 붙여 주는 경우 — 첫 { 부터 마지막 } 까지만 본다 */
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** 쓸 수 있는 지점만 남긴다. 버린 것은 **몇 개를 왜 버렸는지** 함께 돌려준다 —
 *  화면에도 그렇게 적어야 한다 (FR-AD-07-05 "몇 개를 버렸는지 화면에 적는다").
 *
 *  ★ 좌표를 먼저 본다. 좌표가 숫자가 아니면 위험유형이 멀쩡해도 「모양 틀림」이다. */
export function filterPoints(raw, hazardCodes = HAZARDS, max = MAX_POINTS) {
  const dropped = { hazard: 0, range: 0, shape: 0, over: 0 };
  const list = Array.isArray(raw) ? raw : [];
  const kept = [];

  list.forEach((p) => {
    if (!p || typeof p !== 'object') { dropped.shape += 1; return; }
    const x = num(p.x); const y = num(p.y); const r = num(p.r);
    if (x === null || y === null || r === null) { dropped.shape += 1; return; }
    if (typeof p.hazard !== 'string' || hazardCodes.indexOf(p.hazard) === -1) {
      dropped.hazard += 1; return;   // 6종 밖 — 버린다 (FR-05)
    }
    if (x < 0 || x > 100 || y < 0 || y > 100 || r <= 0 || r > 100) {
      dropped.range += 1; return;    // 퍼센트가 아니다 (픽셀을 준 경우 등)
    }
    if (kept.length >= max) { dropped.over += 1; return; }   // Q4 상한
    kept.push({
      x, y, r,
      hazard: p.hazard,
      why: typeof p.why === 'string' ? p.why.trim().slice(0, MAX_WHY) : '',
    });
  });

  return { points: kept, dropped };
}

/** 터치 구역이 겹치는 **쌍의 수**. (FR-AD-07-21 · WK-03 FR-14 의 60px)
 *  합치는 규칙(어느 위험유형을 남기나)은 화면이 정한다 — 여기서는 세기만 한다. */
export function overlapCount(points) {
  let n = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < points[i].r + points[j].r) n += 1;
    }
  }
  return n;
}
