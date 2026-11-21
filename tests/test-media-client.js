/* 교육 그림 받기 — net.js Net.media · mediaInto · prefetchMedia (2026-11-16)

   교육 데이터에는 그림 대신 'media:<교육>/<이름>.jpg' 만 남고, 그림은 우리 서버에서 받아
   이 기기의 캐시에 담아 둔다. 이 묶음이 지키는 것
     1. ★★ 한 번 받은 그림은 **인터넷이 끊겨도** 캐시에서 다시 나온다
     2. ★ 캐시 이름이 'safety-' 로 시작하지 않는다 (sw.js 가 판이 바뀔 때 지운다)
     3. ★ 캐시 열쇠에 쿼리가 없다 (sw.js 가 ignoreSearch 로 찾는다)
     4. ★ 모양이 다른 값은 서버를 부르지 않는다 · 예전 data URL 은 그대로 그린다
     5. 못 받으면 던지지 않고 칸에 「없음」 표시만 한다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ok, eq, report, SRC } = require('./harness');

const src = fs.readFileSync(path.join(SRC, 'assets/net.js'), 'utf8');
const JPG = 'data:image/jpeg;base64,/9j/2Q==';

function makeEnv(online) {
  const calls = [];
  const stores = new Map();
  const caches = {
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        match: async (k) => (m.has(k) ? new Response(m.get(k)) : undefined),
        put: async (k, res) => { m.set(k, await res.text()); },
      };
    },
  };
  const ctx = {
    location: { protocol: 'https:' },
    setTimeout, clearTimeout, AbortController, Response, Promise, JSON,
    caches,
    fetch: async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      if (!online.on) throw new Error('offline');
      const body = JSON.parse(opts.body);
      if (body.op === 'media-get' && body.ref === 'media:c1/q0-0.jpg') return new Response(JSON.stringify({ data: JPG }), { status: 200 });
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.Net = Net;', ctx);
  return { Net: ctx.Net, calls, stores };
}

(async () => {
  const online = { on: true };
  const { Net, calls, stores } = makeEnv(online);

  ok('주소 모양을 안다', Net.isMediaRef('media:c1/q0-0.jpg') && !Net.isMediaRef('media:../x.jpg') && !Net.isMediaRef(JPG));

  eq('★ 처음에는 서버에서 받는다', await Net.media('media:c1/q0-0.jpg', { token: 't' }), JPG);
  eq('서버에 media-get 으로 묻는다', calls[0] && calls[0].body.op + ' ' + calls[0].url, 'media-get /api/scans');
  const names = [...stores.keys()];
  ok('★ 캐시 이름이 safety- 로 시작하지 않는다 (sw.js 가 지우지 않게)', names.length === 1 && names[0].indexOf('safety-') !== 0, names.join(','));
  const keys = [...stores.get(names[0]).keys()];
  ok('★ 캐시 열쇠에 쿼리가 없다 (sw.js ignoreSearch)', keys.length === 1 && keys[0].indexOf('?') === -1, keys.join(','));

  online.on = false;
  const n = calls.length;
  eq('★★ 끊겨도 한 번 받은 그림은 캐시에서 나온다', await Net.media('media:c1/q0-0.jpg', { token: 't' }), JPG);
  eq('캐시에 있으면 서버를 부르지 않는다', calls.length, n);
  eq('★ 받은 적 없는 그림은 끊기면 빈 값 (던지지 않는다)', await Net.media('media:c1/q9-9.jpg', { token: 't' }), '');

  online.on = true;
  eq('★ 모양이 다른 값은 서버를 부르지 않는다', await Net.media('https://evil.example/x.jpg'), '');
  ok('그 값으로는 아무것도 묻지 않았다', !calls.some((c) => c.body.ref === 'https://evil.example/x.jpg'));

  const img1 = { src: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  await Net.mediaInto(img1, JPG);
  eq('★ 예전 교육(data URL)은 그대로 그린다', img1.src, JPG);
  const img2 = { src: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  await Net.mediaInto(img2, 'media:c1/zz-1.jpg', { token: 't' });
  eq('★ 못 받으면 칸에 「없음」 표시만', img2.attrs['data-media'] + '|' + img2.src, 'missing|');

  const before = calls.length;
  await Net.prefetchMedia(['media:c1/q0-0.jpg', '', null, 'data:image/jpeg;base64,AA', 'media:c1/q1-0.jpg'], { token: 't' });
  eq('미리 받기는 주소 모양인 것만 묻는다 (캐시에 있는 것은 안 묻는다)', calls.length - before, 1);

  /* 🆕 같은 그림을 동시에 부르면 서버에는 한 번만 묻는다 (퀴즈 첫 문항 + 미리 받기) */
  const b2 = calls.length;
  const [x1, x2] = await Promise.all([Net.media('media:c1/q2-0.jpg', { token: 't' }), Net.media('media:c1/q2-0.jpg', { token: 't' })]);
  eq('★ 동시에 두 번 불러도 서버에는 한 번', calls.length - b2, 1);
  ok('둘 다 같은 답을 받는다', x1 === x2);

  /* 🆕 로그아웃 — 이 기기에 담은 사업장 그림을 지운다 (공용 폰) */
  await Net.clearMedia();
  ok('★★ 로그아웃하면 그림 캐시가 사라진다', !stores.has('media-v1'));

  report('교육 그림 받기 (net.js media)');
})();
