/* 결과 파일로 안전교육 영상을 만든다 — 배포 전 로컬 시험용 (PRD-AD-08 S5).
   node scripts/make-video.mjs <결과 파일> <출력 mp4>

   위험 하나 = 세 컷 (2026-11-12 기존 안전교육 영상 조사 → 계획 vivid-doodling-newt):
     ① 어디   — 실제 설비 사진에서 AI 탐지 박스(빨강)로 천천히 확대
     ② 무슨 일 — 재연: 끼임·램 낙하는 3D 클립(scripts/video3d/press.html → render-3d.mjs), 그 밖은 AI 그림
     ③ 이렇게 — 바른 행동: 3D 클립 또는 AI 그림 + 검수 문구 음성
   음성: ①② 동안 위험 설명(AI 대본), ③ 동안 검수 문구(그대로).

   ★ 영상 안에 글자를 넣지 않는다 (C06 D-035). AI 그림 프롬프트에도 「글자·숫자·로고 금지」를 넣고,
     생긴 그림에 글자가 있는지 GPT 로 한 번 보고, 있으면 한 번 다시 만든다.
   ★ 상처·피는 그리지 않는다 — 재연은 닿기 직전까지만.
   ★ 실제 사진과 만든 그림을 섞어 헷갈리지 않게: 3D·AI 컷에는 연필 아이콘 + 테두리(재연 주황, 바른 행동 초록).
     실제 사진 컷에는 테두리·아이콘이 없고 탐지 박스(빨강)만 있다.
   ★ 안전 지시는 검수 완료 문구가 메인이다. 위험 설명(narration)에 지시투가 있으면 part·risk 로 바꾼다.
   🆕 2026-11-17 교육 전체 구성 (yesol 결정): ③ 에서 검수 문구 뒤에 GPT 수칙(guide)을 보충하고, 끝 전에 공통 수칙(general)을 넣는다.
     GPT 문장은 지시투 가능 — 대신 .script.json 의 lines 에 source:'gpt' 로 표시하고, 담당자가 검수한 뒤 배포한다.
     문구는 DB(library 표) 먼저, 없으면 seed.js. 종류 + 위험유형 태그로 고른다 (Store.phrasesFor 와 같은 규칙).
     node scripts/make-video.mjs <결과> <out.mp4> --script-only [--hazards=pinch,shock]  → 대본만 (GPT 1회)
     대본 검수·수정 → node scripts/make-video.mjs <결과> <out.mp4> --reuse  → 렌더 (GPT 대본 0회)
   ★ 그림은 research/videos/<출력 이름>/ 에 두고 다시 쓴다 (같은 위험이면 다시 만들지 않는다 — 비용).
   ★ 이 PC 에는 한국어 음성만 있다. 노동자 언어 음성은 서버 TTS(제출 직전 결제 예정)로 바꾼다.
   🆕 2026-11-23 노트북 시연용 (yesol 요청 — 배포 없이 영상만):
     --seedance       AI 그림 대신 Seedance 2.0 mini 영상 클립 (실제 설비 사진의 위험 부분을 첫 장면으로, 5초 720p, 소리 없음)
     --seedance-test  첫 위험의 재연 클립 1개만 만들고 끝낸다 (시험용, 약 $0.15)
     --tts=gemini     한국어 음성을 Gemini TTS 로 (없으면 이 PC 의 SAPI). 같은 문장은 캐시에서 다시 쓴다
     --intro3d=<mp4>  처음 컷을 3D 둘레 장면으로 (tools3d 의 milling_3d_path.mp4)
     클립·음성은 research/videos/<출력 이름>/ 에 두고 다시 쓴다 (프롬프트·문장이 같으면 다시 부르지 않는다 — 비용).
   키는 .env.local, 출력하지 않는다. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import { callModel } from '../api/_shared.mjs';
import { parseModelJson } from '../api/_hazards.mjs';
import { readEnvLocal } from './measure-hazards.mjs';

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('쓰는 법: node scripts/make-video.mjs <결과 파일> <출력 mp4>'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(from, 'utf8'));
if (!run.photo || !/^data:image\/(jpeg|png);base64,/.test(run.photo.data || '')) { console.error('설비 사진이 든 결과 파일이 필요합니다.'); process.exit(1); }

const VW = 1280, VH = 720, FPS = 24, FADE = 0.3;
const HAZARDS = [4, 5];                 /* 위험 4~5개 → 60~90초 (사용자 결정 2026-11-12) */
const WHERE_SEC = 3;                    /* ① 확대 컷 길이 */
const IMAGE_MODEL = 'gpt-image-1-mini'; /* gpt-image-1 은 2026-10-23 종료. 장당 약 $0.01 (medium) */
const STYLE = 'Flat vector safety-training illustration for factory workers. Simple shapes, muted industrial colors, clear silhouettes, '
  + 'three-quarter view, plain light background, one worker wearing a blue work uniform and cotton gloves. '
  + 'Absolutely no text, letters, numbers, labels, signs with writing, logos or watermarks anywhere. No injury, no blood, no gore.';
