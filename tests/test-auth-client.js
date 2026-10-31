/* 화면 쪽 로그인 — 서버 모드와 로컬 모드 (T11 · TK-3-02).

   ★ 실제 서버를 부르지 않는다. **가짜 fetch** 를 끼운다.

   이 묶음이 지키는 것
     1. ★ 서버가 "아이디·비밀번호가 틀렸다" 고 하면 **목업으로 새지 않는다**
        (여기가 새면 목업 비밀번호로 들어가지는 뒷문이 생긴다)
     2. 서버에 닿지 못했을 때만 이 기기 계정으로 이어간다 — 그리고 그렇다고 적는다
     3. 토큰은 sessionStorage 에만, 주소가 아니라 헤더로 보낸다
     4. 탭을 닫아 토큰이 사라지면 화면 가드가 막는다 (공용 폰)
     5. 노동자 화면 6개는 서버를 부를 수단(net.js)조차 싣지 않는다

   케이스: D07 STC-E25-024 ~ STC-E25-027
   근거:   A02 §14.3·§14.5 · PRD-CM-01 · C05 원칙 2 (기존 길을 없애지 않는다) */

const { boot, ok, eq, has, report, SRC } = require('./harness');
const fs = require('fs');
const path = require('path');

/** 가짜 fetch 를 끼운다. plan 은 부를 때마다 하나씩 꺼내 쓴다. */
function fakeFetch(win, plan) {
  const calls = [];
  win.fetch = function (url, opts) {
    calls.push({ url: String(url), opts: opts || {} });
    const r = plan.shift() || { status: 200, body: {} };
    if (r.dead) return Promise.reject(new Error('닿지 못함'));
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
    });
  };
  return calls;
}

