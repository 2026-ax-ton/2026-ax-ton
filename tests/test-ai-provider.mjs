/* AI 공급사 고르기 — 함수 묶음마다 (2026-11-22)

   밀링·드릴 조사가 gemini-3.1-flash-lite 로 돌아 출처가 0개였다 → 조사 묶음만 GPT 로 돌릴 수 있게 했다.
   지키는 것: AI_PROVIDER_RESEARCH=openai 면 조사 묶음은 GPT · 번역 등 나머지는 그대로 AI_PROVIDER · 키가 없으면 null */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');
const { readConfig } = await import('../api/_shared.mjs');

const keep = { ...process.env };
const set = (o) => { for (const k of ['AI_PROVIDER', 'AI_PROVIDER_RESEARCH', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'GEMINI_API_KEY', 'AI_MODEL_TRANSLATE']) delete process.env[k]; Object.assign(process.env, o); };

set({ GEMINI_API_KEY: 'g', AI_MODEL_TRANSLATE: 'gemini-x', AI_PROVIDER_RESEARCH: 'openai', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'gpt-x' });
eq('★★ 조사 묶음은 AI_PROVIDER_RESEARCH 를 본다 → GPT', readConfig('AI_MODEL_TRANSLATE', 'AI_PROVIDER_RESEARCH').provider, 'openai');
eq('조사 묶음 모델은 OPENAI_MODEL', readConfig('AI_MODEL_TRANSLATE', 'AI_PROVIDER_RESEARCH').model, 'gpt-x');
ok('★ 번역(묶음 지정 없음)은 그대로 Gemini', !readConfig('AI_MODEL_TRANSLATE').provider && readConfig('AI_MODEL_TRANSLATE').model === 'gemini-x');

set({ GEMINI_API_KEY: 'g', AI_MODEL_TRANSLATE: 'gemini-x' });
ok('묶음 값이 없으면 AI_PROVIDER(기본 Gemini) 그대로', !readConfig('AI_MODEL_TRANSLATE', 'AI_PROVIDER_RESEARCH').provider);

set({ AI_PROVIDER_RESEARCH: 'openai' });
eq('★ GPT 키가 없으면 null (지어내지 않는다)', readConfig('AI_MODEL_TRANSLATE', 'AI_PROVIDER_RESEARCH'), null);

set({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'gpt-x' });
eq('AI_PROVIDER=openai 는 예전처럼 전부 GPT', readConfig('AI_MODEL_BACK').provider, 'openai');

for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
Object.assign(process.env, keep);
report('AI 공급사 고르기 — 함수 묶음마다');
