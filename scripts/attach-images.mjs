/* 결과 파일에 항목 참고 사진을 붙인다 (api/_images.mjs).
   node scripts/attach-images.mjs <결과 파일> <새 파일>          — AI 를 다시 부르지 않고 출처 페이지만 연다
   node scripts/attach-images.mjs <결과 파일> <새 파일> --find   — 「사진 찾기」 질문을 보낸다 (파일당 GPT 3회까지, .env.local 키) */
import fs from 'fs';
import { attachImages, findPhotoHints } from '../api/_images.mjs';
import { callModel } from '../api/_shared.mjs';
import { parseModelJson } from '../api/_hazards.mjs';
import { readEnvLocal } from './measure-hazards.mjs';

const [from, to, flag] = process.argv.slice(2);
if (!from || !to) { console.error('쓰는 법: node scripts/attach-images.mjs <결과 파일> <새 파일> [--find]'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(from, 'utf8'));
const eq = run.equipment || {};
const t0 = Date.now();
run.research.items.forEach((it) => { delete it.image; });   // 다시 맞출 때 옛 사진을 남기지 않는다

/* 사진 찾기 힌트는 결과 파일에 남긴다 — --find 없이 다시 돌리면 그 힌트로 (GPT 를 다시 부르지 않는다) */
let hints = run.photoHints || {};
if (flag === '--find') {
  const env = { ...readEnvLocal(), ...process.env };
  const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
  if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;   // 실측 도구와 같게 (빠뜨리면 느려져 시간 초과)
  const key = (gpt ? env.OPENAI_API_KEY : (env.GEMINI_API_KEY || '')).trim();
  if (!key) { console.error('.env.local 에 키가 없습니다.'); process.exit(1); }
  /* 도구는 함수 60초 상한이 없다 — 질문을 파일당 MAX_CALLS 번으로 묶고(묶음이 커지는 만큼) 기다림을 늘린다 */
  const cfg = { provider: gpt ? 'openai' : undefined, key, model: run.model || env.OPENAI_MODEL, timeoutMs: 150000 };
  const MAX_CALLS = 3;
  const r = await findPhotoHints(callModel, cfg, eq, run.research.items, parseModelJson, MAX_CALLS, Math.ceil(run.research.items.length / MAX_CALLS));
  if (r.error) console.log('  ✗ 사진 찾기 실패: ' + r.error);
  hints = r.hints;
  run.photoHints = hints;
  const n = Object.values(hints);
  console.log('  사진 찾기 질문 ' + r.calls + '번 · ' + (Date.now() - t0) + 'ms · 페이지 있는 항목 ' + n.filter((h) => h.pages.length).length + ' · 영상 있는 항목 ' + n.filter((h) => h.video).length);
}

run.research = await attachImages(run.research, { budgetMs: 40000, eqName: eq.name || '', hints });
run.research.items.forEach((it) => console.log((it.image ? '  📷 ' : '  · ') + it.id + ' ' + it.part
  + (it.image ? ' — [' + it.image.kind + '] ' + it.image.host + ' 「' + it.image.alt + '」 ' + Math.round(it.image.data.length * 0.75 / 1024) + 'KB · ' + it.image.license : '')));
const kindN = (k) => run.research.items.filter((it) => it.image && it.image.kind === k).length;
console.log('사진 ' + run.research.images + '/' + run.research.items.length + ' (page ' + kindN('page') + ' · video ' + kindN('video')
  + ' · 사용 조건 확인됨 ' + run.research.items.filter((it) => it.image && it.image.license !== '확인 필요').length + ') · ' + (Date.now() - t0) + 'ms');
fs.writeFileSync(to, JSON.stringify(run, null, 2));
