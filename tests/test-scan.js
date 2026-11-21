/* 설비 촬영 가이드 (admin/scan.html, 시제품 2026-11-14) — 화면이 뜨고, 찍을지 거르는 계산이 맞는가 */
const { boot, ok, eq, has, report } = require('./harness');

const t = boot('admin/scan.html?equipment=e-press3', { page: 'admin/scan.js', login: 'kim@daesung.co.kr', role: 'admin' });
const M = t.win.ScanMath;
const C = M.C;
const empty = () => Array.from({ length: C.SEGMENTS }, () => []);

ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
ok('고른 설비 이름이 보인다', t.$('scan-equip').textContent.length > 0 && !/고르지 않음/.test(t.$('scan-equip').textContent), t.$('scan-equip').textContent);
/* 2026-11-16 Figma 시안 — 카메라 칸은 늘 자리를 보이고, 켜기 전에는 안내만 */
ok('촬영 전에는 카메라가 꺼진 상태 (live 아님) · 안내가 보인다', !t.$('scan-stage').classList.contains('live') && !!t.$('scan-idle'));
has('개인정보 주의 띠', t.$('scan-stage').textContent, '사람 얼굴');
eq('촬영 전에는 멈추기를 못 누른다', t.$('btn-scan-stop2').disabled, true);

/* ★★ 촬영 전에 「두 바퀴에 무엇을 하는지」가 보인다 (PR #18 `ab09b86`).
   🆕 2026-11-17 — 합치기에서 이 칸이 조용히 빠져 있었다. 촬영을 처음 하는 사람은
   [촬영 시작]을 누르기 전에 무엇을 할지 알 수 없었다 (촬영 대본을 넘겨받는 사람이 그 처지다). */
{
  const steps = [...t.win.document.querySelectorAll('.scan-steps li')];
  eq('★★ 촬영 전 안내가 세 줄이다 (허리 높이 · 팔 들고 · 알아서 올라감)', steps.length, 3);
  has('★ 1번 — 허리 높이 한 바퀴', steps[0].textContent, '허리 높이');
  has('★ 2번 — 팔을 들고 한 바퀴 더', steps[1].textContent, '팔을 들고');
  has('★ 3번 — 다 찍으면 알아서 올라간다', steps[2].textContent, '알아서 올라갑니다');
  ok('★ 번호를 색이 아니라 글자·표시로 구분한다 (C05 UI-3)',
    steps.every((li) => !!li.querySelector('.n')));
}

/* 카메라를 못 켜는 곳 — 조용히 실패하지 않고 이유를 말한다 */
t.$('btn-scan-start').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
has('★ 카메라를 못 켜면 이유를 적는다', t.$('scan-status').textContent, '카메라');

/* 방향 → 칸 */
eq('0° → 0번 칸', M.segmentOf(0, 24), 0);
eq('359° → 마지막 칸', M.segmentOf(359.9, 24), 23);
eq('-15° → 23번 칸 (음수도 한 바퀴로)', M.segmentOf(-15, 24), 23);
eq('375° → 1번 칸', M.segmentOf(375, 24), 1);

/* 선명도 — 무늬 있는 화면이 민 화면보다 선명하다 */
const w = 20, h = 20;
const flat = new Array(w * h).fill(128);
const checker = Array.from({ length: w * h }, (_, i) => (((i % w) + Math.floor(i / w)) % 2 ? 230 : 30));
const sFlat = M.stats(flat, w, h), sCheck = M.stats(checker, w, h);
eq('민 화면 선명도 0', sFlat.sharp, 0);
ok('무늬 화면이 더 선명하다', sCheck.sharp > C.SHARP_MIN, String(sCheck.sharp));
eq('평균 밝기', Math.round(sFlat.mean), 128);

/* 거르기 */
eq('어두우면 dark', M.verdict({ mean: 10, sharp: 500 }, 0), 'dark');
eq('너무 밝으면 bright', M.verdict({ mean: 250, sharp: 500 }, 0), 'bright');
eq('빨리 돌면 fast', M.verdict({ mean: 120, sharp: 500 }, 90), 'fast');
eq('흐리면 blur', M.verdict({ mean: 120, sharp: 5 }, 0), 'blur');
eq('괜찮으면 찍는다', M.verdict({ mean: 120, sharp: 500 }, 5), '');

