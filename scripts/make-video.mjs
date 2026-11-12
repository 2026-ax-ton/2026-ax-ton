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
   ★ 안전 지시는 검수 완료 문구에서만 읽는다. AI 대본에 지시투가 있으면 위험 설명(part·risk)으로 바꾼다.
   ★ 그림은 research/videos/<출력 이름>/ 에 두고 다시 쓴다 (같은 위험이면 다시 만들지 않는다 — 비용).
   ★ 이 PC 에는 한국어 음성만 있다. 노동자 언어 음성은 서버 TTS(제출 직전 결제 예정)로 바꾼다.
   키는 .env.local, 출력하지 않는다. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
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
const kind = (run.equipment && run.equipment.kind) || (/프레스/.test(eqName) ? 'press' : /사출/.test(eqName) ? 'injection' : 'other');
const LABEL = { press: '프레스', injection: '사출성형', paint: '도장', electric: '전기설비', other: '기타' };
const seedSrc = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'seed.js'), 'utf8');
const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(seedSrc);
const phrases = (libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : [])
  .filter((p) => p.status === 'reviewed' && (p.category === '공통' || p.category === LABEL[kind])).map((p) => ({ id: p.id, ko: p.ko }))
  .filter((p, i, all) => all.findIndex((q) => q.ko === p.ko) === i);   /* 같은 문장이 id 만 다르게 여럿 있다 */
const boxes = new Map(((run.guided && run.guided.mapped) || []).map((m) => [m.id, m.box]));
const hazards = run.research.items.filter((it) => it.status === 'ok' && boxes.get(it.id))
  .map((it) => ({ id: it.id, part: it.part, risk: it.risk, official: !!it.official, box: boxes.get(it.id) }));
const has3d = kind === 'press' && Object.values(CLIPS3D).every((p) => p.every((n) => fs.existsSync(path.join(DIR3D, n + '.mp4'))));

/* ── ① 대본 (GPT 1회) ── */
const env = { ...readEnvLocal(), ...process.env };
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
  + '4) narration 은 쉬운 한국어 1~2문장, 「어디가 무엇 때문에 위험한가」만. 「~하십시오」「~하세요」「~마세요」 같은 지시투는 쓰지 않는다.\n'
  + '5) 무엇을 해야 하는지는 검수 문구 목록에서 그 위험에 맞는 것을 phraseId 로 고른다. 문구를 고쳐 쓰지 않는다.\n'
  + '6) intro 와 outro 는 한국어 한 문장씩 (지시투 금지). outroPhraseId 는 마무리로 읽을 검수 문구.\n'
  + '7) 설명 없이 JSON 하나만: {"intro":"...","hazards":[{"hazardId":"o1","accident":"끼임","visual":"pinch","narration":"...","phraseId":"ph-1"},'
  + '{"hazardId":"r5","accident":"감전","visual":"ai","happen":"...","safe":"...","narration":"...","phraseId":"ph-2"}],"outro":"...","outroPhraseId":"ph-6"}';
const user = '설비: ' + eqName + '\n위험요소:\n' + hazards.map((h) => '- ' + h.id + ' | ' + h.part + ' | ' + h.risk + (h.official ? ' | 공식 문서' : '')).join('\n')
  + '\n검수 문구:\n' + phrases.map((p) => '- ' + p.id + ': ' + p.ko).join('\n');
const t0 = Date.now();
const r = await callModel(cfg, system, user, { maxOutputTokens: 8000, maxText: 16000 });
if (r.error) { console.error('대본 실패: ' + r.error); process.exit(1); }
const raw = parseModelJson(r.text) || {};

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
  picked.push({ hazard: h, accident, visual, happen, safe, narration, fixed, phrase });
});
const intro = clean(raw.intro) || eqName + ' 의 위험한 곳을 함께 봅니다.';
const outro = clean(raw.outro);
const outroPhrase = phraseOf(raw.outroPhraseId);
console.log('대본 위험 ' + picked.length + '개 · ' + (Date.now() - t0) + 'ms · 후보 ' + (raw.hazards || []).map((s) => s.hazardId + '/' + s.accident).join(' '));
picked.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.hazard.id + ' ' + s.hazard.part + ' [' + s.accident + '/' + s.visual + '] ' + s.narration
  + (s.phrase ? ' ▶ ' + s.phrase.id + ': ' + s.phrase.ko : ' ▶ (문구 없음)') + (s.fixed ? ' (지시투라 위험 설명으로 바꿈)' : '')));
