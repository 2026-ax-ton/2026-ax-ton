/* ===================================================================
   net.js — 브라우저에서 **우리 서버를 부르는 유일한 자리**

   ★ 이 파일이 `src/` 안에서 `fetch` 를 쓰는 하나뿐인 곳이다 (C06 D-030).

     규칙은 「제3자 요청 0건, 같은 출처 `/api` 만」이다 (C05 T-1′).
     2026-11-04 부터 **같은 출처만**이다 — 배포 주소를 붙이는 file:// 길을 지웠다
     (C06 D-034: 제출본은 우리 서버를 부를 수 없다).
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

  /* ── 결정에 걸린 값 (A02 §5.2 · C06 D-034) ──────────────────────────

     ★ 2026-11-04 — **배포 주소 상수가 없어졌다.** 우리는 **같은 출처 '/api/...'
       만** 부른다.

       옛 모습: 제출 HTML 을 file:// 로 열었을 때만 배포 주소(API_BASE)를 붙이고,
       서버는 ALLOW_FILE_ORIGIN=1 로 Origin: null 을 받아 줬다 (C06 D-019, C08 §7).

       그 길이 막혔다. 2026-11-03 개정 공지가 「프론트엔드 HTML + 팀에서 직접
       운영하는 백엔드 서버와 통신하는 방식은 불가」로 정했다 — 마감 뒤 서버 쪽
       기능을 바꿀 수 있기 때문이다. **제출본이 우리 서버를 부르면 실격이다**
       (C08 §7.1, C06 D-034). 그래서 주소를 지웠다. 고를 수 있는 설정이 아니라
       부를 수단 자체를 없앤 것이다 — 설정으로 두면 누군가 켠다. */

  var DEFAULT_TIMEOUT_MS = 25000;

  /** 언제나 같은 출처다. 배포 주소를 붙이지 않는다 (C06 D-034). */
  function apiUrl(path) {
    return path;
  }

  /** 우리 서버가 있는 자리인가 — https 로 열렸을 때만이다.
   *
   *  file:// (제출본·더블클릭)·http:// 에서는 **부르지 않는다.** 규정이기도 하고
   *  (D-034), 이 프로젝트가 처음부터 지켜 온 모양이기도 하다 — auth.js·store.js·
   *  report.js·dashboard.js 가 이미 똑같이 `location.protocol === 'https:'` 를
   *  본다 (A02 §14.5). 여기서 한 번 더 막는 것은 **부르는 자리가 여기 하나뿐**
   *  이어서다 (C06 D-030): 새 화면이 protocol 검사를 빠뜨려도 요청은 안 나간다.
   *
   *  ★ 막을 때도 조용히 넘어가지 않는다 — 부르는 쪽은 { failed:'network' } 를
   *    받아 손 입력·로컬 모드로 이어가고, 화면은 이유를 적는다. */
  function onHttps() {
    return typeof location !== 'undefined' && location.protocol === 'https:';
  }

  /** AI 를 부를 수 있는 자리인가 — **바꿔 끼울 수 있는 한 칸**이다 (C06 D-034 ②).
   *
   *  기본값은 `onHttps()` 다. 배포본에서는 우리 `/api/translate` 를 거쳐 부른다.
   *
   *  ★ 제출본만 이 칸을 바꿔 끼운다. 2026-11-03 개정 공지는 팀이 운영하는 백엔드는
   *    막았지만 **「AI 모델 API 를 HTML 에서 직접 호출하는 것」은 허용**했다. 그래서
   *    제출본에는 Gemini 를 직접 부르는 조각(`assets/submission-ai.js`)이 한 장 더
   *    실리고, 그 조각이 이 함수와 `post` 를 갈아 끼운다.
   *
   *  ★ 그 조각은 **`src/` 안에 두지 않는다.** 틀은 `scripts/submission-ai.template.js`
   *    에 있고 `scripts/build-submission.mjs` 가 `submission/` 으로 찍어 낸다 —
   *    `src/` 는 「제3자 요청 0건·키 0건」을 검사로 증명한 상태를 유지한다
   *    (`tests/test-smoke.js`·`tests/test-agent-boundary.js`).
   *
   *  ★ 키가 파일에 들어가므로 **해커톤용 임시 키**를 쓰고 행사 뒤 폐기한다
   *    (개정 공지 권고 · C08 §7.1). 운영 키는 서버 환경변수에만 둔다. */
  function aiReady() {
    return onHttps();
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
    return request('POST', path, body, opts);
  }

  /** 메서드를 골라 부른다. 동기화(T12)가 GET·PUT 을 쓴다. */
  function request(method, path, body, opts) {
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

    var fetchOpts = { method: method, headers: headers };
    /* GET 에는 본문을 붙이지 않는다 — 붙이면 브라우저가 요청을 만들지 못한다 */
    if (method !== 'GET' && body !== null) {
      fetchOpts.body = JSON.stringify(body === undefined ? {} : body);
    }
    if (ac) fetchOpts.signal = ac.signal;

    /* ★ 던지지 않는다. fetch 가 아예 없는 브라우저(아주 오래된 인앱 브라우저)에서도
       부르는 쪽은 "닿지 못했다" 를 받아 손 입력·로컬 모드로 이어가야 한다.
       여기서 터지면 로그인 버튼이 아무 반응 없는 화면이 된다. */
    if (!available() || !onHttps()) {
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
    request: request,
    available: available,
    onHttps: onHttps,
    aiReady: aiReady,
    apiUrl: apiUrl,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS
  };
})();
