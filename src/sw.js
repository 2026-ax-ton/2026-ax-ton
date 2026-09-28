/* ===================================================================
   sw.js — 인터넷이 끊겨도 화면이 열리게 한다 (E1)

   왜 필요한가
     이 제품은 "현장 인터넷이 약하다" 를 전제로 만들어졌다.
     공장 안 · 지하 · 자재 창고에는 신호가 없다. 그런데 D1 에서 만든 QR 은
     "설비 앞에 붙인다" 는 것이 시연 문장이다. 그 자리에 신호가 없으면
     찍어도 아무것도 안 열린다.

   무엇이 문제였나
     데이터는 이미 오프라인이다 (localStorage). 못 열리는 것은 화면 파일
     (HTML · CSS · JS) 뿐이다. 그래서 그것만 미리 담아 두면 끝난다.

   ★ 이 파일은 배포 루트에 있어야 한다.
     Vercel 의 Root Directory 가 src 라서 이 파일이 /sw.js 가 되고,
     그래야 scope 가 / 전체다. assets/ 아래로 옮기면 scope 가 /assets/ 로
     좁아져 화면을 하나도 못 잡는다.

   ★ file:// 에서는 이 파일이 아예 돌지 않는다. 등록하는 쪽(assets/ui.js)이
     https 일 때만 부른다. 더블클릭 확인이 이 프로젝트의 검증 방법 전체라
     그것을 깨뜨릴 수 없다.

   ★ 외부 요청 0건 규칙은 여기서도 그대로다. 남의 오리진은 손대지 않는다.
   =================================================================== */

'use strict';

/* ★ 화면을 고쳐 배포할 때마다 이 값을 올린다.
   안 올리면 옛 화면이 그대로 남아, 고쳤는데 안 고쳐진 것으로 보인다.
   Service Worker 에서 가장 흔한 사고가 이것이다. */
var VERSION = 'v9';
var CACHE = 'safety-' + VERSION;

/* 미리 담을 화면 파일 전부.
   ★ 새 화면이나 새 공용 파일을 만들면 여기 한 줄 더해야 한다.
     빠뜨리면 그 화면만 오프라인에서 안 열린다 — 그런데 온라인에서는
     멀쩡해서 눈치채기 어렵다. 그래서 tests/test-offline.js 가
     src/ 의 실제 파일과 이 목록을 대조한다. */
var PRECACHE = [
  './',

  /* 화면 HTML 13 */
  'index.html',
  'signup.html',
  'worker/home.html',
  'worker/learn.html',
  'worker/quiz.html',
  'worker/report.html',
  'worker/talk.html',
  'worker/my.html',
  'admin/setup.html',
  'admin/dashboard.html',
  'admin/content.html',
  'admin/proof.html',
  'admin/library.html',

  /* CSS 5 */
  'assets/style.css',
  'assets/style-admin.css',
  'assets/app.css',
  'worker/worker.css',
  'admin/admin.css',

  /* 공용 JS 9 */
  'assets/store.js',
  'assets/auth.js',
  'assets/ui.js',
  'assets/icons.js',
  'assets/i18n.js',
  'assets/login.js',
  'assets/signup.js',
  'assets/seed.js',
  'assets/diagrams.js',
  'assets/qr.js',
  'assets/review.js',

  /* 화면 JS 11 */
  'worker/home.js',
  'worker/learn.js',
  'worker/quiz.js',
  'worker/report.js',
  'worker/talk.js',
  'worker/my.js',
  'admin/setup.js',
  'admin/dashboard.js',
  'admin/content.js',
  'admin/proof.js',
  'admin/library.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    })
  );
  /* ★ skipWaiting() 을 부르지 않는다.
     보고 있는 중에 파일이 새 것으로 갈리면 옛 HTML 이 새 JS 를 부르는
     반쪽 화면이 된다. 새 판은 탭을 닫았다 열 때 들어온다. */
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        /* 이 앱이 만든 옛 판만 지운다. 남의 캐시는 손대지 않는다. */
        if (n !== CACHE && n.indexOf('safety-') === 0) return caches.delete(n);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  /* 읽기만 담는다. POST 같은 것은 그대로 흘려보낸다. */
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* 같은 오리진만. 외부 요청 0건 규칙이라 원래 걸릴 것이 없지만,
     확장 프로그램이 끼워 넣는 요청까지 가로채면 남의 일을 망친다. */
  if (url.origin !== self.location.origin) return;

  /* ★ sw.js 자신은 담지 않는다. 담으면 갱신 통로가 막힌다. */
  if (url.pathname === self.location.pathname) return;

  e.respondWith(
    /* ★ ignoreSearch 가 이 파일에서 가장 중요한 한 줄이다.
       QR 로 들어오는 주소는 worker/learn.html?course=c-press 인데,
       이것은 worker/learn.html 과 다른 키다. 이 옵션이 없으면
       QR 로 들어온 노동자만 오프라인에서 빈 화면을 본다.
       설비 앞에서 QR 을 찍는 사람이 정확히 그 경우다. */
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).catch(function () {
        /* 담아 두지 않은 것을 오프라인에서 찾았다.
           화면 이동이면 로그인 화면이라도 띄운다 — 브라우저 기본
           오류 화면은 글을 못 읽는 사람에게 아무것도 아니다. */
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
