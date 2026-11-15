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

/* ── 안내형 — 리서치 항목마다 「사진 속 어디인가」 (PRD-AD-08 S3 · FR-09·10) ─────
   자유 탐색(위)보다 정확하다 — 무엇을 찾을지 알려 주고 위치만 묻는다.
   좌표는 Gemini 가 잘 내는 모양 그대로 `box_2d` [ymin, xmin, ymax, xmax] 0~1000 으로 받고
   서버가 퍼센트로 바꾼다. 사진에 안 보이면 null + 필요한 사진. */

/* 공식 문서 항목(_official.MAX_OFFICIAL_ITEMS 8) + /api/research 의 MAX_ITEMS(기본 12 + 고유 5).
   ★ 숫자를 여기 적어 두는 이유 — 이 파일은 **다른 파일을 부르지 않는다**. 제출본 빌드가
     `export` 만 떼어 브라우저에 그대로 끼워 넣기 때문이다 (`scripts/build-submission.mjs`).
     어긋나면 `tests/test-api-research.mjs` 가 깨진다 (공식 + 리서치 상한과 대조). */
export const MAX_GUIDED_ITEMS = 25;
const MIN_BOX = 1;                    // 0~100 기준 가로·세로 1% 미만은 박스가 아니다
const R_MIN = 5;                      // 문항 정답 원 반지름 (diagrams.js answerFor 의 12 와 같은 단위)
/* 2026-11-09 실측 — 긴 변 절반을 그대로 쓰면 반지름이 17~26 이 되어 문항 정답 원이 5쌍 겹쳤다.
   노동자는 한 점을 짚는다 — 도해 정답 원(diagrams.js answerFor)이 12 이므로 15 를 천장으로 둔다 */
const R_MAX = 15;

function cleanText(v, max) {
  return typeof v === 'string' ? v.replace(/[\r\n"`{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** 요청의 리서치 항목에서 id·부위·위험유형만 꺼낸다. 모양이 틀리면 버린다 */
export function cleanGuidedItems(list, hazardCodes = HAZARD_CODES) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_GUIDED_ITEMS).forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const id = typeof it.id === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(it.id) ? it.id : '';
    const part = cleanText(it.part, 40);
    if (!id || !part || seen.has(id)) return;
    seen.add(id);
    out.push({ id, part, hazard: hazardCodes.indexOf(it.hazard) !== -1 ? it.hazard : 'unknown' });
  });
  return out;
}

export function guidedSystemText() {
  return '너는 산업안전 점검자다. 공장 설비 사진 한 장과 확인할 부위 목록을 받는다.\n'
    + '규칙:\n'
    + '1) 목록의 부위마다 사진 속 위치를 box_2d 로 낸다. box_2d 는 [ymin, xmin, ymax, xmax] 이고 0~1000 으로 정규화한다.\n'
    + '2) 사진에서 그 부위를 확실히 찾을 수 없으면 추측하지 말고 box_2d 를 null 로 하고,'
    + ' needsPhoto 에 어떤 부위를 어느 각도에서 찍어야 하는지 한국어로 짧게 쓴다.\n'
    + '3) 목록에 없는 id 를 만들지 않는다.\n'
    + '4) 사진에 사람의 얼굴이나 몸, 이름표가 보이면 person 을 true 로 한다.\n'
    + '5) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"person": false, "boxes": [{"id": "r1", "box_2d": [380, 300, 620, 700], "needsPhoto": ""}]}';
}

export function guidedUserText(items) {
  return '확인할 부위 목록:\n'
    + items.map((it) => it.id + ': ' + it.part + ' (' + it.hazard + ')').join('\n')
    + '\n이 사진에서 각 부위의 위치를 찾아라.';
}

function boxPercent(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = b.map((n) => n / 10);
  if (ymin < 0 || xmin < 0 || ymax > 100 || xmax > 100) return null;
  if (xmax - xmin < MIN_BOX || ymax - ymin < MIN_BOX) return null;
  return { x0: xmin, y0: ymin, x1: xmax, y1: ymax };
}

/** 모델이 준 박스를 항목에 붙인다.
 *  돌려주는 값: { mapped: [{id, part, hazard, box, answer}], missing: [{id, part, hazard, needsPhoto}], dropped }
 *  ★ 항목 1개에 박스 1개 — 같은 id 가 두 번 오면 처음 것만 (FR-AD-08-13 「1:1」)
 *  ★ `answer {x,y,r}` 는 지금 `courses` hotspot 정답 모양 그대로다 — 문항 초안(S6)이 그대로 쓴다 */
export function mapBoxes(raw, items) {
  const dropped = { unknownId: 0, duplicate: 0, badBox: 0 };
  const byId = new Map(items.map((it) => [it.id, it]));
  const got = new Map();
  const list = raw && Array.isArray(raw.boxes) ? raw.boxes : [];

  list.forEach((b) => {
    if (!b || typeof b !== 'object' || !byId.has(b.id)) { dropped.unknownId += 1; return; }
    if (got.has(b.id)) { dropped.duplicate += 1; return; }
    if (b.box_2d === null || b.box_2d === undefined) {
      got.set(b.id, { needsPhoto: cleanText(b.needsPhoto, 80) });
      return;
    }
    const box = boxPercent(b.box_2d);
    if (!box) { dropped.badBox += 1; got.set(b.id, { needsPhoto: cleanText(b.needsPhoto, 80) }); return; }
    got.set(b.id, { box });
  });

  const mapped = [];
  const missing = [];
  items.forEach((it) => {
    const g = got.get(it.id);
    if (g && g.box) {
      const b = g.box;
      const r = Math.min(R_MAX, Math.max(R_MIN, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2));
      const round = (n) => Math.round(n * 10) / 10;
      mapped.push({
        ...it,
        box: { x0: round(b.x0), y0: round(b.y0), x1: round(b.x1), y1: round(b.y1) },
        answer: { x: round((b.x0 + b.x1) / 2), y: round((b.y0 + b.y1) / 2), r: round(r) },
      });
    } else {
      /* 모델이 아무 말도 안 했거나 좌표가 틀렸으면 우리가 필요한 사진을 적는다 (FR-10) */
      missing.push({ ...it, needsPhoto: (g && g.needsPhoto) || '「' + it.part + '」이(가) 잘 보이게 다시 찍어 주세요' });
    }
  });

  return { mapped, missing, dropped };
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
