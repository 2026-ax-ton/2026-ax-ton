/* ===================================================================
   my.js — 마이페이지

   담당: P2
   기능번호: — (내 기록)
   읽는 키: setup, courses, progress, reports, accounts
   쓰는 키: accounts — 내 언어(lang) 값만
   근거: SCREEN 화면10 · PRD §4.2

   ★ 증빙은 저장하지 않고 progress 를 그대로 읽어서 그린다.
     사본이 없으니 고칠 경로도 없다 — 기능5 와 같은 방식이다.

   ★ 못 들은 교육과 통과하지 못한 교육을 빼고 뽑는 경로를 만들지 않는다.
     걸러 보기도, 결과순 정렬도 두지 않는다.
     숨길 수 있는 증빙은 증빙이 아니다.

   ★ 외국인등록번호 · 여권번호를 다루지 않는다.
     사업장 안에서 쓰는 식별번호만 보여 준다.

   ★ 위험 신고는 익명이라 "내가 낸 것" 을 골라낼 수 없다.
     그게 익명이라는 뜻이므로, 왜 그런지 화면에 적는다.

   ★ 내 언어는 accounts 의 lang "값만" 고친다. 모양은 넓히지 않는다.
     accounts 는 로그인이 읽는 데이터다. 모양이 바뀌면 로그인이 깨진다.
     네 개 노동자 화면이 전부 user.lang 을 먼저 보므로, 여기만 고치면 다 따라온다.

   ★ 문항별 복기는 성적표가 아니라 "무엇을 몰랐는지" 다.
     그림(위험유형 픽토그램)이 먼저고 글은 거든다 — 읽어 주는 버튼을 함께 둔다.
     미통과를 숨기지 않는다는 규칙과 어긋나지 않는다. 숨기는 게 아니라 더 보여 준다.

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

  function langName(code) {
    var l = Store.language(code);
    return l ? l.name : (code || '-');
  }

  function processName(id) {
    var p = Store.findBy(Store.setup.load().processes, 'id', id);
    return p ? p.name : '';
  }

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

  function resultOf(course) {
    var row = progressOf(course.id);
    if (!row || !row.learnedAt) {
      return { state: 'none', label: '아직 안 들었습니다', learnedAt: null, quizAt: null, score: null };
    }
    if (!row.quiz) {
      return { state: 'noquiz', label: '확인이 남았습니다', learnedAt: row.learnedAt, quizAt: null, score: null };
    }
    return {
      state: row.quiz.passed ? 'pass' : 'fail',
      label: row.quiz.passed ? '완료' : '통과하지 못했습니다',
      learnedAt: row.learnedAt,
      quizAt: row.quiz.at,
      score: row.quiz.score,
      attempt: row.quiz.attempt,
      lang: row.lang
    };
  }

  function renderVoiceNote() {
    var note = UI.voiceNote(me.lang);
    var box = $('voicenote');
    box.textContent = note;
    box.hidden = !note;
  }

  /* -----------------------------------------------------------------
     1. 내 정보

     ★ 외국인등록번호 · 여권번호는 아예 다루지 않는다.
       받지 않는다는 사실도 화면에 적는다.
     ----------------------------------------------------------------- */

  function renderMe() {
    var state = Store.setup.load();
    var list = $('me-list');
    list.textContent = '';

    var rows = [
      { what: '식별번호', note: me.id },
      { what: '사업장', note: state.site.name || '(미등록)' },
      { what: '공정', note: processName(me.processId) || '(미배정)' },
      { what: '내 언어', note: langName(me.lang) }
    ];

    rows.forEach(function (r) {
      var li = UI.el('li');
      li.setAttribute('data-done', 'yes');
      li.appendChild(UI.el('span', 'what', r.what));
      li.appendChild(UI.neutralBadge(r.note));
      list.appendChild(li);
    });
  }

  /* -----------------------------------------------------------------
     2. 받은 교육 — 못 들은 것도 그대로
     ----------------------------------------------------------------- */

  function badgeFor(state) {
    if (state === 'pass') return UI.okBadge(I18N.t('state.done'));
    if (state === 'fail') return UI.stopBadge(I18N.t('state.retry'));
    if (state === 'noquiz') return UI.waitBadge(I18N.t('state.quizLeft'));
    return UI.neutralBadge(I18N.t('state.notStarted'));
  }

  function renderHistory() {
    var list = $('history-list');
    list.textContent = '';

    var courses = myCourses();
    if (!courses.length) {
      list.appendChild(UI.emptyRow('아직 받을 교육이 없습니다.'));
      return;
    }

    var state = Store.setup.load();

    courses.forEach(function (course) {
      var eq = Store.findBy(state.equipments, 'id', course.equipmentId);
      var r = resultOf(course);

      var li = UI.el('li', 'course-card');

      var ico = UI.iconBox((eq && eq.icon) || 'gear', 'ico');
      ico.setAttribute('aria-hidden', 'true');
      li.appendChild(ico);

      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, course.title));
      body.appendChild(UI.el('p', 'meta', [
        r.quizAt ? '확인 ' + UI.formatDate(r.quizAt) : (r.learnedAt ? '들은 날 ' + UI.formatDate(r.learnedAt) : null),
        r.score === null ? null : r.score + '점'
      ].filter(Boolean).join(' · ') || '기록 없음'));

      var tags = UI.el('div', 'tags');
      tags.appendChild(badgeFor(r.state));
      body.appendChild(tags);
      /* 어느 문항에서 막혔는지 (C4). 미통과한 것에만 붙인다 —
         통과한 교육에 틀린 문항을 다시 들추면 성적표가 된다. */
      if (r.state === 'fail') {
        var stuck = stuckOf(course);
        if (stuck.length) body.appendChild(renderStuck(stuck));
      }

      li.appendChild(body);

      // 다시 할 수 있는 길을 준다. 통과하지 못한 것이 막다른 길이 되면 안 된다.
      if (r.state !== 'pass') {
        var go = UI.el('a', 'btn-sm go', r.state === 'noquiz' ? '확인하기' : '다시 듣기');
        go.href = r.state === 'noquiz'
          ? 'quiz.html?course=' + encodeURIComponent(course.id)
          : 'learn.html';
        li.appendChild(go);
      }

      list.appendChild(li);
    });
  }


  /* -----------------------------------------------------------------
     문항별 복기 (C4)

     ★ admin/dashboard.js 의 stuckTopics() 와 같은 판정이다 —
       answers[i] 가 1 이 아니면 그 자리의 문항이 틀린 것이다.
       담당자가 보는 "취약 항목" 과 노동자가 보는 "여기서 막혔습니다" 가
       어긋나면, 같은 시험을 두고 서로 다른 말을 하게 된다.
     ----------------------------------------------------------------- */

  var QLABEL = { hotspot: '위험 지점 짚기', choice: '올바른 작업 고르기', match: '보호구 연결하기' };

  function stuckOf(course) {
    var row = progressOf(course.id);
    if (!row || !row.quiz || !Array.isArray(row.quiz.answers)) return [];

    var lang = row.lang || me.lang;
    var out = [];

    row.quiz.answers.forEach(function (correct, i) {
      if (correct === 1) return;

      /* 답은 "그때 낸 문항" 과 짝지어져 있다. 자리로 찾으면 나중에 문항을
         내렸을 때 어긋난다 — Store.askedQuestion 이 그 짝을 찾는다 (C6).
         그 문항이 아예 지워졌으면 짝이 없다.
         없는 문항을 지어내지 않고 건너뛴다. */
      var q = Store.askedQuestion(course, row.quiz, i);
      if (!q) return;

      var haz = Store.hazard(q.hazard);
      out.push({
        icon: haz ? haz.icon : '📋',
        label: haz ? haz.label : (QLABEL[q.type] || q.type),
        prompt: Store.qtext(q, lang, 'prompt') || '',
        ko: q.prompt || '',
        lang: lang
      });
    });

    return out;
  }

  /* 내 언어 음성이 기기에 없으면 한국어 원문을 읽는다 (learn.js 의 speechFor 와 같은 모양) */
  function speechForStuck(list) {
    var text = list.map(function (s) { return s.prompt; }).filter(Boolean).join('. ');
    var ko = list.map(function (s) { return s.ko; }).filter(Boolean).join('. ');
    return { text: text || ko, lang: list[0] ? list[0].lang : me.lang, ko: ko };
  }

  /* ★ 글자를 못 읽어도 무엇을 놓쳤는지는 알아야 한다.
       픽토그램이 먼저 오고, 문항 문구는 내 언어로 거든다. */
  function renderStuck(stuck) {
    var box = UI.el('div', 'stuck');

    var head = UI.el('div', 'stuck-head');
    head.appendChild(UI.el('strong', 'stuck-title', '여기서 막혔습니다'));

    /* 읽어 줄 것이 있을 때만 버튼을 둔다. 눌러도 아무 일이 없는 버튼은
       글을 못 읽는 사람에게 고장으로 보인다. */
    var speech = speechForStuck(stuck);
    if (speech.text) {
      /* ★ 소리가 안 나는 상태면 버튼 그림도 그렇게 보여야 한다.
         멀쩡한 스피커 그림인데 눌러도 아무 일이 없으면 고장으로 읽힌다.
         감추지는 않는다 — 왜 안 나는지는 화면 맨 위 안내 줄이 적고 있다. */
      var mute = UI.voiceBlocked() || UI.voiceSilent(me.lang);
      var say = UI.el('button', 'btn-sm say');
      say.appendChild(UI.iconBox(mute ? 'speaker-off' : 'speaker', null));
      say.appendChild(document.createTextNode(
        mute ? ' 소리가 안 납니다' : ' 읽어 주기'));
      say.type = 'button';
      say.addEventListener('click', function () { UI.speak(speech); });
      head.appendChild(say);
    }
    box.appendChild(head);

    var ul = UI.el('ul', 'stuck-list');
    stuck.forEach(function (s) {
      var li = UI.el('li');

      var ico = UI.el('span', 'ico', s.icon);
      ico.setAttribute('aria-hidden', 'true');
      li.appendChild(ico);

      var b = UI.el('div', 'body');
      b.appendChild(UI.el('strong', null, s.label));
      if (s.prompt) b.appendChild(UI.el('p', 'meta', s.prompt));
      li.appendChild(b);

      // 색만으로 구분하지 않는다 — 아이콘 + 글자 + 색 3중
      li.appendChild(UI.stopBadge(I18N.t('state.wrong')));
      ul.appendChild(li);
    });
    box.appendChild(ul);

    /* SCREEN 기능4 와 같은 말을 여기서도 한다.
       복기가 "네가 못했다" 로 읽히면 이 화면은 성적표가 된다. */
    box.appendChild(UI.el('p', 'stuck-why',
      '미통과는 노동자의 실패가 아니라 교육의 실패로 기록됩니다. ' +
      '위 항목은 다시 들을 때 무엇을 눈여겨보면 되는지입니다.'));

    return box;
  }
  /* -----------------------------------------------------------------
     3. 위험 신고 — 익명이라 내 것만 골라낼 수 없다
     ----------------------------------------------------------------- */

  function renderReports() {
    var list = $('reports-list');
    list.textContent = '';

    $('reports-why').textContent =
      '신고는 이름을 남기지 않으므로 "내가 낸 것" 만 골라 볼 수 없습니다. ' +
      '우리 현장에 들어온 신고를 함께 봅니다. 그게 이름을 남기지 않는다는 뜻입니다.';

    var state = Store.setup.load();
    var all = Store.reports.load().slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    if (!all.length) {
      list.appendChild(UI.emptyRow('아직 들어온 신고가 없습니다.'));
      return;
    }

    all.slice(0, 5).forEach(function (r) {
      var eq = Store.findBy(state.equipments, 'id', r.equipmentId);
      var haz = Store.hazard(r.hazard);

      var li = UI.el('li', 'report-item');
      var ico = UI.iconBox(haz ? haz.icon : 'alert', 'ico');
      ico.setAttribute('aria-hidden', 'true');
      li.appendChild(ico);

      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null,
        (haz ? haz.label : '위험') + ' · ' + (eq ? eq.name : '설비 미지정')));
      body.appendChild(UI.el('p', 'meta',
        [r.ticket, UI.formatDate(r.createdAt)].filter(Boolean).join(' · ')));
      li.appendChild(body);

      if (r.status === 'resolved') li.appendChild(UI.okBadge(I18N.t('state.handled')));
      else if (r.status === 'urgent') li.appendChild(UI.stopBadge(I18N.t('state.urgent')));
      else li.appendChild(UI.waitBadge(I18N.t('state.checking')));

      list.appendChild(li);
    });

    if (all.length > 5) {
      var more = UI.el('li');
      more.appendChild(UI.el('p', 'empty', '그 밖에 ' + (all.length - 5) + '건이 더 있습니다.'));
      list.appendChild(more);
    }
  }


  /* -----------------------------------------------------------------
     내 언어 바꾸기 (C8)

     ★ accounts 의 lang "값만" 고친다. 키도 모양도 늘리지 않는다.
       accounts 는 로그인이 읽는 데이터라 모양이 바뀌면 로그인이 깨진다.

     ★ 고르는 칸에 모국어 글자를 앞세운다 (ភាសាខ្មែរ · Bahasa Indonesia).
       한국어 이름만 있으면 한국어를 못 읽는 사람은 자기 언어를 못 찾는다.
       이 화면에서 그건 언어를 바꿀 수 없다는 뜻이 된다.
     ----------------------------------------------------------------- */

  function renderLangPick() {
    var box = $('pick-mylang');
    if (!box) return;
    box.textContent = '';

    Store.LANGUAGES.forEach(function (lang) {
      var node = UI.chip({
        type: 'radio', name: 'mylang', value: lang.code,
        label: lang.native, sub: lang.name,
        checked: lang.code === me.lang
      });
      node.querySelector('input').addEventListener('change', function () {
        saveLang(lang.code);
      });
      box.appendChild(node);
    });
  }

  /* 화면 안내 번역이 검수 전이면 그 사실을 적는다 (UI-1).
     검수된 언어에는 아무것도 안 뜬다 — 늘 떠 있으면 무시하게 된다. */
  function renderI18nNote() {
    var box = $('i18n-note');
    if (!box) return;
    var note = (typeof I18N === 'undefined') ? '' : I18N.note();
    box.textContent = note;
    box.hidden = !note;
  }

  function saveLang(code) {
    var result = Store.accounts.update(function (list) {
      var acc = Store.findBy(list, 'userId', me.id);
      if (acc) acc.lang = code;          // ★ 값만. 다른 필드는 손대지 않는다
    });

    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      renderLangPick();                  // 고른 표시를 원래대로 되돌린다
      return;
    }

    /* user 는 accounts 를 읽어 만든 값이라 다시 읽어야 한다.
       안 그러면 화면은 바뀌었는데 me.lang 은 옛 언어로 남는다. */
    user = Auth.current();
    me = whoAmI();

    render();
    UI.toast(langName(code) + ' 로 바꿨습니다. 교육과 이해도 검증이 이 언어로 나옵니다.');
  }

  /* -----------------------------------------------------------------
     글자 크기 (B3 · PRD §9.4)

     ★ prefs 는 기기에 딸린다. 계정이 아니다.
       한 대의 폰을 여러 사람이 돌려 쓰기도 하고, 무엇보다 로그인 화면
       글자가 안 보이는 사람은 계정 설정에 닿지도 못한다.

     ★ 칸에 적힌 글자를 실제 그 크기로 보여 준다.
       "작게 / 보통 / 크게" 라는 글자를 읽어야 고를 수 있으면,
       글자가 안 보여서 여기 온 사람에게는 아무 도움이 안 된다.
     ----------------------------------------------------------------- */

  var FONT_LABEL = { small: '작게', normal: '보통', large: '크게' };

  function renderFontPick() {
    var box = $('pick-myfont');
    if (!box) return;
    box.textContent = '';

    var now = Store.prefs.load().fontScale;

    Store.FONT_SCALES.forEach(function (code) {
      var node = UI.chip({
        type: 'radio', name: 'myfont', value: code,
        label: '가', sub: FONT_LABEL[code],
        checked: code === now
      });
      // 칩이 그 크기로 보인다 — 글자를 못 읽어도 눈으로 고를 수 있다
      node.querySelector('.chip').classList.add('font-demo', 'font-demo-' + code);
      box.appendChild(node);
    });
  }

  function saveFontScale(code) {
    var result = Store.prefs.update(function (data) {
      data.fontScale = code;
    });

    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      renderFontPick();
      return;
    }

    /* store.js 는 화면이 처음 뜰 때만 붙인다. 지금 고른 것은 여기서 바로 붙인다 —
       새로고침해야 바뀌면 고른 사람은 안 바뀐 줄 안다. */
    var root = document.documentElement;
    if (code === 'normal') root.removeAttribute('data-font');
    else root.setAttribute('data-font', code);

    renderFontPick();
    UI.toast('글자를 ' + FONT_LABEL[code] + ' 로 바꿨습니다. 이 기기에서 계속 유지됩니다.');
  }

  /* -----------------------------------------------------------------
     3.5 내 언어 음성이 이 기기에 없을 때

     ★ 기본은 소리를 내지 않는 것이다. 뜻이 닿지 않는 소리가 나면 사람은
       "들었다" 고 생각하고 넘어간다 — 그게 이 제품이 막으려는 상황이다.
       안 낼 때는 화면 맨 위 안내 줄(#voicenote)이 그 이유를 그 사람의
       언어로 적는다. 조용히 아무 일도 안 일어나면 그게 가장 나쁜 실패다.

     ★ 그래도 "한국어로 들려주기" 를 없애지 않는다 — 말은 알아듣는데 글은
       못 읽는 사람이 흔하다. 이 제품이 겨냥한 것은 "문해력 없음" 이지
       "한국어 전혀 모름" 이 아니다. 그 사람에게는 한국어 음성이 유일한 통로다.

     ★ prefs 는 기기에 딸린다 (글자 크기와 같은 이유).
       기기마다 들어 있는 음성이 다르므로 이건 그 기기의 사정이다.

     ★ 한국어를 쓰는 노동자에게도 감추지 않는다. 기기 설정이고,
       폰을 돌려 쓰는 상황이 실제로 있다.
     ----------------------------------------------------------------- */

  /* 아이콘 + 글자 두 겹으로 준다 — 색만으로 구분하지 않는다 */
  var VOICE_CHIP = {
    silent: { icon: '🔇', key: 'my.voiceSilent' },
    ko:     { icon: '🔊', key: 'my.voiceKo' }
  };

  /* i18n.js 가 안 실린 화면에서도 글자가 비지 않아야 한다 */
  function tt(key) {
    return (typeof I18N === 'undefined') ? key : I18N.t(key);
  }

  function renderVoicePick() {
    var box = $('pick-myvoice');
    if (!box) return;
    box.textContent = '';

    /* ★ 읽는 통로는 UI.voiceFallback() 하나다. 여기서 Store.prefs 를 또
       읽으면 판정이 두 곳으로 갈린다 (phraseOk · qtext 와 같은 이유). */
    var now = UI.voiceFallback();

    Store.VOICE_FALLBACKS.forEach(function (code) {
      var spec = VOICE_CHIP[code];
      box.appendChild(UI.chip({
        type: 'radio', name: 'myvoice', value: code,
        icon: spec.icon, label: tt(spec.key),
        checked: code === now
      }));
    });
  }

  function saveVoiceFallback(code) {
    var result = Store.prefs.update(function (data) {
      data.voiceFallback = code;
    });

    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      renderVoicePick();          // 고른 표시를 원래대로 되돌린다
      return;
    }

    renderVoicePick();

    /* ★ 🔊/🔇 버튼과 안내 줄은 ui.js 가 들고 있다. 여기서 다시 그려 달라고
       알린다 — 새로고침해야 바뀌는 설정은 바뀌지 않는 설정과 구분되지 않는다. */
    UI.notifyVoice();

    /* 사전을 거친다 — 여기서 한국어를 박으면, 한국어를 못 알아듣는 사람이
       오는 자리에 한국어만 남는다 */
    UI.toast(tt('my.voiceFallback') + ' : ' + tt(VOICE_CHIP[code].key));
  }
  /* -----------------------------------------------------------------
     4. 인쇄되는 증빙

     ★ 걸러 보기가 없다. 받은 교육 전부가 순서 그대로 들어간다.
     ----------------------------------------------------------------- */

  function metaRow(label, value) {
    var tr = UI.el('tr');
    tr.appendChild(UI.el('th', null, label));
    tr.appendChild(UI.el('td', null, value));
    return tr;
  }

  function renderProof() {
    var state = Store.setup.load();
    var courses = myCourses();

    $('proof-issued-at').textContent = '발급 ' + UI.formatDate(new Date().toISOString());

    var metas = $('proof-meta-rows');
    metas.textContent = '';
    metas.appendChild(metaRow('사업장', state.site.name || '(미등록)'));
    metas.appendChild(metaRow('식별번호', me.id));
    metas.appendChild(metaRow('공정', processName(me.processId) || '(미배정)'));
    metas.appendChild(metaRow('교육 언어', langName(me.lang)));

    var done = courses.filter(function (c) { return resultOf(c).state === 'pass'; }).length;
    metas.appendChild(metaRow('받은 교육', courses.length + '건 중 ' + done + '건 완료'));

    var body = $('proof-rows');
    body.textContent = '';

    if (!courses.length) {
      var tr = UI.el('tr');
      var cell = UI.el('td');
      cell.colSpan = 6;
      cell.appendChild(UI.el('p', 'empty', '받은 교육이 없습니다.'));
      tr.appendChild(cell);
      body.appendChild(tr);
      return;
    }

    courses.forEach(function (course) {
      var r = resultOf(course);
      var tr = UI.el('tr');
      tr.setAttribute('data-state', r.state);

      tr.appendChild(UI.el('td', null, course.title));
      tr.appendChild(UI.el('td', null, langName(r.lang || me.lang)));
      tr.appendChild(UI.el('td', null, r.learnedAt ? UI.formatDate(r.learnedAt) : '-'));
      tr.appendChild(UI.el('td', null, r.quizAt ? UI.formatDate(r.quizAt) : '-'));

      var scoreCell = UI.el('td', 'num');
      if (r.score === null) {
        scoreCell.textContent = '-';
      } else {
        scoreCell.appendChild(document.createTextNode(r.score + '점'));
        if (r.attempt > 1) scoreCell.appendChild(UI.el('span', 'sub', r.attempt + '회차'));
      }
      tr.appendChild(scoreCell);

      var resultCell = UI.el('td');
      if (r.state === 'pass') resultCell.appendChild(UI.okBadge('이수'));
      else if (r.state === 'fail') resultCell.appendChild(UI.stopBadge('미통과'));
      else resultCell.appendChild(UI.neutralBadge(r.state === 'noquiz' ? '검증 미실시' : '미수강'));
      tr.appendChild(resultCell);

      body.appendChild(tr);
    });
  }

  /* -----------------------------------------------------------------
     그리기
     ----------------------------------------------------------------- */

  function render() {
    renderVoiceNote();
    renderMe();
    renderLangPick();
    renderI18nNote();
    renderFontPick();
    renderVoicePick();
    renderHistory();
    renderReports();
    renderProof();
  }


  /* 칸에 건다 — 칩은 다시 만들어지지만 칸은 그대로다 (talk.js 와 같은 이유) */
  $('pick-myfont').addEventListener('change', function (e) {
    if (e.target && e.target.value) saveFontScale(e.target.value);
  });
  $('pick-myvoice').addEventListener('change', function (e) {
    if (e.target && e.target.value) saveVoiceFallback(e.target.value);
  });
  $('btn-print').addEventListener('click', function () {
    renderProof();     // 발급 시각을 누르는 순간으로
    window.print();
  });

  window.addEventListener('pagehide', UI.stopSpeak);
  /* ★ 안내 줄만 다시 그리면 복기의 "읽어 주기" 버튼은 스피커 그림으로 남는다.
     눌러도 소리가 안 나는 버튼이 멀쩡한 얼굴을 하고 있으면 고장으로 읽힌다. */
  UI.onVoicesReady(function () { renderVoiceNote(); renderHistory(); });

  window.addEventListener('storage', function (e) {
    if (e.key === Store.progress.KEY || e.key === Store.courses.KEY ||
        e.key === Store.reports.KEY || e.key === Store.setup.KEY) render();
  });

  render();
})();
