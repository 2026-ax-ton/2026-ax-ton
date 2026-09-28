/* ===================================================================
   home.js — 노동자 홈

   담당: P2
   기능번호: — (진입점)
   읽는 키: setup, courses, library, progress, orders
   쓰는 키: 없음
   근거: SCREEN 화면2 · PRD §4.2

   ★ 글자를 한 자도 읽지 않고 어디로 가야 할지 알 수 있어야 한다.
     그래서 이 화면의 모든 조작에 픽토그램과 음성이 함께 붙는다.

   이 파일이 코드로 지키는 것 —

   · 오늘의 안전 문구는 검수 완료(reviewed)된 것만 올린다.
     홈 배너는 교육에 들어가지 않아도 보이는 자리라, 여기 잘못된 문구가
     걸리면 가장 오래 노출된다.

   · 수강 → 검증 → 완료 3단계를 픽토그램으로 보여 준다.
     통과하지 못하면 완료가 아니다 (SCREEN 기능4).

   -------------------------------------------------------------------
   골격입니다. 남은 것은 화면 아래 "여기부터 채우시면 됩니다" 에 적혀 있습니다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillWorkerBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  function whoAmI() {
    var state = Store.setup.load();
    var row = Store.findBy(state.workers, 'id', user.userId) || {};
    return {
      id: user.userId,
      lang: user.lang || row.lang || 'ko',
      processId: user.processId || row.processId || ''
    };
  }

  var me = whoAmI();

  /* -----------------------------------------------------------------
     읽기
     ----------------------------------------------------------------- */

  function myCourses() {
    var state = Store.setup.load();
    return Store.courses.load().filter(function (c) {
      if (!c || !c.approved) return false;
      if (!me.processId) return true;
      var eq = Store.findBy(state.equipments, 'id', c.equipmentId);
      return !!eq && eq.processId === me.processId;
    });
  }

  function progressOf(courseId) {
    return Store.progress.load().filter(function (r) {
      return r.workerId === me.id && r.courseId === courseId;
    })[0] || null;
  }

  function stateOf(courseId) {
    var row = progressOf(courseId);
    if (!row) return 'todo';
    if (row.quiz && row.quiz.passed) return 'done';
    if (row.learnedAt) return 'verify';
    return 'todo';
  }

  /* 내 언어로 된 번역. 없으면 null. */
  function translationOf(phrase) {
    var t = phrase.translations && phrase.translations[me.lang];
    return (t && t.text) ? t : null;
  }

  /* 이 사람에게 번역이 필요한가.

     ★ 한국어를 쓰는 노동자에게는 한국어 원문이 곧 그 사람의 언어다.
       translations.ko 는 앞으로도 생기지 않으므로, 없다고 "번역 준비 중" 을
       띄우면 그 배지가 영원히 남는다 — 화면이 거짓말을 하게 된다.
       (한국어도 노동자의 언어 중 하나다. 되돌림이 아니다.) */
  function needsTranslation() { return me.lang !== 'ko'; }

  /* -----------------------------------------------------------------
  /* 오늘 띄울 문구들. 검수를 지난 것만, 내 언어 기준으로 판정한다.

     ★ 내 설비 교육이 쓰는 문구를 앞에 둔다. 없으면 검수된 것 전부를 쓴다 —
       빈 배너보다는 낫다. */
  function phrasePool() {
    // 판정은 내 언어 기준이다 — 다른 언어의 오역으로 내 문구가 사라지지 않는다
    var library = Store.library.load().filter(function (p) {
      return Store.phraseOk(p, me.lang);
    });
    if (!library.length) return [];

    var mine = {};
    myCourses().forEach(function (c) {
      (c.phraseIds || []).forEach(function (id) { mine[id] = true; });
    });

    var preferred = library.filter(function (p) { return mine[p.id]; });
    return preferred.length ? preferred : library;
  }

  /* 날짜로 돌린다. 새로고침할 때마다 바뀌면 "오늘의 문구" 가 아니다. */
  function todayIndex(pool) {
    if (!pool.length) return 0;
    return Math.floor(Date.now() / 86400000) % pool.length;
  }

  /* 지금 보고 있는 자리. null 이면 아직 오늘 것을 보고 있다는 뜻이다 (C5). */
  var phraseAt = null;

  function currentPhrase() {
    var pool = phrasePool();
    if (!pool.length) return null;

    /* 문구가 지워지거나 검수가 내려가면 목록이 짧아진다.
       자리를 그대로 두면 없는 것을 가리키게 되므로 접어 준다. */
    var at = (phraseAt === null) ? todayIndex(pool) : ((phraseAt % pool.length) + pool.length) % pool.length;
    return { phrase: pool[at], at: at, total: pool.length };
  }

  /* 좌우로 넘긴다. 끝에서 다시 처음으로 돌아온다 —
     막다른 끝이 있으면 글을 못 읽는 사람은 고장으로 여긴다. */
  function stepPhrase(delta) {
    var now = currentPhrase();
    if (!now || now.total < 2) return;

    phraseAt = ((now.at + delta) % now.total + now.total) % now.total;
    renderToday();

    /* ★ 넘기면 그 문구를 읽어 준다. 사람이 손으로 누른 뒤라
       음성이 실제로 나는지도 여기서 판정된다 (UI.speak). */
    var next = currentPhrase();
    if (next) UI.speak(speechFor(next.phrase));
  }

  function speechFor(phrase) {
    var t = translationOf(phrase);
    return {
      text: t ? t.text : phrase.ko,
      lang: t ? me.lang : 'ko',
      ko: phrase.ko               // 내 언어 음성이 기기에 없으면 이것을 읽는다
    };
  }

  function renderToday() {
    var now = currentPhrase();
    var box = $('today');
    var nav = $('today-nav');

    if (!now) {
      box.className = 'today empty-today';
      UI.setIcon($('today-pict'), 'clipboard');
      $('today-text').textContent = '아직 안전 문구가 준비되지 않았습니다.';
      $('today-ko').textContent = '';
      $('today-note').textContent = '';
      $('today-listen').textContent = '';
      nav.hidden = true;
      return;
    }

    var phrase = now.phrase;
    box.className = 'today';

    var eqIcon = 'alert';
    var state = Store.setup.load();
    myCourses().some(function (c) {
      if ((c.phraseIds || []).indexOf(phrase.id) === -1) return false;
      var eq = Store.findBy(state.equipments, 'id', c.equipmentId);
      if (eq) { eqIcon = eq.icon; return true; }
      return false;
    });

    var t = translationOf(phrase);
    UI.setIcon($('today-pict'), eqIcon);
    $('today-text').textContent = t ? t.text : phrase.ko;
    $('today-ko').textContent = t ? phrase.ko : '';

    /* ★ 배지는 정해진 자리에만 넣는다. 예전에는 다시 그릴 때마다
         listen 옆에 새로 끼워 넣어서 배지가 쌓였다. */
    var note = $('today-note');
    note.textContent = '';

    /* ★ "검수 완료" 를 적는다 (B4 — 목업에 있던 배지).
         phrasePool() 이 Store.phraseOk 를 지난 것만 담으므로 여기 오른
         문구는 전부 검수를 지난 것이다. 그 사실이 화면에 보여야
         노동자가 이 지시를 믿을 근거가 생긴다 — 검수를 지나지 않은 말은
         아예 안 나온다는 것이 이 제품의 약속이다. */
    note.appendChild(UI.okBadge(I18N.t('home.reviewedOk')));
    if (!t && needsTranslation()) note.appendChild(UI.waitBadge(I18N.t('learn.transPending')));

    var listen = $('today-listen');
    listen.textContent = '';
    listen.appendChild(UI.audioButton(function () {
      return speechFor(phrase);
    }, I18N.t('home.listenPhrase')));
    listen.appendChild(UI.el('span', 'label', I18N.t('action.listen')));

    /* 넘겨 볼 것이 하나뿐이면 버튼을 아예 두지 않는다 (C5) */
    nav.hidden = now.total < 2;
    $('today-pos').textContent = now.total < 2 ? '' : (now.at + 1) + ' / ' + now.total;
  }

  /* -----------------------------------------------------------------
     1-1. 담당자가 내린 재교육 지시 (D2)

     ★ 판정은 Store.orderOpen() 한 곳에서 한다. 담당자 대시보드가 같은
       함수를 쓴다 — 계산이 두 곳이면 한쪽만 고쳐져서, 담당자는 "보냈다" 고
       보는데 이 화면에는 아무것도 안 뜨는 일이 생긴다.

     ★ 담당자가 남긴 말은 한국어다. 이 화면에서 그것을 번역할 방법이 없다
       (검수를 지난 문구만 안전 지시로 쓴다는 규칙이 여기에도 걸린다).
       그래서 조용히 두지 않고 **한국어라고 화면에 적는다.**
       못 읽는 말을 아무 표시 없이 두면 그냥 못 본 것이 된다.

     ★ 무엇을 하면 되는지는 글이 아니라 그림과 버튼으로 준다.
       메모를 못 읽어도 "이 교육을 다시 듣는다" 까지는 갈 수 있어야 한다.
     ----------------------------------------------------------------- */

  function myOpenOrders() {
    var courses = myCourses();
    return Store.orders.load().filter(function (o) {
      if (o.workerId !== me.id) return false;
      return Store.orderOpen(o, progressOf(o.courseId));
    }).map(function (o) {
      return { order: o, course: Store.findBy(courses, 'id', o.courseId) };
    }).filter(function (x) { return !!x.course; });
  }

  function renderOrders() {
    var card = $('order-card');
    var box = $('order-list');
    box.textContent = '';

    var list = myOpenOrders();
    card.hidden = !list.length;
    if (!list.length) return;

    list.forEach(function (x) {
      var item = UI.el('div', 'order-item');

      var pict = UI.iconBox('repeat', 'pict', 'p');
      pict.setAttribute('aria-hidden', 'true');
      item.appendChild(pict);

      item.appendChild(UI.el('p', 'order-title', x.course.title));

      if (x.order.note) {
        item.appendChild(UI.el('p', 'order-note', x.order.note));
        // ★ 못 읽는 말을 못 읽는다고 적는다
        var mark = UI.el('p', 'order-lang');
        mark.appendChild(UI.waitBadge(I18N.t('home.koreanNote')));
        item.appendChild(mark);
      }

      // 글자를 한 자도 안 읽어도 무슨 일인지 알 수 있게
      var listen = UI.el('div', 'listen');
      listen.appendChild(UI.audioButton(function () {
        return {
          text: '"' + x.course.title + '" 교육을 다시 들어 주세요.' +
            (x.order.note ? ' ' + x.order.note : ''),
          lang: 'ko'
        };
      }, '다시 들으라는 안내 듣기'));
      listen.appendChild(UI.el('span', 'label', I18N.t('action.listen')));
      item.appendChild(listen);

      var actions = UI.el('div', 'big-actions');
      actions.appendChild(bigLink('🎧', '다시 듣기', 'learn.html'));
      item.appendChild(actions);

      box.appendChild(item);
    });
  }

  /* -----------------------------------------------------------------
     2. 수강 → 검증 → 완료 3단계
     ----------------------------------------------------------------- */

  function renderStage() {
    var courses = myCourses();
    var track = $('stage-track');
    var say = $('stage-say');
    var actions = $('stage-actions');
    actions.textContent = '';

    function mark(step, value) {
      var li = track.querySelector('[data-step="' + step + '"]');
      if (li) li.setAttribute('data-state', value);
    }

    if (!courses.length) {
      ['learn', 'quiz', 'done'].forEach(function (s) { mark(s, 'wait'); });
      say.textContent = '아직 받을 교육이 없습니다. 관리자가 교육을 만들면 여기 나옵니다.';
      return;
    }

    // 가장 급한 교육 하나를 고른다 — 미수강 > 검증 대기 > 완료
    var todo = courses.filter(function (c) { return stateOf(c.id) === 'todo'; })[0];
    var verify = courses.filter(function (c) { return stateOf(c.id) === 'verify'; })[0];
    var target = todo || verify || courses[0];
    var state = stateOf(target.id);

    if (state === 'todo') {
      mark('learn', 'now'); mark('quiz', 'wait'); mark('done', 'wait');
      say.textContent = '"' + target.title + '" 을 아직 듣지 않았습니다.';
      actions.appendChild(bigLink('🎧', '교육 듣기', 'learn.html'));
    } else if (state === 'verify') {
      mark('learn', 'done'); mark('quiz', 'now'); mark('done', 'wait');
      say.textContent = '"' + target.title + '" 을 들었습니다. 이해했는지 확인이 남았습니다.';
      actions.appendChild(bigLink('👆', '이해 확인하기',
        'quiz.html?course=' + encodeURIComponent(target.id)));
    } else {
      mark('learn', 'done'); mark('quiz', 'done'); mark('done', 'done');
      say.textContent = '받아야 할 교육을 모두 마쳤습니다.';
      actions.appendChild(bigLink('🙋', '내 기록 보기', 'my.html'));
    }

    // 상태를 소리로도 알려 준다
    var listen = UI.audioButton(function () {
      return { text: say.textContent, lang: 'ko' };
    }, I18N.t('home.listenStatus'));
    listen.classList.add('inline-audio');
    say.appendChild(listen);
  }

  function bigLink(icon, label, href) {
    var a = UI.el('a', 'btn btn-primary');
    a.href = href;
    a.appendChild(UI.iconBox(icon, null));
    a.appendChild(document.createTextNode(' ' + label));
    return a;
  }

  /* -----------------------------------------------------------------
     3. 메뉴 4갈래 — 픽토그램 + 글자 + 음성
     ----------------------------------------------------------------- */

  var MENU = [
    { icon: '🎧', key: 'home.menuLearn', href: 'learn.html', sayKey: 'speech.menuLearn' },
    { icon: '📷', key: 'report.title',   href: 'report.html', sayKey: 'speech.menuReport' },
    { icon: '💬', key: 'talk.title',     href: 'talk.html',   sayKey: 'speech.menuTalk' },
    { icon: '🙋', key: 'my.title',       href: 'my.html',     sayKey: 'speech.menuMy' }
  ];

  /* 메뉴 칸에 붙는 배지 (B4 — 목업에 있던 것).
     들어가기 전에 무엇이 기다리는지 알려 준다.

     ★ 익명이라는 것을 누르기 전에 말한다. 들어가서야 알면 이미 늦다 —
       망설이던 사람은 그 화면을 열지도 않는다.

     ★ 목업은 이 자리(소통 칸)에 "오프라인 가능" 을 두었지만 여기 두지 않는다.
       오프라인은 소통 화면 하나의 성질이 아니라 앱 전체의 성질이다.
       메뉴 한 칸에 붙이면 "소통만 오프라인" 으로 읽힌다.
       그래서 메뉴 아래에 따로 적는다 (renderOfflineOk).
       이 자리에는 C7 에서 생긴 "공식 답변 표시" 를 그대로 둔다. */
  function menuBadge(item) {
    if (item.href === 'learn.html') {
      var courses = myCourses();
      if (!courses.length) return null;
      var left = courses.filter(function (c) { return stateOf(c.id) !== 'done'; }).length;
      return left
        ? UI.waitBadge(I18N.t('home.coursesLeft') + ' ' + left + '/' + courses.length)
        : UI.okBadge(I18N.t('state.allDone'));
    }
    if (item.href === 'report.html') return UI.neutralBadge(I18N.t('home.anonAccept'));
    if (item.href === 'talk.html') return UI.neutralBadge(I18N.t('home.officialMark'));
    if (item.href === 'my.html') return UI.neutralBadge(I18N.t('home.proofPrint'));
    return null;
  }

  function renderMenu() {
    var box = $('bigmenu');
    box.textContent = '';

    MENU.forEach(function (item) {
      var cell = UI.el('div', 'bigmenu-cell');

      var a = UI.el('a', 'bigmenu-link');
      a.href = item.href;
      a.appendChild(UI.iconBox(item.icon, 'ico'));
      a.appendChild(UI.el('span', 'name', I18N.t(item.key)));

      var badge = menuBadge(item);
      if (badge) a.appendChild(badge);

      cell.appendChild(a);

      /* 글자를 못 읽어도 무엇인지 알 수 있게.
         ★ 배지도 함께 읽어 준다. 배지만 붙이고 소리에서 빼면
           글을 못 읽는 사람에게는 그 정보가 아예 없는 것과 같다. */
      var tail = badge ? '. ' + UI.badgeText(badge) : '';
      var lang = I18N.lang();
      cell.appendChild(UI.audioButton(function () {
        return {
          text: I18N.t(item.sayKey, lang) + tail,
          lang: lang,
          ko: I18N.t(item.sayKey, 'ko') + tail
        };
      }, I18N.t(item.key) + ' ' + I18N.t('action.listenGuide')));

      box.appendChild(cell);
    });
  }

  /* -----------------------------------------------------------------
     4. 번역 이상 신고 안내 — 음성으로도
     ----------------------------------------------------------------- */

  function renderBadTrans() {
    var box = $('badtrans-listen');
    box.textContent = '';
    box.appendChild(UI.audioButton(function () {
      return I18N.say('speech.badTrans');
    }, I18N.t('action.listenGuide')));
    box.appendChild(UI.el('span', 'label', I18N.t('action.listenGuide')));
  }

  /* 오프라인으로 열린다는 표시 (E1) — 목업 02-home 의 "오프라인 가능".

     ★★ 담겼을 때만 그린다. UI.offlineReady() 가 실제 controller 를 본다.
       고정 문구로 박아 두면 file:// 로 열었을 때도, 아직 안 담겼을 때도
       "오프라인 가능" 이라고 말하게 된다. B4 에서 이 배지를 일부러 뺀 이유가
       바로 그것이었다 — 화면이 거짓말을 하면 안 된다.

     ★ "처음 한 번은 인터넷이 필요하다" 를 함께 적는다. 설비 앞에서 QR 을
       처음 찍는 사람에게는 그 한 번이 있어야 한다. 안 적으면
       "오프라인 된다더니" 가 된다. */
  function renderOfflineOk() {
    var box = $('offline-ok');
    if (!box) return;
    box.textContent = '';

    if (!UI.offlineReady()) { box.hidden = true; return; }

    box.appendChild(UI.okBadge(I18N.t('home.offlineOk')));
    box.appendChild(document.createTextNode(' '));
    box.appendChild(UI.el('span', 'offline-ok-body',
      '이 기기에 저장돼 있어 인터넷이 끊겨도 교육을 이어갈 수 있습니다. ' +
      '처음 한 번만 인터넷이 필요합니다.'));
    box.hidden = false;
  }

  function renderVoiceNote() {
    var note = UI.voiceNote(me.lang);
    var box = $('voicenote');
    box.textContent = note;
    box.hidden = !note;
  }

  /* -----------------------------------------------------------------
     그리기
     ----------------------------------------------------------------- */

  function render() {
    renderVoiceNote();
    renderToday();
    renderOrders();
    renderStage();
    renderMenu();
    renderOfflineOk();
    renderBadTrans();
  }

  /* 안전 문구 넘겨 보기 (C5).
     교육에 들어가지 않아도 안전 지시가 여러 번 닿게 하는 것이 목적이다. */
  $('today-prev').addEventListener('click', function () { stepPhrase(-1); });
  $('today-next').addEventListener('click', function () { stepPhrase(1); });

  window.addEventListener('pagehide', UI.stopSpeak);
  UI.onVoicesReady(renderVoiceNote);

  window.addEventListener('storage', function (e) {
    if (e.key === Store.courses.KEY || e.key === Store.library.KEY ||
        e.key === Store.progress.KEY || e.key === Store.setup.KEY) render();
  });

  render();
})();
