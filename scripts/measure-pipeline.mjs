/* AI 교육 자동 생성 실측 — 리서치(S2) → 사진 위치(S3)를 **실제 Gemini** 로 한 번 돌려 본다.

   서버(`/api/research`·`/api/hazards`)와 **같은 함수**(지시문·거르기)를 쓴다.
   다른 점은 로그인·DB 를 거치지 않는다는 것뿐이다 — 내 PC 에서만 돈다.

   쓰는 법 (저장소 루트에서)
     node scripts/measure-pipeline.mjs --name "유압 프레스" --maker Hwacheon --model HPC-110
     node scripts/measure-pipeline.mjs --name "유압 프레스" --photo photos/press.jpg

   키는 `.env.local` 의 GEMINI_API_KEY (또는 GEMINI_HACKATHON_KEY). 화면에 찍지 않는다.
   ★ 아무것도 저장소에 저장하지 않는다. 사진 위 박스 미리보기만 임시 폴더에 HTML 로 쓴다.
   ★ 사진은 설비만 — 사람 얼굴·이름표 없는 것으로 (A05 §3.1). 1.5MB 이하로 (서버 상한과 같다). */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { callModel } from '../api/_shared.mjs';
import {
  parseModelJson, cleanGuidedItems, guidedSystemText, guidedUserText, mapBoxes, overlapCount,
} from '../api/_hazards.mjs';
import { systemText, userText, cleanField, cleanResult } from '../api/_research.mjs';
import { readEnvLocal } from './measure-hazards.mjs';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;   // api/hazards.mjs 와 같다
const TIER = ['', '제조사', '공공', '일반', '동영상'];

function args() {
  const a = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) { o[a[i].slice(2)] = a[i + 1]; i += 1; }
  }
  return o;
}

/** --out 파일에 결과를 남긴다 — 승인 화면의 [결과 파일 불러오기]가 읽는 모양. 키는 넣지 않는다 */
function save(o, data) {
  if (!o.out) return;
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, JSON.stringify({ kind: 'safety-ai-run', version: 1, ...data }, null, 2));
  console.log('  결과 파일: ' + o.out);
}

