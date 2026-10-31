/* ===================================================================
   store.js — 이 서비스의 모든 데이터가 지나가는 단 하나의 문

   서버도 DB도 없다. 브라우저 localStorage 하나에만 쌓인다.

   ★ 화면 코드는 localStorage 를 직접 부르지 않는다. 반드시 이 파일을 거친다.
     나중에 서버가 생기면 이 파일만 바꾸면 되기 때문이다.

   ★ 아래 키 목록은 노동자 팀과 관리자 팀이 만나는 유일한 지점이다.
     한쪽이 쓰고 다른 쪽이 읽으므로, 모양을 바꾸려면 반드시 팀에 알린다.

       키          쓰는 쪽           읽는 쪽
       accounts    회원가입          로그인
       session     로그인            모든 화면(가드)
       setup       관리자 기능1      노동자 전부 · 관리자 전부
       library     운영자 기능9      관리자 기능2 · 노동자 기능3
       courses     관리자 기능2      노동자 기능3·4
       progress    노동자 기능3·4    관리자 기능5·6
       reports     노동자 기능8      관리자 기능6
       posts       노동자 기능7      노동자 기능7

   ES 모듈(import/export)을 쓰지 않는다. file:// 로 열면 모듈이 CORS 로 막히는데,
   "인터넷 없이 그냥 열린다"(외부 요청 0건 규칙)를 잃고 싶지 않다.
   =================================================================== */

