/* ===================================================================
   content.js — 기능2 교육 콘텐츠 생성 · 승인 (담당자)

   담당: P3
   기능번호: 기능2
   읽는 키: setup, library
   쓰는 키: courses (발급 · 발급 뒤 문항 고치기)
   읽는 키(추가): progress — 이미 푼 사람이 있는지 (C6)
   근거: SCREEN 기능2 · PRD §4.1

   설비 → 언어 → 문구 → 문항 → 승인. 승인하면 그 공정 노동자의
   수강 화면(기능3)에 바로 나타난다.

   이 파일이 코드로 지키는 것 —

   · 검수 완료(status === 'reviewed')된 문구만 선택지에 올린다.
     검수 대기·사용 중지 문구는 목록에 아예 나오지 않는다.
     오역이 그대로 사고가 되므로, 고를 수 있게 두는 것 자체가 위험하다.

   · 언어는 사업장 등록(기능1)에서 등록한 것만 나온다.
     등록하지 않은 언어가 교육에 들어가면 그 언어 노동자가 없는데 번역만 쌓인다.

   · 고른 언어에 번역이 없는 문구가 있으면 승인 전에 알린다.
     그대로 내보내면 그 언어 노동자는 한국어 원문만 보게 된다.

   · AI 는 문구를 새로 쓰지 않는다. 고르기만 한다 (화면 상단 고지).

   -------------------------------------------------------------------
   골격입니다. 남은 것은 화면 아래 "여기부터 채우시면 됩니다" 에 적혀 있습니다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillAdminBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  var QTYPES = [
    { code: 'hotspot', icon: '👆', label: '위험 지점 짚기' },
    { code: 'choice',  icon: '☑',  label: '올바른 작업 고르기' },
    { code: 'match',   icon: '🔗', label: '보호구 연결하기' }
  ];

  /* 초안. 승인을 누를 때까지 저장하지 않는다 —
     반쯤 만든 교육이 courses 에 들어가면 노동자 화면에 그대로 나온다. */
  var draft = newDraft();

  /* -----------------------------------------------------------------
     발급한 교육의 문항 고치기 (C6)

     ★ 문항 만드는 폼을 두 벌로 만들지 않는다.
       3단계 카드가 초안에도 쓰이고 발급된 교육에도 쓰인다. 두 벌이 되면
       언젠가 한쪽만 고쳐진다 (C1 의 courseBlock, C3 의 글쓰기 화면과 같은 이유).

     ★★ 이미 그 교육을 푼 사람의 progress.quiz.answers 는 그때 낸 문항과
       짝지어져 있다. 그래서 여기서 할 수 있는 것을 좁게 정했다.

       할 수 있는 것 — 맨 뒤에 문항 더하기
                     — 문항 내리기 (retired: 앞으로 안 나감. 기록은 그대로)
                     — 아무도 안 푼 교육이면 진짜 지우기

       하지 않는 것 — 순서 바꾸기
                     — 선택지 개수·순서·정답 번호 바꾸기
         정답은 "몇 번째 선택지" 라는 번호로 저장된다. 그것을 바꾸면
         옛 기록이 다른 선택지를 가리키고, **틀린 작업을 맞다고 가르친다.**
         고쳐야 하면 그 문항을 내리고 새 문항을 붙인다.
     ----------------------------------------------------------------- */

  var editingCourseId = null;

  function courseOf(id) { return Store.findBy(Store.courses.load(), 'id', id); }

  function editingCourse() {
    return editingCourseId ? courseOf(editingCourseId) : null;
  }

  /* 지금 문항이 붙는 자리의 문항 목록 */
  function targetQuiz() {
    var c = editingCourse();
    return c ? (c.quiz || []) : draft.quiz;
  }

  /* 이 교육을 푼 기록이 하나라도 있는가 —
     있으면 문항을 지우지 않는다. 지우면 옛 기록이 가리킬 곳을 잃는다. */
  function hasAnswers(courseId) {
    return Store.progress.load().some(function (r) {
      return r.courseId === courseId && r.quiz && Array.isArray(r.quiz.answers) &&
        r.quiz.answers.length > 0;
    });
  }

  /* 문항 하나를 지금 자리에 붙인다. 발급된 교육이면 바로 저장한다. */
  function pushQuestion(q) {
    var courseId = editingCourseId;
    if (!courseId) {
      q.id = 'q' + (draft.quiz.length + 1);
      draft.quiz.push(q);
      return true;
    }

    var result = Store.courses.update(function (list) {
      var c = Store.findBy(list, 'id', courseId);
      if (!c) return;
      c.quiz = c.quiz || [];
      /* ★ id 는 그 교육 안에서 겹치면 안 된다. 지금 개수로 매기면
           내렸다 더할 때 겹칠 수 있어, 안 쓰는 번호를 찾아 붙인다. */
      var n = c.quiz.length + 1;
      while (c.quiz.some(function (x) { return x.id === 'q' + n; })) n += 1;
      q.id = 'q' + n;
      c.quiz.push(q);          // ★ 맨 뒤에만. 앞 문항의 자리를 건드리지 않는다
    });

    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      return false;
    }
    return true;
  }

  function startEditing(course) {
    editingCourseId = course.id;
    $('edit-who').textContent = '"' + course.title + '" 의 문항을 고치는 중입니다.';
    $('edit-banner').hidden = false;
    render();
    $('edit-banner').scrollIntoView({ block: 'center' });
  }

  function stopEditing() {
    editingCourseId = null;
    $('edit-banner').hidden = true;
    render();
  }

  /* 문항을 내린다 — 배열에서 빼지 않고 표시만 한다.
     빼 버리면 이미 그 문항을 푼 기록이 가리킬 곳을 잃는다. */
  function retireQuestion(courseId, qid, on) {
    Store.courses.update(function (list) {
      var c = Store.findBy(list, 'id', courseId);
      if (!c) return;
      var q = Store.findBy(c.quiz || [], 'id', qid);
      if (q) q.retired = !!on;
    });
    render();
    UI.toast(on
      ? '문항을 내렸습니다. 앞으로 이 문항은 나오지 않습니다. 지난 기록은 그대로입니다.'
      : '문항을 다시 올렸습니다.');
  }


  function newDraft() {
    return { title: '', equipmentId: '', languages: [], phraseIds: [], quiz: [], dueAt: '' };
  }

  /* -----------------------------------------------------------------
     읽기
     ----------------------------------------------------------------- */

  function setup() { return Store.setup.load(); }

  /* ★ 검수를 지난 문구만. 여기가 규칙이 코드가 되는 지점이다.

     판정은 언어별이다 (Store.phraseOk). 사업장에 등록한 언어 중 하나라도
     쓸 수 있으면 고를 수 있게 둔다 — 인도네시아어 번역만 중지된 문구를
     선택지에서 아예 빼면 크메르어 노동자도 그 안전 지시를 못 받는다.
     어느 언어에서 빠지는지는 renderPhraseWarn 이 화면에 적는다. */
  function usablePhrases() {
    var langs = setup().languages;
    return Store.library.load().filter(function (p) {
      if (!langs.length) return Store.phraseOk(p, 'ko');
      return langs.some(function (code) { return Store.phraseOk(p, code); });
    });
  }

  function equipmentOf(id) { return Store.findBy(setup().equipments, 'id', id); }

  function langName(code) {
    var l = Store.language(code);
    return l ? l.name : code;
  }

  function phraseOf(id) { return Store.findBy(Store.library.load(), 'id', id); }

  /* 이 교육을 볼 수 있는 노동자 수 — 설비가 속한 공정의 노동자 */
  function audienceOf(course) {
    var state = setup();
    var eq = Store.findBy(state.equipments, 'id', course.equipmentId);
    if (!eq) return 0;
    return state.workers.filter(function (w) { return w.processId === eq.processId; }).length;
  }

  /* -----------------------------------------------------------------
     1단계 — 설비와 언어
     ----------------------------------------------------------------- */

  function buildLangPicker() {
    var box = $('pick-lang');
    box.textContent = '';
    var registered = setup().languages;

    if (!registered.length) {
      box.appendChild(UI.el('p', 'empty', '등록된 언어가 없습니다. 사업장 등록에서 먼저 골라 주세요.'));
      return;
    }
    registered.forEach(function (code) {
      var lang = Store.language(code);
      box.appendChild(UI.chip({
        type: 'checkbox', name: 'lang', value: code,
        label: lang ? lang.name : code, sub: lang ? lang.native : '',
        checked: draft.languages.indexOf(code) !== -1
      }));
    });
  }

  /* -----------------------------------------------------------------
     2단계 — 안전 문구
     ----------------------------------------------------------------- */

  function buildPhrasePicker() {
    var box = $('pick-phrase');
    box.textContent = '';

    var all = Store.library.load();
    var usable = usablePhrases();
    var excluded = all.length - usable.length;

    $('phrase-note').textContent = excluded
      ? '검수 완료 ' + usable.length + '개만 보입니다. 검수 대기·사용 중지 ' + excluded + '개는 고를 수 없습니다.'
      : '검수 완료 ' + usable.length + '개';

    if (!usable.length) {
      box.appendChild(UI.el('p', 'empty',
        '검수를 지난 문구가 없습니다. 운영자가 안전 문구 라이브러리(기능9)에서 검수를 마쳐야 합니다.'));
      return;
    }

    usable.forEach(function (p) {
      box.appendChild(UI.chip({
        type: 'checkbox', name: 'phrase', value: p.id,
        label: p.ko, sub: p.category || '',
        checked: draft.phraseIds.indexOf(p.id) !== -1
      }));
    });
  }

  /* 고른 언어에 번역이 없는 문구를 알린다.
     막지는 않는다 — 안전 지시를 아예 빼는 것보다 한국어로라도 보이는 편이 낫다.
     대신 무엇이 빠졌는지는 화면에 남는다. */
  function renderPhraseWarn() {
    var box = $('phrase-warn');
    box.textContent = '';
    if (!draft.languages.length || !draft.phraseIds.length) return;


    var missing = [];
    var blocked = [];      // 그 언어에서 검수를 지나지 못한 조합 — 아예 안 나간다

    draft.phraseIds.forEach(function (id) {
      var p = phraseOf(id);
      if (!p) return;
      draft.languages.forEach(function (code) {
        var t = p.translations && p.translations[code];
        if (!t || !t.text) { missing.push(langName(code) + ' — ' + p.ko); return; }
        // 번역은 있는데 그 언어의 판정이 검수 완료가 아니면 그 언어에서는 빠진다
        if (!Store.phraseOk(p, code)) blocked.push(langName(code) + ' — ' + p.ko);
      });
    });

    function warnBox(title, lines, tail) {
      var warn = UI.el('div', 'warnbox');
      warn.appendChild(UI.el('strong', null, title));
      var list = UI.el('ul');
      lines.slice(0, 6).forEach(function (line) { list.appendChild(UI.el('li', null, line)); });
      if (lines.length > 6) list.appendChild(UI.el('li', null, '그 밖에 ' + (lines.length - 6) + '건'));
      warn.appendChild(list);
      warn.appendChild(UI.el('p', null, tail));
      box.appendChild(warn);
    }

    /* ★ 번역이 없는 것과 그 언어에서 중지된 것은 다른 일이다.
         번역이 없으면 한국어로라도 보이고, 중지됐으면 아예 안 나간다.
         같은 상자에 넣으면 담당자가 둘을 구분하지 못한다. */
    if (blocked.length) {
      warnBox('그 언어에서 나가지 않는 조합 ' + blocked.length + '건', blocked,
        '그 언어의 번역이 검수를 지나지 못했습니다. 그 언어 노동자에게는 이 문구가 ' +
        '아예 보이지 않습니다. 다른 언어 노동자는 그대로 받습니다.');
    }

    if (missing.length) {
      warnBox('번역이 없는 조합 ' + missing.length + '건', missing,
        '이대로 발급하면 그 언어 노동자는 이 문구를 한국어로 보게 됩니다. ' +
        '운영자에게 번역 요청을 해 두세요.');
    }
  }

  /* -----------------------------------------------------------------
     3단계 — 문항 만들기
     ----------------------------------------------------------------- */

  var pickedZone = null;     // hotspot 에서 고른 구역

  function buildTypePicker() {
    var box = $('pick-qtype');
    box.textContent = '';
    QTYPES.forEach(function (t, i) {
      box.appendChild(UI.chip({
        type: 'radio', name: 'qtype', value: t.code,
        icon: t.icon, label: t.label, checked: i === 0
      }));
    });
  }

  function buildChoiceInputs() {
    var box = $('q-ch-options');
    box.textContent = '';
    for (var i = 0; i < 3; i++) {
      var wrap = UI.el('div', 'opt-row');

      var head = UI.el('div', 'opt-head');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'q-ch-answer';
      radio.value = String(i);
      radio.id = 'q-ch-answer-' + i;
      if (i === 0) radio.checked = true;
      head.appendChild(radio);
      var lab = UI.el('label', null, (i + 1) + '번이 정답');
      lab.setAttribute('for', 'q-ch-answer-' + i);
      head.appendChild(lab);
      wrap.appendChild(head);

      var opt = document.createElement('input');
      opt.type = 'text';
      opt.id = 'q-ch-opt-' + i;
      opt.placeholder = (i + 1) + '번 선택지';
      wrap.appendChild(opt);

      var res = document.createElement('input');
      res.type = 'text';
      res.id = 'q-ch-res-' + i;
      res.placeholder = '이 선택을 하면 무슨 일이 생기는지 (선택)';
      wrap.appendChild(res);

      box.appendChild(wrap);
    }
  }

  function addPairRow() {
    var box = $('q-ma-pairs');
    var n = box.children.length;
    var row = UI.el('div', 'pair-row');

    var a = document.createElement('input');
    a.type = 'text';
    a.className = 'pair-a';
    a.placeholder = '작업 (예: 프레스 작업)';
    row.appendChild(a);

    var arrow = UI.el('span', 'pair-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    row.appendChild(arrow);

    var b = document.createElement('input');
    b.type = 'text';
    b.className = 'pair-b';
    b.placeholder = '보호구 (예: 안전장갑)';
    row.appendChild(b);

    if (n >= 2) {
      var del = UI.el('button', 'btn-sm danger', '삭제');
      del.type = 'button';
      del.addEventListener('click', function () { box.removeChild(row); });
      row.appendChild(del);
    }

    box.appendChild(row);
  }

  function renderHotspotFigure() {
    var box = $('q-hot-figure');
    box.textContent = '';
    pickedZone = null;
    $('q-hot-picked').textContent = '아직 고르지 않았습니다.';

    var eq = equipmentOf(draft.equipmentId);
    var name = Diagrams.nameFor(eq);
    box.appendChild(Diagrams.svg(name));

    var zones = Diagrams.zones(name);
    if (!zones.length) {
      $('q-hot-picked').textContent =
        '이 설비는 도해에 이름 붙은 구역이 없습니다. 다른 문항 유형을 쓰시거나 P1 에게 도해 추가를 요청해 주세요.';
      return;
    }

    zones.forEach(function (z) {
      var btn = UI.el('button', 'zone');
      btn.type = 'button';
      btn.setAttribute('aria-label', z.label);
      btn.style.left = z.x + '%';
      btn.style.top = z.y + '%';
      btn.style.width = z.w + '%';
      btn.style.height = z.h + '%';
      btn.addEventListener('click', function () {
        pickedZone = z;
        UI.$$('.zone', box).forEach(function (other) { other.removeAttribute('data-mark'); });
        btn.setAttribute('data-mark', 'ok');
        $('q-hot-picked').textContent = '정답 구역 — ' + z.label;
      });
      box.appendChild(btn);
    });
  }

  function currentType() { return UI.pickedValue('qtype') || 'hotspot'; }

  function showTypeForm() {
    var type = currentType();
    /* 번역 칸은 유형마다 다르다 — choice 만 선택지 번역이 붙는다.
       유형을 바꾸면 다시 그린다. */
    buildI18nInputs();
    $('q-hotspot').hidden = type !== 'hotspot';
    $('q-choice').hidden = type !== 'choice';
    $('q-match').hidden = type !== 'match';
    if (type === 'hotspot') renderHotspotFigure();
  }

  /* -----------------------------------------------------------------
     3단계 곁 — 문항 번역

     문항이 한국어로만 나가면 기능4 는 기존 필기시험이 된다.
     안전 문구는 운영자 검수를 거치는데 문항 문구는 그 통로가 없으므로,
     여기서 할 수 있는 것은 역번역 대조다 (assets/review.js).

     ★ 부정이 뒤집힌 것만 크게 알린다. 낱말 차이와 같은 세기로 표시하면
       담당자가 표시를 무시하게 되고, 정작 뜻이 뒤집힌 것이 지나간다.
       기능9 가 같은 판정을 쓴다.

     ★ 선택지 번역은 개수가 한국어와 같아야 저장한다. answer 는 인덱스라서
       한 칸이라도 어긋나면 정답이 다른 선택지를 가리킨다. 노동자 화면의
       Store.qtext 가 되돌려 주기는 하지만, 담당자가 번역을 넣었는데 조용히
       한국어로 나가는 것이 더 나쁘다. 그래서 여기서 막는다.
     ----------------------------------------------------------------- */

  function i18nLangs() {
    return draft.languages.filter(function (code) { return code !== 'ko'; });
  }

  function iid(code, name) { return 'q-i18n-' + code + '-' + name; }

  function textInput(id, placeholder) {
    var el = document.createElement('input');
    el.type = 'text';
    el.id = id;
    el.placeholder = placeholder;
    return el;
  }

  /* 역번역을 원문과 견줘 본 결과를 그 언어 칸 아래에 적는다 */
  function renderBackCheck(code) {
    var box = $(iid(code, 'warn'));
    if (!box) return;
    box.textContent = '';

    var ko = $('q-' + shortType() + '-prompt');
    var koText = ko ? ko.value.trim() : '';
    var back = $(iid(code, 'back'));
    var backText = back ? back.value.trim() : '';
    if (!koText || !backText) return;

    if (Review.negationFlipped(koText, backText)) {
      var warn = UI.el('div', 'warnbox');
      var wt = UI.el('strong', null);
    wt.appendChild(UI.iconBox('alert', null));
    wt.appendChild(document.createTextNode(' 뜻이 뒤집혔을 수 있습니다'));
    warn.appendChild(wt);
      warn.appendChild(UI.el('p', null,
        '한쪽에만 "않 · 마십시오 · 금지" 같은 부정 표현이 있습니다. ' +
        '"손을 넣지 마십시오" 가 "손을 넣어도 됩니다" 로 바뀌면 정반대 지시가 됩니다. ' +
        '번역을 다시 확인해 주세요.'));
      box.appendChild(warn);
      return;
    }

    var n = Review.newWordCount(koText, backText);
    box.appendChild(UI.el('p', 'muted',
      n ? '원문에 없던 낱말 ' + n + '개. 뜻이 같으면 그대로 두셔도 됩니다.'
        : '역번역이 원문과 같은 낱말로 돌아왔습니다.'));
  }

  function shortType() {
    var t = currentType();
    return t === 'hotspot' ? 'hot' : (t === 'choice' ? 'ch' : 'ma');
  }

  function buildI18nInputs() {
    var box = $('q-i18n');

    /* 이미 적어 둔 값을 기억해 두고 다시 채운다.
       화면 어디를 눌러도 render() 가 돌 수 있는데, 그때마다 타이핑이
       사라지면 담당자는 번역을 넣기를 포기한다. */
    var kept = {};
    UI.$$('input', box).forEach(function (el) {
      if (el.id && el.value) kept[el.id] = el.value;
    });

    box.textContent = '';

    var langs = i18nLangs();
    if (!langs.length) {
      box.appendChild(UI.el('p', 'muted',
        '1단계에서 언어를 고르면 여기에 문항 번역 칸이 생깁니다.'));
      return;
    }

    box.appendChild(UI.el('h3', 'sub', '문항 번역'));
    box.appendChild(UI.el('p', 'muted',
      '비워 두면 그 언어 노동자는 한국어 문항과 "번역 준비 중" 배지를 봅니다. ' +
      '역번역을 함께 적으면 뜻이 뒤집혔는지 대조해 드립니다.'));

    var isChoice = currentType() === 'choice';

    langs.forEach(function (code) {
      var wrap = UI.el('div', 'i18n-box');
      wrap.appendChild(UI.el('h4', null, langName(code)));

      var f1 = UI.el('div', 'field');
      var l1 = UI.el('label', null, '문항 (' + langName(code) + ')');
      l1.setAttribute('for', iid(code, 'prompt'));
      f1.appendChild(l1);
      f1.appendChild(textInput(iid(code, 'prompt'), langName(code) + '로 쓴 문항'));
      wrap.appendChild(f1);

      if (isChoice) {
        for (var i = 0; i < 3; i++) {
          wrap.appendChild(textInput(iid(code, 'opt-' + i), (i + 1) + '번 선택지 번역'));
        }
        wrap.appendChild(UI.el('p', 'muted',
          '선택지는 채운 개수가 한국어와 같아야 저장됩니다. ' +
          '정답은 번호로 정해지므로 한 칸이 비면 정답이 어긋납니다.'));
      }

      var f2 = UI.el('div', 'field');
      var l2 = UI.el('label', null, '역번역 — 위 번역을 다시 한국어로 (선택)');
      l2.setAttribute('for', iid(code, 'back'));
      f2.appendChild(l2);
      var back = textInput(iid(code, 'back'), '예) 프레스가 멈추면 무엇을 합니까');
      back.addEventListener('input', function () { renderBackCheck(code); });
      f2.appendChild(back);
      wrap.appendChild(f2);

      wrap.appendChild(UI.el('div', 'i18n-warn', ''));
      wrap.lastChild.id = iid(code, 'warn');

      box.appendChild(wrap);
    });

    // 기억해 둔 값을 되돌린다
    UI.$$('input', box).forEach(function (el) {
      if (kept[el.id]) el.value = kept[el.id];
    });
  }

  /* 폼에 적힌 번역을 모은다.
     kept 는 choice 에서 실제로 저장되는 한국어 선택지의 줄 번호다.
     같은 줄의 번역만 가져와야 정답 인덱스가 어긋나지 않는다. */
  function collectI18n(type, kept) {
    var out = {};
    var blocked = [];

    i18nLangs().forEach(function (code) {
      var el = $(iid(code, 'prompt'));
      var prompt = el ? el.value.trim() : '';
      if (!prompt) return;              // 번역 없음 — 노동자 화면이 배지를 띄운다

      var pack = { prompt: prompt };

      if (type === 'choice' && kept) {
        var opts = [];
        var filled = 0;
        kept.forEach(function (row) {
          var o = $(iid(code, 'opt-' + row));
          var v = o ? o.value.trim() : '';
          if (v) filled++;
          opts.push(v);
        });
        if (filled && filled !== kept.length) {
          blocked.push(langName(code));
        } else if (filled === kept.length) {
          pack.options = opts;
        }
      }

      var b = $(iid(code, 'back'));
      var back = b ? b.value.trim() : '';
      if (back) pack.back = { prompt: back };

      out[code] = pack;
    });

    return { i18n: out, blocked: blocked };
  }

  function clearI18nInputs() {
    i18nLangs().forEach(function (code) {
      ['prompt', 'back', 'opt-0', 'opt-1', 'opt-2'].forEach(function (name) {
        var el = $(iid(code, name));
        if (el) el.value = '';
      });
      var warn = $(iid(code, 'warn'));
      if (warn) warn.textContent = '';
    });
  }

  function addQuestion() {
    var type = currentType();

    if (type === 'hotspot') {
      var hp = $('q-hot-prompt').value.trim();
      if (!hp) { UI.toast('문항을 적어 주세요.'); $('q-hot-prompt').focus(); return; }
      if (!pickedZone) { UI.toast('그림에서 정답이 될 위험 구역을 골라 주세요.'); return; }

      var hi = collectI18n('hotspot', null);

      if (!pushQuestion({
        type: 'hotspot',
        prompt: hp,
        answer: Diagrams.answerFor(pickedZone),
        i18n: hi.i18n
      })) return;
      $('q-hot-prompt').value = '';
      clearI18nInputs();

    } else if (type === 'choice') {
      var cp = $('q-ch-prompt').value.trim();
      if (!cp) { UI.toast('문항을 적어 주세요.'); $('q-ch-prompt').focus(); return; }

      var options = [];
      var results = [];
      var kept = [];        // 실제로 저장되는 선택지의 줄 번호 — 번역도 같은 줄에서 가져온다
      for (var i = 0; i < 3; i++) {
        var v = $('q-ch-opt-' + i).value.trim();
        if (v) { options.push(v); results.push($('q-ch-res-' + i).value.trim()); kept.push(i); }
      }
      if (options.length < 2) { UI.toast('선택지를 두 개 이상 적어 주세요.'); return; }

      var answer = Number(UI.pickedValue('q-ch-answer') || '0');
      if (answer >= options.length) { UI.toast('정답으로 고른 번호의 선택지가 비어 있습니다.'); return; }

      /* ★ 선택지 번역을 넣다 말면 저장하지 않는다.
           정답은 번호로 정해지므로 한 칸이 비면 다른 선택지를 가리킨다. */
      var ci = collectI18n('choice', kept);
      if (ci.blocked.length) {
        UI.toast(ci.blocked.join(' · ') + ' 선택지 번역이 덜 채워졌습니다. ' +
          '한국어와 같은 개수로 채우거나 모두 비워 주세요.');
        return;
      }

      if (!pushQuestion({
        type: 'choice',
        prompt: cp,
        options: options,
        answer: answer,
        results: results,
        i18n: ci.i18n
      })) return;
      $('q-ch-prompt').value = '';
      for (var k = 0; k < 3; k++) { $('q-ch-opt-' + k).value = ''; $('q-ch-res-' + k).value = ''; }
      clearI18nInputs();

    } else {
      var mp = $('q-ma-prompt').value.trim();
      if (!mp) { UI.toast('문항을 적어 주세요.'); $('q-ma-prompt').focus(); return; }

      var pairs = [];
      UI.$$('#q-ma-pairs .pair-row').forEach(function (row) {
        var a = row.querySelector('.pair-a').value.trim();
        var b = row.querySelector('.pair-b').value.trim();
        if (a && b) pairs.push([a, b]);
      });
      if (pairs.length < 3) { UI.toast('짝을 세 개 이상 채워 주세요.'); return; }

      var mi = collectI18n('match', null);

      if (!pushQuestion({
        type: 'match',
        prompt: mp,
        pairs: pairs,
        i18n: mi.i18n
      })) return;
      $('q-ma-prompt').value = '';
      clearI18nInputs();
      $('q-ma-pairs').textContent = '';
      addPairRow();
      addPairRow();
      addPairRow();           // 최소 세 쌍 (H4, FR-WK-03-15)
    }

    UI.toast(editingCourseId
      ? '문항을 맨 뒤에 더했습니다. 지금부터 이 교육을 푸는 사람에게 나옵니다.'
      : '문항을 추가했습니다.');
    render();
  }

  function renderQuizList() {
    var list = $('quiz-list');
    list.textContent = '';

    var course = editingCourse();
    var quiz = targetQuiz();

    if (!quiz.length) {
      list.appendChild(UI.emptyRow('아직 문항이 없습니다. 아래에서 하나 만들어 주세요.'));
      return;
    }

    /* 발급된 교육이면 "이미 푼 사람이 있는가" 를 한 번만 본다 */
    var locked = course ? hasAnswers(course.id) : false;

    quiz.forEach(function (q, i) {
      var type = Store.findBy(QTYPES, 'code', q.type) || { icon: '?', label: q.type };
      var li = UI.itemRow(type.icon, q.prompt, (i + 1) + '번 · ' + type.label);

      var row = UI.el('div', 'btn-row');

      /* --- 초안: 그냥 지운다. 아직 아무도 못 봤다 --- */
      if (!course) {
        var del = UI.el('button', 'btn-sm danger', '삭제');
        del.type = 'button';
        del.addEventListener('click', function () {
          draft.quiz.splice(i, 1);
          // 번호를 다시 매긴다. 지운 뒤 q1, q3 이 남으면 채점 기록이 헷갈린다
          draft.quiz.forEach(function (x, k) { x.id = 'q' + (k + 1); });
          render();
        });
        row.appendChild(del);
        li.appendChild(row);
        list.appendChild(li);
        return;
      }

      /* --- 발급된 교육 --- */
      if (q.retired) li.appendChild(UI.stopBadge('내려짐 · 앞으로 안 나옴'));

      var toggle = UI.el('button', 'btn-sm', q.retired ? '다시 올리기' : '내리기');
      toggle.type = 'button';
      toggle.addEventListener('click', function () {
        retireQuestion(course.id, q.id, !q.retired);
      });
      row.appendChild(toggle);

      if (locked) {
        /* ★ 왜 못 지우는지 화면에 적는다.
             버튼만 조용히 없으면 사람은 그것을 고장으로 읽는다 (C3 에서 배운 것). */
        li.appendChild(UI.el('p', 'why',
          '이미 이 교육을 푼 사람이 있어 문항을 지울 수 없습니다. ' +
          '지우면 그 사람의 답이 어느 문항의 것인지 알 수 없게 됩니다. ' +
          '고쳐야 하면 이 문항을 내리고 새 문항을 붙여 주세요.'));
      } else {
        var hardDel = UI.el('button', 'btn-sm danger', '삭제');
        hardDel.type = 'button';
        hardDel.addEventListener('click', function () {
          if (!window.confirm('"' + q.prompt + '" 문항을 지울까요?\n\n' +
            '아직 이 교육을 푼 사람이 없어서 지울 수 있습니다.')) return;
          Store.courses.update(function (all) {
            var c = Store.findBy(all, 'id', course.id);
            if (!c) return;
            var at = (c.quiz || []).indexOf(Store.findBy(c.quiz || [], 'id', q.id));
            if (at !== -1) c.quiz.splice(at, 1);
          });
          render();
          UI.toast('문항을 지웠습니다.');
        });
        row.appendChild(hardDel);
      }

      li.appendChild(row);
      list.appendChild(li);
    });
  }

  /* -----------------------------------------------------------------
     4단계 — 확인하고 발급
     ----------------------------------------------------------------- */

  function draftSteps() {
    var eq = equipmentOf(draft.equipmentId);
    return [
      { what: '1. 설비와 제목', done: !!(draft.equipmentId && draft.title),
        note: eq ? eq.name : '설비 미선택' },
      { what: '1. 언어', done: draft.languages.length > 0,
        note: draft.languages.length ? draft.languages.map(langName).join(' · ') : '미선택' },
      { what: '2. 안전 문구', done: draft.phraseIds.length > 0,
        note: draft.phraseIds.length + '개' },
      { what: '3. 이해도 검증 문항', done: draft.quiz.length > 0,
        note: draft.quiz.length + '문항' }
    ];
  }

  function renderCheck() {
    var list = $('draft-check');
    list.textContent = '';
    draftSteps().forEach(function (s) {
      var li = UI.el('li');
      li.setAttribute('data-done', s.done ? 'yes' : 'no');
      li.appendChild(UI.el('span', 'what', s.what));
      li.appendChild(s.done ? UI.okBadge(s.note) : UI.neutralBadge(s.note));
      list.appendChild(li);
    });

    var ready = draftSteps().every(function (s) { return s.done; });
    $('btn-approve').disabled = !ready;
  }

  function approve() {
    if (!draftSteps().every(function (s) { return s.done; })) {
      UI.toast('아직 채우지 않은 단계가 있습니다.');
      return;
    }

    var course = {
      id: Store.uid(),
      title: draft.title,
      equipmentId: draft.equipmentId,
      languages: draft.languages.slice(),
      phraseIds: draft.phraseIds.slice(),
      quiz: draft.quiz.slice(),
      dueAt: draft.dueAt || '',      // 비어 있어도 넣는다. 기능6 이 "미정" 으로 읽는다
      approved: true,
      createdAt: new Date().toISOString()
    };

    var result = Store.courses.update(function (list) { list.push(course); });
    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      return;
    }

    var count = audienceOf(course);
    UI.toast('발급했습니다. 노동자 ' + count + '명의 수강 화면에 나타납니다.');

    draft = newDraft();
    resetForms();
    render();
  }

  /* -----------------------------------------------------------------
     발급한 교육 목록
     ----------------------------------------------------------------- */

  function renderCourses() {
    var body = $('course-rows');
    body.textContent = '';

    var list = Store.courses.load();
    if (!list.length) {
      var tr = UI.el('tr');
      var cell = UI.el('td');
      cell.colSpan = 8;
      cell.appendChild(UI.el('p', 'empty', '아직 발급한 교육이 없습니다.'));
      tr.appendChild(cell);
      body.appendChild(tr);
      return;
    }

    list.forEach(function (c) {
      var eq = equipmentOf(c.equipmentId);
      var tr = UI.el('tr');

      tr.appendChild(UI.el('td', null, c.title));
      var td = UI.el('td', null);
      if (eq) {
        td.appendChild(UI.iconBox(eq.icon, 'ico'));
        td.appendChild(document.createTextNode(' ' + eq.name));
      } else {
        td.textContent = '삭제된 설비';
      }
      tr.appendChild(td);

      var langCell = UI.el('td');
      var chips = UI.el('div', 'chips');
      (c.languages || []).forEach(function (code) {
        chips.appendChild(UI.el('span', 'badge badge-neutral', langName(code)));
      });
      langCell.appendChild(chips);
      tr.appendChild(langCell);

      /* 검수 상태가 바뀌어 지금 쓸 수 있는 문구가 줄었을 수 있다. 그것도 보여 준다.

         판정이 언어별이라 세 갈래다 —
           전체 언어에서 나간다 · 일부 언어에서만 빠졌다 · 어느 언어에도 안 나간다.
         가운데를 "중지됨" 으로 뭉치면 담당자는 교육 전체가 멈춘 줄 안다. */
      var ids = c.phraseIds || [];
      var courseLangs = (c.languages || []).length ? c.languages : ['ko'];

      var live = 0;      // 모든 언어에서 나가는 문구
      var partial = 0;   // 일부 언어에서만 빠진 문구
      ids.forEach(function (id) {
        var p = phraseOf(id);
        var okCount = courseLangs.filter(function (code) {
          return Store.phraseOk(p, code);
        }).length;
        if (okCount === courseLangs.length) live++;
        else if (okCount > 0) partial++;
      });
      var countCell = UI.el('td');
      countCell.appendChild(document.createTextNode('문구 ' + live + ' / ' + ids.length));
      countCell.appendChild(UI.el('span', 'sub', '문항 ' + ((c.quiz || []).length) + '개'));
      tr.appendChild(countCell);

      tr.appendChild(UI.el('td', 'num', audienceOf(c) + '명'));

      /* 대시보드와 같은 UI.dueBadge 를 쓴다. 발급한 자리에서 바로 보여야
         담당자가 대시보드까지 가서야 기한이 빈 것을 알게 되지 않는다. */
      var dueCell = UI.el('td');
      dueCell.appendChild(UI.dueBadge(c.dueAt));
      tr.appendChild(dueCell);

      var statusCell = UI.el('td');
      if (!(c.quiz || []).length) statusCell.appendChild(UI.stopBadge('문항 없음'));
      else if (live + partial < ids.length) {
        statusCell.appendChild(UI.waitBadge('문구 ' + (ids.length - live - partial) + '개 중지됨'));
      } else if (partial) {
        statusCell.appendChild(UI.waitBadge('문구 ' + partial + '개 일부 언어 중지'));
      }
      else if (c.approved) statusCell.appendChild(UI.okBadge('발급됨'));
      else statusCell.appendChild(UI.neutralBadge('미승인'));
      tr.appendChild(statusCell);

      var actCell = UI.el('td');
      var row = UI.el('div', 'btn-row');

      var link = UI.el('button', 'btn-sm', '접속 주소');
      link.type = 'button';
      link.addEventListener('click', function () { showLink(c); });
      row.appendChild(link);

      /* 발급한 뒤에도 문항을 손볼 수 있다 (C6).
         할 수 있는 것과 없는 것은 3단계 카드의 안내에 적혀 있다. */
      var edit = UI.el('button', 'btn-sm', '문항 고치기');
      edit.type = 'button';
      edit.addEventListener('click', function () { startEditing(c); });
      row.appendChild(edit);

      var del = UI.el('button', 'btn-sm danger', '삭제');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm('"' + c.title + '" 교육을 삭제할까요?\n\n' +
          '노동자의 수강 화면에서 사라집니다. 이미 남은 수강 기록은 지워지지 않습니다.')) return;
        Store.courses.update(function (all) {
          var i = all.findIndex ? all.findIndex(function (x) { return x.id === c.id; }) : -1;
          if (i === -1) { for (var k = 0; k < all.length; k++) if (all[k].id === c.id) { i = k; break; } }
          if (i !== -1) all.splice(i, 1);
        });
        render();
        UI.toast('교육을 삭제했습니다.');
      });
      row.appendChild(del);

      actCell.appendChild(row);
      tr.appendChild(actCell);

      body.appendChild(tr);
    });
  }

  /* -----------------------------------------------------------------
     설비 앞에 붙일 QR (D1)

     ★ QR 은 절대 주소여야 한다. 노동자 폰에서 열리는 주소가 아니면
       찍어도 아무 데도 못 간다.
       - 배포 주소로 열었으면 그 주소를 그대로 쓴다
       - file:// 로 열었으면 그 경로는 이 PC 안에만 있으므로 배포 주소를 쓴다.
         그리고 지금 무엇을 쓰고 있는지 화면에 적는다

     ★ 주소를 글자로도 계속 보여 준다. QR 이 안 찍히는 상황은 반드시 있다
       (카메라 없는 기기 · 인쇄 품질 · 어두운 현장).
     ----------------------------------------------------------------- */

  /* 배포 주소. file:// 로 열었을 때 QR 이 가리킬 곳이다.
     ★ 배포 주소가 바뀌면 여기도 바꾼다 (docs/08-overview.md 6부와 같은 값). */
  var DEPLOY_ORIGIN = 'https://2026-ax-ton.vercel.app';

  /* 이 앱의 뿌리 주소. 끝에 슬래시가 없다. */
  function appBase() {
    var web = location.protocol === 'http:' || location.protocol === 'https:';
    if (!web) return { url: DEPLOY_ORIGIN, live: false };

    // .../admin/content.html → .../
    var dir = location.pathname.replace(/\/admin\/[^/]*$/, '');
    return { url: location.origin + dir, live: true };
  }

  function courseUrl(course) {
    var base = appBase();
    return {
      url: base.url + '/worker/learn.html?course=' + encodeURIComponent(course.id),
      live: base.live
    };
  }

  function showLink(course) {
    var note = $('link-note');
    note.textContent = '';
    note.hidden = false;

    var target = courseUrl(course);

    var head = UI.el('p', 'link-head');
    head.appendChild(UI.el('strong', null, course.title));
    head.appendChild(document.createTextNode(' — 설비 앞에 붙일 QR'));
    note.appendChild(head);

    /* --- QR 그림 --- */
    var box = UI.el('div', 'qr-box');
    var img = QR.svg(target.url, { label: course.title + ' 교육으로 가는 QR 코드' });

    if (img) {
      box.appendChild(img);
    } else {
      /* ★ 못 만들면 못 만들었다고 적는다.
           스캔 안 되는 그림을 그려 두는 것이 아무것도 안 그리는 것보다 나쁘다. */
      box.appendChild(UI.el('p', 'empty',
        '주소가 너무 길어 QR 로 만들지 못했습니다 (' + target.url.length + '자). ' +
        '아래 주소를 그대로 쓰시거나 담당자에게 알려 주세요.'));
    }
    note.appendChild(box);

    /* --- 주소를 글자로도. QR 이 안 찍히는 상황은 반드시 있다 --- */
    var addr = UI.el('p', 'link-url');
    addr.appendChild(document.createTextNode('주소 — '));
    addr.appendChild(UI.el('code', null, target.url));
    note.appendChild(addr);

    note.appendChild(UI.el('p', 'why',
      '찍으면 이 교육이 바로 열립니다. 로그인이 안 돼 있으면 로그인한 뒤 ' +
      '이 교육으로 이어집니다 — 어느 설비를 찍었는지는 잃지 않습니다.'));

    if (!target.live) {
      /* file:// 로 열었으면 지금 보고 있는 화면과 QR 이 가리키는 곳이 다르다.
         그 사실을 적지 않으면 "내가 넣은 데이터가 왜 안 보이지" 가 된다. */
      note.appendChild(UI.el('p', 'why',
        '지금 이 화면은 파일로 열려 있어서 QR 은 배포 주소를 가리킵니다. ' +
        '배포 주소와 이 PC 의 저장 데이터는 서로 별개입니다.'));
    }
  }

  /* -----------------------------------------------------------------
     그리기
     ----------------------------------------------------------------- */

  function badge(node, done, doneText, todoText) {
    node.className = 'badge ' + (done ? 'badge-ok' : 'badge-neutral');
    node.textContent = '';
    var icon = UI.iconBox(done ? 'check' : 'circle', null);
    icon.setAttribute('aria-hidden', 'true');
    node.appendChild(icon);
    node.appendChild(document.createTextNode(' ' + (done ? doneText : todoText)));
  }

  function render() {
    var state = setup();
    var ready = state.equipments.length > 0 && state.languages.length > 0;
    $('setup-lock').hidden = ready;
    $('builder').hidden = !ready;

    if (ready) {
      UI.fillSelect($('draft-equip'), state.equipments,
        function (e) { return e.id; },
      /* ★ <option> 안에는 그림을 넣을 수 없다. 이모지를 남기면 이 목록만
         옛 말투로 남으므로 이름만 쓴다 (그림은 고른 뒤 화면에서 보인다). */
        function (e) { return e.name; });
      if (!draft.equipmentId) draft.equipmentId = $('draft-equip').value;
      $('draft-equip').value = draft.equipmentId;

      buildLangPicker();
      buildPhrasePicker();
      renderPhraseWarn();
      renderQuizList();
      buildI18nInputs();     // 1단계에서 고른 언어가 바뀌면 번역 칸도 바뀐다
      renderCheck();

      badge($('b-step1'), !!(draft.equipmentId && draft.title && draft.languages.length),
        draft.languages.length + '개 언어', '미설정');
      badge($('b-step2'), draft.phraseIds.length > 0, draft.phraseIds.length + '개 문구', '미설정');

      var quiz = targetQuiz();
      badge($('b-step3'), quiz.length > 0, quiz.length + '문항', '미설정');

      applyEditMode();
    }

    renderCourses();
  }

  /* 발급된 교육을 고치는 중이면 초안의 단계들을 감춘다 (C6).
     ★ 남겨 두면 "지금 무엇을 만드는 중인지" 가 섞인다 —
       고치는 줄 알고 초안에 문항을 붙이거나, 그 반대가 된다. */
  function applyEditMode() {
    var editing = !!editingCourseId;

    ['t-step1', 't-step2', 't-step4'].forEach(function (id) {
      var head = $(id);
      var card = head && head.closest ? head.closest('.card') : null;
      if (card) card.hidden = editing;
    });

    /* 그 사이에 그 교육이 지워졌으면 조용히 빠져나온다.
       ★ 여기서 stopEditing() 을 부르면 render() 안에서 render() 를 불러
         무한히 돈다. 상태만 되돌리고 다음 그리기에 맡긴다. */
    if (editing && !editingCourse()) {
      editingCourseId = null;
      $('edit-banner').hidden = true;
      ['t-step1', 't-step2', 't-step4'].forEach(function (id) {
        var head = $(id);
        var card = head && head.closest ? head.closest('.card') : null;
        if (card) card.hidden = false;
      });
    }
  }

  function resetForms() {
    $('draft-title').value = '';
    $('draft-due').value = '';
    $('q-hot-prompt').value = '';
    $('q-ch-prompt').value = '';
    $('q-ma-prompt').value = '';
    buildChoiceInputs();
    $('q-ma-pairs').textContent = '';
    addPairRow();
    addPairRow();
    addPairRow();           // 최소 세 쌍 (H4, FR-WK-03-15)
    showTypeForm();
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('draft-equip').addEventListener('change', function () {
    draft.equipmentId = $('draft-equip').value;
    // 제목을 아직 손대지 않았으면 설비 이름으로 채워 준다
    var eq = equipmentOf(draft.equipmentId);
    if (eq && !$('draft-title').value.trim()) {
      $('draft-title').value = eq.name + ' 안전교육';
      draft.title = $('draft-title').value;
    }
    if (currentType() === 'hotspot') renderHotspotFigure();
    render();
  });

  $('draft-title').addEventListener('input', function () {
    draft.title = $('draft-title').value.trim();
    renderCheck();
  });

  /* 기한은 발급 조건이 아니다. 넣지 않아도 발급되고 "미정" 으로 남는다 —
     기한이 없다고 교육 자체를 막으면 급한 교육을 못 내보낸다. */
  function readDue() { draft.dueAt = $('draft-due').value; }
  $('draft-due').addEventListener('change', readDue);
  $('draft-due').addEventListener('input', readDue);

  $('pick-lang').addEventListener('change', function () {
    draft.languages = UI.checkedValues('lang');
    buildI18nInputs();          // 고른 언어마다 번역 칸이 하나씩
    renderPhraseWarn();
    renderCheck();
    badge($('b-step1'), !!(draft.equipmentId && draft.title && draft.languages.length),
      draft.languages.length + '개 언어', '미설정');
  });

  $('pick-phrase').addEventListener('change', function () {
    draft.phraseIds = UI.checkedValues('phrase');
    renderPhraseWarn();
    renderCheck();
    badge($('b-step2'), draft.phraseIds.length > 0, draft.phraseIds.length + '개 문구', '미설정');
  });

  $('pick-qtype').addEventListener('change', showTypeForm);
  $('q-ma-add').addEventListener('click', addPairRow);
  $('btn-add-q').addEventListener('click', addQuestion);
  $('btn-edit-done').addEventListener('click', stopEditing);
  $('btn-approve').addEventListener('click', approve);

  $('btn-reset-draft').addEventListener('click', function () {
    if (!window.confirm('만들던 초안을 비웁니다. 계속할까요?')) return;
    draft = newDraft();
    resetForms();
    render();
    UI.toast('초안을 비웠습니다.');
  });

  // 운영자가 다른 탭에서 문구 검수를 바꾸면 선택지도 따라간다
  window.addEventListener('storage', function (e) {
    if (e.key === Store.library.KEY || e.key === Store.setup.KEY || e.key === Store.courses.KEY) render();
  });

  buildTypePicker();
  resetForms();
  render();
})();
