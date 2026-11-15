/* 교육(courses) ↔ 설비·위험요소 연결 검사 — 서버가 다시 본다 (2026-11-11 요청 「백엔드에서도 설비와 콘텐츠의 일치 여부를 검증」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 바깥을 부르지 않는 순수 계산만 둔다.

   ★ 새로 들어오거나 바뀐 교육만 본다. 이미 저장된 옛 교육(설비를 나중에 지운 것 등)이 있다고
     교육 저장 전체가 막히면 안 된다.
   ★ 사업장 설정(setup)이 서버에 아직 없으면 설비 id 는 못 본다 — 위험요소 연결만 본다. */

/* ── 교육 1건의 크기 상한 (C06 D-048) ────────────────────────────────

   ★ 이 숫자들은 `src/assets/limits.js` 와 **같은 값이어야 한다.**
     `src/` 는 ES 모듈이 아니라(C05 T-2, `file://` 에서 열린다) 한 파일을
     같이 쓸 수 없어 두 벌이다. 어긋나지 않는지는 `tests/test-course-size.js`
     가 두 파일을 같이 읽어 지킨다. **한쪽만 고치지 않는다.**

   왜 서버도 보나 — 화면(`admin/autogen`)이 발급 전에 막지만, 동기화 경로로
   들어오는 길이 따로 있다. 상한을 넘는 교육이 하나 들어오면 그 사업장은
   덩어리 전체(512KB)가 막혀 **다른 교육까지 못 올린다**. */
const MAX_COURSE_BYTES = 125 * 1024;
const MAX_PICS = 12;
const PIC_MAX_BYTES = 7 * 1024;
const PHOTO_MAX_BYTES = 28 * 1024;

function bytesOf(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value);
  return Buffer.byteLength(s, 'utf8');
}

function kb(bytes) {
  return Math.round(bytes / 1024) + 'KB';
}

function picsOf(row) {
  const out = [];
  const quiz = row && Array.isArray(row.quiz) ? row.quiz : [];
  quiz.forEach((q, qi) => {
    const pics = q && Array.isArray(q.pics) ? q.pics : [];
    pics.forEach((pic) => { if (typeof pic === 'string' && pic.startsWith('data:image/')) out.push({ qi, pic }); });
  });
  return out;
}

/** 교육 한 건의 크기 문제 — 없으면 '' (limits.js 의 같은 함수와 문장까지 같다) */
export function courseSizeProblem(row) {
  if (!row || typeof row !== 'object') return '';
  const pics = picsOf(row);
  if (pics.length > MAX_PICS) {
    return `보기 그림이 ${pics.length}장입니다. ${MAX_PICS}장까지 넣을 수 있습니다`;
  }
  for (const p of pics) {
    const n = bytesOf(p.pic);
    if (n > PIC_MAX_BYTES) {
      return `${p.qi + 1}번째 문항의 보기 그림이 ${kb(n)} 입니다. 한 장은 ${kb(PIC_MAX_BYTES)} 까지입니다`;
    }
  }
  if (typeof row.photo === 'string' && row.photo.startsWith('data:image/')) {
    const pb = bytesOf(row.photo);
    if (pb > PHOTO_MAX_BYTES) return `설비 사진이 ${kb(pb)} 입니다. ${kb(PHOTO_MAX_BYTES)} 까지입니다`;
  }
  const total = bytesOf(row);
  if (total > MAX_COURSE_BYTES) {
    return `교육 1건이 ${kb(total)} 입니다. ${kb(MAX_COURSE_BYTES)} 까지입니다`;
  }
  return '';
}

/** 한 교육의 문제 — 없으면 '' */
export function courseProblem(row, equipmentIds) {
  if (!row || typeof row !== 'object') return '';
  const tooBig = courseSizeProblem(row);
  if (tooBig) return tooBig;
  const eqId = row.equipmentId;
  if (typeof eqId !== 'string' || !eqId) return '설비가 정해지지 않았습니다';
  if (equipmentIds && equipmentIds.indexOf(eqId) === -1) return '사업장에 없는 설비입니다';
  const quiz = Array.isArray(row.quiz) ? row.quiz : [];
  const linked = quiz.filter((q) => q && q.hazardId !== undefined);
  if (!Array.isArray(row.hazards)) return linked.length ? '문항이 가리키는 위험요소 목록이 없습니다' : '';
  if (row.hazards.some((h) => !h || h.equipmentId !== eqId)) return '다른 설비의 위험요소가 섞였습니다';
  const ids = new Set(row.hazards.map((h) => h.id));
  if (linked.some((q) => !ids.has(q.hazardId))) return '문항이 이 교육에 없는 위험요소를 가리킵니다';
  return '';
}

/** 들어온 목록 중 새로 오거나 바뀐 교육의 첫 문제 — { id, title, why } 또는 null */
export function firstCourseProblem(incoming, current, equipmentIds) {
  const before = new Map((Array.isArray(current) ? current : []).filter((r) => r && r.id).map((r) => [r.id, JSON.stringify(r)]));
  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (!row || !row.id || before.get(row.id) === JSON.stringify(row)) continue;
    const why = courseProblem(row, equipmentIds);
    if (why) return { id: String(row.id), title: String(row.title || ''), why };
  }
  return null;
}