var Store = (function () {
  'use strict';

  var PREFIX = 'safety.';
  var VERSION = 1;

  /* -----------------------------------------------------------------
     공통 어휘 — 화면과 저장이 같은 목록을 본다.
     여기 없는 값은 저장되지 않고, 저장된 값 중 여기 없는 것은 화면에서 무시된다.
     ----------------------------------------------------------------- */

  var LANGUAGES = [
    { code: 'km', name: '크메르어',     native: 'ភាសាខ្មែរ' },
    { code: 'id', name: '인도네시아어', native: 'Bahasa Indonesia' },
    { code: 'vi', name: '베트남어',     native: 'Tiếng Việt' },
    { code: 'ne', name: '네팔어',       native: 'नेपाली' },
    { code: 'th', name: '태국어',       native: 'ภาษาไทย' },
    { code: 'ko', name: '한국어',       native: '한국어' }
  ];

  var HAZARDS = [
    { code: 'pinch',    label: '끼임',     icon: '⚙' },
    { code: 'shock',    label: '감전',     icon: '⚡' },
    { code: 'fire',     label: '화재',     icon: '🔥' },
    { code: 'fall',     label: '추락',     icon: '🪜' },
    { code: 'choke',    label: '질식',     icon: '😷' },
    { code: 'chemical', label: '화학물질', icon: '🧪' }
  ];

  var ICONS = ['⚙', '🏭', '🔧', '🔩', '⚡', '🔥', '🧪', '🧯', '📦', '🚜'];

  /* 사업장 규모는 11-admin-start.html 의 가입 폼과 같은 3구간을 쓴다.
     같은 개념을 두 화면이 다르게 물으면 나중에 합칠 때 값을 손으로 옮겨야 한다. */
  var SIZE_BANDS = ['10인 미만', '10~49인', '50인 이상'];

  var ROLES = [
    { code: 'worker',   label: '노동자',        landing: 'worker/home.html' },
    { code: 'admin',    label: '사업장 담당자', landing: 'admin/dashboard.html' },
    { code: 'operator', label: '시스템 운영자', landing: 'admin/library.html' }
  ];

  /* 검수 상태 3종 — SCREEN 기능9 의 데이터 정의를 그대로 쓴다 */
  /* ★ icon 은 icons.js 의 아이콘 이름이다 (글자가 아니다).
       모양이 서로 달라야 흑백 인쇄에서도 뜻이 남는다 —
       체크 / 찬 원 / 경고 삼각형. 색은 badge 가 따로 나른다. */
  var PHRASE_STATUS = {
    reviewed: { label: '검수 완료', badge: 'badge-ok',   icon: 'check' },
    waiting:  { label: '검수 대기', badge: 'badge-wait', icon: 'dot' },
    stopped:  { label: '사용 중지', badge: 'badge-stop', icon: 'alert' }
  };

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  function available() {
    try {
      localStorage.setItem(PREFIX + 'probe', '1');
      localStorage.removeItem(PREFIX + 'probe');
      return true;
    } catch (e) {
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* -----------------------------------------------------------------
     저장소 하나를 만드는 공장

     저장 모양은 전부 { v, updatedAt, data } 로 통일한다.
     v 가 있어야 나중에 모양이 바뀌었을 때 옛 데이터를 옮길 자리가 생긴다.
     이게 없으면 "브라우저 캐시 지우세요" 말고는 답이 없어진다.

     normalize(data) 는 읽어 온 값을 화면이 기대하는 모양으로 다듬는다.
     빠진 필드를 채우고, 배열이어야 할 것이 아니면 배열로 바꾼다.
     ----------------------------------------------------------------- */
  function makeStore(name, makeDefault, normalize) {
    var KEY = PREFIX + name + '.v' + VERSION;

    function load() {
      var raw;
      try {
        raw = localStorage.getItem(KEY);
      } catch (e) {
        return makeDefault();          // 저장소가 막힌 환경. 화면은 그대로 뜬다
      }
      if (!raw) return makeDefault();

      try {
        var box = JSON.parse(raw);
        // 봉투가 씌워지기 전에 저장된 값이 남아 있을 수 있다. 그대로 받아 준다.
        var data = (box && typeof box === 'object' && 'data' in box) ? box.data : box;
        return normalize(data);
      } catch (e) {
        return makeDefault();          // 값이 깨져 있어도 앱이 죽지 않는다
      }
    }

    function save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          v: VERSION,
          updatedAt: new Date().toISOString(),
          data: data
        }));
        return true;
      } catch (e) {
        return false;
      }
    }

    /* 읽기 → 고치기 → 저장 한 사이클. 화면 코드는 되도록 이것만 쓴다. */
    function update(fn) {
      var data = load();
      var replaced = fn(data);
      if (replaced !== undefined) data = replaced;
      return { data: data, ok: save(data) };
    }

    function updatedAt() {
      try {
        var box = JSON.parse(localStorage.getItem(KEY));
        return (box && box.updatedAt) || null;
      } catch (e) {
        return null;
      }
    }

    function clear() {
      try { localStorage.removeItem(KEY); return true; } catch (e) { return false; }
    }

    return {
      KEY: KEY, load: load, save: save, update: update,
      updatedAt: updatedAt, clear: clear
    };
  }

  /* 목록형 저장소는 전부 같은 모양이라 한 번에 찍어 낸다 */
  function listStore(name) {
    return makeStore(name, function () { return []; }, arr);
  }

  /* 1. accounts — 회원가입이 쓰고 로그인이 읽는다
        { userId, pw, role, name, title, siteName, lang, processId } */
  var accounts = listStore('accounts');

  /* 2. session — 로그인이 쓰고 모든 화면이 읽는다 */
  var session = makeStore('session',
    function () { return { userId: '', role: '', at: null }; },
    function (d) {
      d = obj(d);
      return { userId: d.userId || '', role: d.role || '', at: d.at || null };
    });

  /* 3. setup — 관리자 기능1 (사업장 · 언어 · 공정 · 설비 · 노동자) */
  var setup = makeStore('setup',
    function () {
      return {
        site: { name: '', sizeBand: SIZE_BANDS[1] },
        languages: [], processes: [], equipments: [], workers: []
      };
    },
    function (d) {
      d = obj(d);
      return {
        site: {
          name: (d.site && d.site.name) || '',
          sizeBand: (d.site && d.site.sizeBand) || SIZE_BANDS[1]
        },
        languages: arr(d.languages),
        processes: arr(d.processes),
        equipments: arr(d.equipments),
        workers: arr(d.workers)
      };
    });

  /* 4. library — 운영자 기능9. 안전 문구와 언어별 검수 상태
        { id, category, ko, status,
          translations: { km: { text, back, status, agent, judged } },
          flags: [ { note, lang, at, resolvedAt } ] }

        🆕 2026-10-31 (T6 · A02 §6.3 · FR-AD-02-09) — 언어마다 칸 둘이 늘었다.
        **더하기만 했다. 옛 데이터는 두 칸이 없을 뿐 그대로 읽힌다.**

          agent  : { tries, flipped, escalated, model, at }
                   AI 가 몇 번 만에 냈는지 · 뜻이 뒤집혔었는지 · 사람에게 올렸는지.
                   ★ 이것은 기록일 뿐 판정이 아니다. status 를 건드리지 않는다
          judged : { by, at }
                   **사람이** 상태를 정한 기록. 누가 언제 승인·중지했는가.
                   ★ AI 는 이 칸을 만들지 않는다. agent 가 있고 judged 가 없으면
                     "AI 가 내놓았고 아직 아무도 안 봤다" 는 뜻이다

        읽을 때는 Store.phraseAgent(p, lang) · Store.phraseJudged(p, lang) 를 쓴다.
        화면이 t.agent 를 직접 뒤지면 칸이 없는 옛 데이터에서 터진다.

        status 는 PHRASE_STATUS 의 세 가지 중 하나.
        translations[code].status 는 그 언어만의 판정이고, 없으면 문구 전체를 따른다.
        flags[].lang 이 있으면 그 언어만 중지된다 — 크메르어 오역 하나로
        인도네시아어 노동자까지 안전 지시를 못 듣게 되지 않는다.

        읽을 때는 Store.phraseOk(p, lang) 을 쓴다. p.status 를 직접 보면
        언어별 판정이 무시된다.
        검수 완료가 아닌 문구는 안전 지시로 쓰지 않는다 (SCREEN 기능9 · PRD §9.3). */
  var library = listStore('library');

  /* 5. courses — 관리자 기능2 가 만든 교육. 노동자 기능3·4 가 읽는다
        { id, title, equipmentId, languages: [], phraseIds: [], dueAt,
          quiz: [ { id, type, prompt, i18n } ], approved, createdAt }

        문항의 한국어 문구는 prompt · options · results · pairs · why 에 있고,
        번역은 i18n[언어코드] 아래에 같은 이름으로 들어간다.
          i18n: { km: { prompt, options: [], results: [], pairs: [], why } }
        번역이 없으면 한국어로 내려간다. 읽을 때는 반드시 qtext() 를 쓴다 —
        아래 qtext 주석에 왜 화면에서 직접 뒤지면 안 되는지 적었다. */
  var courses = listStore('courses');

  /* 6. progress — 노동자 기능3·4 가 쓰고 관리자 기능5·6 이 읽는다
        { workerId, courseId, lang, learnedAt,
          quiz: { score, passed, answers, at, asked } }
        asked 는 그때 실제로 낸 문항의 id 목록이다 (C6). answers 와 자리가 짝지어진다.
        통과하지 못하면 교육 완료로 기록되지 않는다 (SCREEN 기능4). */
  var progress = listStore('progress');

  /* progress.quiz.answers[i] 가 가리키는 문항을 찾는다 (C6).

     ★ answers 는 "그때 실제로 낸 문항" 의 순서다. course.quiz 의 자리와
       같다는 보장이 없다 — 채점할 수 없는 문항이 섞여 있거나(quiz.js 의
       questionsOf 가 걸러 낸다) 나중에 문항을 내리면(retired) 어긋난다.
       어긋나면 대시보드의 취약 항목과 증빙이 **조용히 다른 문항을 가리킨다.**
       틀린 곳을 틀렸다고 말하지 못하는 것보다, 엉뚱한 곳을 가리키는 쪽이 나쁘다.

     ★ 그래서 새 기록에는 quiz.asked (문항 id 목록) 를 함께 남긴다.
       asked 가 있으면 그것으로 찾는다.

     ★ 없는 옛 기록은 지금까지처럼 자리로 찾는다.
       자리로 찾는 길을 없애면 이미 쌓인 기록이 통째로 빈다. */
  function askedQuestion(course, quizRow, i) {
    var list = (course && Array.isArray(course.quiz)) ? course.quiz : [];
    var asked = (quizRow && Array.isArray(quizRow.asked)) ? quizRow.asked : null;
    if (!asked) return list[i] || null;
    return asked[i] ? findBy(list, 'id', asked[i]) : null;
  }

  /* 7. reports — 노동자 기능8 위험요소 신고. 관리자 기능6 이 처리한다
        { id, processId, equipmentId, hazard, memo, status, createdAt }
        ★ 신고자 식별 정보를 넣지 않는다. 익명이 기본이다 (PRD §9.2).
          익명성이 깨지면 신고가 멈추고, 선행지표도 함께 사라진다. */
  var reports = listStore('reports');

  /* 8. posts — 노동자 기능7 현장 즉시 소통 게시판
        { id, title, body, author, anonymous, createdAt, comments: [] } */
  var posts = listStore('posts');

  /* 9. prefs — 이 브라우저의 보기 설정 (B3 글자 크기)

        { fontScale: 'small' | 'normal' | 'large' }

        ★ 계정이 아니라 기기에 딸린다. 현장에서는 한 대의 폰을 여러 사람이
          돌려 쓰기도 하고, 글자 크기는 "이 화면이 지금 잘 보이는가" 의 문제다.
          accounts 에 넣으면 로그인해야 글자가 커지는데, 로그인 화면 글자가
          안 보이는 사람은 거기서 막힌다.

        ★ 목록이 아니라 값 하나다. 늘어날 설정이 생기면 여기 필드를 더한다. */
  var FONT_SCALES = ['small', 'normal', 'large'];

  /* 내 언어 음성이 이 기기에 없을 때 무엇을 할지.

       silent — 소리를 내지 않는다 (기본)
       ko     — 한국어로 읽어 준다

     ★ 기본이 silent 인 이유 — 크메르어 노동자에게 한국어 음성은 대부분
       뜻이 닿지 않는다. 소리는 나는데 아무것도 전달되지 않으면,
       사람은 "들었다" 고 생각하고 넘어간다. 그게 이 제품이 막으려는 상황이다.

     ★ 그런데 ko 를 없애지도 않는다 — 말은 알아듣는데 글은 못 읽는 사람이
       흔하다. 이 제품이 겨냥한 것은 "문해력 없음" 이지 "한국어 전혀 모름" 이
       아니다. 그 사람에게 한국어 음성은 유일한 통로일 수 있다.
       그래서 없애는 대신 마이 화면에서 고르게 한다.

     ★ 계정이 아니라 기기에 딸린다 (fontScale 과 같은 이유).
       기기마다 있는 음성이 다르므로 이건 그 기기의 사정이다. */
  var VOICE_FALLBACKS = ['silent', 'ko'];

  var prefs = makeStore('prefs',
    function () { return { fontScale: 'normal', voiceFallback: 'silent' }; },
    function (d) {
      d = obj(d);
      return {
        fontScale: FONT_SCALES.indexOf(d.fontScale) === -1 ? 'normal' : d.fontScale,
        voiceFallback: VOICE_FALLBACKS.indexOf(d.voiceFallback) === -1
          ? 'silent' : d.voiceFallback
      };
    });

  /* 10. orders — 담당자가 내린 재교육 지시 (D2)

        [ { id, workerId, courseId, note, at, by, canceledAt } ]

        ★ 해소됐는지는 여기 적지 않는다. progress 를 보고 판정한다 —
          지시를 내린 뒤(at) 그 교육을 통과했으면 해소된 것이다.
          "완료" 를 따로 저장하면 진실이 두 곳이 되고, 언젠가 어긋난다.

        ★ 이 기록으로 사람을 세지 않는다.
          "이 사람 재교육 3회" 는 인사 평가 자료다. 대시보드가 개인별 점수를
          인사·평가 목적으로 내보내지 않는다는 원칙과 같은 이유로,
          누적 횟수를 세거나 사람을 줄 세우는 화면을 만들지 않는다.
          지시는 "이 교육을 다시 듣게 한다" 는 뜻이지 "이 사람이 못했다" 가 아니다. */
  var orders = listStore('orders');

  /* 이 지시가 아직 살아 있는가 (D2).

     ★ 판정을 여기 한 곳에 둔다. 담당자 대시보드와 노동자 홈이 같은 함수를
       쓴다 — 계산을 화면마다 두면 한쪽만 고쳐져서, 담당자는 "보냈다" 고
       보고 노동자 화면에는 아무것도 안 뜨는 일이 생긴다.

     ★ 해소됐다는 것을 orders 에 적지 않는다. progress 를 보고 판정한다.
       "완료" 를 따로 저장하면 진실이 두 곳이 되고 언젠가 어긋난다.

     ★ 지시를 내린 뒤(at)에 통과했어야 해소다.
       그전에 통과한 기록으로 지시가 저절로 사라지면, 담당자가 방금 보낸
       지시가 보내자마자 없어진다. */
  function orderOpen(order, progressRow) {
    if (!order || order.canceledAt) return false;

    var q = progressRow && progressRow.quiz;
    if (!q || !q.passed) return true;
    if (!q.at || !order.at) return true;      // 언제인지 모르면 살아 있는 것으로 둔다

    return String(q.at) <= String(order.at);  // ISO 문자열이라 그대로 견줄 수 있다
  }


  /* -----------------------------------------------------------------
     글자 크기를 화면이 그려지기 전에 적용한다 (B3)

     ★ store.js 는 모든 화면의 <head> 에서 읽힌다. ui.js(문서 끝)에서 하면
       기본 크기로 한 번 그려졌다가 커지는 것이 눈에 보인다.
       저시력 사용자에게는 그 한 번이 "안 보이는 화면" 이다.

     ★ 저장소가 막힌 브라우저에서는 조용히 기본 크기로 간다.
       여기서 던지면 store.js 가 통째로 멈추고 화면이 아예 안 뜬다.
     ----------------------------------------------------------------- */
  try {
    var bootScale = prefs.load().fontScale;
    if (bootScale && bootScale !== 'normal' && document.documentElement) {
      document.documentElement.setAttribute('data-font', bootScale);
    }
  } catch (e) { /* 기본 크기로 간다 */ }


  /* -----------------------------------------------------------------
     지금 어디서 열렸는가 — 개발 자리인가, 배포된 자리인가 (2026-08-30)

     화면 여덟 개의 맨 아래에는 "여기부터 채우시면 됩니다" 칸이 있다.
     남은 일을 적어 둔 개발용 메모다. 그것이 **배포 주소에서 보이면
     시연 중에 "아직 안 만든 화면" 으로 읽힌다.** 그렇다고 지우면
     무엇이 남았는지를 잃는다.

     그래서 지우지 않고 **자리에 따라 감춘다.**

       <html data-env="dev">   file:// · localhost · 브랜치 미리보기
                               → 칸이 보인다 (개발할 때 봐야 하니까)
       <html data-env="live">  배포 주소 (2026-ax-ton.vercel.app)
                               → 칸이 감춰진다 (시연에서 안 보여야 하니까)

     ★ 감추는 쪽이 CSS 의 기본값이다 (app.css 의 `.todo { display: none }`).
       이 스크립트가 멈춰도 배포 주소에서는 여전히 안 보인다.
       실패해도 시연이 안전한 쪽으로 기울여 뒀다.

     ★ 브랜치 미리보기 주소에는 `-git-` 이 들어간다
       (예: 2026-ax-ton-git-develop-….vercel.app). 그것으로 갈라낸다.
     ----------------------------------------------------------------- */
  function whereAmI() {
    try {
      if (typeof location === 'undefined') return 'dev';
      if (location.protocol === 'file:') return 'dev';

      var host = String(location.hostname || '').toLowerCase();
      if (!host) return 'dev';
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'dev';
      if (host.indexOf('.local') !== -1) return 'dev';
      if (host.indexOf('-git-') !== -1) return 'dev';   // Vercel 브랜치 미리보기

      return 'live';
    } catch (e) {
      return 'live';        /* 모르겠으면 감추는 쪽으로 — 시연이 우선이다 */
    }
  }

  var ENV = whereAmI();
  try {
    if (document.documentElement) document.documentElement.setAttribute('data-env', ENV);
  } catch (e) { /* 기본값(감춤)으로 간다 */ }

  var ALL = [accounts, session, setup, library, courses, progress, reports, posts,
             prefs, orders];

  /* -----------------------------------------------------------------
     전체 내보내기 / 불러오기 / 초기화

     서버가 없으니 데이터가 이 브라우저를 벗어나지 못한다.
     발표 전 백업하거나 다른 기기로 옮길 통로가 하나는 있어야 한다.
     ----------------------------------------------------------------- */

  /* ★ prefs 는 일부러 뺀다. 글자 크기와 음성 되돌림은 계정이 아니라
       "그 기기" 의 설정이다 (my.js). 옮겨 온 기기에는 그 기기의 화면과
       그 기기에 깔린 음성이 있으므로, 남의 기기 설정이 따라오면 안 된다.

     ★★ orders 는 반드시 넣는다. 여기서 빠져 있었고, 그래서
       내보내기 → 불러오기를 지나면 재교육 지시가 조용히 사라졌다.
       서버가 없어서 이 통로가 기기 사이를 옮기는 유일한 길인데,
       그 길에서 데이터가 없어지면 옮긴 사람은 없어진 줄도 모른다.
       ALL(초기화용)과 어긋나 있었던 것이 원인이라 아래 검사로 묶어 둔다. */
  var PAIRS = [
    [accounts, 'accounts'], [session, 'session'], [setup, 'setup'],
    [library, 'library'], [courses, 'courses'], [progress, 'progress'],
    [reports, 'reports'], [posts, 'posts'], [orders, 'orders']
  ];

  function exportAll() {
    var out = { v: VERSION, exportedAt: new Date().toISOString() };
    for (var i = 0; i < PAIRS.length; i++) out[PAIRS[i][1]] = PAIRS[i][0].load();
    return JSON.stringify(out, null, 2);
  }

  function importAll(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'JSON 형식이 아닙니다.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: '설정 데이터의 모양이 아닙니다.' };
    }
    for (var i = 0; i < PAIRS.length; i++) {
      if (parsed[PAIRS[i][1]] !== undefined) PAIRS[i][0].save(parsed[PAIRS[i][1]]);
    }
    return { ok: true };
  }

  function resetAll() {
    for (var i = 0; i < ALL.length; i++) ALL[i].clear();
    return true;
  }

  /* 어휘를 코드로 찾는 helper — 화면마다 다시 만들지 않게 여기 둔다 */
  function findBy(list, key, value) {
    for (var i = 0; i < list.length; i++) {
      if (list[i][key] === value) return list[i];
    }
    return null;
  }
  function language(code) { return findBy(LANGUAGES, 'code', code); }
  function hazard(code)   { return findBy(HAZARDS, 'code', code); }
  function role(code)     { return findBy(ROLES, 'code', code); }

  /* -----------------------------------------------------------------
     문구를 언어별로 판정한다 — phraseStatus / phraseOk

     ★ 검수 상태가 문구 단위이면, 크메르어 번역 하나가 오역이어도 문구 전체가
       내려가고 인도네시아어·베트남어 노동자도 그 안전 지시를 함께 못 듣습니다.
       그것은 오역보다 나은 상태가 아닙니다 — 안전 지시가 조용히 사라집니다.

     그래서 언어마다 상태를 가질 수 있게 합니다.
       translations[code].status — 그 언어의 판정 (없으면 문구 전체를 따름)
       p.status                  — 문구 전체의 판정

     둘이 다르면 **엄한 쪽**을 따릅니다. 중지 > 대기 > 완료.
     한국어 원문이 아직 대기인데 번역만 완료라고 해서 쓸 수는 없고,
     문구 전체가 중지면 어느 언어로도 나가지 않아야 합니다.

     번역이 없는 언어는 판정이 아니라 "아직 없음" 입니다. 그때는 문구 전체의
     상태를 따르고, 노동자 화면은 한국어를 띄우며 "준비 중" 을 남깁니다
     (learn.js) — 조용히 숨기지 않습니다.
     ----------------------------------------------------------------- */

  var STATUS_RANK = { reviewed: 0, waiting: 1, stopped: 2 };

  function stricter(a, b) {
    var ra = STATUS_RANK[a] === undefined ? 1 : STATUS_RANK[a];
    var rb = STATUS_RANK[b] === undefined ? 1 : STATUS_RANK[b];
    return ra >= rb ? a : b;
  }

  function phraseStatus(phrase, lang) {
    if (!phrase) return 'stopped';

    var whole = STATUS_RANK[phrase.status] === undefined ? 'waiting' : phrase.status;
    if (!lang || lang === 'ko') return whole;

    var t = obj(phrase.translations)[lang];
    if (!t || !t.text) return whole;              // 번역이 없다 — 판정이 아니다
    if (STATUS_RANK[t.status] === undefined) return whole;

    return stricter(whole, t.status);
  }

  /* 이 언어로 안전 지시로 쓸 수 있는가.
     검수 완료가 아닌 문구는 안전 지시로 쓰지 않는다 (PRD §9.3). */
  function phraseOk(phrase, lang) {
    return phraseStatus(phrase, lang) === 'reviewed';
  }

  /* -----------------------------------------------------------------
     판정 기록 — AI 가 한 일(agent)과 사람이 한 일(judged)을 갈라 읽는다
     🆕 2026-10-31 (T6 · A02 §6.3 · FR-AD-02-09)

     ★ 두 칸은 옛 데이터에 없다. 화면이 t.agent.tries 를 직접 읽으면 그 자리에서
       터진다. 없으면 null 을 돌려주는 자리를 여기 한 곳에만 둔다.

     ★ agent 가 있는 것은 "AI 가 내놓았다" 는 뜻일 뿐 승인이 아니다.
       승인 여부는 언제나 status 로만 본다 (phraseOk).
     ----------------------------------------------------------------- */

  function translationOf(phrase, lang) {
    if (!phrase || !lang) return null;
    var t = obj(phrase.translations)[lang];
    return t && typeof t === 'object' ? t : null;
  }

  /** AI 가 이 언어에 무엇을 했나. 없으면 null (손으로 넣은 번역이거나 옛 데이터). */
  function phraseAgent(phrase, lang) {
    var t = translationOf(phrase, lang);
    var a = t && t.agent;
    if (!a || typeof a !== 'object') return null;
    return {
      tries: Number(a.tries) || 0,
      flipped: !!a.flipped,
      escalated: !!a.escalated,
      model: a.model || '',
      at: a.at || null,
      text: a.text || ''        // AI 가 내놓은 번역문 (얼려 둔 것)
    };
  }

  /** ★ 사람에게 올린 언어를 AI 번역문 그대로 승인할 수 있는가 — 없다 (FR-AD-03-14).
   *  지금 번역문이 AI 가 내놓은 것과 같으면 아직 아무도 손대지 않은 것이다.
   *  사람이 직접 고쳐 넣으면 달라지고, 그때 승인이 열린다. */
  function approvalBlocked(phrase, lang) {
    var a = phraseAgent(phrase, lang);
    if (!a || !a.escalated) return false;
    var t = translationOf(phrase, lang);
    return !!t && !!a.text && t.text === a.text;
  }

  /** 사람이 이 언어를 언제 판정했나. 없으면 null = 아직 아무도 안 봤다. */
  function phraseJudged(phrase, lang) {
    var t = translationOf(phrase, lang);
    var j = t && t.judged;
    if (!j || typeof j !== 'object' || !j.by) return null;
    return { by: j.by, at: j.at || null };
  }

  /** ★ AI 가 올렸는데 아직 사람이 안 본 것. 운영자가 먼저 볼 자리다. */
  function needsHuman(phrase, lang) {
    var a = phraseAgent(phrase, lang);
    return !!a && a.escalated && !phraseJudged(phrase, lang);
  }

  /* 이 문구가 중지된 언어들. 화면에 "무엇이 왜 빠졌는지" 를 적을 때 쓴다. */
  function stoppedLangs(phrase) {
    if (!phrase) return [];
    var t = obj(phrase.translations);
    return Object.keys(t).filter(function (code) {
      return t[code] && t[code].status === 'stopped';
    });
  }

  /* -----------------------------------------------------------------
     문항을 노동자의 언어로 읽는다 — qtext / qhas

     ★ 화면에서 q.i18n[lang] 을 직접 뒤지지 마세요. 이유가 하나 있습니다.

     answer 는 options 의 인덱스입니다. 번역 배열의 길이나 순서가 한국어와
     다르면 정답이 엉뚱한 선택지를 가리킵니다. 안전교육에서 정답이 어긋나면
     틀린 작업을 맞다고 가르치게 됩니다.

     그래서 "길이가 다르면 한국어로 되돌린다" 는 검사를 여기 한 곳에만 둡니다.
     화면마다 흩어 놓으면 언젠가 한 곳이 빠지고, 빠진 것을 눈으로 찾을 수 없습니다.

     되돌리는 규칙 — 어긋나면 그 필드만 한국어로:
       lang 이 없거나 'ko'                  → 한국어
       i18n[lang][field] 가 없음            → 한국어
       문자열이어야 하는데 아니거나 빈 값   → 한국어
       배열인데 길이가 한국어와 다름        → 한국어 배열 전체
       pairs 인데 각 줄이 두 칸이 아님      → 한국어 pairs
     ----------------------------------------------------------------- */

  var Q_ARRAY_FIELDS = { options: true, results: true, pairs: true };

  function qtext(q, lang, field) {
    var ko = q ? q[field] : undefined;
    if (!q || !lang || lang === 'ko') return ko;

    var pack = obj(q.i18n)[lang];
    if (!pack) return ko;

    var val = pack[field];
    if (val === undefined || val === null) return ko;

    if (!Q_ARRAY_FIELDS[field]) {
      // 문자열 필드 — prompt · why
      if (typeof val !== 'string' || !val.trim()) return ko;
      return val;
    }

    // 배열 필드 — options · results · pairs
    if (!Array.isArray(val) || !Array.isArray(ko)) return ko;
    if (val.length !== ko.length) return ko;          // ★ 정답 인덱스가 어긋난다

    if (field === 'pairs') {
      // pairs 는 [['작업', '보호구'], ...] 두 칸짜리 줄의 배열이다
      var shapeOk = val.every(function (row) {
        return Array.isArray(row) && row.length === 2 &&
          typeof row[0] === 'string' && typeof row[1] === 'string' &&
          row[0].trim() && row[1].trim();
      });
      return shapeOk ? val : ko;
    }

    // 한 칸이라도 비어 있으면 그 배열은 못 쓴다 — 빈 선택지가 화면에 나간다
    var allFilled = val.every(function (s) { return typeof s === 'string' && s.trim(); });
    return allFilled ? val : ko;
  }

  /* 이 문항이 그 언어로 "온전히" 나오는가.

     없으면 화면이 "내 언어 번역 준비 중" 을 띄웁니다 —
     번역이 없는 것을 조용히 숨기지 않습니다 (기능3 의 같은 원칙).

     ★ 문구만 번역되고 선택지가 한국어로 되돌아간 경우도 false 입니다.
       그 경우 노동자는 문항은 읽히는데 선택지는 못 읽는 화면을 봅니다.
       배지가 없으면 그 사실이 아무 데도 남지 않습니다.

     보는 것은 "문항을 풀기 위해 읽어야 하는" 세 필드입니다.
     results 와 why 는 답한 뒤의 설명이라 여기서 보지 않습니다 — 없으면
     한국어로 내려가고 음성은 UI.speak 이 한국어로 읽어 줍니다. */

  var Q_ASK_FIELDS = ['prompt', 'options', 'pairs'];

  function qhas(q, lang) {
    if (!q || !lang || lang === 'ko') return true;
    if (!obj(q.i18n)[lang]) return false;

    for (var i = 0; i < Q_ASK_FIELDS.length; i++) {
      var f = Q_ASK_FIELDS[i];
      if (q[f] === undefined || q[f] === null) continue;   // 이 유형에 없는 필드
      if (qtext(q, lang, f) === q[f]) return false;        // 한국어로 되돌아갔다
    }
    return true;
  }

  return {
    // 어휘
    LANGUAGES: LANGUAGES, HAZARDS: HAZARDS, ICONS: ICONS,
    SIZE_BANDS: SIZE_BANDS, ROLES: ROLES, PHRASE_STATUS: PHRASE_STATUS,
    language: language, hazard: hazard, role: role, findBy: findBy,

    // 문항을 노동자의 언어로 읽는 통로 (화면에서 q.i18n 을 직접 뒤지지 않는다)
    qtext: qtext, qhas: qhas,

    // 문구를 언어별로 판정하는 통로 (화면에서 p.status 를 직접 보지 않는다)
    phraseStatus: phraseStatus, phraseOk: phraseOk, stoppedLangs: stoppedLangs,
    phraseAgent: phraseAgent, phraseJudged: phraseJudged, needsHuman: needsHuman,
    approvalBlocked: approvalBlocked,

    // 저장소 8개
    accounts: accounts, session: session, setup: setup, library: library,
    courses: courses, progress: progress, reports: reports, posts: posts,
    prefs: prefs, orders: orders, FONT_SCALES: FONT_SCALES,
    env: ENV, isDev: ENV === 'dev',
    VOICE_FALLBACKS: VOICE_FALLBACKS,
    orderOpen: orderOpen, askedQuestion: askedQuestion,

    // 공통
    uid: uid, available: available,
    exportAll: exportAll, importAll: importAll, resetAll: resetAll
  };
})();
