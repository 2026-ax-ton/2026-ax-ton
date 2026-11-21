/* 올린 촬영 사진 내려받기 (admin/scan.html, 2026-11-21) — 3D 재료를 PC 폴더로

   이 묶음이 지키는 것
     1. 올린 촬영 묶음마다 [사진 내려받기] 버튼이 있다
     2. ★★ 누르면 그 묶음의 사진을 전부 받아 고른 폴더에 쓴다 (이름 = <묶음>_<바퀴-칸-번호>.jpg)
     3. ★ 우리 서버 /api/scans (list → get) 만 부르고, 토큰은 헤더로만 보낸다
     4. 폴더 고르기를 취소하면 아무것도 받지 않는다 */

const { boot, ok, eq, has, report } = require('./harness');

const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n) => { for (let i = 0; i < (n || 12); i += 1) await tick(); };
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

const calls = [];
const written = {};
let cancel = false;

const t = boot('admin/scan.html?equipment=e-press3', {
  login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/scan.js',
  before: (w) => {
    w.sessionStorage.setItem('safety.token.v1', 'tok-test');
    w.fetch = (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ url: String(url), body, auth: opts.headers.Authorization });
      let data = { error: 'bad' }, status = 400;
      if (body.op === 'list' && !body.scanId) { status = 200; data = { scans: [{ scanId: '20261116152746', count: 2, at: '2026-11-16T06:27:46Z' }] }; }
      if (body.op === 'list' && body.scanId) { status = 200; data = { paths: ['scans/wpA/e-press3/20261116152746/0-1-0.jpg', 'scans/wpA/e-press3/20261116152746/1-5-2.jpg'] }; }
      if (body.op === 'get') { status = 200; data = { data: JPG }; }
      return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(data) });
    };
    w.showDirectoryPicker = () => (cancel ? Promise.reject(new Error('AbortError')) : Promise.resolve({
      getFileHandle: (name) => Promise.resolve({
        createWritable: () => Promise.resolve({ write: (b) => { written[name] = b.length; return Promise.resolve(); }, close: () => Promise.resolve() }),
      }),
    }));
  },
});
const { win, $ } = t;

(async () => {
  await ticks();
  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  const btn = win.document.querySelector('#scan-list button[data-download]');
  ok('★ 올린 촬영 묶음마다 [사진 내려받기] 버튼', !!btn && btn.textContent === '사진 내려받기');

  /* 취소 — 받지 않는다 */
  cancel = true;
  const n0 = calls.length;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  eq('★ 폴더 고르기를 취소하면 서버를 부르지 않는다', calls.length, n0);

  cancel = false;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks(30);
  eq('★★ 묶음의 사진을 전부 고른 폴더에 쓴다', Object.keys(written).sort().join(','), '20261116152746_0-1-0.jpg,20261116152746_1-5-2.jpg');
  eq('JPEG 바이트 그대로', written['20261116152746_0-1-0.jpg'], 4);
  const used = calls.slice(n0);
  ok('★ 우리 서버 /api/scans 만 부른다', used.length > 0 && used.every((c) => /\/api\/scans$/.test(c.url)), used.map((c) => c.url).join(' '));
  ok('★ 토큰은 헤더로만 (주소·본문에 없다)', used.every((c) => c.auth === 'Bearer tok-test' && !/tok-test/.test(c.url + JSON.stringify(c.body))));
  eq('list(묶음) → get 두 번', used.map((c) => c.body.op).join(','), 'list,get,get');
  eq('끝나면 버튼이 돌아온다', btn.disabled + '|' + btn.textContent, 'false|사진 내려받기');
  has('몇 장 받았는지 알린다', $('toast').textContent, '2 / 2장');

  report('올린 촬영 사진 내려받기');
})();
