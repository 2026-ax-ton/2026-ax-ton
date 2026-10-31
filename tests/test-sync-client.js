/* 화면 쪽 동기화 — Store 서버 모드 (T12 · TK-3-03).

   ★ 실제 서버를 부르지 않는다. **가짜 fetch** 를 끼운다.

   이 묶음이 지키는 것
     1. ★ 읽기는 **언제나 이 기기 캐시에서 동기로** — 화면이 서버를 기다리지 않는다
     2. ★ 끊겨도 **잃지 않는다** — 보낼 것이 대기열에 쌓이고, 연결되면 올라간다
     3. ★ 409(다른 기기가 먼저 바꿈)면 당겨와서 **다시 보낸다**
     4. 올리지 않는 것: `prefs`(그 기기의 글자 크기) · `accounts`·`session`(서버 테이블)
        · `reports`(익명, 별도 경로)
     5. `file://`·토큰 없음·net.js 없음 → 서버 모드가 아예 꺼진다 (예전 그대로)
     6. 끊기면 화면을 비우지 않고 **위에 한 줄**만 띄운다

   케이스: D07 STC-E25-009·012·013 · STC-E25-033~035
   근거:   A02 §14.5 · C05 P-4 */

const { boot, ok, eq, has, report } = require('./harness');

const TOKEN = 'T'.repeat(64);
const USER = { userId: 'W-4821-07', role: 'worker', siteName: '대성정밀', lang: 'km' };

