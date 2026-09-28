/* ===================================================================
   learn.js — 기능3 안전교육 수강

   담당: P1
   기능번호: 기능3
   읽는 키: courses, library, setup
   쓰는 키: progress
   근거: SCREEN 기능3 · PRD §4.2

   내 공정 설비의 교육을 목록으로 보여 주고, 고르면 안전 문구를
   한 장씩 내 언어의 음성과 픽토그램으로 듣는다.
   다 들으면 progress 에 learnedAt 을 남기고 이해도 검증(quiz.html)으로 보낸다.

   이 파일이 코드로 지키는 규칙 세 가지 —

   · 검수 완료가 아닌 문구는 안전 지시로 쓰지 않는다. 판정은 내 언어 기준이다
     (Store.phraseOk) — 다른 언어의 오역으로 내 안전 지시가 사라지지 않는다.
     걸러 낸 결과가 0개면 진행 자체를 막는다. 오역이 그대로 사고가 된다.

   · 내 언어 번역이 없는 문구를 조용히 숨기지 않는다.
     안전 지시가 말없이 사라지는 쪽이 더 위험하다. 한국어 원문을 띄우고
     "번역 준비 중"을 표시해서, 못 받았다는 사실이 화면에 남게 한다.

   · 내 언어 음성이 기기에 없으면 그 사실을 화면에 적는다 (UI.voiceNote).
     소리가 안 났는데 난 줄 알고 넘어가면, 글자를 못 읽는 사람은
     아무것도 받지 못한 채 교육을 통과한다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillWorkerBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  /* -----------------------------------------------------------------
     내가 누구인지 — 계정에 없으면 사업장 등록(기능1)에서 보완한다.
     계정은 회원가입이 만들고 workers 는 담당자가 등록하므로 둘 중 하나만
     채워져 있는 경우가 생긴다. 어느 쪽이든 교육은 들을 수 있어야 한다.
     ----------------------------------------------------------------- */
  function whoAmI() {
    var setup = Store.setup.load();
    var row = Store.findBy(setup.workers, 'id', user.userId) || {};
    return {
      id: user.userId,
      lang: user.lang || row.lang || 'ko',
      processId: user.processId || row.processId || ''
    };
  }

  var me = whoAmI();

  /* -----------------------------------------------------------------
     읽기 — 화면에 필요한 모양으로 다듬는다
     ----------------------------------------------------------------- */

  /* 내가 들어야 하는 교육.
     공정이 배정되지 않은 노동자에게는 사업장의 승인된 교육을 전부 보여 준다.
     배정이 안 됐다는 이유로 안전교육을 못 보는 상태를 만들지 않는다. */
  function myCourses() {
    var setup = Store.setup.load();

    return Store.courses.load().filter(function (c) {
      if (!c || !c.approved) return false;
      if (!me.processId) return true;
      var eq = Store.findBy(setup.equipments, 'id', c.equipmentId);
      return !!eq && eq.processId === me.processId;
    });
  }

  function equipmentOf(course) {
    return Store.findBy(Store.setup.load().equipments, 'id', course.equipmentId);
  }

  /* 이 교육에서 실제로 들려줄 문구.
     ★ 검수 완료인 것만 남는다. 여기가 규칙이 코드가 되는 지점이다.

     ★ 판정은 내 언어 기준이다 (Store.phraseOk). 크메르어 번역 하나가 오역이어도
       인도네시아어 노동자는 그 안전 지시를 계속 들어야 한다.
       p.status 를 직접 보면 언어별 판정이 무시된다. */
  function phrasesOf(course) {
    var library = Store.library.load();
    var ids = Array.isArray(course.phraseIds) ? course.phraseIds : [];

    return ids.map(function (id) {
      return Store.findBy(library, 'id', id);
    }).filter(function (p) {
      return Store.phraseOk(p, me.lang);
    });
  }

  /* 걸러지기 전 개수 — "몇 개가 검수 대기라 빠졌는지" 를 말해 주려면 필요하다 */
  function phraseTotal(course) {
    return (Array.isArray(course.phraseIds) ? course.phraseIds : []).length;
  }

  function progressOf(courseId) {
    return Store.findBy(
      Store.progress.load().filter(function (r) { return r.workerId === me.id; }),
      'courseId', courseId
    );
  }

  /* 교육 하나의 상태 — 목록 배지와 다음 행동이 여기서 갈린다.
     통과하지 못하면 완료가 아니다 (SCREEN 기능4). */
  function stateOf(courseId) {
    var row = progressOf(courseId);
    if (!row) return 'todo';
    if (row.quiz && row.quiz.passed) return 'done';
    if (row.learnedAt) return 'verify';
    return 'todo';
  }

  /* 내 언어로 된 번역. 없으면 null — 숨기지 않고 그 사실을 화면에 남긴다. */
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
     음성 안내 줄 — 이 기기에서 내 언어 음성이 나오는지
     ----------------------------------------------------------------- */
  function renderVoiceNote() {
    var note = UI.voiceNote(me.lang);
    var box = $('voicenote');
    box.textContent = note;
    box.hidden = !note;
  }

  /* -----------------------------------------------------------------
     화면 A — 교육 목록
     ----------------------------------------------------------------- */

  function badgeFor(state) {
    if (state === 'done') return UI.okBadge(I18N.t('state.done'));
    if (state === 'verify') return UI.waitBadge(I18N.t('state.quizLeft'));
    return UI.neutralBadge(I18N.t('state.notStarted'));
  }

  function renderList() {
    var setup = Store.setup.load();
    var courses = myCourses();
    var proc = Store.findBy(setup.processes, 'id', me.processId);
    var lang = Store.language(me.lang);

    $('courses-why').textContent = [
      proc ? proc.name + ' 공정' : '공정 미배정',
      lang ? lang.name : me.lang
    ].join(' · ') + ' — 내 설비의 교육만 보입니다.';

    var list = $('course-list');
    list.textContent = '';

    if (!courses.length) {
      list.appendChild(UI.emptyRow(
        '담당자가 아직 내 설비의 교육을 만들지 않았습니다. 현장 관리자에게 알려 주세요.'
      ));
      return;
    }

    courses.forEach(function (course) {
      var eq = equipmentOf(course);
      var state = stateOf(course.id);
      var usable = phrasesOf(course).length;
      var total = phraseTotal(course);

      var li = UI.el('li', 'course-card');

      var open = UI.el('button', 'course-open');
      open.type = 'button';

      var ico = UI.iconBox((eq && eq.icon) || 'gear', 'ico');
      ico.setAttribute('aria-hidden', 'true');
      open.appendChild(ico);

      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, course.title));
      body.appendChild(UI.el('p', 'meta',
        [(eq && eq.name) || '설비 미지정', '안전 문구 ' + usable + '개'].join(' · ')));

      var tags = UI.el('div', 'tags');
      tags.appendChild(badgeFor(state));
      // 검수를 못 지난 문구가 있으면 몇 개가 빠졌는지 밝힌다
      if (total > usable) tags.appendChild(UI.waitBadge(I18N.t('learn.excluded') + ' ' + (total - usable)));
      if (needsTranslation() && !translationCoverage(course))
        tags.appendChild(UI.waitBadge(I18N.t('learn.transPending')));
      body.appendChild(tags);

      open.appendChild(body);
      open.addEventListener('click', function () { openCourse(course); });
      li.appendChild(open);

      // 카드가 무슨 교육인지 소리로도 알 수 있게. 제목은 한국어라 한국어로 읽는다.
      li.appendChild(UI.audioButton(function () {
        return { text: course.title, lang: 'ko' };
      }, course.title + ' 소리로 듣기'));

      list.appendChild(li);
    });
  }

  /* 이 교육의 문구 중 내 언어 번역이 하나라도 있는지 */
  function translationCoverage(course) {
    return phrasesOf(course).some(function (p) { return !!translationOf(p); });
  }

  /* -----------------------------------------------------------------
     화면 B — 수강 진행. 문구 한 장씩.
     ----------------------------------------------------------------- */

  var current = null;      // { course, phrases, index }

  function show(which) {
    $('view-list').hidden = which !== 'list';
    $('view-step').hidden = which !== 'step';
    $('view-nophrase').hidden = which !== 'nophrase';
    window.scrollTo(0, 0);
  }

  function openCourse(course) {
    var phrases = phrasesOf(course);

    // ★ 검수 완료 문구가 없으면 진행하지 않는다.
    //   검수 안 된 문구를 안전 지시로 쓰는 것보다 못 듣는 편이 낫다.
    if (!phrases.length) {
      var total = phraseTotal(course);
      $('nophrase-why').textContent = total
        ? '이 교육의 안전 문구 ' + total + '개가 아직 검수를 지나지 않았습니다. ' +
          '검수를 지나지 않은 문구는 안전 지시로 쓰지 않습니다. 담당자에게 알려 주세요.'
        : '이 교육에 아직 안전 문구가 들어 있지 않습니다. 담당자에게 알려 주세요.';
      show('nophrase');
      return;
    }

    current = { course: course, phrases: phrases, index: 0 };
    show('step');
    renderStep(true);
  }

  function speechFor(phrase) {
    var t = translationOf(phrase);
    return {
      text: t ? t.text : phrase.ko,
      lang: t ? me.lang : 'ko',
      ko: phrase.ko                 // 내 언어 음성이 기기에 없으면 이것을 읽는다
    };
  }

  function renderStep(autoSpeak) {
    var course = current.course;
    var phrase = current.phrases[current.index];
    var eq = equipmentOf(course);
    var last = current.index === current.phrases.length - 1;

    $('step-title').textContent = course.title;
    $('step-count').textContent =
      '안전 문구 ' + (current.index + 1) + ' / ' + current.phrases.length;

    var dots = $('step-dots');
    dots.textContent = '';
    current.phrases.forEach(function (_, i) {
      var dot = UI.el('span');
      dot.setAttribute('data-state', i < current.index ? 'done' : (i === current.index ? 'now' : 'todo'));
      dots.appendChild(dot);
    });

    var card = $('phrase-card');
    card.textContent = '';

    /* 픽토그램 — 설비 아이콘을 쓴다.
       문구마다 다른 그림을 주려면 library 에 icon 필드가 필요하고,
       library 는 기능9(P4) 소유라 지금은 손대지 않는다. */
    var pict = UI.iconBox((eq && eq.icon) || 'alert', 'pict', 'p');
    pict.setAttribute('aria-hidden', 'true');
    card.appendChild(pict);

    var t = translationOf(phrase);
    if (t) {
      card.appendChild(UI.el('p', 'translated', t.text));
      card.appendChild(UI.el('p', 'original', phrase.ko));
    } else {
      // 내 언어 번역이 없다. 숨기지 않고 한국어를 띄우고 그 사실을 배지로 남긴다.
      card.appendChild(UI.el('p', 'translated', phrase.ko));
      if (needsTranslation()) {
        var miss = UI.el('p', 'original');
        miss.appendChild(UI.waitBadge(I18N.t('learn.transPending')));
        card.appendChild(miss);
      }
    }

    var listen = UI.el('div', 'listen');
    listen.appendChild(UI.audioButton(function () { return speechFor(phrase); }, I18N.t('learn.listenAgain')));
    listen.appendChild(UI.el('span', 'label', '다시 듣기'));
    card.appendChild(listen);

    $('btn-prev').disabled = current.index === 0;
    $('btn-next').textContent = last ? '다 들었습니다 ✓' : '다음 ▶';

    if (autoSpeak) UI.speak(speechFor(phrase));
  }

  function step(delta) {
    UI.stopSpeak();
    var next = current.index + delta;

    if (next < 0) return;

    if (next >= current.phrases.length) {   // 마지막 장에서 "다 들었습니다"
      finish();
      return;
    }

    current.index = next;
    renderStep(true);
  }

  /* -----------------------------------------------------------------
     저장 — 다 들었다는 사실만 남긴다. 완료 여부는 검증이 정한다.

     ★ progress 의 모양은 기능5·6(P3·P4)이 읽는다. 필드를 바꾸지 않는다.
     ----------------------------------------------------------------- */
  function finish() {
    var courseId = current.course.id;

    var result = Store.progress.update(function (list) {
      var row = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].workerId === me.id && list[i].courseId === courseId) { row = list[i]; break; }
      }
      if (!row) {
        row = { workerId: me.id, courseId: courseId, lang: me.lang, learnedAt: null, quiz: null };
        list.push(row);
      }
      row.lang = me.lang;
      row.learnedAt = new Date().toISOString();
    });

    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      return;
    }

    // 교육을 들었으면 바로 이해도 검증으로. 서명이 아니라 이해가 완료 조건이다.
    location.href = 'quiz.html?course=' + encodeURIComponent(courseId);
  }

  function backToList() {
    UI.stopSpeak();
    current = null;
    renderList();
    show('list');
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('btn-prev').addEventListener('click', function () { step(-1); });
  $('btn-next').addEventListener('click', function () { step(1); });
  $('btn-quit').addEventListener('click', backToList);
  $('btn-nophrase-back').addEventListener('click', backToList);

  // 화면을 떠날 때 소리를 끊는다. 다음 화면까지 따라가면 무슨 소리인지 알 수 없다.
  window.addEventListener('pagehide', UI.stopSpeak);

  // 음성 목록은 비동기로 채워지는 브라우저가 있다. 준비되면 안내를 다시 그린다.
  UI.onVoicesReady(renderVoiceNote);

  // 담당자가 다른 탭에서 교육을 만들거나 문구 검수를 바꾸면 목록도 따라간다
  window.addEventListener('storage', function (e) {
    if (e.key === Store.courses.KEY || e.key === Store.library.KEY ||
        e.key === Store.progress.KEY || e.key === Store.setup.KEY) {
      if (!current) renderList();
    }
  });

  renderVoiceNote();
  renderList();
  show('list');

  /* -----------------------------------------------------------------
     설비 앞 QR 로 들어온 경우 (D1)

     ?course=<id> 가 붙어 있으면 그 교육을 바로 연다.
     ★ 목록을 먼저 보여 주고 "찾아서 누르세요" 라고 하면, 글을 못 읽는
       사람에게는 QR 을 찍은 뜻이 사라진다. 찍은 그 설비의 교육이 열려야 한다.

     ★ 내 교육이 아니면 목록에 그대로 둔다. 남의 공정 교육을 열어 주면
       엉뚱한 설비의 안전 지시를 배우게 된다.
     ----------------------------------------------------------------- */
  (function openFromQR() {
    var m = /[?&]course=([^&]*)/.exec(location.search || '');
    if (!m) return;

    var wanted = decodeURIComponent(m[1]);
    var course = Store.findBy(myCourses(), 'id', wanted);
    if (course) openCourse(course);
  })();
})();
