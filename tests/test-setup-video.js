/* 설비 사진 칸에 동영상 넣기 (admin/setup.html, 2026-11-21)

   이 묶음이 지키는 것
     1. 설비 사진 칸이 동영상도 받는다 (accept)
     2. ★ 동영상을 고르면 가이드 촬영과 같은 장면 뽑기(ScanShots.fromVideo)를 부른다
     3. ★★ 저장하면 뽑은 장면을 **저장한 설비 id** 의 촬영 묶음으로 올린다
     4. ★ 장면을 고르는 동안에는 저장하지 못한다 (장면이 빠진 채 저장되지 않게)
     5. 선명한 장면이 없거나 못 읽으면 이유를 적는다 */

const { boot, ok, eq, has, report } = require('./harness');

const t = boot('admin/setup.html', { login: 'kim@daesung.co.kr', page: 'admin/setup.js' });
const { win } = t;
const $ = (id) => win.document.getElementById(id);
const S = win.Store;
const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n) => { for (let i = 0; i < (n || 8); i += 1) await tick(); };

/* setup.html 이 싣는 scan.js — 장면 뽑기(ScanShots)를 가짜로 바꿔 낀다 (jsdom 에는 영상 해독이 없다) */
t.run('admin/scan.js');
ok('setup 화면에서 scan.js 를 실어도 촬영 화면 코드는 돌지 않는다 (오류 없음)', t.errors.length === 0, t.errors.join(' | '));
const calls = { from: 0, up: [] };
let release;
const shot = { t: 1, sharp: 300, pass: 0, seg: 0, blob: new win.Blob(['x'], { type: 'image/jpeg' }) };
const passes = [[[shot]], [[]]];
win.ScanShots = {
  best: (p) => (p[0][0][0] || null),
  fromVideo: () => { calls.from += 1; return new Promise((ok2) => { release = () => ok2({ passes, count: 1, duration: 4 }); }); },
  upload: (id, p) => { calls.up.push({ id, n: p[0][0].length }); return Promise.resolve({ done: 1, failed: 0, scanId: '20261121000000' }); },
};
/* 사진 줄이기 — jsdom 에는 그림 해독이 없다. 곧바로 「읽었다」고 답하게 */
win.URL.createObjectURL = () => 'blob:fake';
win.URL.revokeObjectURL = () => {};
win.Image = function () { this.naturalWidth = 10; this.naturalHeight = 10; };
Object.defineProperty(win.Image.prototype, 'src', { set() { setTimeout(() => this.onload && this.onload()); } });

has('★ 설비 사진 칸이 동영상도 받는다', $('equip-photo').getAttribute('accept'), 'video/*');

function pick(file) {
  Object.defineProperty($('equip-photo'), 'files', { value: [file], configurable: true });
  $('equip-photo').dispatchEvent(new win.Event('change', { bubbles: true }));
}

(async () => {
  pick(new win.File(['v'], 'press.mp4', { type: 'video/mp4' }));
  eq('★ 동영상이면 장면 뽑기를 부른다', calls.from, 1);
  ok('★ 고르는 동안에는 저장 버튼이 꺼진다', $('btn-equip-save').disabled === true);
  has('진행을 알린다', $('equip-video-status').textContent, '고르는 중');

  release();
  await ticks();
  ok('다 고르면 저장 버튼이 켜진다', $('btn-equip-save').disabled === false);
  has('★ 몇 장을 골랐는지·저장하면 무엇이 되는지 알린다', $('equip-video-status').textContent, '1장을 골랐습니다');

  $('equip-name').value = '동영상 프레스';
  $('equip-proc').value = S.setup.load().processes[0].id;
  $('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await ticks();
  const e = S.setup.load().equipments.find((x) => x.name === '동영상 프레스');
  ok('설비가 저장됐다', !!e);
  eq('★★ 뽑은 장면을 저장한 설비의 촬영 묶음으로 올린다', calls.up.length + '|' + (calls.up[0] && calls.up[0].id), '1|' + (e && e.id));
  has('올린 결과를 알린다', $('equip-video-status').textContent, '촬영 묶음');

  /* 다음 설비로 딸려 가지 않는다 */
  $('equip-name').value = '사진 없는 설비';
  $('equip-proc').value = S.setup.load().processes[0].id;
  $('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await ticks();
  eq('★ 앞 설비의 동영상 장면이 다음 설비로 딸려 가지 않는다', calls.up.length, 1);

  /* 선명한 장면이 없으면 */
  win.ScanShots.best = () => null;
  win.ScanShots.fromVideo = () => Promise.resolve({ passes: [[[]], [[]]], count: 0, duration: 4 });
  pick(new win.File(['v'], 'dark.mp4', { type: 'video/mp4' }));
  await ticks();
  has('★ 선명한 장면이 없으면 다시 찍으라고 적는다', $('equip-video-status').textContent, '찾지 못했습니다');

  /* 못 읽으면 */
  win.ScanShots.fromVideo = () => Promise.reject(new Error('video'));
  pick(new win.File(['v'], 'odd.mov', { type: 'video/quicktime' }));
  await ticks();
  has('★ 못 읽으면 이유를 적는다', $('equip-video-status').textContent, '읽지 못했습니다');
  ok('못 읽어도 저장 버튼은 다시 켜진다', $('btn-equip-save').disabled === false);

  /* 🆕 2026-11-21 사진 여러 장 — 예전 촬영 사진(밀링 33장 등)을 한꺼번에 */
  ok('★ 설비 사진 칸이 여러 장을 받는다', $('equip-photo').hasAttribute('multiple'));
  let gotFiles = null;
  win.ScanShots.best = (p) => (p[0][0][0] || null);
  win.ScanShots.fromImages = (files) => { gotFiles = files; return Promise.resolve({ passes, count: 1, dropped: 1 }); };
  function pickMany(list) {
    Object.defineProperty($('equip-photo'), 'files', { value: list, configurable: true });
    $('equip-photo').dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  pickMany([new win.File(['a'], '20261116152219_0-0-0.jpg', { type: 'image/jpeg' }), new win.File(['b'], '20261116152219_0-1-0.jpg', { type: 'image/jpeg' })]);
  await ticks();
  eq('★★ 여러 장을 고르면 장면 고르기(fromImages)로 간다', gotFiles && gotFiles.length, 2);
  has('★ 몇 장 골랐는지 · 몇 장 뺐는지 알린다', $('equip-video-status').textContent, '1장은 어둡거나 흔들려 뺐습니다');
  const n0 = calls.up.length;
  $('equip-name').value = '밀링 머신';
  $('equip-proc').value = S.setup.load().processes[0].id;
  $('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await ticks();
  const mill = S.setup.load().equipments.find((x) => x.name === '밀링 머신');
  eq('★★ 저장하면 고른 사진이 그 설비의 촬영 묶음으로 올라간다', calls.up.length - n0 + '|' + (calls.up[n0] && calls.up[n0].id), '1|' + (mill && mill.id));
  gotFiles = null;
  pickMany([new win.File(['a'], 'one.jpg', { type: 'image/jpeg' })]);
  await ticks();
  eq('사진 한 장은 예전처럼 설비 사진만 (장면 고르기 아님)', gotFiles, null);

  report('설비 사진 칸에 동영상 넣기');
})();
