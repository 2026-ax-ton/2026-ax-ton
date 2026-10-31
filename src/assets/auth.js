/* ===================================================================
   auth.js — 로그인 · 세션 · 화면 가드

   ★ 2026-11-01 (T11) — 길이 둘이 됐다.

     ① 서버 모드 (https + net.js 가 실려 있을 때)
        진짜 로그인이다. 비밀번호는 서버에서 scrypt 로 해시해 저장하고,
        브라우저에는 **토큰만** 온다. 토큰은 sessionStorage 에 둔다 —
        탭을 닫으면 로그아웃이다 (공용 폰 대응, A02 §14.3).

     ② 로컬 모드 (file:// · 서버에 닿지 못할 때)
        예전 그대로의 목업이다. 비밀번호가 브라우저에 평문으로 들어간다.
        감출 방법이 없고 감춘 척하는 게 더 나쁘므로 화면에 목업이라고 적는다.
        **이 길을 없애지 않는다** — 현장 시연은 제출 HTML 더블클릭이고(C08 §7),
        서버가 죽어도 교육은 계속돼야 한다 (C05 원칙 2).

   ★ 화면 가드는 두 모드에서 똑같이 동기로 돈다. 11개 화면은 고치지 않았다.

   쓰는 곳
     로그인 화면      Auth.login(userId, pw)            ← 로컬
                      Auth.loginServer(id, pw, done)    ← 서버 (net.js 필요)
     회원가입 화면    Auth.signup({...}) · Auth.signupServer({...}, done)
     나머지 모든 화면 Auth.require('worker')   ← <head> 에서 한 줄

   store.js 가 먼저 읽혀 있어야 한다. 서버 모드는 net.js 도 필요하다.
   =================================================================== */

