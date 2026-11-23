/* 영상과 같은 위험으로 평가문항을 만든다 — 영상 그림(3D 장면·AI 그림)을 그대로 다시 쓴다. AI 호출 0회.
   node scripts/make-video-quiz.mjs <결과 파일> <영상 대본 .script.json> <새 결과 파일>
   위험마다 두 문항 (영상 ①·②③ 과 같은 순서):
   - 어디: 실제 설비 사진에서 그 자리 누르기 (hotspot, 정답 = AI 탐지 좌표 guided.mapped)
   - 그림 고르기: 「안전하게 일하는 그림」 고르기 (choice + pics). 3D 위험은 위험 장면 2장 + 바른 장면 1장, AI 그림 위험은 1장 + 1장
   ★ 그림이 정답을 정한다 → AI 가 만든 내용이라 aiWritten (담당자 검토 표시 전 발급 불가)
   ★ 그림에 역할 색 테두리를 넣지 않는다 (주황=위험·초록=안전이면 답이 보인다). 연필 아이콘만 — 실제 사진이 아니라는 표시
   ★ 글 해설은 조사 결과의 risk 와 검수 문구(reviewed)만 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const [from, scriptFile, to] = process.argv.slice(2);
if (!from || !scriptFile || !to) { console.error('쓰는 법: node scripts/make-video-quiz.mjs <결과 파일> <영상 대본 .script.json> <새 결과 파일>'); process.exit(1); }

const PIC_W = 560;                 // 폰 화면 폭이면 충분 — 그림 1장 약 30~50KB (localStorage 5MB 안에서 교육 여러 개)
const PIC_Q = 6;                   // ffmpeg JPEG 품질 (2 좋음 ~ 31 나쁨)
/* 3D 클립에서 뽑을 장면 (초) — scripts/video3d/press.html 의 동작 시각 */
const STILLS = {
  press_pinch: [2.4, 4.3],         // 손이 금형 사이로 들어감 · 램이 손 바로 위 (붉은 깜빡임)
  press_drop: [1.6, 4.2],          // 블록 없이 금형에 손 · 램이 내려오는 중
  press_safe: [3.0],               // 가드 닫힘 + 두 손 조작 버튼
  press_blocked: [3.5]             // 안전블록 끼우고 금형 작업
};
const PROMPT = '안전하게 일하는 그림을 고르세요';

const run = JSON.parse(fs.readFileSync(from, 'utf8'));
const video = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const imgDir = scriptFile.replace(/\.script\.json$/, '');
const clipDir = path.join(path.dirname(scriptFile), '3d');
const pencil = fileURLToPath(new URL('./video3d/pencil.png', import.meta.url));

const seedSrc = fs.readFileSync(new URL('../src/assets/seed.js', import.meta.url), 'utf8');
const libSrc = /var LIBRARY = (\[[\s\S]*?\n  \]);/.exec(seedSrc);
const reviewed = new Map((libSrc ? vm.runInNewContext('(' + libSrc[1] + ')') : []).filter((p) => p.status === 'reviewed').map((p) => [p.id, p.ko]));

