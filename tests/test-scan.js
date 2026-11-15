/* 설비 촬영 가이드 (admin/scan.html, 시제품 2026-11-14) — 화면이 뜨고, 찍을지 거르는 계산이 맞는가 */
const { boot, ok, eq, has, report } = require('./harness');

const t = boot('admin/scan.html?equipment=e-press3', { page: 'admin/scan.js', login: 'kim@daesung.co.kr', role: 'admin' });
const M = t.win.ScanMath;
const C = M.C;
const empty = () => Array.from({ length: C.SEGMENTS }, () => []);

ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
ok('고른 설비 이름이 보인다', t.$('scan-equip').textContent.length > 0 && !/고르지 않음/.test(t.$('scan-equip').textContent), t.$('scan-equip').textContent);
eq('촬영 전에는 카메라 칸이 숨어 있다', t.$('scan-stage').hidden, true);

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

report('설비 촬영 가이드');