const CLIPS3D = { pinch: ['press_pinch', 'press_safe'], drop: ['press_drop', 'press_blocked'] };   /* [재연, 바른 행동] */
const BORDER = { happen: '0xF59E0B', safe: '0x16A34A' };
const SEED = process.argv.includes('--seedance') || process.argv.includes('--seedance-test');
const SEED_TEST = process.argv.includes('--seedance-test');
const TTS_GEMINI = process.argv.includes('--tts=gemini');
const INTRO3D = (process.argv.find((a) => a.startsWith('--intro3d=')) || '').slice('--intro3d='.length);
const SEED_MODEL = 'dreamina-seedance-2-0-mini-260615';   /* BytePlus ModelArk 모델 표 (2026-11-23 확인) */
const SEED_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
const SEED_STYLE = 'Realistic factory safety-training footage that continues from the first frame, a real milling machine. '
  + 'Keep the machine, colors and framing of the first frame; slow, gentle camera movement. One worker in a blue work uniform and cotton gloves. '
  + 'Absolutely no text, letters, numbers, signs or logos. No injury, no blood. Scene: ';
const TTS_MODEL = 'gemini-3.8-flash-tts', TTS_VOICE = 'Kore';   /* ai.google.dev speech-generation (Interactions API) */
const IMPERATIVE = /(하십시오|하세요|마세요|마십시오|해야 합니다|하지 말)/;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DIR3D = path.join(ROOT, 'research', 'videos', '3d');
const PENCIL = path.join(ROOT, 'scripts', 'video3d', 'pencil.png');
const cache = to.replace(/\.mp4$/, '');
fs.mkdirSync(cache, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-video-'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args));
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

/* ── 재료 ── */
const eqName = (run.equipment && run.equipment.name) || '';
const kind = (run.equipment && run.equipment.kind) || (/프레스/.test(eqName) ? 'press' : /사출/.test(eqName) ? 'injection' : /밀링/.test(eqName) ? 'milling' : /드릴/.test(eqName) ? 'drill' : 'other');
const LABEL = { press: '프레스', injection: '사출성형', paint: '도장', electric: '전기설비', milling: '밀링', drill: '드릴', other: '기타' };
const env = { ...readEnvLocal(), ...process.env };
const boxes = new Map(((run.guided && run.guided.mapped) || []).map((m) => [m.id, m.box]));
const hazards = run.research.items.filter((it) => it.status === 'ok' && boxes.get(it.id))
  .map((it) => ({ id: it.id, part: it.part, risk: it.risk, hazard: it.hazard || '', official: !!it.official, box: boxes.get(it.id) }));

/* 🆕 2026-11-17 문구는 DB(library 표)가 먼저, 없으면 seed.js. 매칭은 종류 + 위험유형 태그
   위험유형 = 설비에 등록한 것(run.equipment.hazards 또는 --hazards a,b) + AI 조사 항목의 hazard (Store.phrasesFor 와 같은 규칙) */
const argHz = (process.argv.find((a) => a.startsWith('--hazards=')) || '').slice('--hazards='.length);
const wantHz = new Set([...((run.equipment && run.equipment.hazards) || []), ...argHz.split(',').filter(Boolean), ...hazards.map((h) => h.hazard).filter(Boolean)]);
async function loadLibrary() {
  const url = (env.SAFETY_DATABASE_URL || env.DATABASE_URL || '').trim();
  if (url) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const rows = await neon(url)`select id, data from library`;
      if (rows.length) return { from: 'DB', list: rows.map((r) => ({ ...r.data, id: r.id })) };
    } catch (e) { console.log('DB 문구를 못 읽어 seed.js 를 쓴다: ' + String(e.message || e).slice(0, 80)); }
  }
  const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'seed.js'), 'utf8'));
  return { from: 'seed.js', list: libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : [] };
}
const lib = await loadLibrary();
const phrases = lib.list
  .filter((p) => p.status === 'reviewed' && (p.category === '공통' || p.category === LABEL[kind]))
  .filter((p) => !wantHz.size || !(p.hazards || []).length || p.hazards.some((h) => wantHz.has(h)))
  .map((p) => ({ id: p.id, ko: p.ko, hazards: p.hazards || [] }))
  .filter((p, i, all) => all.findIndex((q) => q.ko === p.ko) === i);   /* 같은 문장이 id 만 다르게 여럿 있다 */
console.log('승인 문구 ' + phrases.length + '개 (' + lib.from + ') · 위험유형 ' + [...wantHz].join(','));
const has3d = kind === 'press' && Object.values(CLIPS3D).every((p) => p.every((n) => fs.existsSync(path.join(DIR3D, n + '.mp4'))));

