/* 규칙 문서 ↔ 코드 — SAFETY_QUESTION_GENERATION_RULES.md 의 json 블록과 api/_questions.mjs 의 RULES 가 같은가.
   문서만 고치고 코드를 안 고치면(또는 반대면) 여기서 깨진다 (규칙 문서 §10 「규칙 값 바꾸기」). */

import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');
const Q = await import('../api/_questions.mjs');
const { HAZARD_CODES } = await import('../api/_hazards.mjs');
const { EQUIPMENT_KINDS } = await import('../api/_official.mjs');

const md = fs.readFileSync(new URL('../docs/documentations/20_기술명세/SAFETY_QUESTION_GENERATION_RULES.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const blocks = md.match(/```json\n[\s\S]*?\n```/g) || [];
eq('★ 문서에 json 블록은 하나 (§10)', blocks.length, 1);
let doc = null;
try { doc = JSON.parse(blocks[0].replace(/^```json\n|\n```$/g, '')); } catch (e) { doc = null; }
ok('json 블록이 읽힌다', !!doc);
eq('★★ 문서의 규칙 = 코드의 RULES', JSON.stringify(Q.RULES), JSON.stringify(doc));

/* 문서가 스스로 지키라고 적은 것 */
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
ok('유형 비율 합 = 1', Math.abs(sum(Q.RULES.typeMix) - 1) < 1e-9);
ok('난이도 비율 합 = 1', Math.abs(sum(Q.RULES.difficulty) - 1) < 1e-9);
/* §4.3 난이도는 유형에서 나온다 — easy = location + ox, medium = action, hard = situation */
ok('★ 난이도 비율 = 유형에서 나온 값 (§4.3)', Math.abs(Q.RULES.difficulty.easy - (Q.RULES.typeMix.location + Q.RULES.typeMix.ox)) < 1e-9
  && Q.RULES.difficulty.medium === Q.RULES.typeMix.action && Q.RULES.difficulty.hard === Q.RULES.typeMix.situation);
eq('★ 위험유형 중대성 = 서버 위험유형 6종 + unknown', Object.keys(Q.RULES.severity).sort().join(), HAZARD_CODES.concat('unknown').sort().join());
ok('문서가 설비 종류 다섯을 그대로 쓴다', EQUIPMENT_KINDS.every((k) => md.indexOf('`' + k + '`') !== -1));
ok('★ 「면책」 금지어가 들어 있다 (제품 원칙)', Q.RULES.bannedPhrases.indexOf('면책') !== -1);

/* §4.2 표 — N 별 유형 칸 수 */
[[3, [1, 1, 1, 0]], [5, [2, 2, 1, 0]], [8, [3, 2, 2, 1]]].forEach(([n, want]) => {
  const q = Q.quotas(n, Q.RULES.typeMix);
  eq('§4.2 N=' + n + ' location·action·situation·ox', [q.location, q.action, q.situation, q.ox].join(), want.join());
});
/* §3.2 예 */
eq('§3.2 위험 5 → 5 · 20 → 8 · 2 → 3 · 1 → 2 · 0 → 0', [5, 20, 2, 1, 0].map((h) => Q.countFor(h)).join(), '5,8,3,2,0');

/* 법적 의무와 설계 기준을 섞지 않는다 — 문항 수를 「의무」로 쓰지 않는다 */
ok('★ 문서가 「법이 정한 문항 수 — 없다」를 밝힌다', /법이 정한 문항 수가 있는가 — \*\*없다\*\*/.test(md));

report('규칙 문서 ↔ 코드 (SAFETY_QUESTION_GENERATION_RULES.md)');
