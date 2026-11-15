/* 결과 파일의 평가문항을 사업장 언어로 번역해 붙인다 — 서버 /api/translate-quiz 와 같은 거르기 (api/_quiztrans.mjs).
   node scripts/translate-questions.mjs <결과 파일> <새 파일> [km,id,vi]
   언어마다 GPT 1회. 키는 .env.local, 출력하지 않는다. 정답이 검수 문구면 그 문구의 검수된 번역을 정답 선택지에 쓴다 */
import fs from 'fs';
import vm from 'vm';
import { callModel, LANG_NAMES } from '../api/_shared.mjs';
import { parseModelJson } from '../api/_hazards.mjs';
import { cleanItems, systemText, userText, readTranslations } from '../api/_quiztrans.mjs';
import { readEnvLocal } from './measure-hazards.mjs';

const [from, to, langArg] = process.argv.slice(2);
if (!from || !to) { console.error('쓰는 법: node scripts/translate-questions.mjs <결과 파일> <새 파일> [km,id,vi]'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(from, 'utf8'));
if (!run.questions || !Array.isArray(run.questions.quiz)) { console.error('문항이 없는 결과 파일입니다 (make-questions 먼저).'); process.exit(1); }
const langs = (langArg || 'km,id,vi').split(',').filter((l) => LANG_NAMES[l]);

const seedSrc = fs.readFileSync(new URL('../src/assets/seed.js', import.meta.url), 'utf8');
const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(seedSrc);
const lib = libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : [];

const env = { ...readEnvLocal(), ...process.env };
const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;
const cfg = { provider: gpt ? 'openai' : undefined, key: (gpt ? env.OPENAI_API_KEY : env.GEMINI_API_KEY || '').trim(), model: run.model || env.OPENAI_MODEL, timeoutMs: 90000 };
const items = cleanItems(run.questions.quiz);
const eqName = (run.equipment && run.equipment.name) || '';

const results = await Promise.all(langs.map(async (lang) => {
  const t0 = Date.now();
  const r = await callModel(cfg, systemText(LANG_NAMES[lang]), userText(items), { maxOutputTokens: 12000, maxText: 40000 });
  if (r.error) return { lang, error: r.error };
  return { lang, ms: Date.now() - t0, ...readTranslations(parseModelJson(r.text), items, [eqName]) };
}));

results.forEach((res) => {
  if (res.error) { console.log(res.lang + ' ✗ ' + res.error); return; }
  console.log(res.lang + ' — 번역 ' + Object.keys(res.i18n).length + '/' + items.length + ' · ' + res.ms + 'ms' + (res.failed.length ? ' · 실패 ' + JSON.stringify(res.failed) : ''));
  run.questions.quiz.forEach((q) => {
    const t = res.i18n[q.id];
    if (!t) return;
    q.i18n = q.i18n || {};
    q.i18n[res.lang] = t;
    const m = /^phrase:(.+)$/.exec(q.answerFrom || '');
    const p = m && lib.find((x) => x.id === m[1]);
    const pt = p && p.translations && p.translations[res.lang];
    if (pt && pt.text && Array.isArray(t.options)) t.options[q.answer] = pt.text;   // 검수된 문구 번역이 앞선다
  });
  const q = run.questions.quiz.find((x) => x.type === 'choice');
  if (q && q.i18n[res.lang]) console.log('   예) ' + q.i18n[res.lang].prompt + ' / ' + q.i18n[res.lang].options.join(' | '));
});
fs.writeFileSync(to, JSON.stringify(run, null, 2));