/* ── ① 대본 (GPT 1회) ── */
const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;
const key = (gpt ? env.OPENAI_API_KEY : env.GEMINI_API_KEY || '').trim();
const cfg = { provider: gpt ? 'openai' : undefined, key, model: run.model || env.OPENAI_MODEL, timeoutMs: 90000 };
const system = '너는 이주노동자 안전교육 영상의 대본 작가다. 글을 못 읽는 사람이 소리와 그림으로만 배운다.\n'
  + '규칙:\n'
  + '1) 위험요소 후보를 ' + (HAZARDS[1] + 2) + '개까지 중요한 순서로 낸다 (공식 문서 항목 먼저). accident 에 사고 종류를 적는다: 끼임(작업 중 손이 금형 사이에) · 낙하압착(금형 교체·정비 중 램이 저절로 내려옴 — 이것만) · 감전 · 화재누유 · 넘어짐추락 · 기타. '
  + '사고 종류가 서로 다르게 고른다 — 같은 종류는 한 번만 쓰인다.' + (has3d ? ' 끼임 1개와 낙하압착 1개는 목록에 있으면 꼭 넣는다.' : '') + '\n'
  + '2) 위험마다 visual 을 정한다: ' + (has3d ? '"pinch" = 손이 금형 사이에 들어가 램에 끼이는 사고 (3D 장면, 한 번만), "drop" = 금형 교체·정비 중 램이 갑자기 내려오는 사고 (3D 장면, 한 번만), ' : '')
  + '"ai" = 그 밖의 사고 (그림을 새로 만든다).\n'
  + '3) visual 이 "ai" 이면 happen 과 safe 에 그림 설명을 영어로 쓴다. happen = 사고 직전 순간 (아직 다치지 않음, 위험한 곳이 눈에 띄게), safe = 같은 장면에서 바른 행동. 그림에 글자가 들어갈 만한 것(표지판·화면 글씨)은 쓰지 않는다.\n'
  /* 🆕 2026-11-17 (yesol 결정) 검수 문구가 메인 + 교육 전체를 GPT 가 구성. GPT 문장(guide·general)은 지시투 가능 —
     영상은 담당자가 대본(.script.json 의 lines, source:'gpt')을 검수한 뒤 배포한다 */
  + '4) narration 은 쉬운 한국어 1~2문장, 「어디가 무엇 때문에 위험한가」만. 「~하십시오」「~하세요」「~마세요」 같은 지시투는 쓰지 않는다.\n'
  + '5) 무엇을 해야 하는지는 검수 문구가 메인이다. 검수 문구 목록에서 그 위험에 맞는 것을 phraseId 로 반드시 먼저 고른다 ([ ] 안은 그 문구가 막는 위험유형). 문구를 고쳐 쓰지 않는다.\n'
  + '6) guide 는 그 위험을 막는 일반 안전수칙 1~2문장 (쉬운 한국어, 지시투 가능). 고른 검수 문구와 같은 뜻은 되풀이하지 않고 보충만 한다. 맞는 검수 문구가 없으면 guide 가 행동을 알려 준다.\n'
  + '7) general 은 위험별 내용 밖의 공통 수칙 2~4개 (보호구, 이상할 때 멈추고 알리기, 비상정지, 정리정돈 등 이 설비에 맞는 것). 맞는 검수 문구가 있으면 phraseId 를 넣고 text 는 비운다.\n'
  + '8) intro 는 설비 소개와 교육 목적 1~2문장, outro 는 한 문장 (둘 다 지시투 금지). outroPhraseId 는 마무리로 읽을 검수 문구.\n'
  + '9) 설명 없이 JSON 하나만: {"intro":"...","hazards":[{"hazardId":"o1","accident":"끼임","visual":"pinch","narration":"...","phraseId":"ph-1","guide":"..."},'
  + '{"hazardId":"r5","accident":"감전","visual":"ai","happen":"...","safe":"...","narration":"...","phraseId":"ph-2","guide":"..."}],'
  + '"general":[{"text":"...","phraseId":""}],"outro":"...","outroPhraseId":"ph-6"}';
const user = '설비: ' + eqName + '\n위험요소:\n' + hazards.map((h) => '- ' + h.id + ' | ' + h.part + ' | ' + h.risk + (h.official ? ' | 공식 문서' : '')).join('\n')
  + '\n검수 문구:\n' + phrases.map((p) => '- ' + p.id + (p.hazards.length ? ' [' + p.hazards.join(',') + ']' : '') + ': ' + p.ko).join('\n');
const t0 = Date.now();
/* --reuse: 지난 대본(.script.json)을 그대로 쓴다 — 그림 한 장만 고칠 때 위험 구성이 바뀌지 않게 (GPT 0회) */
const scriptFile = to.replace(/\.mp4$/, '.script.json');
let raw;
if (process.argv.includes('--reuse') && fs.existsSync(scriptFile)) {
  const prev = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  const vis = (shot) => shot.source === '3d' ? Object.keys(CLIPS3D).find((k) => CLIPS3D[k].includes(shot.clip)) : 'ai';
  /* 담당자가 .script.json 의 글(narration·guide·general)을 고쳤으면 고친 대로 읽는다 */
  raw = { intro: prev.intro, outro: prev.outro, outroPhraseId: prev.outroPhraseId, general: prev.general || [],
    hazards: prev.hazards.map((h) => ({ hazardId: h.hazardId, accident: h.accident, visual: h.visual || vis(h.shots[1]),
      happen: h.happen !== undefined ? h.happen : h.shots[1].prompt, safe: h.safe !== undefined ? h.safe : h.shots[2].prompt,
      narration: h.narration, phraseId: h.phraseId, guide: h.guide || '' })) };
} else {
  const r = await callModel(cfg, system, user, { maxOutputTokens: 8000, maxText: 16000 });
  if (r.error) { console.error('대본 실패: ' + r.error); process.exit(1); }
  raw = parseModelJson(r.text) || {};
}