/** 로그인 화면을 띄운다. plan 이 없으면 fetch 가 없는 것처럼(로컬 모드) 둔다. */
function openLogin(plan) {
  let calls = null;
  const t = boot('index.html', {
    page: 'assets/login.js',          // shimLocation — 어디로 갔는지 t.nav 에 담긴다
    before: (win) => { if (plan) calls = fakeFetch(win, plan); },
  });
  t.calls = calls;
  return t;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

const USER = {
  userId: 'W-4821-07', role: 'worker', name: '', title: '',
  siteName: '대성정밀', lang: 'km', processId: 'p-press',
};

(async () => {
  /* =================================================================
     1. 서버 로그인이 되면 토큰을 들고 들어간다
     ================================================================= */
  {
    const t = openLogin([{ status: 200, body: { token: 'T'.repeat(64), user: USER } }]);

    ok('서버를 부를 수 있는 자리다 (https + net.js + fetch)', t.win.Auth.canServer());

    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '비밀번호';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    eq('서버를 한 번 불렀다', t.calls.length, 1);
    eq('부른 곳은 같은 출처 /api/auth/login 이다', t.calls[0].url, '/api/auth/login');
    eq('POST 로 보낸다', t.calls[0].opts.method, 'POST');

    const sent = JSON.parse(t.calls[0].opts.body);
    eq('아이디를 보낸다', sent.userId, 'W-4821-07');
    ok('★ 주소에 비밀번호·아이디가 붙지 않는다', t.calls[0].url.indexOf('W-4821') === -1);

    eq('★ 토큰은 sessionStorage 에 둔다 (탭을 닫으면 사라진다)',
      t.win.sessionStorage.getItem('safety.token.v1'), 'T'.repeat(64));
    eq('★ localStorage 에는 토큰을 두지 않는다',
      t.win.localStorage.getItem('safety.token.v1'), null);

    /* ★ 공용 폰 — 서버 로그인은 이 기기에 남는 자리에 아무것도 쓰지 않는다.
       탭을 닫으면 sessionStorage 와 함께 로그인도 사라진다. */
    eq('★ 이 기기에 남는 세션에는 아무것도 쓰지 않는다',
      t.win.Store.session.load().userId, '');

    const me = t.win.Auth.current();
    eq('지금 사람은 서버가 알려 준 사람이다', me.userId, 'W-4821-07');
    eq('사업장 이름도 서버에서 온다', me.siteName, '대성정밀');

    eq('자기 첫 화면으로 간다', t.nav[t.nav.length - 1], 'worker/home.html');
  }

  /* =================================================================
     2. ★★ 서버가 거절하면 목업으로 새지 않는다
     ================================================================= */
  {
    const t = openLogin([{ status: 401, body: { error: 'bad_login', message: '아이디 또는 비밀번호가 맞지 않습니다.' } }]);

    /* 이 기기에는 예시 계정(비밀번호 1234)이 들어 있다.
       서버가 거절했는데 여기로 새면, 서버 계정을 모르는 사람도 1234 로 들어간다. */
    ok('이 기기에는 예시 계정이 있다', t.win.Store.accounts.load().length > 0);

    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    eq('★★ 서버가 거절하면 들어가지 못한다 (목업 뒷문이 없다)', t.nav.length, 0);
    eq('서버가 한 말을 그대로 보여 준다', t.$('login-error').textContent,
      '아이디 또는 비밀번호가 맞지 않습니다.');
    eq('토큰도 생기지 않는다', t.win.sessionStorage.getItem('safety.token.v1'), null);
    ok('세션도 남지 않는다', !t.win.Store.session.load().userId);
  }

  {
    /* 잠긴 계정도 마찬가지다 — 기다리면 풀린다는 것을 알려 준다 */
    const t = openLogin([{ status: 423, body: { error: 'locked', message: '여러 번 틀려서 잠겼습니다. 잠시 뒤 다시 시도해 주세요.' } }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    eq('잠긴 동안에는 들어가지 못한다', t.nav.length, 0);
    has('기다리면 풀린다고 알려 준다', t.$('login-error').textContent, '잠시 뒤');
  }

  /* =================================================================
     3. 서버에 닿지 못하면 이 기기로 이어간다 — 그리고 그렇다고 적는다
     ================================================================= */
  {
    const t = openLogin([{ dead: true }]);

    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';          // 이 기기의 예시 계정 비밀번호
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    eq('★ 교육이 멈추지 않는다 — 이 기기 계정으로 들어간다', t.nav[t.nav.length - 1], 'worker/home.html');
    ok('★ 어느 길로 들어왔는지 숨기지 않는다', !t.$('login-mode').hidden);
    has('목업이라고 적는다', t.$('login-mode').textContent, '목업');
    eq('그때는 토큰이 없다', t.win.sessionStorage.getItem('safety.token.v1'), null);
    ok('이 기기 모드라 세션은 여기에 남는다', !!t.win.Store.session.load().userId);
  }

  {
    /* 서버 설정이 덜 된 것(500 config)도 "사람이 틀린 것" 이 아니다 → 이어갈 수 있다 */
    const t = openLogin([{ status: 500, body: { error: 'config', message: '서버 설정 오류입니다.' } }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();
    eq('★ 서버 설정 오류일 때도 교육은 계속된다', t.nav[t.nav.length - 1], 'worker/home.html');
  }

  {
    /* DB가 잠들었거나 아픈 것(503 db)도 마찬가지다 (2026-11-01 미리보기에서 실물로 드러남) */
    const t = openLogin([{ status: 503, body: { error: 'db', message: 'DB에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();
    eq('★ DB가 아플 때도 교육은 계속된다', t.nav[t.nav.length - 1], 'worker/home.html');
    has('목업으로 확인했다고 적는다', t.$('login-mode').textContent, '목업');
  }

  /* =================================================================
     4. fetch 가 없는 브라우저 — 묻지도 않고 로컬 모드
     ================================================================= */
  {
    const t = openLogin(null);   // 가짜 fetch 를 끼우지 않는다
    ok('★ 부를 수단이 없으면 서버 모드가 아니다', !t.win.Auth.canServer());

    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = '1234';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));

    eq('★ 기다리지 않고 바로 들어간다 (옛 길 그대로)', t.nav[t.nav.length - 1], 'worker/home.html');
  }

  /* =================================================================
     5. 공용 폰 — 토큰이 사라지면 가드가 막는다
     ================================================================= */
  {
    const t = openLogin([{ status: 200, body: { token: 'T'.repeat(64), user: USER } }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = 'x';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();
    ok('서버로 들어와 있다', t.win.Auth.current() !== null);

    /* 다음 사람이 탭을 닫고 새로 연 상황 — sessionStorage 는 탭과 함께 사라진다 */
    t.win.sessionStorage.clear();
    eq('★ 탭을 닫으면 로그인이 사라진다 (공용 폰)', t.win.Auth.current(), null);
    eq('★ 이 기기에 남는 자리에도 자국이 없다', t.win.Store.session.load().userId, '');
  }

  {
    /* 로컬 모드 세션은 예전처럼 그대로 산다 — 옛 길을 없애지 않았다 */
    const t = boot('worker/home.html', { login: 'W-4821-07' });
    const me = t.win.Auth.current();
    ok('로컬 모드 세션은 그대로 동작한다', me && me.userId === 'W-4821-07');
  }

  /* =================================================================
     6. 로그아웃 — 서버에 알리고, 못 알려도 토큰은 버린다
     ================================================================= */
  {
    const t = openLogin([{ status: 200, body: { token: 'T'.repeat(64), user: USER } }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = 'x';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    t.calls.length = 0;
    t.win.Auth.logout();
    await tick();

    eq('서버에 로그아웃을 알린다', t.calls.length, 1);
    eq('부른 곳', t.calls[0].url, '/api/auth/logout');
    eq('★ 토큰은 주소가 아니라 헤더로 보낸다 (주소는 로그에 남는다)',
      t.calls[0].opts.headers.Authorization, 'Bearer ' + 'T'.repeat(64));
    ok('주소에 토큰이 붙지 않는다', t.calls[0].url.indexOf('T'.repeat(10)) === -1);

    eq('★ 이 기기의 토큰을 버린다', t.win.sessionStorage.getItem('safety.token.v1'), null);
    ok('사용자 정보도 버린다', !t.win.sessionStorage.getItem('safety.user.v1'));
    ok('세션도 비운다', !t.win.Store.session.load().userId);
    /* 로그인 화면으로 보내는 것(location.href)은 jsdom 이 흉내 내지 않는다 —
       로컬 모드 로그아웃 이동은 test-worker.js 가 본다 */
  }

  {
    /* ★ 서버가 죽어 있어도 로그아웃은 된다. 공용 폰에서 다음 사람이 그대로 쓰면 안 된다 */
    const t = openLogin([{ status: 200, body: { token: 'T'.repeat(64), user: USER } }, { dead: true }]);
    t.$('login-id').value = 'W-4821-07';
    t.$('login-pw').value = 'x';
    t.$('form-login').dispatchEvent(new t.win.Event('submit'));
    await tick();

    t.win.Auth.logout();
    await tick();

    eq('★ 서버에 못 알려도 이 기기의 토큰은 사라진다',
      t.win.sessionStorage.getItem('safety.token.v1'), null);
    ok('사용자 정보도 함께 사라진다', !t.win.sessionStorage.getItem('safety.user.v1'));
  }

  /* =================================================================
     7. 가입 화면 — 가입 코드 칸은 서버 모드에서만
     ================================================================= */
  {
    const plan = [];
    const t = boot('signup.html', { before: (win) => fakeFetch(win, plan) });
    t.run('assets/signup.js');

    ok('★ 서버 모드에서는 노동자에게 가입 코드를 묻는다', !t.$('field-code').hidden);
    has('목업이라고 적지 않는다 (서버가 암호화한다)', t.$('join-note').textContent, '서버에서 암호화');
  }

  {
    const t = boot('signup.html');      // fetch 없음 = 로컬 모드
    t.run('assets/signup.js');
    ok('★ 로컬 모드에서는 가입 코드를 묻지 않는다 (서버가 없다)', t.$('field-code').hidden);
    has('그때는 목업이라고 적는다', t.$('join-note').textContent, '목업');
  }

  /* =================================================================
     8. 노동자 화면은 서버를 부를 수단조차 없다
     ================================================================= */
  {
    /* 2026-11-01 개정 (C06 D-032) — 노동자 화면도 우리 서버와 주고받는다.
       로그인에 대해 남는 보증: **로그인 화면 말고는 로그인 API 를 부르지 않는다** */
    ['home', 'learn', 'quiz', 'report', 'talk', 'my'].forEach((name) => {
      const js = fs.readFileSync(path.join(SRC, 'worker/' + name + '.js'), 'utf8');
      ok('노동자 ' + name + ': 로그인 API 를 직접 부르지 않는다', js.indexOf('/api/auth/') === -1);
      ok('노동자 ' + name + ': 화면 코드가 직접 부르지 않는다', !/\bfetch\s*\(/.test(js));
    });

    const auth = fs.readFileSync(path.join(SRC, 'assets/auth.js'), 'utf8');
    ok('★ auth.js 는 직접 부르지 않는다 (net.js 를 거친다)', !/\bfetch\s*\(/.test(auth));
    ok('net.js 가 없는 화면에서도 터지지 않는다', /typeof Net !== 'undefined'/.test(auth));
    ok('토큰은 sessionStorage 에만 둔다 (주석은 빼고 본다)',
      !/localStorage/.test(auth.replace(/\/\*[\s\S]*?\*\//g, '')));
  }

  report('화면 쪽 로그인 — 서버 모드와 로컬 모드 (T11)');
})();