const items = new Map(run.research.items.map((it) => [it.id, it]));
const mapped = new Map(((run.guided && run.guided.mapped) || []).map((m) => [m.id, m.answer]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vquiz-'));

/** 그림 한 장 → 작은 JPEG data URL (연필 아이콘을 왼쪽 위에) */
function pic(input, sec) {
  const out = path.join(tmp, 'p' + Math.random().toString(36).slice(2) + '.jpg');
  const src = sec === undefined ? ['-i', input] : ['-ss', String(sec), '-i', input];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(src, ['-i', pencil,
    '-filter_complex', '[0:v]scale=' + PIC_W + ':-2[b];[1:v]scale=44:44[p];[b][p]overlay=12:12', '-frames:v', '1', '-q:v', String(PIC_Q), out]));
  return 'data:image/jpeg;base64,' + fs.readFileSync(out).toString('base64');
}

const quiz = [];
const skipped = [];
video.hazards.forEach((h, n) => {
  const it = items.get(h.hazardId);
  const answer = mapped.get(h.hazardId);
  if (!it || !answer) { skipped.push(h.hazardId + ' (조사 항목·사진 위치 없음)'); return; }
  const phrase = h.phraseId && reviewed.get(h.phraseId) ? h.phraseId : '';
  const sources = it.sources || [];
  const base = { hazard: it.hazard, hazardId: h.hazardId, why: it.risk, sources, i18n: {} };
  quiz.push({ ...base, id: 'q' + (quiz.length + 1), type: 'hotspot', subtype: 'location', difficulty: 'easy',
    prompt: '사진에서 「' + it.part + '」을(를) 누르세요', prevention: '', evidence: '영상 ① 과 같은 자리 · 설비 사진에서 위치 확인',
    answerFrom: 'photo', aiWritten: false, answer, figure: 'photo' });

  const [happen, safe] = [h.shots[1], h.shots[2]];
  /* 🆕 2026-11-23 Seedance 클립(ai-video) — 사고 직전 장면 2컷(2초·4.5초) + 바른 장면 1컷(3초) */
  const vid = (shot) => path.join(imgDir, shot.file);
  const danger = happen.source === 'ai-video' ? [pic(vid(happen), 2), pic(vid(happen), 4.5)] : happen.source === '3d' ? STILLS[happen.clip].map((t) => pic(path.join(clipDir, happen.clip + '.mp4'), t)) : [pic(path.join(imgDir, happen.file || h.hazardId + '_happen.png'))];
  const good = safe.source === 'ai-video' ? pic(vid(safe), 3) : safe.source === '3d' ? pic(path.join(clipDir, safe.clip + '.mp4'), STILLS[safe.clip][0]) : pic(path.join(imgDir, safe.file || h.hazardId + '_safe.png'));
  const at = n % (danger.length + 1);           // 정답 자리를 위험마다 옮긴다 — 늘 같은 번호면 외워서 맞힌다
  const pics = danger.slice();
  pics.splice(at, 0, good);
  const safeText = phrase ? reviewed.get(phrase) : '';
  quiz.push({ ...base, id: 'q' + (quiz.length + 1), type: 'choice', subtype: 'picture', difficulty: 'medium', prompt: PROMPT,
    prevention: safeText, evidence: '영상 ②·③ 장면 (' + (happen.source === '3d' ? '3D 재연' : happen.source === 'ai-video' ? 'AI 영상(Seedance)' : 'AI 그림') + ')',
    answerFrom: phrase ? 'picture+phrase:' + phrase : 'picture', aiWritten: true,
    options: pics.map((_, i) => '그림 ' + (i + 1)), pics, answer: at,
    results: pics.map((_, i) => (i === at ? (safeText || it.risk) : it.risk)) });
});
fs.rmSync(tmp, { recursive: true, force: true });

const bytes = quiz.reduce((s, q) => s + (q.pics || []).reduce((a, p) => a + p.length, 0), 0);
quiz.forEach((q) => console.log('  ' + q.id + ' [' + q.subtype + '] ' + q.hazardId + ' — ' + q.prompt + (q.pics ? ' · 그림 ' + q.pics.length + '장, 정답 ' + (q.answer + 1) + '번' : '')));
if (skipped.length) console.log('  ✗ 뺀 위험: ' + skipped.join(', '));
console.log('문항 ' + quiz.length + ' · 그림 ' + Math.round(bytes / 1024) + 'KB · AI 호출 0회');

run.questions = {
  plan: { count: quiz.length, slots: [], reasons: ['영상 ' + path.basename(scriptFile) + ' 의 위험 ' + video.hazards.length + '개 — 위험마다 사진 위치 1 + 그림 고르기 1'] },
  quiz, excluded: [], missing: [], rulesVersion: 'video-quiz-1', phrases: [...new Set(video.hazards.map((h) => h.phraseId).filter(Boolean))],
  video: path.basename(scriptFile), at: new Date().toISOString()
};
fs.writeFileSync(to, JSON.stringify(run, null, 2));