/* ── ② 대본 거르기 ── */
const byId = new Map(hazards.map((h) => [h.id, h]));
const phraseOf = (id) => phrases.find((p) => p.id === id) || null;
const clean = (s) => { const t = String(s || '').trim().slice(0, 200); return IMPERATIVE.test(t) ? '' : t; };
/* 사고 종류마다 한 번 — 끼임은 3D pinch, 낙하압착은 3D drop (모델이 ai 로 적어도) */
const AS3D = { '끼임': 'pinch', '낙하압착': 'drop' };
/* 사고 종류는 위험요소 글로 정한다 — 모델은 같은 끼임을 다른 종류로 적곤 했다 (2026-11-12 3회 실측). 순서가 중요하다 */
const KINDS = [['낙하압착', /교체|셋업|서스펜션|램 정지|블록|블로킹/], ['감전', /전기|감전|배선|제어반/], ['화재누유', /유압|누유|화재|누출/],
  ['넘어짐추락', /추락|미끄|상부|낙하물/], ['끼임', /가드|금형 사이|포인트|끼/]];
const classify = (h) => { const t = h.part + ' ' + h.risk; const k = KINDS.find((x) => x[1].test(t)); return k ? k[0] : ''; };
const usedKind = new Set(), usedPhrase = new Set();
const picked = [];
(Array.isArray(raw.hazards) ? raw.hazards : []).forEach((s) => {
  const h = s && byId.get(s.hazardId);
  if (!h || picked.length >= HAZARDS[1] || picked.some((p) => p.hazard.id === h.id)) return;
  const accident = classify(h) || String(s.accident || '기타').trim();
  const visual = has3d && AS3D[accident] ? AS3D[accident] : has3d && CLIPS3D[s.visual] ? s.visual : 'ai';
  const kindKey = visual !== 'ai' ? visual : accident;
  if (usedKind.has(kindKey)) return;
  const happen = String(s.happen || '').trim().slice(0, 400), safe = String(s.safe || '').trim().slice(0, 400);
  if (visual === 'ai' && (!happen || !safe)) return;
  usedKind.add(kindKey);
  const ph = phraseOf(s.phraseId);
  const phrase = ph && !usedPhrase.has(ph.id) ? ph : null;   /* 같은 문구를 두 번 읽지 않는다 */
  if (phrase) usedPhrase.add(phrase.id);
  let narration = clean(s.narration);
  const fixed = !narration;
  if (fixed) narration = h.part + '. ' + h.risk;
  const guide = String(s.guide || '').trim().slice(0, 200);   /* GPT 수칙 — 지시투 허용, 담당자 검수 대상 */
  picked.push({ hazard: h, accident, visual, happen, safe, narration, fixed, phrase, guide });
});
/* 공통 수칙 — 검수 문구가 있으면 그것, 없으면 GPT 글. 3D/그림 없이 설비 사진 컷 하나씩 */
const general = (Array.isArray(raw.general) ? raw.general : []).map((g) => {
  const ph = g && phraseOf(g.phraseId);
  const phrase = ph && !usedPhrase.has(ph.id) ? ph : null;
  if (phrase) usedPhrase.add(phrase.id);
  return { phrase, text: phrase ? '' : String((g && g.text) || '').trim().slice(0, 200) };
}).filter((g) => g.phrase || g.text).slice(0, 4);
const intro = clean(raw.intro) || eqName + ' 의 위험한 곳을 함께 봅니다.';
const outro = clean(raw.outro);
const outroPhrase = phraseOf(raw.outroPhraseId);

/* 담당자 검수용 대본 — 읽는 순서대로, 문장마다 출처(phrase = 검수 문구 그대로, gpt = AI 작성 → 검수 필요) */
const line = (at, text, src) => (text ? [{ at, source: src, text }] : []);
const lines = [].concat(line('intro', intro, 'gpt'),
  ...picked.map((s) => [].concat(line(s.hazard.id + ' 위험', s.narration, s.fixed ? 'research' : 'gpt'),
    line(s.hazard.id + ' 문구', s.phrase && s.phrase.ko, 'phrase'), line(s.hazard.id + ' 수칙', s.guide, 'gpt'))),
  ...general.map((g, i) => line('공통 ' + (i + 1), g.phrase ? g.phrase.ko : g.text, g.phrase ? 'phrase' : 'gpt')),
  line('outro', outro, 'gpt'), line('outro 문구', outroPhrase && !usedPhrase.has(outroPhrase.id) && outroPhrase.ko, 'phrase'));
