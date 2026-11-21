/* 목록에 없는 설비 id 로 촬영 화면에 들어왔을 때 (admin/scan.html, 2026-11-21)

   설비 카드가 지워져도 촬영 사진은 저장소의 「설비 id」 아래 남는다.
   이 묶음이 지키는 것
     1. ★ 그 id 로 「올린 촬영」을 보이고 [사진 내려받기]를 쓸 수 있다
     2. ★★ [설비 카드 다시 만들기] — **같은 id** 로 카드를 되살린다 (사진이 다시 이어진다)
     3. ★ 촬영 묶음의 낮은 바퀴 첫 장을 설비 사진으로 넣는다 · 검수 대기로 시작한다
     4. 이름이 없거나 겹치면 만들지 않는다
     5. id 모양이 이상하면 아무것도 하지 않는다 */

const { boot, ok, eq, has, report } = require('./harness');

const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n) => { for (let i = 0; i < (n || 20); i += 1) await tick(); };
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const LOST = 'mwjettgwtlnzi';
const calls = [];

function before(w) {
  w.sessionStorage.setItem('safety.token.v1', 'tok-test');
  w.fetch = (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    let data = {}, status = 200;
    if (body.op === 'list' && !body.scanId) data = { scans: [{ scanId: '20261116152219', count: 3, at: '2026-11-16T06:22:19Z' }] };
    else if (body.op === 'list') data = { paths: ['scans/wpA/' + LOST + '/20261116152219/1-0-0.jpg', 'scans/wpA/' + LOST + '/20261116152219/0-2-1.jpg'] };
    else if (body.op === 'get') data = { data: JPG };
    else status = 400;
    return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(data) });
  };
  /* jsdom 에는 그림 해독이 없다 — 곧바로 「읽었다」 */
  w.Image = function () { this.naturalWidth = 1600; this.naturalHeight = 1200; };
  Object.defineProperty(w.Image.prototype, 'src', { set() { setTimeout(() => this.onload && this.onload()); } });
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,SMALL';
}

(async () => {
  const t = boot('admin/scan.html?equipment=' + LOST, { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/scan.js', before });
  const { win, $ } = t;
  const S = win.Store;
  await ticks();
  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  has('★ 목록에 없는 설비라고 알린다', $('scan-equip').textContent, LOST);
  ok('★ 다시 만들기 칸이 보인다', !!$('btn-scan-restore'));
  ok('★★ 그 id 로 올린 촬영을 보이고 내려받기 버튼이 있다',
    !$('sec-uploaded').hidden && !!win.document.querySelector('#scan-list button[data-download="20261116152219"]'));
  ok('목록을 그 설비 id 로 물었다', calls.some((c) => c.op === 'list' && c.equipmentId === LOST));

  /* 이름 없이 → 만들지 않는다 */
  $('btn-scan-restore').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  ok('이름이 없으면 만들지 않는다', !S.setup.load().equipments.some((e) => e.id === LOST));

  /* 겹치는 이름 → 만들지 않는다 */
  const input = win.document.querySelector('.scan-lost input');
  input.value = S.setup.load().equipments[0].name;
  $('btn-scan-restore').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  ok('같은 이름이 있으면 만들지 않는다', !S.setup.load().equipments.some((e) => e.id === LOST));

  input.value = '밀링 머신 1호기';
  const n0 = calls.length;
  $('btn-scan-restore').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks(40);
  const e = S.setup.load().equipments.find((x) => x.id === LOST);
  ok('★★ 같은 id 로 카드를 되살린다', !!e && e.name === '밀링 머신 1호기');
  eq('★ 검수 대기로 시작 (설비 탭에서 AI 검수)', e && e.review.status, 'queued');
  eq('★ 촬영 묶음의 사진을 설비 사진으로', e && e.photo, 'data:image/jpeg;base64,SMALL');
  const got = calls.slice(n0).find((c) => c.op === 'get');
  ok('★ 낮은 바퀴(0-…) 첫 장을 고른다', !!got && /\/0-2-1\.jpg$/.test(got.path), got && got.path);
  ok('다 만들면 설비 목록으로', t.nav.some((u) => /setup\.html#list$/.test(u)), t.nav.join(' '));

  /* id 모양이 이상하면 */
  const bad = boot('admin/scan.html?equipment=' + encodeURIComponent('../x'), { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/scan.js', before });
  ok('★ id 모양이 이상하면 다시 만들기 칸을 띄우지 않는다', !bad.$('btn-scan-restore'));

  report('목록에 없는 설비 — 촬영 사진 살리기');
})();
