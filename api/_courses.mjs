/* 교육(courses) ↔ 설비·위험요소 연결 검사 — 서버가 다시 본다 (2026-11-11 요청 「백엔드에서도 설비와 콘텐츠의 일치 여부를 검증」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 바깥을 부르지 않는 순수 계산만 둔다.

   ★ 새로 들어오거나 바뀐 교육만 본다. 이미 저장된 옛 교육(설비를 나중에 지운 것 등)이 있다고
     교육 저장 전체가 막히면 안 된다.
   ★ 사업장 설정(setup)이 서버에 아직 없으면 설비 id 는 못 본다 — 위험요소 연결만 본다. */

/** 한 교육의 문제 — 없으면 '' */
export function courseProblem(row, equipmentIds) {
  if (!row || typeof row !== 'object') return '';
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