const scriptJson = (extra) => JSON.stringify(Object.assign({
  equipment: eqName, model: cfg.model, at: new Date().toISOString(), phrasesFrom: lib.from, hazardTypes: [...wantHz],
  review: '★ source:"gpt" 문장은 AI 가 썼다 — 담당자가 읽고, 고칠 것은 intro·outro·hazards[].narration·guide·general[].text 에서 고친 뒤 --reuse 로 렌더해 배포한다 (lines 는 읽기용)',
  lines, intro, outro, outroPhraseId: outroPhrase ? outroPhrase.id : '',
  general: general.map((g) => ({ text: g.text, phraseId: g.phrase ? g.phrase.id : '' })),
}, extra), null, 2);
if (process.argv.includes('--script-only')) {
  fs.writeFileSync(scriptFile, scriptJson({ hazards: picked.map((s) => ({ hazardId: s.hazard.id, part: s.hazard.part, accident: s.accident, visual: s.visual,
    happen: s.happen, safe: s.safe, narration: s.narration, fixed: s.fixed, phraseId: s.phrase ? s.phrase.id : '', guide: s.guide })) }));
  lines.forEach((l) => console.log('  [' + l.source + '] ' + l.at + ': ' + l.text));
  console.log('대본만 저장: ' + scriptFile + ' — 검수 뒤 --reuse 로 렌더');
  process.exit(0);
}
console.log('대본 위험 ' + picked.length + '개 · ' + (Date.now() - t0) + 'ms · 후보 ' + (raw.hazards || []).map((s) => s.hazardId + '/' + s.accident).join(' '));
picked.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.hazard.id + ' ' + s.hazard.part + ' [' + s.accident + '/' + s.visual + '] ' + s.narration
  + (s.phrase ? ' ▶ ' + s.phrase.id + ': ' + s.phrase.ko : ' ▶ (문구 없음)') + (s.fixed ? ' (지시투라 위험 설명으로 바꿈)' : '')));
if (picked.length < HAZARDS[0]) console.log('  ※ 위험이 ' + HAZARDS[0] + '개보다 적다 — 대본이 고른 것만 쓴다');

/* ── ③ AI 그림 — 캐시가 있으면 다시 만들지 않는다 ── */
let images = 0, checks = 0;
async function genImage(prompt, file) {
  /* 캐시는 프롬프트가 같을 때만 — 옆에 둔 .txt 와 비교한다 (위험 id 만 보면 다른 장면 그림이 붙는다, 2026-11-12 겪음) */
  const side = file.replace(/\.png$/, '.txt');
  if (fs.existsSync(file) && fs.existsSync(side) && fs.readFileSync(side, 'utf8') === prompt) return { file, cached: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY.trim(), 'content-type': 'application/json' },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt: STYLE + '\n\nScene: ' + prompt, size: '1536x1024', quality: 'medium', n: 1 }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('그림 실패 ' + res.status + ' ' + String((j.error && j.error.message) || '').slice(0, 160));
    images++;
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    fs.writeFileSync(side, prompt);
    /* 글자 검사 (GPT 1회) — 있으면 한 번만 다시 */
    checks++;
    const c = await callModel(cfg, 'Answer only YES or NO.', [{ text: 'Does this image contain any readable text, letters, numbers or logos?' },
      { inline_data: { mime_type: 'image/png', data: b64 } }], { maxOutputTokens: 2000 });
    const hasText = !c.error && /^\s*yes/i.test(c.text || '');
    if (!hasText) return { file, textCheck: c.error ? 'error' : 'no' };
    console.log('  그림에 글자가 있어 다시 만든다: ' + path.basename(file));
    if (attempt === 1) return { file, textCheck: 'yes' };
    fs.unlinkSync(file);
  }
}
let clips = 0, seedTokens = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function seedClip(prompt, box, file) {
  const side = file.replace(/\.mp4$/, '.txt');
  if (fs.existsSync(file) && fs.existsSync(side) && fs.readFileSync(side, 'utf8') === prompt) return file;
  /* 첫 장면 = 실제 사진에서 위험 박스 둘레를 16:9 로 자른 것 */
  const src = path.join(tmp, 'seed-src.jpg');
  fs.writeFileSync(src, Buffer.from(run.photo.data.split(',')[1], 'base64'));
  const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).toString().trim().split(',').map(Number);
  let cw = Math.max((box.x1 - box.x0) / 100 * W * 2.2, W * 0.5), ch = cw * 9 / 16;
  if (ch > H) { ch = H; cw = ch * 16 / 9; }
  if (cw > W) { cw = W; ch = cw * 9 / 16; }
  const cx = (box.x0 + box.x1) / 200 * W, cy = (box.y0 + box.y1) / 200 * H;
  const x = Math.round(Math.min(Math.max(0, cx - cw / 2), W - cw)), y = Math.round(Math.min(Math.max(0, cy - ch / 2), H - ch));
  const first = path.join(tmp, 'seed-first.jpg');
  ff(['-i', src, '-vf', 'crop=' + (Math.floor(cw / 2) * 2) + ':' + (Math.floor(ch / 2) * 2) + ':' + x + ':' + y + ',scale=1280:720', '-q:v', '3', first]);
  if (process.env.SEED_DRY) { fs.copyFileSync(first, file.replace(/.mp4$/, '_first.jpg')); throw new Error('SEED_DRY — 첫 장면만 저장'); }
  const key = (env.SEEDANCE_API_KEY || '').trim();
  if (!key) throw new Error('SEEDANCE_API_KEY 가 .env.local 에 없다');
  const h = { Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  const body = { model: SEED_MODEL, resolution: '720p', ratio: '16:9', duration: 5, generate_audio: false, watermark: false,
    content: [{ type: 'text', text: SEED_STYLE + prompt },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(first).toString('base64') }, role: 'first_frame' }] };
  const r = await fetch(SEED_URL, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error('Seedance 시작 실패 ' + r.status + ' ' + String((j.error && j.error.message) || '').slice(0, 200));
  console.log('  Seedance ' + path.basename(file) + ' 만드는 중 (작업 ' + j.id + ')');
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const q = await fetch(SEED_URL + '/' + j.id, { headers: h, signal: AbortSignal.timeout(30000) }).catch(() => null);
    const t = q ? await q.json().catch(() => ({})) : {};
    if (t.status === 'succeeded') {
      const v = await fetch(t.content.video_url, { signal: AbortSignal.timeout(120000) });
      fs.writeFileSync(file, Buffer.from(await v.arrayBuffer()));
      fs.writeFileSync(side, prompt);
      clips++; seedTokens += (t.usage && t.usage.total_tokens) || 0;
      console.log('  완료 ' + path.basename(file) + ' · 토큰 ' + ((t.usage && t.usage.total_tokens) || '?'));
      return file;
    }
    if (['failed', 'cancelled', 'expired'].includes(t.status)) throw new Error('Seedance ' + t.status + ' ' + String((t.error && t.error.message) || '').slice(0, 200));
  }
  throw new Error('Seedance 10분 넘게 안 끝남');
}
if (SEED_TEST) {
  const s = picked.find((p) => p.visual === 'ai');
  if (!s) { console.error('AI 장면 위험이 없다'); process.exit(1); }
  const f = await seedClip(s.happen, s.hazard.box, path.join(cache, s.hazard.id + '_happen.mp4'));
  console.log('시험 클립: ' + f + ' · 새로 만든 클립 ' + clips + '개 · 토큰 ' + seedTokens);
  process.exit(0);
}
for (const s of picked) {
  if (s.visual !== 'ai') continue;
  if (SEED) {
    s.happenClip = await seedClip(s.happen, s.hazard.box, path.join(cache, s.hazard.id + '_happen.mp4'));
    s.safeClip = await seedClip(s.safe, s.hazard.box, path.join(cache, s.hazard.id + '_safe.mp4'));
    continue;
  }
  s.happenImg = await genImage(s.happen + ' The moment just before an accident; nothing bad has happened yet; a soft red warning glow marks the danger spot.', path.join(cache, s.hazard.id + '_happen.png'));
  s.safeImg = await genImage(s.safe + ' Calm, correct and safe work practice.', path.join(cache, s.hazard.id + '_safe.png'));
}

