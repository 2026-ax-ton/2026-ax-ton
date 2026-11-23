// 3D 돌려보기 문항 재료 — 촬영 사진(COLMAP 등록) 묶음 + 위험 위치를 3D 점으로 올려 사진마다 정답 위치(%)를 구한다 (2026-11-23)
// node orbit-scene.mjs <COLMAP txt 폴더> <이미지 폴더> <AI 조사 결과 파일> <기준 사진 이름> <출력 폴더> [url 앞부분]
//   기준 사진 = 조사 결과의 위험 박스가 그려진 사진 (COLMAP 에 등록돼 있어야 한다)
//   위험 3D 점 = 기준 사진에서 박스 가운데 60% 안에 있는 특징점들의 3D 좌표 중앙값
//   보임 판정 = 화면 안에 투영되고, 그 사진도 같은 3D 점 묶음 중 하나 이상을 관측했다 (가림 근사)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const [txt, imgDir, runFile, refName, outDir, urlBase = ''] = process.argv.slice(2);
if (!outDir) { console.error('쓰는 법: node orbit-scene.mjs <txt> <images> <run.json> <기준 사진> <출력> [url 앞부분]'); process.exit(1); }
const FRAME_W = 540;          // 폰 폭이면 충분
const NAME_RE = /^0-(\d+)-(\d+)\.jpg$/;   // 촬영 가이드 이름 (각도-몇 번째) — 카톡 사진 등은 뺀다

const lines = (f) => fs.readFileSync(path.join(txt, f), 'utf8').split(/\r?\n/).filter((l) => l && l[0] !== '#');
const cams = new Map(lines('cameras.txt').map((l) => { const p = l.split(/\s+/); return [p[0], { w: +p[2], h: +p[3], f: +p[4], cx: +p[5], cy: +p[6], k: +(p[7] || 0) }]; }));
const imgs = [];
const il = lines('images.txt');
for (let i = 0; i < il.length; i += 2) {
  const p = il[i].split(/\s+/);
  const pts = (il[i + 1] || '').trim().split(/\s+/);
  const obs = [];
  for (let j = 0; j + 2 < pts.length + 1; j += 3) if (pts[j + 2] !== undefined && pts[j + 2] !== '-1') obs.push({ x: +pts[j], y: +pts[j + 1], id: pts[j + 2] });
  imgs.push({ q: p.slice(1, 5).map(Number), t: p.slice(5, 8).map(Number), cam: cams.get(p[8]), name: p[9], obs, ids: new Set(obs.map((o) => o.id)) });
}
const P3 = new Map(lines('points3D.txt').map((l) => { const p = l.split(/\s+/); return [p[0], [+p[1], +p[2], +p[3]]]; }));

const rot = ([w, x, y, z]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
function project(im, X) {
  const R = rot(im.q);
  const c = R.map((r, i) => r[0] * X[0] + r[1] * X[1] + r[2] * X[2] + im.t[i]);
  if (c[2] <= 0) return null;
  const a = c[0] / c[2], b = c[1] / c[2], d = 1 + im.cam.k * (a * a + b * b);
  return { u: im.cam.f * a * d + im.cam.cx, v: im.cam.f * b * d + im.cam.cy };
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
const ref = imgs.find((im) => im.name === refName);
if (!ref) { console.error('기준 사진이 COLMAP 에 없다: ' + refName); process.exit(1); }
const frames = imgs.filter((im) => NAME_RE.test(im.name))
  .sort((a, b) => { const ma = NAME_RE.exec(a.name), mb = NAME_RE.exec(b.name); return (+ma[1] - +mb[1]) || (+ma[2] - +mb[2]); });

const hazards = {};
const report = [];
for (const m of (run.guided && run.guided.mapped) || []) {
  const b = m.box, W = ref.cam.w, H = ref.cam.h;
  const sx = (b.x1 - b.x0) * 0.2, sy = (b.y1 - b.y0) * 0.2;   // 박스 가운데 60%
  const inBox = ref.obs.filter((o) => { const x = o.x / W * 100, y = o.y / H * 100; return x >= b.x0 + sx && x <= b.x1 - sx && y >= b.y0 + sy && y <= b.y1 - sy && P3.has(o.id); });
  if (inBox.length < 3) { report.push(m.id + ' 특징점 ' + inBox.length + '개 — 3D 로 못 올림'); continue; }
  const X = [0, 1, 2].map((k) => median(inBox.map((o) => P3.get(o.id)[k])));
  const ids = new Set(inBox.map((o) => o.id));
  const r = (m.answer && m.answer.r) || 10;
  const per = frames.map((im) => {
    const p = project(im, X);
    if (!p || p.u < 0 || p.v < 0 || p.u > im.cam.w || p.v > im.cam.h) return null;
    let seen = 0; for (const id of ids) if (im.ids.has(id)) seen++;
    if (!seen) return null;
    return { x: Math.round(p.u / im.cam.w * 1000) / 10, y: Math.round(p.v / im.cam.h * 1000) / 10, r };
  });
  hazards[m.id] = per;
  report.push(m.id + ' ' + m.part + ' — 특징점 ' + inBox.length + ' · 보이는 장면 ' + per.filter(Boolean).length + '/' + frames.length);
}

fs.mkdirSync(outDir, { recursive: true });
const names = frames.map((im, i) => {
  const n = String(i).padStart(2, '0') + '.jpg';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(imgDir, im.name), '-vf', 'scale=' + FRAME_W + ':-2', '-q:v', '5', path.join(outDir, n)]);
  return urlBase + n;
});
const refIndex = frames.indexOf(ref);
fs.writeFileSync(path.join(outDir, 'scene.json'), JSON.stringify({ at: new Date().toISOString(), source: path.basename(txt), frames: names, from: frames.map((im) => im.name), ref: refIndex, hazards }, null, 1));
report.forEach((l) => console.log(l));
console.log('장면 ' + frames.length + '장 · 기준 사진 ' + refIndex + '번 → ' + path.join(outDir, 'scene.json'));
