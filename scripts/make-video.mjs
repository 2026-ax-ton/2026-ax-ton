/* 결과 파일로 안전교육 영상(슬라이드 + 음성)을 만든다 — 배포 전 로컬 시험용 (PRD-AD-08 S5 기본안).
   node scripts/make-video.mjs <결과 파일> <출력 mp4>

   흐름: GPT 가 장면 대본(장면마다 위험요소·설명·읽을 검수 문구)을 쓴다 (1회)
        → 실제 설비 사진에 그 위험의 AI 탐지 박스를 그린 장면 그림 (ffmpeg drawbox)
        → 장면마다 음성 (이 PC 의 Windows 음성, 한국어) → ffmpeg 로 이어 붙인다

   ★ 영상 안에 글자를 넣지 않는다 — 글을 못 읽는 노동자용 (C06 D-035). 그림(박스)과 소리로만.
   ★ 안전 지시(「~하십시오」)는 검수 완료 문구에서만 읽는다. AI 대본은 「무엇이 왜 위험한가」 설명만 —
     지시투로 쓰면 그 문장을 버리고 위험요소 설명(risk)으로 바꾼다.
   ★ 이 PC 에는 한국어 음성만 있다. 크메르어 등 노동자 언어 음성은 서버 TTS(제출 직전 결제 예정)로 바꾼다.
   ★ 유료 AI 영상 클립(fal.ai)은 키(FAL_KEY)가 생기면 장면 그림을 그 클립으로 바꿔 끼운다 — 지금은 사진 장면.
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

const MAX_SCENES = 8;
const IMPERATIVE = /(하십시오|하세요|마세요|마십시오|해야 합니다|하지 말)/;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-video-'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args));

/* ── 재료 ── */
const eqName = (run.equipment && run.equipment.name) || '';
const kind = (run.equipment && run.equipment.kind) || (/프레스/.test(eqName) ? 'press' : /사출/.test(eqName) ? 'injection' : 'other');
const LABEL = { press: '프레스', injection: '사출성형', paint: '도장', electric: '전기설비', other: '기타' };
const seedSrc = fs.readFileSync(new URL('../src/assets/seed.js', import.meta.url), 'utf8');
const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(seedSrc);
const phrases = (libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : [])
  .filter((p) => p.status === 'reviewed' && (p.category === '공통' || p.category === LABEL[kind])).map((p) => ({ id: p.id, ko: p.ko }));
const boxes = new Map(((run.guided && run.guided.mapped) || []).map((m) => [m.id, m.box]));
const hazards = run.research.items.filter((it) => it.status === 'ok')
  .map((it) => ({ id: it.id, part: it.part, risk: it.risk, official: !!it.official, box: boxes.get(it.id) || null }));

/* ── ① 대본 (GPT 1회) ── */
const env = { ...readEnvLocal(), ...process.env };
const gpt = (env.AI_PROVIDER || '').trim() === 'openai';
if (gpt && env.OPENAI_REASONING) process.env.OPENAI_REASONING = env.OPENAI_REASONING;
const cfg = { provider: gpt ? 'openai' : undefined, key: (gpt ? env.OPENAI_API_KEY : env.GEMINI_API_KEY || '').trim(), model: run.model || env.OPENAI_MODEL, timeoutMs: 90000 };
const system = '너는 이주노동자 안전교육 영상의 대본 작가다. 글을 못 읽는 사람이 소리와 사진으로만 배운다.\n'
  + '규칙:\n'
  + '1) 장면은 많아도 ' + MAX_SCENES + '개: 처음(intro) 1개, 위험요소(hazard) 장면들, 끝(outro) 1개.\n'
  + '2) hazard 장면은 사진 위치(box)가 있는 위험요소를 고른다. 공식 문서(official) 항목을 먼저 넣는다.\n'
  + '3) narration 은 쉬운 한국어 1~2문장. 「무엇이 왜 위험한가」만 설명한다. 「~하십시오」「~하세요」「~마세요」 같은 지시투는 쓰지 않는다.\n'
  + '4) 무엇을 해야 하는지는 검수 문구 목록에서 그 장면에 맞는 것을 phraseId 로 고른다 (없으면 비운다). 문구를 고쳐 쓰지 않는다.\n'
  + '5) 설명 없이 JSON 하나만: {"scenes":[{"type":"intro","narration":"..."},{"type":"hazard","hazardId":"o1","narration":"...","phraseId":"ph-1"},{"type":"outro","narration":"...","phraseId":"ph-6"}]}';
const user = '설비: ' + eqName + '\n위험요소:\n' + hazards.map((h) => '- ' + h.id + ' | ' + h.part + ' | ' + h.risk + (h.official ? ' | 공식 문서' : '') + (h.box ? ' | 사진 위치 있음' : '')).join('\n')
  + '\n검수 문구:\n' + phrases.map((p) => '- ' + p.id + ': ' + p.ko).join('\n');
