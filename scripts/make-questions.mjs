/* 결과 파일에 평가문항을 만들어 붙인다 — 서버 /api/questions 와 같은 계산 (api/_questions.mjs).
   node scripts/make-questions.mjs <결과 파일> <새 파일> [--kind press]
   - 위험요소: 출처 확인(ok) 항목과 공식 문서 항목만 (확인 필요는 담당자 판정 전이라 넣지 않는다)
   - 사진 위치: 결과 파일의 guided.mapped 좌표
   - 문구: 시드의 검수 완료 문구 중 그 종류 + 공통 (src/assets/seed.js 를 읽는다)
   GPT 1회 (필수 칸이 비면 1회 더). 키는 .env.local, 출력하지 않는다 */
import fs from 'fs';
import vm from 'vm';
import { callModel } from '../api/_shared.mjs';
import { parseModelJson, HAZARD_CODES } from '../api/_hazards.mjs';
import { RULES, cleanHazards, planQuiz, systemText, userText, selectQuiz, needsModel } from '../api/_questions.mjs';
import { readEnvLocal } from './measure-hazards.mjs';

const [from, to] = process.argv.slice(2);
const kindArg = process.argv.indexOf('--kind') !== -1 ? process.argv[process.argv.indexOf('--kind') + 1] : '';
if (!from || !to) { console.error('쓰는 법: node scripts/make-questions.mjs <결과 파일> <새 파일> [--kind press]'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(from, 'utf8'));
const eqName = (run.equipment && run.equipment.name) || '';
const kind = kindArg || (/프레스/.test(eqName) ? 'press' : /사출/.test(eqName) ? 'injection' : /도장/.test(eqName) ? 'paint' : 'other');
const LABEL = { press: '프레스', paint: '도장', injection: '사출성형', electric: '전기설비', other: '기타' };

/* 시드 문구 — 브라우저 파일이라 vm 으로 읽는다 */
const seedSrc = fs.readFileSync(new URL('../src/assets/seed.js', import.meta.url), 'utf8');
const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(seedSrc);
const lib = libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : [];
const phrases = lib.filter((p) => p.status === 'reviewed' && (p.category === '공통' || p.category === LABEL[kind])).map((p) => ({ id: p.id, ko: p.ko }));

const mapped = new Map(((run.guided && run.guided.mapped) || []).map((m) => [m.id, m.answer]));
const hazards = cleanHazards(run.research.items.filter((it) => it.status === 'ok').map((it) => ({ ...it, answer: mapped.get(it.id) || null })), HAZARD_CODES);
const plan = planQuiz(hazards);
console.log('위험요소 ' + hazards.length + ' (사진 위치 ' + hazards.filter((h) => h.answer).length + ') · 문구 ' + phrases.length + ' · ' + plan.reasons.join(' / '));

let raw = { questions: [] };
const env = { ...readEnvLocal(), ...process.env };
const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;
const cfg = { provider: gpt ? 'openai' : undefined, key: (gpt ? env.OPENAI_API_KEY : env.GEMINI_API_KEY || '').trim(), model: run.model || env.OPENAI_MODEL, timeoutMs: 90000 };
const t0 = Date.now();
let calls = 0;
const ask = async (slots) => {
  calls += 1;
  const r = await callModel(cfg, systemText(), userText({ name: eqName }, hazards, slots.filter((s) => s.type !== 'location'), phrases), { maxOutputTokens: 8000, maxText: 24000 });
  if (r.error) { console.log('  ✗ ' + r.error + ' ' + (r.why || '')); return []; }
  const j = parseModelJson(r.text);
  return (j && Array.isArray(j.questions)) ? j.questions : [];
};
if (needsModel(plan.slots)) raw.questions = await ask(plan.slots);
let out = selectQuiz(plan, hazards, raw, phrases);
const again = plan.slots.filter((s) => s.required && out.missing.indexOf(s.slot) !== -1);
if (again.length) { raw.questions = raw.questions.concat(await ask(again)); out = selectQuiz(plan, hazards, raw, phrases); }

out.quiz.forEach((q) => {
  console.log('  ' + q.id + ' [' + q.subtype + '·' + q.difficulty + '] ' + q.hazardId + ' — ' + q.prompt);
  if (q.options) q.options.forEach((o, i) => console.log('      ' + (i === q.answer ? '●' : '○') + ' ' + o));
  console.log('      해설: ' + q.why + (q.prevention ? ' · 예방: ' + q.prevention : '') + ' · 정답 출처: ' + q.answerFrom);
});
out.excluded.forEach((x) => console.log('  ✗ 뺀 후보 slot ' + x.slot + ' — ' + x.why.join(', ') + ' — ' + x.prompt));
if (out.missing.length) console.log('  ⚠ 못 채운 칸: ' + out.missing.join(', '));
console.log('문항 ' + out.quiz.length + '/' + plan.count + ' · GPT ' + calls + '회 · ' + (Date.now() - t0) + 'ms');

run.equipment = { ...(run.equipment || {}), kind };
run.questions = { plan, ...out, rulesVersion: RULES.version, phrases: phrases.map((p) => p.id), at: new Date().toISOString() };
fs.writeFileSync(to, JSON.stringify(run, null, 2));