var Auth = (function () {
  'use strict';

  /* ── 서버 모드 (T11) ──────────────────────────────────────────────

     토큰과 사용자 정보는 **sessionStorage** 에 둔다 (localStorage 가 아니다).
     공용 폰에서 탭을 닫으면 다음 사람에게 남지 않아야 한다 (A02 §14.3).
     저장 키를 Store 10개 키에 더하지 않는 이유도 같다 — 저 키들은 남는 데이터고
     이것은 **이 탭에서만 사는 값**이다. */

  var TOKEN_KEY = 'safety.token.v1';
  var USER_KEY = 'safety.user.v1';

  /** 서버를 부를 수 있는 자리인가. 셋이 다 맞아야 한다.
      ① net.js 가 실려 있다 (노동자 화면 6개에는 없다 — 요청 0건이 사실이려면)
      ② 부를 수단이 있다 (아주 오래된 인앱 브라우저에는 fetch 가 없다)
      ③ https 다 (file:// 시연은 로컬 모드다, A02 §14.5) */
  function canServer() {
    return typeof Net !== 'undefined' && Net.available()
      && typeof location !== 'undefined' && location.protocol === 'https:';
  }

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function serverUser() {
    try {
      var raw = sessionStorage.getItem(USER_KEY);
      var u = raw ? JSON.parse(raw) : null;
      return (u && u.userId && u.role) ? u : null;
    } catch (e) { return null; }
  }

  /* ★ 서버로 로그인하면 **이 기기에 남는 자리(Store.session)에는 아무것도 쓰지 않는다.**
     탭을 닫으면 sessionStorage 가 사라지고, 그러면 로그인도 사라진다 —
     공용 폰에서 다음 사람이 앞 사람 화면으로 들어가지 못한다 (A02 §14.3).
     화면 가드가 이것을 보는 것은 current() 가 서버 쪽을 먼저 보기 때문이다.
     (Store.session 을 읽는 곳은 이 파일뿐이라 11개 화면은 고치지 않았다.) */
  function keepServer(tok, user) {
    try {
      sessionStorage.setItem(TOKEN_KEY, tok);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { return false; }
    return true;
  }

  function dropServer() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (e) { /* 저장이 막힌 브라우저 — 어차피 넣지도 못했다 */ }
  }

  /* 이 페이지가 src/ 에서 몇 칸 안에 있는지.
     worker/home.html 은 한 칸 안이라 로그인 화면이 ../index.html 이다.
     절대경로(/index.html)를 쓰면 file:// 로 열었을 때 깨진다. */
  function baseDir() {
    var path = location.pathname;
    return (/\/(worker|admin)\//.test(path)) ? '../' : '';
  }

  function current() {
    /* 서버 모드가 먼저다. 토큰이 있으면 그 사람이 로그인한 사람이다.
       ★ 동기로 돈다 — 화면 가드가 기다릴 수 없기 때문이다 (A02 §14.5). */
    var su = serverUser();
    if (token() && su) return su;

    var s = Store.session.load();
    if (!s.userId || !s.role) return null;

    // 세션에 남아 있어도 계정이 지워졌으면 로그인 상태가 아니다
    var acc = Store.findBy(Store.accounts.load(), 'userId', s.userId);
    if (!acc) return null;

    return {
      userId: acc.userId,
      role: acc.role,
      name: acc.name || '',
      title: acc.title || '',
      siteName: acc.siteName || '',
      lang: acc.lang || '',
      processId: acc.processId || ''
    };
  }

  function signup(input) {
    var userId = (input.userId || '').trim();
    var pw = input.pw || '';
    var role = input.role || '';

    if (!userId) return { ok: false, reason: '아이디를 입력해 주세요.' };
    if (!pw) return { ok: false, reason: '비밀번호를 입력해 주세요.' };
    if (!Store.role(role)) return { ok: false, reason: '역할을 골라 주세요.' };

    var list = Store.accounts.load();
    if (Store.findBy(list, 'userId', userId)) {
      return { ok: false, reason: '이미 있는 아이디입니다.' };
    }

    var account = {
      userId: userId,
      pw: pw,
      role: role,
      name: (input.name || '').trim(),
      title: input.title || '',
      siteName: (input.siteName || '').trim(),
      lang: input.lang || '',
      processId: input.processId || ''
    };

    list.push(account);
    if (!Store.accounts.save(list)) {
      return { ok: false, reason: '이 브라우저에 저장할 수 없습니다.' };
    }
    return { ok: true, account: account };
  }

  function login(userId, pw) {
    userId = (userId || '').trim();
    var acc = Store.findBy(Store.accounts.load(), 'userId', userId);

    // 아이디가 없는 경우와 비밀번호가 틀린 경우를 구분해서 알려 주지 않는다.
    // 목업이라도 "그 아이디는 있다"를 흘리는 화면을 만들어 두면 그대로 굳는다.
    if (!acc || acc.pw !== pw) {
      return { ok: false, reason: '아이디 또는 비밀번호가 맞지 않습니다.' };
    }

    var ok = Store.session.save({
      userId: acc.userId,
      role: acc.role,
      at: new Date().toISOString()
    });
    if (!ok) return { ok: false, reason: '이 브라우저에 로그인 상태를 저장할 수 없습니다.' };

    return { ok: true, account: acc, landing: Store.role(acc.role).landing };
  }

  /* ★ 로그아웃은 실패하면 안 된다 (공용 폰).
     서버에 알리는 것은 할 수 있으면 하고, 못 해도 이 기기의 토큰은 반드시 버린다.
     서버에 남은 세션은 만료(12시간)나 다음 로그인 때 정리된다. */
  function logout() {
    var tok = token();
    if (tok && canServer()) {
      Net.post('/api/auth/logout', {}, { token: tok, timeoutMs: 3000 });
    }
    dropServer();
    Store.session.clear();
    location.href = baseDir() + 'index.html';
  }

  /* 로그인 후 역할에 맞는 화면으로 보낸다 */
  function go(role) {
    var r = Store.role(role);
    location.href = baseDir() + (r ? r.landing : 'index.html');
  }

  /* -----------------------------------------------------------------
     화면 가드 — 모든 페이지가 <head> 에서 한 번 부른다

       <script src="../assets/store.js"></script>
       <script src="../assets/auth.js"></script>
       <script>Auth.require('worker');</script>

     allowed 는 문자열 하나 또는 배열.
     세션이 없으면 로그인으로, 역할이 다르면 자기 자리로 돌려보낸다.
     ----------------------------------------------------------------- */
  /* 지금 화면의 "worker/xxx.html?..." 부분. 로그인 뒤 돌아올 자리다 (D1). */
  function wantedPath() {
    var m = /\/((?:worker|admin)\/[a-z0-9-]+\.html)$/i.exec(location.pathname || '');
    if (!m) return '';
    return m[1] + (location.search || '');
  }

  /* 로그인 화면이 받은 ?next= 를 검사한다.

     ★ 넘어온 값을 그대로 믿고 보내면 링크 하나로 아무 데나 보낼 수 있게 된다.
       우리 화면 경로 모양만 받는다. */
  function safeNext(raw) {
    var value = String(raw || '');
    if (!value) return '';
    if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1 ||
        value.indexOf('..') !== -1 || value.indexOf(':') !== -1) return '';
    if (!/^(worker|admin)\/[a-z0-9-]+\.html(\?[A-Za-z0-9=&%._-]*)?$/.test(value)) return '';
    return value;
  }

  /* 그 역할이 갈 수 있는 자리면 돌려주고, 아니면 빈 문자열.
     빈 문자열이면 부르는 쪽이 그 역할의 첫 화면으로 보낸다. */
  function nextFor(role, raw) {
    var value = safeNext(raw);
    if (!value) return '';
    var area = value.split('/')[0];
    if (role === 'worker') return area === 'worker' ? value : '';
    return area === 'admin' ? value : '';
  }

  /* 로그인이 안 돼 있을 때 갈 곳.

     ★ 어디로 가려던 것인지 함께 넘긴다 (D1).
       설비 앞 QR 을 찍은 사람은 로그인이 안 돼 있을 수 있다.
       그냥 로그인으로 보내면 어느 교육을 찍었는지가 사라지고,
       QR 은 그냥 "로그인 화면으로 가는 그림" 이 된다. */
  function loginUrl() {
    var here = wantedPath();
    return baseDir() + 'index.html' +
      (here ? '?next=' + encodeURIComponent(here) : '');
  }

  function require(allowed) {
    var user = current();

    if (!user) {
      location.replace(loginUrl());
      return null;
    }

    var list = Array.isArray(allowed) ? allowed : [allowed];
    if (list.indexOf(user.role) === -1) {
      // 로그인은 했는데 남의 화면에 들어온 경우. 로그인으로 튕기면 왜 튕겼는지 모른다.
      // 자기 역할의 첫 화면으로 보낸다.
      location.replace(baseDir() + Store.role(user.role).landing);
      return null;
    }

    return user;
  }

  /* ── 서버 모드 호출 (T11) ─────────────────────────────────────────
     done(result) 로 알린다. result 는 로컬 모드와 같은 모양이다:
       { ok: true, account, landing } · { ok: false, reason, code }
     code 가 'offline' 이면 **서버에 닿지 못한 것**이라 부르는 쪽이
     로컬 모드로 이어갈 수 있다 (C05 원칙 2 — 기존 길을 없애지 않는다). */

  function landingFor(role) {
    var r = Store.role(role);
    return r ? r.landing : 'index.html';
  }

  function finishServer(r, done) {
    if (r.failed) {
      done({ ok: false, code: 'offline', reason: '서버에 닿지 못했습니다.' });
      return;
    }
    if (!r.ok) {
      var code = (r.data && r.data.error) ? String(r.data.error) : 'error';
      /* ★ 사람이 고칠 수 없는 이유는 전부 '닿지 못함' 으로 본다 —
         서버 설정이 덜 됐거나(config) DB가 아프면(db) 사람 탓이 아니다.
         그것으로 교육을 멈추면, 설정 실수 하나가 현장 교육을 멈춘다 (C06 D-031).
         ★ 반대로 401·423(틀림·잠김)은 여기 넣지 않는다 — 넣으면 목업 뒷문이 된다. */
      var cannotFix = (code === 'config' || code === 'db');
      done({
        ok: false,
        code: cannotFix ? 'offline' : code,
        reason: (r.data && r.data.message) ? String(r.data.message) : '로그인하지 못했습니다.'
      });
      return;
    }
    var user = r.data.user;
    if (!user || !keepServer(r.data.token, user)) {
      done({ ok: false, code: 'offline', reason: '이 브라우저에 로그인 상태를 저장할 수 없습니다.' });
      return;
    }
    done({ ok: true, account: user, landing: landingFor(user.role), joinCode: r.data.joinCode });
  }

  function loginServer(userId, pw, done) {
    if (!canServer()) { done({ ok: false, code: 'offline', reason: '서버를 부를 수 없습니다.' }); return; }
    Net.post('/api/auth/login', { userId: (userId || '').trim(), pw: pw || '' })
      .then(function (r) { finishServer(r, done); });
  }

  /** 노동자 가입 — 담당자에게 받은 가입 코드가 필요하다. */
  function signupServer(input, done) {
    if (!canServer()) { done({ ok: false, code: 'offline', reason: '서버를 부를 수 없습니다.' }); return; }
    Net.post('/api/auth/signup', {
      joinCode: input.joinCode, userId: input.userId, pw: input.pw,
      lang: input.lang, processId: input.processId, name: input.name
    }).then(function (r) { finishServer(r, done); });
  }

  /** 사업장 등록 — 담당자 계정이 함께 생기고 가입 코드를 받는다. */
  function signupWorkplaceServer(input, done) {
    if (!canServer()) { done({ ok: false, code: 'offline', reason: '서버를 부를 수 없습니다.' }); return; }
    Net.post('/api/auth/signup-workplace', {
      siteName: input.siteName, sizeBand: input.sizeBand,
      userId: input.userId, pw: input.pw, name: input.name, title: input.title
    }).then(function (r) { finishServer(r, done); });
  }

  return {
    current: current,
    signup: signup,
    login: login,
    canServer: canServer,
    token: token,
    loginServer: loginServer,
    signupServer: signupServer,
    signupWorkplaceServer: signupWorkplaceServer,
    logout: logout,
    go: go,
    require: require,
    baseDir: baseDir,
    nextFor: nextFor,
    safeNext: safeNext,
    wantedPath: wantedPath,
    loginUrl: loginUrl
  };
})();