const t0 = Date.now();
const r = await callModel(cfg, system, user, { maxOutputTokens: 6000, maxText: 12000 });
if (r.error) { console.error('대본 실패: ' + r.error); process.exit(1); }
const raw = parseModelJson(r.text) || { scenes: [] };

/* ── ② 대본 거르기 — 지시투 문장은 버리고 위험 설명으로, 문구는 검수 목록에서만 ── */
const byId = new Map(hazards.map((h) => [h.id, h]));
const scenes = [];
(Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, MAX_SCENES).forEach((s) => {
  if (!s || typeof s !== 'object') return;
  const h = s.type === 'hazard' ? byId.get(s.hazardId) : null;
  if (s.type === 'hazard' && !h) return;
  let narration = String(s.narration || '').trim().slice(0, 200);
  const fixed = IMPERATIVE.test(narration);
  if (fixed) narration = h ? h.part + '. ' + h.risk : '';
  const phrase = phrases.find((p) => p.id === s.phraseId) || null;
  scenes.push({ type: s.type, hazard: h, narration, phrase, fixed });
});
console.log('대본 ' + scenes.length + '장면 · ' + (Date.now() - t0) + 'ms');
scenes.forEach((s, i) => console.log('  ' + (i + 1) + '. [' + s.type + (s.hazard ? ' ' + s.hazard.id + ' ' + s.hazard.part : '') + '] ' + s.narration
  + (s.phrase ? ' ▶ 검수 문구 ' + s.phrase.id + ': ' + s.phrase.ko : '') + (s.fixed ? ' (지시투라 위험 설명으로 바꿈)' : '')));

/* ── ③ 장면 그림 — 실제 사진 + 그 위험의 AI 탐지 박스 (글자 없음) ── */
const ext = run.photo.data.indexOf('image/png') !== -1 ? 'png' : 'jpg';
const photo = path.join(tmp, 'photo.' + ext);
fs.writeFileSync(photo, Buffer.from(run.photo.data.split(',')[1], 'base64'));
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', photo]).toString().trim().split(',');
const W = Number(probe[0]), H = Number(probe[1]);

/* ── ④ 음성 — 이 PC 의 한국어 음성 (Windows SAPI). 글은 파일로 넘긴다 (따옴표·줄바꿈 안전) ── */
function speak(text, wav) {
  const txt = wav.replace(/\.wav$/, '.txt');
  fs.writeFileSync(txt, text, 'utf8');
  const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
    + "$s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet, [System.Speech.Synthesis.VoiceAge]::NotSet, 0, [System.Globalization.CultureInfo]'ko-KR'); "
    + '$s.Rate = -1; $s.SetOutputToWaveFile(\'' + wav + '\'); $s.Speak([System.IO.File]::ReadAllText(\'' + txt + '\', [System.Text.Encoding]::UTF8)); $s.Dispose()';
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
}

const parts = [];
scenes.forEach((s, i) => {
  const img = path.join(tmp, 'scene' + i + '.png');
  const b = s.hazard && s.hazard.box;
  const vf = ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  if (b) {
    const x = Math.round(b.x0 / 100 * W), y = Math.round(b.y0 / 100 * H);
    const w = Math.max(8, Math.round((b.x1 - b.x0) / 100 * W)), h = Math.max(8, Math.round((b.y1 - b.y0) / 100 * H));
    vf.unshift('drawbox=x=' + (x - 4) + ':y=' + (y - 4) + ':w=' + (w + 8) + ':h=' + (h + 8) + ':color=white@0.9:t=4', 'drawbox=x=' + x + ':y=' + y + ':w=' + w + ':h=' + h + ':color=red@0.95:t=8');
  }
  ff(['-i', photo, '-vf', vf.join(','), '-frames:v', '1', img]);
  const wav = path.join(tmp, 'scene' + i + '.wav');
  speak([s.narration, s.phrase ? s.phrase.ko : ''].filter(Boolean).join(' ... '), wav);
  const mp4 = path.join(tmp, 'scene' + i + '.mp4');
  ff(['-loop', '1', '-i', img, '-i', wav, '-af', 'apad=pad_dur=0.8', '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
  parts.push(mp4);
});
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, parts.map((p) => "file '" + p.replace(/\\/g, '/') + "'").join('\n'));
fs.mkdirSync(path.dirname(path.resolve(to)), { recursive: true });
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', to]);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', to]).toString().trim();
fs.writeFileSync(to.replace(/\.mp4$/, '.script.json'), JSON.stringify({ equipment: eqName, model: cfg.model, at: new Date().toISOString(),
  scenes: scenes.map((s) => ({ type: s.type, hazardId: s.hazard ? s.hazard.id : '', narration: s.narration, phraseId: s.phrase ? s.phrase.id : '', fixed: s.fixed })) }, null, 2));
console.log('영상 ' + to + ' · ' + Math.round(Number(dur)) + '초 · ' + Math.round(fs.statSync(to).size / 1024) + 'KB');
fs.rmSync(tmp, { recursive: true, force: true });