/* ── ④ 컷 만들기 (글자 없음, 1280x720, 24fps, 앞뒤 페이드) ── */
const photo = path.join(tmp, 'photo.' + (run.photo.data.indexOf('image/png') !== -1 ? 'png' : 'jpg'));
fs.writeFileSync(photo, Buffer.from(run.photo.data.split(',')[1], 'base64'));
const [PW0, PH0] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', photo]).toString().trim().split(',').map(Number);
const sc = Math.min(VW / PW0, VH / PH0), pw = Math.round(PW0 * sc / 2) * 2, ph = Math.round(PH0 * sc / 2) * 2, ox = (VW - pw) / 2, oy = (VH - ph) / 2;
const boxPx = (b) => ({ x: Math.round(ox + b.x0 / 100 * pw), y: Math.round(oy + b.y0 / 100 * ph), w: Math.max(8, Math.round((b.x1 - b.x0) / 100 * pw)), h: Math.max(8, Math.round((b.y1 - b.y0) / 100 * ph)) });
const drawBox = (p) => 'drawbox=x=' + (p.x - 4) + ':y=' + (p.y - 4) + ':w=' + (p.w + 8) + ':h=' + (p.h + 8) + ':color=white@0.9:t=3,drawbox=x=' + p.x + ':y=' + p.y + ':w=' + p.w + ':h=' + p.h + ':color=red@0.95:t=6';
const fit = 'scale=' + pw + ':' + ph + ',pad=' + VW + ':' + VH + ':' + ox + ':' + oy + ':color=0x1e2328';
const fades = (d) => 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (d - FADE).toFixed(2) + ':d=' + FADE + ',format=yuv420p';
const enc = ['-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-an'];
let shotN = 0;
const shots = [];   /* { file, sec } — 영상만 */