/* 자세 — 무엇을 어떻게 고칠지 (위쪽 띠) */
eq('오른쪽이 내려가면 tiltRight', M.posture(30, 90, 0), 'tiltRight');
eq('왼쪽이 내려가면 tiltLeft', M.posture(-30, 90, 0), 'tiltLeft');
eq('낮게 돌 때 바닥을 보면 pitchDown', M.posture(0, 30, 0), 'pitchDown');
eq('낮게 돌 때 하늘을 보면 pitchUp', M.posture(0, 150, 0), 'pitchUp');
eq('낮게 돌 때 똑바로 서면 바르다', M.posture(0, 90, 0), '');
eq('★ 높게 돌 때는 내려다보는 것이 바르다 (같은 각도도 바퀴마다 다르다)', M.posture(0, 50, 1) + '|' + M.posture(0, 50, 0), '|pitchDown');
eq('높게 돌 때 똑바로 서 있으면 pitchUp (숙이라고 말한다)', M.posture(0, 110, 1), 'pitchUp');
eq('앞뒤 센서가 없으면 좌우만 본다', M.posture(5, null, 0), '');
ok('위쪽 띠 자리가 있다 (문제 + 고칠 방향)', !!t.$('scan-coach') && !!t.$('scan-coach-what') && !!t.$('scan-coach-fix') && t.$('scan-coach').hidden);

/* 칸마다 PER_SEG 장 — 더 선명한 것으로 바꾼다 */
const list = [];
for (let i = 0; i < C.PER_SEG; i++) ok('칸이 찰 때까지 넣는다', M.keep(list, { sharp: 100 + i }));
eq('더 흐린 것은 넣지 않는다', M.keep(list, { sharp: 50 }), false);
ok('더 선명한 것으로 바꾼다', M.keep(list, { sharp: 999 }) && list.some((s) => s.sharp === 999) && list.length === C.PER_SEG);

/* 진행 · 빈 쪽 */
const segs = empty();
eq('빈 링 → 0', M.coverage(segs), 0);
eq('다 비면 0번부터', M.biggestGap(segs), 0);
for (let i = 0; i < 12; i++) segs[i].push({});
eq('반 찼다', M.coverage(segs), 0.5);
eq('★ 가장 긴 빈 구간의 가운데 (12~23 → 18)', M.biggestGap(segs), 18);
segs[18].push({});
const g = M.biggestGap(segs);
ok('가운데를 채우면 남은 긴 쪽을 가리킨다', g >= 12 && g <= 17, String(g));
const full = empty();
full.forEach((l) => l.push({}));
eq('다 차면 -1', M.biggestGap(full), -1);

/* 🆕 2026-11-21 동영상으로 넣기 (ScanShots) — 가이드 촬영과 같은 거르기 · 같은 칸 */
{
  const V = t.win.ScanShots;
  const samples = [];
  for (let i = 0; i < 96; i++) samples.push({ t: i * 0.5 + 0.25, mean: 120, sharp: 100 + i });
  samples.push({ t: 1.1, mean: 10, sharp: 900 });    // 어두움
  samples.push({ t: 1.2, mean: 120, sharp: 5 });     // 흔들림
  samples.push({ t: 1.3, mean: 250, sharp: 900 });   // 역광
  const p = V.pick(samples, 48);
  const all = p.flat(2);
  eq('두 바퀴로 나눈다', p.length, 2);
  ok('★ 앞 절반은 낮게(허리 높이) 바퀴', p[0].every((l) => l.every((s) => s.t < 24 && s.pass === 0)));
  ok('★ 뒤 절반은 높게(팔 들고) 바퀴', p[1].every((l) => l.every((s) => s.t >= 24 && s.pass === 1)));
  ok('★★ 어둡거나 흔들리거나 역광인 장면은 거른다 (가이드 촬영과 같은 기준)', !all.some((s) => [1.1, 1.2, 1.3].includes(s.t)));
  eq('★★ 거르기를 통과한 장면은 전부 남긴다 (3D 재료 — 칸마다 2장 상한 없음)', V.count(p), 96);
  eq('고르게 찍힌 영상이면 한 바퀴 칸이 다 찬다', M.coverage(p[0]) + M.coverage(p[1]), 2);
  eq('장 수 세기', V.count(p), all.length);
  eq('★ 설비 사진은 낮은 바퀴(정면)에서 고른다', V.best(p).pass, 0);
  eq('다 흔들렸으면 고를 장면이 없다', V.best(V.pick([{ t: 1, mean: 120, sharp: 1 }], 10)), null);
  eq('길이를 모르면 버리지 않고 첫 칸에 둔다', V.count(V.pick([{ t: 1, mean: 120, sharp: 500 }], 0)), 1);
}

report('설비 촬영 가이드');
