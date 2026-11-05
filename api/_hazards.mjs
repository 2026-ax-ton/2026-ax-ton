/* 사진 위험 지점 인식 — 지시문과 **모델 출력 거르기** (T17 · PRD-AD-07).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ 이 파일이 거르는 규칙의 **정답 한 곳**이다.
     `api/hazards.mjs`(서버 함수) · `scripts/measure-hazards.mjs`(좌표 실측 도구)가
     같은 함수를 쓴다. 실측에서 다듬은 규칙이 서버에서 조용히 느슨해지지 않게
     2026-11-04 실측 도구에 있던 원안을 그대로 이리로 옮겼다 (2026-11-05).

   ★ 바깥을 부르지 않는 순수 계산만 둔다 (네트워크·DB 없음).

   넘지 않는 선
     · 모델 출력은 믿을 수 없는 문자열이다 (FR-AD-07-12). 여기서 HTML 을 만들지 않는다
     · 「이유」는 담당자 참고용 한 마디다. 문구·문항으로 쓰지 않는다 (FR-AD-07-09)
     · 6종 밖 위험유형은 버리고, 몇 개를 버렸는지 센다 (FR-AD-07-05)

   근거: PRD-AD-07 §4 FR-04·05·09·12·20·21 · §11 Q4·Q5·Q8 · C06 D-027 */

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

export const MAX_POINTS = 5;   // PRD-AD-07 §11 Q4 결정 (사진 1장당 5개)
export const MAX_WHY = 120;    // 「이유」 길이 — 참고용 한 문장

/** 위험유형 6종.
 *  ★ 화면의 정답은 `src/assets/store.js` 의 `Store.HAZARDS` 다. 서버 함수는 배포 묶음에
 *    `src/` 파일이 들어 있다고 믿을 수 없어서 코드 목록만 여기 둔다.
 *    **두 곳이 어긋나면 `tests/test-api-hazards.mjs` 가 깨진다** — 베낀 것이 아니라
 *    검사로 묶어 둔 사본이다. */
export const HAZARD_CODES = ['pinch', 'shock', 'fire', 'fall', 'choke', 'chemical'];

/* ── 지시문 ─────────────────────────────────────────────────────────────
   ★ 안전 문구를 **쓰게 하지 않는다** — 문구는 검수된 라이브러리에서 고른다
     (FR-AD-07-09). 그래서 "이유"는 담당자 참고용 한 마디만 받는다. */

export function systemText(hazardCodes) {
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

export const USER_TEXT = '이 설비 사진의 위험 지점을 찾아라.';

/* ── 응답 거르기 ──────────────────────────────────────────────────────── */

/** 모델이 코드 울타리(```json)로 싸서 주는 일이 흔하다. 벗기고 JSON 만 꺼낸다. */
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
 *  화면에도 그렇게 적어야 한다 (FR-AD-07-05 "몇 개를 버렸는지 화면에 적는다"). */
export function filterPoints(raw, hazardCodes, max = MAX_POINTS) {
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
      /* 이유는 참고용이고 문구로 저장하지 않는다 (FR-09). 길이만 자른다 */
      why: typeof p.why === 'string' ? p.why.trim().slice(0, MAX_WHY) : '',
    });
  });

  return { points: kept, dropped };
}

/** 터치 구역이 겹치는 지점 쌍을 센다 (FR-AD-07-21 · WK-03 FR-14 의 60px).
 *  합치는 규칙(어느 쪽 위험유형을 남기나)은 화면이 정한다 — 담당자가 보고 고르는 자리다. */
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