/* 실제 사진: 전체 → 박스 쪽으로 확대 (zoom 은 목표 배율 Z 까지) */
function photoShot(sec, list, Z, focus) {
  const out = path.join(tmp, 'shot' + (shotN++) + '.mp4'), N = Math.round(sec * FPS);
  const cx = focus ? (focus.x + focus.w / 2) * 2 : VW, cy = focus ? (focus.y + focus.h / 2) * 2 : VH;
  const zp = "zoompan=z='min(1+(" + Z + "-1)*on/" + Math.round(N * 0.7) + "," + Z + ")':x='max(0,min(iw-iw/zoom," + cx + "-iw/zoom/2))':y='max(0,min(ih-ih/zoom," + cy + "-ih/zoom/2))':d=" + N + ':s=' + VW + 'x' + VH + ':fps=' + FPS;
  ff(['-i', photo, '-vf', [fit].concat(list.map(drawBox)).concat(['scale=' + VW * 2 + ':' + VH * 2, zp, fades(sec)]).join(','), '-frames:v', String(N)].concat(enc, [out]));
  shots.push({ file: out, sec }); return sec;
}
/* 만든 그림·3D: 테두리 + 연필 아이콘 (실제 사진과 구분) */
const mark = (color) => "drawbox=x=0:y=0:w=iw:h=ih:color=" + color + ":t=14[b];[1:v]scale=72:72[i];[b][i]overlay=30:30";
function clipShot(name, minSec, role) {
  const src = /\.mp4$/.test(name) ? name : path.join(DIR3D, name + '.mp4'), out = path.join(tmp, 'shot' + (shotN++) + '.mp4');
  const sec = Math.max(dur(src), minSec);
  const base = '[0:v]scale=' + VW + ':' + VH + ':force_original_aspect_ratio=decrease,pad=' + VW + ':' + VH + ':(ow-iw)/2:(oh-ih)/2:color=0x1e2328,setsar=1,fps=' + FPS
    + ',tpad=stop_mode=clone:stop_duration=' + sec + ',trim=duration=' + sec + ',setpts=PTS-STARTPTS,';
  ff(role ? ['-i', src, '-i', PENCIL, '-filter_complex', base + mark(BORDER[role]) + ',' + fades(sec)].concat(enc, [out])
    : ['-i', src, '-filter_complex', base + fades(sec)].concat(enc, [out]));
  shots.push({ file: out, sec }); return sec;
}
function imageShot(img, sec, role) {
  const out = path.join(tmp, 'shot' + (shotN++) + '.mp4'), N = Math.round(sec * FPS);
  const zp = "zoompan=z='1+0.08*on/" + N + "':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=" + N + ':s=' + VW + 'x' + VH + ':fps=' + FPS;
  ff(['-i', img, '-i', PENCIL, '-filter_complex', '[0:v]scale=' + VW * 2 + ':' + VH * 2 + ':force_original_aspect_ratio=increase,crop=' + VW * 2 + ':' + VH * 2 + ',' + zp + ',' + mark(BORDER[role]) + ',' + fades(sec), '-frames:v', String(N)].concat(enc, [out]));
  shots.push({ file: out, sec }); return sec;
}

/* ── ⑤ 음성 — 이 PC 의 한국어 음성 (Windows SAPI). 글은 파일로 넘긴다 ── */
let wavN = 0;
let ttsCalls = 0;
async function speak(text) {
  if (TTS_GEMINI) {
    const dir = path.join(cache, 'tts');
    fs.mkdirSync(dir, { recursive: true });
    const wav = path.join(dir, crypto.createHash('sha1').update(TTS_MODEL + TTS_VOICE + text).digest('hex').slice(0, 16) + '.wav');
    if (!fs.existsSync(wav)) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'x-goog-api-key': (env.GEMINI_API_KEY || '').trim(), 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ model: TTS_MODEL, input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
          response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: TTS_VOICE }] } }) });
      const j = await r.json().catch(() => ({}));
      const a = (j.steps || []).filter((x) => x.type === 'model_output').flatMap((x) => x.content || []).filter((c) => c.type === 'audio').pop();
      if (!r.ok || !a || !a.data) throw new Error('Gemini TTS 실패 ' + r.status + ' ' + String((j.error && j.error.message) || '').slice(0, 200));
      fs.writeFileSync(wav, Buffer.from(a.data, 'base64'));
      ttsCalls++;
    }
    return { wav, sec: dur(wav) };
  }
  const wav = path.join(tmp, 'v' + (wavN++) + '.wav'), txt = wav.replace(/\.wav$/, '.txt');
  fs.writeFileSync(txt, text, 'utf8');
  const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
    + "$s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet, [System.Speech.Synthesis.VoiceAge]::NotSet, 0, [System.Globalization.CultureInfo]'ko-KR'); "
    + '$s.Rate = -1; $s.SetOutputToWaveFile(\'' + wav + '\'); $s.Speak([System.IO.File]::ReadAllText(\'' + txt + '\', [System.Text.Encoding]::UTF8)); $s.Dispose()';
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  return { wav, sec: dur(wav) };
}
const audio = [];   /* { wav|null, sec } — 컷 묶음 길이에 맞춰 뒤를 비운다 */
const voice = (v, sec) => audio.push({ wav: v && v.wav, sec });

/* 처음 */
let v = await speak(intro);
voice(v, INTRO3D ? clipShot(INTRO3D, Math.max(4, v.sec + 0.8), null) : photoShot(Math.max(4, v.sec + 0.8), [], 1.06, null));

