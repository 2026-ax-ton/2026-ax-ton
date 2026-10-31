/* ===================================================================
   net.js — 브라우저에서 **우리 서버를 부르는 유일한 자리**

   ★ 이 파일이 `src/` 안에서 `fetch` 를 쓰는 하나뿐인 곳이다 (C06 D-030).

     규칙은 「제3자 요청 0건, 같은 출처 `/api` 만」이다 (C05 T-1′).
     부르는 곳이 여기저기 흩어지면 그 규칙을 사람이 지켜야 하는 약속으로
     만들 뿐이다. 한 곳에 모아 두면 **검사가 이 파일 하나만 보면 된다.**

     2026-11-01 이전에는 `agent.js` 가 직접 불렀다. 로그인(T11)이 서버를
     부르게 되면서 두 곳이 될 뻔해, 부르는 자리를 여기로 합쳤다.
     예외는 여전히 셋이다 — `sw.js` · 신고 화면 받아쓰기 · **이 파일**.

   ★ 노동자 화면 6개에는 이 파일을 싣지 않는다. 그 화면들은 요청이 아예 0건이다
     (`tests/test-smoke.js` 가 화면마다 본다).

   쓰는 곳
     로그인·가입 화면  Net.post('/api/auth/login', {...})
     운영자 화면       agent.js 가 번역·역번역을 부를 때

   ★ 던지지 않는다. 끊겨도 { failed: 'network' } 를 담아 돌려준다 —
     부르는 쪽이 "손 입력으로 돌아간다" 를 고르게 하려는 것이다.
   =================================================================== */

var Net = (function () {
  'use strict';

  /* ── 결정에 걸린 값 (A02 §5.2 · C06 D-019) ──────────────────────────

     보통은 빈 문자열이다 = 같은 출처 '/api/...' 를 부른다.
     제출 HTML 을 file:// 로 더블클릭해 여는 현장 시연에서만 배포 주소가 필요하다
     (C08 §7). 그때 서버는 ALLOW_FILE_ORIGIN=1 이어야 받아 준다. */
  var API_BASE = 'https://2026-ax-ton.vercel.app';

  var DEFAULT_TIMEOUT_MS = 25000;

  function apiUrl(path) {
    var file = typeof location !== 'undefined' && location.protocol === 'file:';
    return (file ? API_BASE : '') + path;
  }

  /** 부를 수단이 있는가. 아주 오래된 인앱 브라우저에는 fetch 가 없다.
      없으면 부르는 쪽이 **묻기 전에** 손 입력·로컬 모드를 고를 수 있어야 한다. */
  function available() {
    return typeof fetch === 'function';
  }

  /** 우리 서버를 한 번 부른다.
   *
   *  opts: { timeoutMs, headers, token }
   *  돌려주는 값 (언제나 성공한 Promise)
   *    { ok: true,  status: 200, data: {...} }
   *    { ok: false, status: 401, data: { error, message } }   서버가 거절
   *    { ok: false, status: 0,   failed: 'network' | 'timeout' }  닿지 못함
   */
  function post(path, body, opts) {
    var o = opts || {};
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); },
      o.timeoutMs || DEFAULT_TIMEOUT_MS);

    var headers = { 'Content-Type': 'application/json' };
    var name;
    if (o.headers) {
      for (name in o.headers) {
        if (Object.prototype.hasOwnProperty.call(o.headers, name)) {
          headers[name] = o.headers[name];
        }
      }
    }
    /* 토큰은 헤더로만 보낸다. 주소에 붙이면 로그·기록에 그대로 남는다 (A02 §14.6) */
    if (o.token) headers.Authorization = 'Bearer ' + o.token;

    var fetchOpts = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body === undefined ? {} : body)
    };
    if (ac) fetchOpts.signal = ac.signal;

    /* ★ 던지지 않는다. fetch 가 아예 없는 브라우저(아주 오래된 인앱 브라우저)에서도
       부르는 쪽은 "닿지 못했다" 를 받아 손 입력·로컬 모드로 이어가야 한다.
       여기서 터지면 로그인 버튼이 아무 반응 없는 화면이 된다. */
    if (!available()) {
      clearTimeout(timer);
      return Promise.resolve({ ok: false, status: 0, data: {}, failed: 'network' });
    }

    return fetch(apiUrl(path), fetchOpts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, data: data || {} };
      });
    }, function (e) {
      clearTimeout(timer);
      // 끊김·시간 초과 — 부르는 쪽은 둘 다 "손으로 계속" 으로 간다
      var timedOut = (ac && ac.signal.aborted) || (e && e.name === 'AbortError');
      return { ok: false, status: 0, data: {}, failed: timedOut ? 'timeout' : 'network' };
    });
  }

  return {
    post: post,
    available: available,
    apiUrl: apiUrl,
    API_BASE: API_BASE,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS
  };
})();