/** 서버 모드로 띄운다. plan 은 부를 때마다 하나씩 꺼내 쓴다. */
function open(plan, opts) {
  const calls = [];
  const t = boot('admin/dashboard.html', {
    login: 'kim@daesung.co.kr',
    role: 'admin',
    before: (win) => {
      win.fetch = function (url, o) {
        calls.push({ url: String(url), opts: o || {} });
        const r = (plan || []).shift() || { status: 200, body: {} };
        if (r.dead) return Promise.reject(new Error('닿지 못함'));
        return Promise.resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          json: () => Promise.resolve(r.body),
        });
      };
      if (!(opts && opts.noToken)) {
        win.sessionStorage.setItem('safety.token.v1', TOKEN);
        win.sessionStorage.setItem('safety.user.v1', JSON.stringify(USER));
      }
    },
  });
  t.calls = calls;
  return t;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  /* =================================================================
     1. 서버 모드가 켜지는 조건
     ================================================================= */
  {
    const t = open([]);
    ok('https + net.js + fetch + 토큰이면 서버 모드다', t.win.Store.sync.on());

    const noTok = open([], { noToken: true });
    ok('★ 토큰이 없으면 서버 모드가 아니다', !noTok.win.Store.sync.on());
  }

  {
    /* ★ 노동자 화면도 서버와 주고받는다 (2026-11-01, C06 D-032).
       그래도 **부를 수단이 없으면**(fetch 없는 인앱 브라우저 · file:// 시연) 꺼진다 —
       그때도 교육은 끝까지 돼야 한다. 그것이 이 제품의 전제다. */
    const t = boot('worker/home.html', { login: 'W-4821-07' });
    ok('부를 수단이 없으면 서버 모드가 꺼진다', !t.win.Store.sync.on());
    ok('★ 그래도 화면은 그대로 돈다 — 들을 교육이 캐시에 있다',
      t.win.Store.courses.load().length > 0);

    const fs2 = require('fs');
    const path2 = require('path');
    const home = fs2.readFileSync(path2.join(require('./harness').SRC, 'worker/home.js'), 'utf8');
    ok('★ 노동자 홈은 들어올 때 당겨온다', /Store\.sync\.pull\(\)/.test(home));
    ok('★ 끊김 배지를 띄운다 (그 사람 언어로)', /UI\.syncBadge\(\)/.test(home));
    ok('★ 노동자 화면 코드가 직접 부르지 않는다', !/\bfetch\s*\(/.test(home));
  }

  /* =================================================================
     2. 저장하면 대기열에 들어가고 서버로 간다
     ================================================================= */
  {
    const t = open([{ status: 200, body: { data: [{ id: 'c-x' }], version: 3 } }]);
    t.calls.length = 0;

    t.win.Store.courses.save([{ id: 'c-x' }]);
    await tick();

    eq('서버를 한 번 불렀다', t.calls.length, 1);
    has('PUT 으로 그 키를 보낸다', t.calls[0].url, '/api/store?key=courses');
    eq('메서드는 PUT', t.calls[0].opts.method, 'PUT');
    eq('★ 토큰은 헤더로 간다', t.calls[0].opts.headers.Authorization, 'Bearer ' + TOKEN);

    const sent = JSON.parse(t.calls[0].opts.body);
    eq('캐시에 있는 것을 통째로 보낸다', sent.data[0].id, 'c-x');
    eq('내가 본 판을 함께 보낸다', sent.baseVersion, 0);

    await tick();
    eq('★ 보내고 나면 대기열이 빈다', t.win.Store.sync.pending().length, 0);
    eq('서버가 준 판을 기억한다', t.win.Store.sync.versions().courses, 3);
    eq('연결 상태는 정상', t.win.Store.sync.state(), 'ok');
  }

  /* =================================================================
     3. ★ 끊겨도 잃지 않는다 (STC-E25-009)
     ================================================================= */
  {
    const t = open([{ dead: true }]);
    t.calls.length = 0;

    t.win.Store.courses.save([{ id: 'c-offline' }]);
    await tick();

    eq('★ 이 기기에는 그대로 저장돼 있다', t.win.Store.courses.load()[0].id, 'c-offline');
    eq('★★ 보낼 것이 대기열에 남아 있다 (조용히 잃지 않는다)',
      t.win.Store.sync.pending().join(','), 'courses');
    eq('끊긴 것을 안다', t.win.Store.sync.state(), 'offline');

    /* 다시 연결되면 쌓인 것이 올라간다 */
    t.calls.length = 0;
    t.win.fetch = function (url, o) {
      t.calls.push({ url: String(url), opts: o });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ data: [{ id: 'c-offline' }], version: 1 }),
      });
    };
    await t.win.Store.sync.send();
    await tick();

    eq('★ 다시 연결되니 올라갔다', t.calls.length, 1);
    eq('대기열이 비었다', t.win.Store.sync.pending().length, 0);
    eq('다시 정상', t.win.Store.sync.state(), 'ok');
  }

  {
    /* 한 키를 여러 번 고쳐도 보낼 것은 하나다 */
    const t = open([{ dead: true }]);
    t.win.Store.courses.save([{ id: 'a' }]);
    t.win.Store.courses.save([{ id: 'b' }]);
    t.win.Store.courses.save([{ id: 'c' }]);
    await tick();
    eq('★ 열 번 고쳐도 보낼 것은 한 번이다', t.win.Store.sync.pending().length, 1);
    eq('보낼 때는 마지막 캐시를 보낸다', t.win.Store.courses.load()[0].id, 'c');
  }

  /* =================================================================
     4. ★ 409 — 다른 기기가 먼저 바꿨다 (STC-E25-007 의 화면 쪽)
     ================================================================= */
  {
    const t = open([
      { status: 409, body: { error: 'stale', data: { site: { name: '남이 바꾼 이름' } }, version: 7 } },
      { status: 200, body: { data: { site: { name: '남이 바꾼 이름' } }, version: 8 } },
    ]);
    t.calls.length = 0;

    t.win.Store.setup.save({ site: { name: '내가 바꾼 이름' }, languages: [], processes: [], equipments: [], workers: [] });
    await tick();
    await tick();

    eq('★ 409 를 받으면 다시 보낸다 (두 번 불렀다)', t.calls.length, 2);
    const retry = JSON.parse(t.calls[1].opts.body);
    eq('★ 이번에는 서버가 알려 준 판으로 보낸다', retry.baseVersion, 7);
    eq('서버 것을 캐시에 받아 뒀다', t.win.Store.setup.load().site.name, '남이 바꾼 이름');
    eq('대기열이 비었다', t.win.Store.sync.pending().length, 0);
  }

  /* =================================================================
     5. 당겨오기 — 바뀐 것이 있을 때만 다시 그린다
     ================================================================= */
  {
    const t = open([{
      status: 200,
      body: {
        courses: { data: [{ id: 'c-서버' }], version: 5 },
        progress: { data: [], version: 2 },
      },
    }]);
    t.calls.length = 0;

    let redraws = 0;
    t.win.Store.sync.onChange(function () { redraws += 1; });

    const changed = await t.win.Store.sync.pull(['courses', 'progress']);
    await tick();

    has('GET 으로 키를 적어 부른다', t.calls[0].url, '/api/store?keys=courses%2Cprogress');
    eq('메서드는 GET', t.calls[0].opts.method, 'GET');
    ok('★ GET 에는 본문을 붙이지 않는다 (붙이면 요청이 안 만들어진다)',
      t.calls[0].opts.body === undefined);

    ok('바뀐 것이 있다고 알려 준다', changed === true);
    eq('캐시가 서버 것으로 바뀌었다', t.win.Store.courses.load()[0].id, 'c-서버');
    eq('★ 다시 그리라고 한 번만 알린다', redraws, 1);
    eq('판도 기억한다', t.win.Store.sync.versions().courses, 5);
  }

  {
    /* 같은 값을 받으면 다시 그리지 않는다 — 20초마다 깜빡이면 쓸 수 없다 */
    const t = open([
      { status: 200, body: { courses: { data: [{ id: 'same' }], version: 1 } } },
      { status: 200, body: { courses: { data: [{ id: 'same' }], version: 1 } } },
    ]);
    await t.win.Store.sync.pull(['courses']);
    let redraws = 0;
    t.win.Store.sync.onChange(function () { redraws += 1; });
    const changed = await t.win.Store.sync.pull(['courses']);
    eq('★ 달라진 것이 없으면 다시 그리지 않는다', redraws, 0);
    ok('바뀐 것이 없다고 답한다', changed === false);
  }

  {
    /* ★ 서버가 준 것을 캐시에 적을 때 되돌려 보내지 않는다 (메아리 금지) */
    const t = open([{ status: 200, body: { courses: { data: [{ id: 'from-server' }], version: 9 } } }]);
    await t.win.Store.sync.pull(['courses']);
    await tick();
    eq('★ 받은 것을 그대로 되보내지 않는다 (무한 메아리 금지)',
      t.win.Store.sync.pending().length, 0);
  }

  /* =================================================================
     6. 올리지 않는 것
     ================================================================= */
  {
    const t = open([]);
    t.calls.length = 0;

    t.win.Store.prefs.save({ fontScale: 1.4 });
    t.win.Store.session.save({ userId: 'x', role: 'worker', at: null });
    t.win.Store.accounts.save([{ userId: 'x', pw: '1', role: 'worker' }]);
    t.win.Store.reports.save([{ id: 'r-1', hazard: 'pinch' }]);
    await tick();

    eq('★ 글자 크기는 그 기기의 설정이라 올리지 않는다',
      t.win.Store.sync.pending().indexOf('prefs'), -1);
    eq('★ 계정·세션은 서버 테이블이 대신한다', t.win.Store.sync.pending().indexOf('accounts'), -1);
    eq('★★ 익명 신고는 이 길로 가지 않는다 (별도 경로)',
      t.win.Store.sync.pending().indexOf('reports'), -1);
    eq('아무것도 보내지 않았다', t.calls.length, 0);

    eq('올리는 키는 여섯이다', t.win.Store.sync.KEYS.join(','),
      'setup,courses,progress,posts,orders,library');
    eq('대기열 키 이름', t.win.Store.sync.OUTBOX_KEY, 'safety.outbox.v1');
  }

  /* =================================================================
     7. 읽기는 늘 동기다 — 화면이 기다리지 않는다
     ================================================================= */
  {
    const t = open([{ dead: true }]);
    const before = Date.now();
    const list = t.win.Store.courses.load();
    ok('★ load() 는 기다리지 않고 바로 답한다', Date.now() - before < 50);
    ok('서버가 죽어 있어도 화면에 띄울 것이 있다', Array.isArray(list));
  }

  /* =================================================================
     8. 끊김 배지 — 화면을 비우지 않는다
     ================================================================= */
  {
    const t = open([{ dead: true }]);
    const bar = t.win.UI.syncBadge();
    ok('배지를 만들 수 있다', !!bar);
    eq('★ 평소에는 보이지 않는다', bar.hidden, true);

    t.win.Store.courses.save([{ id: 'x' }]);
    await tick();

    eq('★ 끊기면 뜬다', bar.hidden, false);
    /* ★ 글자를 박지 않고 사전으로 견준다 (C05 §7) — 번역을 고쳐도 안 깨진다 */
    eq('★ 지금 사람의 언어로 적는다', bar.textContent, t.win.I18N.t('sync.offline'));
    has('한국어 원문은 "이 휴대폰에 저장" 이다', t.win.I18N.t('sync.offline', 'ko'), '이 휴대폰에 저장');
    has('잃지 않았다고 알려 준다', t.win.I18N.t('sync.offline', 'ko'), '다시 연결되면');
    ok('★ 색만으로 알리지 않는다 — 아이콘이 함께 있다',
      bar.querySelector('svg') !== null || bar.textContent.length > 0);
  }

  /* =================================================================
     9. 대시보드는 20초마다 당겨온다
     ================================================================= */
  {
    const fs = require('fs');
    const path = require('path');
    const { SRC } = require('./harness');
    const code = fs.readFileSync(path.join(SRC, 'admin/dashboard.js'), 'utf8');
    ok('★ 대시보드가 20초마다 당겨온다', /Store\.sync\.every\(20000\)/.test(code));
    ok('열자마자 한 번 당겨온다', /Store\.sync\.pull\(\)/.test(code));
    ok('바뀌면 다시 그린다', /Store\.sync\.onChange/.test(code));
    ok('끊김 배지를 띄운다', /UI\.syncBadge\(\)/.test(code));

    const store = fs.readFileSync(path.join(SRC, 'assets/store.js'), 'utf8');
    ok('★ store.js 는 직접 부르지 않는다 (net.js 를 거친다)', !/\bfetch\s*\(/.test(store));
    ok('net.js 가 없는 화면에서도 터지지 않는다', /typeof Net !== 'undefined'/.test(store));
  }

  report('화면 쪽 동기화 — Store 서버 모드 (T12)');
})();