for (const s of picked) {
  const p = boxPx(s.hazard.box);
  const Z = Math.min(2.4, Math.max(1.3, 0.75 * Math.min(VW / p.w, VH / p.h)));
  v = await speak(s.narration);
  /* ①+② 동안 위험 설명 */
  const pair = s.visual !== 'ai' ? CLIPS3D[s.visual] : null;
  let sec = photoShot(WHERE_SEC, [p], Z.toFixed(2), p);
  const need = Math.max(4, v.sec + 0.6 - WHERE_SEC);
  sec += pair ? clipShot(pair[0], need, 'happen') : s.happenClip ? clipShot(s.happenClip, need, 'happen') : imageShot(s.happenImg.file, need, 'happen');
  voice(v, sec);
  /* ③ 동안 검수 문구(메인) → GPT 수칙(보충) */
  const say3 = [s.phrase && s.phrase.ko, s.guide].filter(Boolean).join(' ... ');
  const pv = say3 ? await speak(say3) : null;
  const need3 = Math.max(4, pv ? pv.sec + 0.8 : 0);
  voice(pv, pair ? clipShot(pair[1], need3, 'safe') : s.safeClip ? clipShot(s.safeClip, need3, 'safe') : imageShot(s.safeImg.file, need3, 'safe'));
}

/* 공통 수칙 — 설비 전체 사진 한 컷씩 */
for (const g of general) {
  v = await speak(g.phrase ? g.phrase.ko : g.text);
  voice(v, photoShot(Math.max(4, v.sec + 0.8), [], 1.06, null));
}

/* 끝 — 설비 전체 (박스를 다 그리면 겹쳐서 읽히지 않는다) */
v = await speak([outro, outroPhrase && !usedPhrase.has(outroPhrase.id) ? outroPhrase.ko : ''].filter(Boolean).join(' ... '));
voice(v, photoShot(Math.max(4, v.sec + 1), [], 1.06, null));

/* ── ⑥ 이어 붙이기: 영상 따로, 음성 따로(컷 묶음 길이에 맞춤) → 합치기 ── */
const vlist = path.join(tmp, 'v.txt');
fs.writeFileSync(vlist, shots.map((s) => "file '" + s.file.replace(/\\/g, '/') + "'").join('\n'));
const vfile = path.join(tmp, 'video.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', vlist, '-c', 'copy', vfile]);
const apart = audio.map((a, i) => {
  const out = path.join(tmp, 'a' + i + '.wav');
  ff((a.wav ? ['-i', a.wav] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']).concat(['-af', 'aresample=44100,apad=whole_dur=' + a.sec.toFixed(3) + ',atrim=0:' + a.sec.toFixed(3), '-ac', '1', '-c:a', 'pcm_s16le', out]));
  return out;
});
const alist = path.join(tmp, 'a.txt');
fs.writeFileSync(alist, apart.map((f) => "file '" + f.replace(/\\/g, '/') + "'").join('\n'));
const afile = path.join(tmp, 'audio.wav');
ff(['-f', 'concat', '-safe', '0', '-i', alist, '-c', 'copy', afile]);
fs.mkdirSync(path.dirname(path.resolve(to)), { recursive: true });
ff(['-i', vfile, '-i', afile, '-c:v', 'copy', '-c:a', 'aac', '-shortest', to]);

const total = dur(to);
fs.writeFileSync(scriptFile, scriptJson({
  imageModel: SEED ? SEED_MODEL : IMAGE_MODEL, tts: TTS_GEMINI ? TTS_MODEL : 'sapi', seconds: Math.round(total), calls: { script: process.argv.includes('--reuse') ? 0 : 1, images, textChecks: checks, seedanceClips: clips, seedanceTokens: seedTokens, tts: ttsCalls },
  hazards: picked.map((s) => ({
    hazardId: s.hazard.id, part: s.hazard.part, accident: s.accident, visual: s.visual, happen: s.happen, safe: s.safe,
    narration: s.narration, fixed: s.fixed, phraseId: s.phrase ? s.phrase.id : '', guide: s.guide,
    shots: [
      { role: 'where', source: 'real-photo', box: s.hazard.box },
      s.happenClip ? { role: 'happen', source: 'ai-video', prompt: s.happen, file: path.basename(s.happenClip) }
        : s.visual === 'ai' ? { role: 'happen', source: 'ai-image', prompt: s.happen, file: path.basename(s.happenImg.file), textCheck: s.happenImg.textCheck || 'cached' }
        : { role: 'happen', source: '3d', clip: CLIPS3D[s.visual][0] },
      s.safeClip ? { role: 'safe', source: 'ai-video', prompt: s.safe, file: path.basename(s.safeClip) }
        : s.visual === 'ai' ? { role: 'safe', source: 'ai-image', prompt: s.safe, file: path.basename(s.safeImg.file), textCheck: s.safeImg.textCheck || 'cached' }
        : { role: 'safe', source: '3d', clip: CLIPS3D[s.visual][1] },
    ],
  })),
}));
console.log('영상 ' + to + ' · ' + Math.round(total) + '초 · ' + Math.round(fs.statSync(to).size / 1024) + 'KB · 그림 ' + images + '장 생성 · 글자검사 ' + checks + '회 · Seedance 클립 ' + clips + '개(토큰 ' + seedTokens + ') · TTS ' + ttsCalls + '회');
fs.rmSync(tmp, { recursive: true, force: true });