async function main() {
  const o = args();
  const env = { ...readEnvLocal(), ...process.env };
  /* AI_PROVIDER=openai 면 GPT (api/_openai.mjs), 아니면 Gemini — 서버와 같은 갈림 */
  const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
  if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;
  const key = (gpt ? env.OPENAI_API_KEY : (env.GEMINI_API_KEY || env.GEMINI_HACKATHON_KEY) || '').trim();
  if (!key) { console.error('.env.local 에 ' + (gpt ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY') + ' 를 넣어 주세요.'); process.exit(1); }
  /* --gold research/gold/x.json 이면 그 파일의 설비 정보로 조사한다 (사람 조사와 같은 기계) */
  if (o.gold) { const gq = JSON.parse(fs.readFileSync(o.gold, 'utf8')).equipment; o.name = o.name || gq.name; o.maker = o.maker || gq.maker; o.model = o.model || gq.model; }
  if (!o.name) { console.error('--name "설비 종류" 가 필요하다. 예: --name "유압 프레스" --maker Hwacheon --model HPC-110'); process.exit(1); }

  const model = o['model-id'] || (gpt ? env.OPENAI_MODEL : (env.AI_MODEL_RESEARCH || env.AI_MODEL_TRANSLATE || 'gemini-3.1-flash-lite'));
  if (!model) { console.error('.env.local 에 OPENAI_MODEL 을 넣어 주세요 (platform.openai.com 모델 목록에서 확인).'); process.exit(1); }
  const provider = gpt ? 'openai' : undefined;
  const eq = { name: cleanField(o.name, 60), maker: cleanField(o.maker, 60), model: cleanField(o.model, 60), year: null };

  /* ── S2 리서치 ── */
  console.log('── S2 리서치 · ' + (gpt ? 'GPT' : 'Gemini') + ' ' + model + ' · ' + [eq.name, eq.maker, eq.model].filter(Boolean).join(' / '));
  let t0 = Date.now();
  const r = await callModel({ provider, key, model, timeoutMs: 60000 }, systemText(), userText(eq),
    { maxOutputTokens: 4000, maxText: 16000, tools: [{ google_search: {} }] });
  if (r.error) { console.log('  ✗ ' + r.error + ' · ' + (r.why || '') + ' · ' + (Date.now() - t0) + 'ms'); process.exit(1); }
  const raw = parseModelJson(r.text);
  if (!raw) { console.log('  ✗ JSON 이 아니다. 앞부분: ' + JSON.stringify(String(r.text).slice(0, 200))); process.exit(1); }
  const res = cleanResult(raw, r.grounding, eq);
  const chunks = r.grounding && Array.isArray(r.grounding.groundingChunks) ? r.grounding.groundingChunks.length : 0;
  console.log('  걸린 시간 ' + (Date.now() - t0) + 'ms · 검색 근거 ' + chunks + '건 · 확인된 출처 사이트 ' + res.sourceCount + '곳'
    + (res.thin ? ' · ⚠ 자료 부족' : '') + (res.general ? ' · 일반 자료' : ''));
  console.log('  개요: ' + res.overview);
  (res.limits || []).forEach((l) => console.log('  막힘: ' + l));
  res.items.forEach((it) => {
    console.log('  ' + (it.status === 'ok' ? '✓' : '?') + ' [' + it.id + '] ' + it.part + ' · ' + it.hazard + ' — ' + it.risk);
    it.sources.forEach((s) => console.log('       출처(' + TIER[s.tier] + ') ' + s.host + ' — ' + s.title));
    if (it.unverifiedSources) console.log('       ✗ 검색 근거에 없는 출처 ' + it.unverifiedSources + '개 (버림)');
    if (it.reasons.length) console.log('       확인 필요: ' + it.reasons.join(' · '));
    if (it.conflict) console.log('       충돌: ' + it.conflict);
  });
  if (res.dropped.shape || res.dropped.over) console.log('  버린 항목 — 모양 틀림 ' + res.dropped.shape + ' · 상한 초과 ' + res.dropped.over);

  const record = { at: new Date().toISOString(), provider: gpt ? 'openai' : 'gemini', model, equipment: eq,
    research: { ...res, model }, guided: null, photo: null, ms: { research: Date.now() - t0 }, groundingCount: chunks };
  if (!o.photo) {
    console.log('\n(사진은 없다 — --photo <파일> 로 S3 까지 잴 수 있다)');
    save(o, record);
    return;
  }

  /* ── S3 사진 위치 ── */
  const abs = path.resolve(process.cwd(), o.photo);
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!fs.existsSync(abs) || !mime) { console.log('\n  ✗ 사진을 읽을 수 없다 (' + Object.keys(MIME).join(' ') + ')'); return; }
  const buf = fs.readFileSync(abs);
  if (buf.length > MAX_IMAGE_BYTES) { console.log('\n  ✗ ' + Math.round(buf.length / 1024) + 'KB — 1.5MB 아래로 줄여 주세요'); return; }

  const items = cleanGuidedItems(res.items.map((it) => ({ id: it.id, part: it.part, hazard: it.hazard })));
  console.log('\n── S3 사진 위치 · ' + path.basename(abs) + ' ' + Math.round(buf.length / 1024) + 'KB · 항목 ' + items.length + '개');
  t0 = Date.now();
  const g = await callModel({ provider, key, model, timeoutMs: 45000 }, guidedSystemText(), [
    { inline_data: { mime_type: mime, data: buf.toString('base64') } },
    { text: guidedUserText(items) },
  ], { maxOutputTokens: 2400, maxText: 4000 });
  if (g.error) { console.log('  ✗ ' + g.error + ' · ' + (g.why || '')); return; }
  const out = parseModelJson(g.text);
  if (!out) { console.log('  ✗ JSON 이 아니다. 앞부분: ' + JSON.stringify(String(g.text).slice(0, 200))); return; }
  record.photo = { file: path.relative(process.cwd(), abs).split(path.sep).join('/'), mime, data: 'data:' + mime + ';base64,' + buf.toString('base64') };
  if (out.person === true) {
    console.log('  사람·이름표가 있다고 했다 → 다시 찍게 한다');
    record.guided = { mode: 'guided', person: true, mapped: [], missing: [], dropped: {}, overlaps: 0 };
    record.photo.data = null;   // 사람이 찍힌 사진은 결과 파일에 남기지 않는다 (FR-20)
    save(o, record);
    return;
  }
  const m = mapBoxes(out, items);
  console.log('  걸린 시간 ' + (Date.now() - t0) + 'ms · 위치 ' + m.mapped.length + '곳 · 사진 더 필요 ' + m.missing.length + '곳'
    + ' · 겹침 ' + overlapCount(m.mapped.map((x) => x.answer)) + '쌍 · 버림 ' + JSON.stringify(m.dropped));
  m.mapped.forEach((x) => console.log('  ✓ [' + x.id + '] ' + x.part + ' — x ' + x.box.x0 + '~' + x.box.x1 + '%, y ' + x.box.y0 + '~' + x.box.y1 + '%'));
  m.missing.forEach((x) => console.log('  ? [' + x.id + '] ' + x.part + ' — 필요한 사진: ' + x.needsPhoto));
  record.guided = { mode: 'guided', person: false, ...m, overlaps: overlapCount(m.mapped.map((x) => x.answer)) };
  record.ms.photo = Date.now() - t0;
  save(o, record);

  /* 사람이 눈으로 판정하게 미리보기 (임시 폴더, 저장소 밖) */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const boxes = m.mapped.map((x) => '<div style="position:absolute;left:' + x.box.x0 + '%;top:' + x.box.y0 + '%;width:'
    + (x.box.x1 - x.box.x0) + '%;height:' + (x.box.y1 - x.box.y0) + '%;border:3px solid #e53935"><span style="background:#e53935;color:#fff;font:13px sans-serif;padding:1px 4px">'
    + esc(x.part) + '</span></div>').join('');
  const html = '<!doctype html><meta charset="utf-8"><title>좌표 미리보기</title><div style="position:relative;max-width:900px">'
    + '<img style="width:100%;display:block" src="data:' + mime + ';base64,' + buf.toString('base64') + '">' + boxes + '</div>';
  const file = path.join(os.tmpdir(), 'measure-pipeline-' + Date.now() + '.html');
  fs.writeFileSync(file, html);
  console.log('\n  미리보기: ' + file + '  ← 브라우저로 열어 박스가 제자리인지 본다');
}

main();