if (picked.length < HAZARDS[0]) console.log('  ※ 위험이 ' + HAZARDS[0] + '개보다 적다 — 대본이 고른 것만 쓴다');

/* ── ③ AI 그림 — 캐시가 있으면 다시 만들지 않는다 ── */
let images = 0, checks = 0;
async function genImage(prompt, file) {
  if (fs.existsSync(file)) return { file, cached: true };
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
for (const s of picked) {
  if (s.visual !== 'ai') continue;
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
  const src = path.join(DIR3D, name + '.mp4'), out = path.join(tmp, 'shot' + (shotN++) + '.mp4');
  const sec = Math.max(dur(src), minSec);
  ff(['-i', src, '-i', PENCIL, '-filter_complex', '[0:v]tpad=stop_mode=clone:stop_duration=' + sec + ',trim=duration=' + sec + ',setpts=PTS-STARTPTS,' + mark(BORDER[role]) + ',' + fades(sec)].concat(enc, [out]));
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
function speak(text) {
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
let v = speak(intro);
voice(v, photoShot(Math.max(4, v.sec + 0.8), [], 1.06, null));

for (const s of picked) {
  const p = boxPx(s.hazard.box);
  const Z = Math.min(2.4, Math.max(1.3, 0.75 * Math.min(VW / p.w, VH / p.h)));
  v = speak(s.narration);
  /* ①+② 동안 위험 설명 */
  const pair = s.visual !== 'ai' ? CLIPS3D[s.visual] : null;
  let sec = photoShot(WHERE_SEC, [p], Z.toFixed(2), p);
  const need = Math.max(4, v.sec + 0.6 - WHERE_SEC);
  sec += pair ? clipShot(pair[0], need, 'happen') : imageShot(s.happenImg.file, need, 'happen');
  voice(v, sec);
  /* ③ 동안 검수 문구 */
  const pv = s.phrase ? speak(s.phrase.ko) : null;
  const need3 = Math.max(4, pv ? pv.sec + 0.8 : 0);
  voice(pv, pair ? clipShot(pair[1], need3, 'safe') : imageShot(s.safeImg.file, need3, 'safe'));
}

/* 끝 — 설비 전체 (박스를 다 그리면 겹쳐서 읽히지 않는다) */
v = speak([outro, outroPhrase && !usedPhrase.has(outroPhrase.id) ? outroPhrase.ko : ''].filter(Boolean).join(' ... '));
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
fs.writeFileSync(to.replace(/\.mp4$/, '.script.json'), JSON.stringify({
  equipment: eqName, model: cfg.model, imageModel: IMAGE_MODEL, at: new Date().toISOString(), seconds: Math.round(total),
  calls: { script: 1, images, textChecks: checks },
  intro, outro, outroPhraseId: outroPhrase ? outroPhrase.id : '',
  hazards: picked.map((s) => ({
    hazardId: s.hazard.id, part: s.hazard.part, accident: s.accident, narration: s.narration, fixed: s.fixed, phraseId: s.phrase ? s.phrase.id : '',
    shots: [
      { role: 'where', source: 'real-photo', box: s.hazard.box },
      s.visual === 'ai' ? { role: 'happen', source: 'ai-image', prompt: s.happen, file: path.basename(s.happenImg.file), textCheck: s.happenImg.textCheck || 'cached' }
        : { role: 'happen', source: '3d', clip: CLIPS3D[s.visual][0] },
      s.visual === 'ai' ? { role: 'safe', source: 'ai-image', prompt: s.safe, file: path.basename(s.safeImg.file), textCheck: s.safeImg.textCheck || 'cached' }
        : { role: 'safe', source: '3d', clip: CLIPS3D[s.visual][1] },
    ],
  })),
}, null, 2));
console.log('영상 ' + to + ' · ' + Math.round(total) + '초 · ' + Math.round(fs.statSync(to).size / 1024) + 'KB · 그림 ' + images + '장 생성 · 글자검사 ' + checks + '회');
fs.rmSync(tmp, { recursive: true, force: true });
