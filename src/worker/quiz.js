/* ===================================================================
   quiz.js — 기능4 이해도 검증

   담당: P1
   기능번호: 기능4
   읽는 키: courses, setup, progress
   쓰는 키: progress
   근거: SCREEN 기능4 · PRD §4.2

   ★ 이 화면이 제품의 심장이다.
     교육 완료의 기준을 출석부 서명에서 "이해했는가"로 옮기는 곳이다.
     통과하지 못하면 progress 에 passed:false 로 남고 교육 완료로 기록되지 않는다.

   문항 세 유형 —
     hotspot  설비 도해에서 위험 지점을 짚는다   answer { x, y, r } 퍼센트 좌표
              도해와 위험 구역은 assets/diagrams.js 에 있다 — 기능2 가 같은 것을 본다
     choice   올바른 작업을 고른다               options [] · answer 인덱스
     match    작업과 보호구를 연결한다           pairs [[작업, 보호구], ...]

   이 파일이 코드로 지키는 것 —

   · 한 문항에 한 번만 답한다. 그 자리에서 다시 풀 수 있으면 점수가 늘 100 이 되고
     담당자 대시보드의 "최초 통과율"이 뜻을 잃는다. 다시 풀기는 처음부터 한다.

   · 답한 직후 "지금 이대로 하면 무슨 일이 생기는지"를 말한다.
     맞고 틀림만 알려 주면 다음에 또 같은 선택을 한다.

   · 미통과 화면에 "노동자의 실패가 아니라 교육의 실패" 를 적는다.
     이 문장이 빠지면 이 기능은 노동자를 걸러 내는 시험이 된다.

   · 문항은 음성으로 읽어 준다. 글자를 한 자도 읽지 않고 끝낼 수 있어야 한다.

   · 문항을 노동자의 언어로 읽는다. courses.quiz[].i18n 에 있고 Store.qtext 로
     읽는다. 문항이 한국어로만 나오면 이 기능은 기존 필기시험이 된다.
     번역이 없으면 한국어를 띄우고 "내 언어 번역 준비 중" 배지를 남긴다 —
     조용히 숨기지 않는다.

   · ★ answer 는 options 의 인덱스다. 번역 배열의 길이가 한국어와 다르면
     정답이 엉뚱한 선택지를 가리킨다. 이 검사는 store.js 의 qtext 한 곳에만 있다.
     화면에서 q.i18n 을 직접 뒤지지 마세요.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillWorkerBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  /* 통과 기준. 안전 지시는 하나라도 놓치면 안 되므로 전 문항 정답이다.
     기준을 낮추면 "절반은 몰라도 교육 완료" 가 기록으로 남는다. */
  var PASS_SCORE = 100;

  var KIND = {
    hotspot: { ico: '👆', label: '위험 지점 짚기' },
    choice:  { ico: '☑',  label: '올바른 작업 고르기' },
    match:   { ico: '🔗', label: '보호구 연결하기' }
  };

  /* -----------------------------------------------------------------
     내가 누구인지 · 무엇을 검증하는지
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

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function myCourses() {
    var setup = Store.setup.load();
    return Store.courses.load().filter(function (c) {
      if (!c || !c.approved) return false;
      if (!me.processId) return true;
      var eq = Store.findBy(setup.equipments, 'id', c.equipmentId);
      return !!eq && eq.processId === me.processId;
    });
  }

  function progressOf(courseId) {
    return Store.findBy(
      Store.progress.load().filter(function (r) { return r.workerId === me.id; }),
      'courseId', courseId
    );
  }

  /* 실제로 낼 수 있는 문항만 남긴다. 모르는 유형은 조용히 통과시키지 않고 뺀다 —
     채점할 수 없는 문항을 정답으로 세면 이해하지 못한 사람이 통과한다. */
  function questionsOf(course) {
    return (Array.isArray(course.quiz) ? course.quiz : []).filter(function (q) {
      if (!q || !KIND[q.type]) return false;

      /* ★ 내린 문항은 앞으로 내지 않는다 (C6).
           배열에서 빼지 않고 표시만 한 것이라, 이미 그 문항을 푼 사람의
           기록은 그대로 남는다. 지워 버리면 옛 기록이 가리킬 곳을 잃는다. */
      if (q.retired) return false;

      if (q.type === 'hotspot') return !!(q.answer && typeof q.answer.x === 'number');
      if (q.type === 'choice') return Array.isArray(q.options) && q.options.length > 1
        && typeof q.answer === 'number';
      if (q.type === 'match') return Array.isArray(q.pairs) && q.pairs.length > 0;
      return false;
    });
  }

  /* -----------------------------------------------------------------
     화면 넘기기
     ----------------------------------------------------------------- */

  function show(which) {
    $('view-quiz').hidden = which !== 'quiz';
    $('view-result').hidden = which !== 'result';
    $('view-gate').hidden = which !== 'gate';
    window.scrollTo(0, 0);
  }

  function linkButton(label, href, primary) {
    var a = UI.el('a', 'btn ' + (primary ? 'btn-primary' : 'btn-quiet'), label);
    a.href = href;
    return a;
  }

  function gate(ico, title, why, actions) {
    UI.setIcon($('gate-ico'), ico);
    $('gate-title').textContent = title;
    $('gate-why').textContent = why;
    var box = $('gate-actions');
    box.textContent = '';
    actions.forEach(function (node) { box.appendChild(node); });
    show('gate');
  }

  /* -----------------------------------------------------------------
     문항 진행
     ----------------------------------------------------------------- */

  var run = null;   // { course, equipment, questions, index, answers, locked }

  function start(course) {
    var setup = Store.setup.load();
    run = {
      course: course,
      equipment: Store.findBy(setup.equipments, 'id', course.equipmentId),
      questions: questionsOf(course),
      index: 0,
      answers: [],
      locked: false
    };
    show('quiz');
    renderQuestion();
  }

  function renderVoiceNote() {
    var note = UI.voiceNote(me.lang);
    var box = $('voicenote');
    box.textContent = note;
    box.hidden = !note;
  }

  /* --- 문항을 내 언어로 읽는다 ---

     ★ q.i18n 을 여기서 직접 뒤지지 않는다. Store.qtext 를 거친다.
       answer 는 options 의 인덱스라서, 번역 배열의 길이가 한국어와 다르면
       정답이 엉뚱한 선택지를 가리킨다. 그 검사가 store.js 한 곳에 있다.

     번역이 없으면 한국어가 그대로 나오고, 화면에는 "내 언어 번역 준비 중"
     배지가 붙는다. 조용히 숨기지 않는다 — 안전 지시가 말없이 사라지는 쪽이
     더 위험하다는 기능3 의 판단과 같다. */

  function qt(q, field) {
    return Store.qtext(q, me.lang, field);
  }

  /* 내 언어로 읽어 주고, 기기에 그 언어 음성이 없으면 한국어로 돌린다.
     되돌린 사실은 UI.voiceNote() 가 화면에 적는다 (renderVoiceNote). */
  function say(text, koText) {
    return { text: text, lang: me.lang, ko: koText || text };
  }

  function promptSpeech(q) {
    return say(qt(q, 'prompt'), q.prompt);
  }

  function renderQuestion() {
    var q = run.questions[run.index];
    var kind = KIND[q.type];
    run.locked = false;

    $('quiz-course').textContent = run.course.title;
    $('step-count').textContent =
      '문항 ' + (run.index + 1) + ' / ' + run.questions.length + ' · ' + kind.label;

    var dots = $('step-dots');
    dots.textContent = '';
    run.questions.forEach(function (_, i) {
      var dot = UI.el('span');
      dot.setAttribute('data-state', i < run.index ? 'done' : (i === run.index ? 'now' : 'todo'));
      dots.appendChild(dot);
    });

    UI.setIcon($('quiz-kind'), kind.ico);
    $('quiz-prompt').textContent = qt(q, 'prompt');

    var audio = $('prompt-audio');
    audio.textContent = '';
    audio.appendChild(UI.audioButton(function () { return promptSpeech(q); }, I18N.t('quiz.listenAgain')));

    /* 이 문항이 내 언어로 온전히 나오지 않으면 그 사실을 남긴다.
       배지가 없으면 노동자는 왜 한국어가 보이는지 알 수 없고,
       담당자도 어느 문항의 번역이 빠졌는지 알 방법이 없다. */
    var note = $('prompt-note');
    note.textContent = '';
    if (!Store.qhas(q, me.lang)) {
      note.appendChild(UI.waitBadge(I18N.t('learn.transPending')));
      note.hidden = false;
    } else {
      note.hidden = true;
    }

    $('consequence').hidden = true;
    $('btn-next').hidden = true;
    $('btn-next').textContent =
      run.index === run.questions.length - 1 ? '결과 보기 ▶' : '다음 문항 ▶';

    var body = $('quiz-body');
    body.textContent = '';
    if (q.type === 'hotspot') renderHotspot(body, q);
    else if (q.type === 'choice') renderChoice(body, q);
    else renderMatch(body, q);

    UI.speak(promptSpeech(q));
  }

  /* 답이 정해졌다. 결과를 말하고 다음으로 갈 수 있게 한다.

     consequenceKo 는 그 문장의 한국어 원문이다. 기기에 노동자의 언어 음성이
     없을 때 UI.speak 이 이것을 읽는다. 안 넘기면 번역문을 한국어 음성으로
     읽으려 해서 아무 말도 안 들린다. */
  function answered(correct, consequenceText, consequenceKo) {
    if (run.locked) return;
    run.locked = true;
    run.answers[run.index] = correct ? 1 : 0;

    var box = $('consequence');
    if (consequenceText) {
      UI.setIcon($('consequence-ico'), correct ? 'check-circle' : 'alert');
      $('consequence-text').textContent = consequenceText;
      box.hidden = false;
      UI.speak(say(consequenceText, consequenceKo));
    } else {
      box.hidden = true;
    }

    $('btn-next').hidden = false;
  }

  /* --- hotspot — 설비 도해에서 위험 지점 짚기 --- */

  function renderHotspot(body, q) {
    var name = Diagrams.nameFor(run.equipment);

    var figure = UI.el('div', 'quiz-figure');
    figure.appendChild(Diagrams.svg(name));

    /* 이 도해의 구역 중 정답 원 안에 들어오는 것이 있는지.
       없으면 구역을 쓰지 않는다 — 아무 구역도 정답이 아니면 통과할 길이 없다. */
    var zones = Diagrams.zones(name);
    var hasCorrect = zones.some(function (z) { return Diagrams.inAnswer(q.answer, z.x, z.y); });

    if (zones.length && hasCorrect) renderZones(figure, q, zones);
    else renderFreeTap(figure, q);

    body.appendChild(figure);
    // 힌트는 도해 밖에 둔다. figure 안에 넣으면 퍼센트 좌표계 위에 겹친다.
    body.appendChild(UI.el('p', 'zonehint', '그림에서 위험한 곳을 한 번 누르세요.'));
  }

  function renderZones(figure, q, zones) {
    var buttons = [];

    zones.forEach(function (z) {
      var btn = UI.el('button', 'zone');
      btn.type = 'button';
      btn.setAttribute('aria-label', z.label);
      btn.style.left = z.x + '%';
      btn.style.top = z.y + '%';
      btn.style.width = z.w + '%';
      btn.style.height = z.h + '%';
      buttons.push({ btn: btn, zone: z, correct: Diagrams.inAnswer(q.answer, z.x, z.y) });

      btn.addEventListener('click', function () {
        if (run.locked) return;
        var picked = Store.findBy(buttons, 'btn', btn);

        // 고른 곳과 정답을 함께 표시한다. 어디가 정답인지 모르면 배울 것이 없다.
        buttons.forEach(function (b) {
          b.btn.disabled = true;
          if (b === picked) b.btn.setAttribute('data-mark', picked.correct ? 'ok' : 'no');
          else if (!picked.correct && b.correct) b.btn.setAttribute('data-mark', 'ok');
        });

        /* 구역별 결과 문장(z.consequence)은 도해에 붙어 있어 한국어만 있다.
           그 경우 한국어를 그대로 읽는다 — 없는 번역을 있는 척하지 않는다. */
        if (z.consequence) answered(picked.correct, z.consequence, z.consequence);
        else answered(picked.correct, qt(q, 'why') || '', q.why || '');
      });

      figure.appendChild(btn);
    });
  }

  /* 도해가 없는 설비 — 그림 아무 곳이나 눌러 짚는다.
     구역 이름을 못 주므로 결과 설명도 일반적인 문장이 된다. */
  function renderFreeTap(figure, q) {
    figure.addEventListener('click', function (e) {
      if (run.locked) return;

      var box = figure.getBoundingClientRect();
      if (!box.width || !box.height) return;   // 아직 그려지지 않았다

      var x = ((e.clientX - box.left) / box.width) * 100;
      var y = ((e.clientY - box.top) / box.height) * 100;

      var mark = UI.el('div', 'tapmark');
      mark.style.left = x + '%';
      mark.style.top = y + '%';
      figure.appendChild(mark);

      var correct = Diagrams.inAnswer(q.answer, x, y);
      var fallback = correct
        ? '맞습니다. 이곳이 이 설비에서 다치기 쉬운 자리입니다.'
        : '이곳이 아닙니다. 교육을 다시 듣고 위험한 자리를 확인해 주세요.';
      answered(correct, qt(q, 'why') || fallback, q.why || fallback);
    });
  }

  /* --- choice — 올바른 작업 고르기 --- */

  function renderChoice(body, q) {
    var list = UI.el('ul', 'choice-list');

    /* 번역이 온전하지 않으면 qtext 가 한국어 배열을 그대로 돌려준다.
       그래서 아래 i 는 언제나 q.answer 와 같은 자리를 가리킨다. */
    var options = qt(q, 'options');

    options.forEach(function (option, i) {
      var li = UI.el('li', 'choice-row');
      var optionKo = q.options[i];

      var btn = UI.el('button', 'choice-btn');
      btn.type = 'button';
      btn.appendChild(UI.el('span', 'no', String(i + 1)));
      btn.appendChild(UI.el('span', 'text', option));

      btn.addEventListener('click', function () {
        if (run.locked) return;
        var correct = i === q.answer;

        UI.$$('.choice-btn', list).forEach(function (other, k) {
          other.disabled = true;
          if (k === i) other.setAttribute('data-mark', correct ? 'ok' : 'no');
          else if (!correct && k === q.answer) other.setAttribute('data-mark', 'ok');
        });

        // results 는 선택지마다의 결과 설명. 기능2 가 아직 안 만들었으면 없다.
        var results = Array.isArray(qt(q, 'results')) ? qt(q, 'results') : [];
        var resultsKo = Array.isArray(q.results) ? q.results : [];
        answered(correct,
          results[i] || qt(q, 'why') || '',
          resultsKo[i] || q.why || '');
      });

      li.appendChild(btn);
      li.appendChild(UI.audioButton(function () {
        return say(option, optionKo);
      }, (i + 1) + '번 선택지 듣기'));

      list.appendChild(li);
    });

    body.appendChild(list);
  }

  /* --- match — 작업과 보호구 연결하기

     드래그를 쓰지 않는다. 장갑 낀 손으로는 왼쪽 하나 누르고
     오른쪽 하나 누르는 편이 정확하다. --- */

  function shuffled(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function renderMatch(body, q) {
    /* 번역이 온전하지 않으면 한국어 pairs 가 그대로 온다.
       어느 쪽이든 i 는 원래 줄 번호라서 정답 판정(links[l.i] === l.i)이 그대로 맞다. */
    var pairs = qt(q, 'pairs');

    var lefts = pairs.map(function (p, i) { return { i: i, text: p[0] }; });
    var rights = shuffled(pairs.map(function (p, i) { return { i: i, text: p[1] }; }));

    var picked = null;      // 지금 고른 왼쪽 index
    var links = {};         // 왼쪽 index -> 오른쪽 index

    var board = UI.el('div', 'match-board');

    var head = UI.el('div', 'match-col-head');
    head.appendChild(UI.el('span', null, '작업'));
    head.appendChild(UI.el('span', null, '보호구'));
    board.appendChild(head);

    var leftBtns = [];
    var rightBtns = [];

    function pairNumberOf(leftIndex) {
      // 이어진 순서대로 1, 2, 3… 짝 번호를 준다. 색만으로는 무엇이 무엇과
      // 이어졌는지 알 수 없어서 글자로도 남긴다.
      var order = Object.keys(links).sort(function (a, b) { return links[a] - links[b]; });
      return order.indexOf(String(leftIndex)) + 1;
    }

    function repaint() {
      lefts.forEach(function (l, row) {
        var btn = leftBtns[row];
        btn.setAttribute('aria-pressed', picked === l.i ? 'true' : 'false');
        if (links[l.i] !== undefined) {
          btn.setAttribute('data-pair', String(pairNumberOf(l.i)));
          btn.querySelector('.pairno').textContent = String(pairNumberOf(l.i));
        } else {
          btn.removeAttribute('data-pair');
          btn.querySelector('.pairno').textContent = '';
        }
      });

      rights.forEach(function (r, row) {
        var btn = rightBtns[row];
        var ownerLeft = null;
        Object.keys(links).forEach(function (k) { if (links[k] === r.i) ownerLeft = Number(k); });
        if (ownerLeft !== null) {
          btn.setAttribute('data-pair', String(pairNumberOf(ownerLeft)));
          btn.querySelector('.pairno').textContent = String(pairNumberOf(ownerLeft));
        } else {
          btn.removeAttribute('data-pair');
          btn.querySelector('.pairno').textContent = '';
        }
      });

      confirmBtn.hidden = Object.keys(links).length !== q.pairs.length;
    }

    function makeBtn(item, side) {
      var btn = UI.el('button', 'match-btn');
      btn.type = 'button';
      btn.appendChild(UI.el('span', 'pairno'));
      btn.appendChild(UI.el('span', 'text', item.text));
      btn.setAttribute('aria-pressed', 'false');

      btn.addEventListener('click', function () {
        if (run.locked) return;

        if (side === 'left') {
          // 이미 이어진 것을 다시 누르면 연결을 푼다. 잘못 누르는 일이 잦다.
          if (links[item.i] !== undefined) { delete links[item.i]; picked = null; }
          else picked = (picked === item.i) ? null : item.i;
        } else {
          if (picked === null) { UI.toast('왼쪽에서 작업을 먼저 골라 주세요.'); return; }
          // 이 보호구가 다른 작업에 이미 붙어 있으면 떼어 온다
          Object.keys(links).forEach(function (k) { if (links[k] === item.i) delete links[k]; });
          links[picked] = item.i;
          picked = null;
        }
        repaint();
      });

      return btn;
    }

    lefts.forEach(function (l, row) {
      var line = UI.el('div', 'match-row');
      var lb = makeBtn(l, 'left');
      var rb = makeBtn(rights[row], 'right');
      leftBtns.push(lb);
      rightBtns.push(rb);
      line.appendChild(lb);
      var mid = UI.el('span', 'match-linked', '—');
      mid.setAttribute('aria-hidden', 'true');
      line.appendChild(mid);
      line.appendChild(rb);
      board.appendChild(line);
    });

    var confirmBtn = UI.el('button', 'btn btn-primary', '이대로 확인하기 ✓');
    confirmBtn.type = 'button';
    confirmBtn.hidden = true;
    confirmBtn.addEventListener('click', function () {
      if (run.locked) return;

      var allRight = lefts.every(function (l) { return links[l.i] === l.i; });

      leftBtns.forEach(function (btn, row) {
        var l = lefts[row];
        btn.setAttribute('data-mark', links[l.i] === l.i ? 'ok' : 'no');
        btn.disabled = true;
      });
      rightBtns.forEach(function (btn, row) {
        var r = rights[row];
        var owner = null;
        Object.keys(links).forEach(function (k) { if (links[k] === r.i) owner = Number(k); });
        btn.setAttribute('data-mark', owner === r.i ? 'ok' : 'no');
        btn.disabled = true;
      });

      var fallback = allRight
        ? '맞습니다. 작업에 맞는 보호구를 골랐습니다.'
        : '연결이 맞지 않습니다. 보호구가 맞지 않으면 착용해도 사고를 막지 못합니다.';
      answered(allRight, qt(q, 'why') || fallback, q.why || fallback);
    });

    var wrap = UI.el('div', 'big-actions');
    wrap.appendChild(confirmBtn);

    body.appendChild(board);
    body.appendChild(wrap);
    repaint();
  }

  /* -----------------------------------------------------------------
     채점과 저장

     ★ progress.quiz 의 기존 네 필드(score · passed · answers · at)는 그대로 둔다.
       기능5·6(P3·P4)이 읽는 모양이다.

     ★ attempt 와 firstPassed 를 더한다.
       다시 풀면 최신 결과가 앞 결과를 덮으므로, 그것만 남기면 담당자 대시보드의
       "최초 통과율"(목표 70~85%)을 계산할 근거가 사라진다.
       없으면 무시하면 되는 필드라 다른 화면은 깨지지 않는다.
     ----------------------------------------------------------------- */

  function grade() {
    var total = run.questions.length;
    var right = run.answers.filter(function (a) { return a === 1; }).length;
    var score = total ? Math.round((right / total) * 100) : 0;
    var passed = score >= PASS_SCORE;
    var courseId = run.course.id;

    var result = Store.progress.update(function (list) {
      var row = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].workerId === me.id && list[i].courseId === courseId) { row = list[i]; break; }
      }
      if (!row) {
        row = { workerId: me.id, courseId: courseId, lang: me.lang, learnedAt: null, quiz: null };
        list.push(row);
      }

      var prev = row.quiz;
      var attempt = prev ? (prev.attempt || 1) + 1 : 1;
      var firstPassed = prev
        ? (prev.firstPassed !== undefined ? prev.firstPassed : !!prev.passed)
        : passed;

      row.lang = me.lang;
      row.quiz = {
        score: score,
        passed: passed,
        answers: run.answers.slice(),
        at: new Date().toISOString(),
        attempt: attempt,
        firstPassed: firstPassed,

        /* ★ 그때 실제로 낸 문항의 id 를 함께 남긴다 (C6).
             answers 의 자리는 "낸 문항" 의 순서지 course.quiz 의 자리가 아니다.
             채점할 수 없는 문항이 섞여 있거나(questionsOf 가 걸러 낸다)
             나중에 담당자가 문항을 내리면 자리가 어긋나고, 그러면
             대시보드의 취약 항목과 증빙이 **조용히 다른 문항을 가리킨다.**
             읽는 쪽은 Store.askedQuestion() 하나만 쓴다. */
        asked: run.questions.map(function (q) { return q.id; })
      };
    });

    if (!result.ok) UI.toast('결과를 저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');

    return { score: score, right: right, total: total, passed: passed };
  }

  function renderResult(r) {
    var panel = $('result-panel');
    panel.className = 'result-panel ' + (r.passed ? 'pass' : 'fail');

    UI.setIcon($('result-ico'), r.passed ? 'check-circle' : 'repeat');
    $('result-title').textContent = r.passed ? '이해도 검증을 통과했습니다' : '아직 통과하지 못했습니다';
    $('result-score').textContent = r.score + '점';
    $('result-note').textContent = r.total
      ? r.total + '문항 중 ' + r.right + '문항 정답 · 통과 기준 ' + PASS_SCORE + '점'
      : '';

    var fault = $('result-fault');
    if (r.passed) {
      fault.hidden = true;
    } else {
      // SCREEN 기능4 — 이 문장이 빠지면 이 기능은 노동자를 걸러 내는 시험이 된다
      fault.textContent = '미통과는 노동자의 실패가 아니라 교육의 실패로 기록됩니다. ' +
        '틀린 문항은 그 문구를 다시 만들라는 신호로 담당자에게 전달됩니다.';
      fault.hidden = false;
    }

    var review = $('result-review');
    review.textContent = '';
    run.questions.forEach(function (q, i) {
      var li = UI.el('li');
      var ico = UI.el('span', 'ico', KIND[q.type].ico);
      ico.setAttribute('aria-hidden', 'true');
      li.appendChild(ico);
      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, qt(q, 'prompt')));
      body.appendChild(UI.el('p', 'meta', KIND[q.type].label));
      li.appendChild(body);
      li.appendChild(run.answers[i] === 1 ? UI.okBadge(I18N.t('state.correct')) : UI.stopBadge(I18N.t('state.wrong')));
      review.appendChild(li);
    });

    var actions = $('result-actions');
    actions.textContent = '';
    if (r.passed) {
      actions.appendChild(linkButton('홈으로', 'home.html', true));
      actions.appendChild(linkButton('내 수강 기록 보기', 'my.html'));
    } else {
      actions.appendChild(linkButton('교육을 다시 듣기', 'learn.html', true));
      var again = UI.el('button', 'btn btn-quiet', '지금 다시 풀기');
      again.type = 'button';
      again.addEventListener('click', function () { start(run.course); });
      actions.appendChild(again);
    }

    show('result');
  }

  /* -----------------------------------------------------------------
     들어올 때 — 무엇을 검증할지 정한다
     ----------------------------------------------------------------- */

  function begin() {
    var courses = myCourses();
    var wanted = param('course');

    if (!courses.length) {
      gate('🎧', '검증할 교육이 없습니다',
        '담당자가 아직 내 설비의 교육을 만들지 않았습니다. 현장 관리자에게 알려 주세요.',
        [linkButton('교육 목록 보기', 'learn.html', true)]);
      return;
    }

    var course = wanted
      ? Store.findBy(courses, 'id', wanted)
      // 지정이 없으면 교육은 들었고 아직 통과하지 못한 것을 먼저 꺼낸다
      : courses.filter(function (c) {
          var row = progressOf(c.id);
          return row && row.learnedAt && !(row.quiz && row.quiz.passed);
        })[0];

    if (!course) {
      gate('🎧', '지금 검증할 교육이 없습니다',
        wanted
          ? '이 교육은 내 설비의 교육이 아닙니다. 교육 목록에서 다시 골라 주세요.'
          : '교육을 들으면 이어서 이해도 검증으로 넘어갑니다.',
        [linkButton('교육 목록 보기', 'learn.html', true)]);
      return;
    }

    // ★ 순서를 지킨다. 듣지 않고 문항만 풀어 통과하는 길을 만들지 않는다.
    var row = progressOf(course.id);
    if (!row || !row.learnedAt) {
      gate('🎧', '먼저 교육을 들어야 합니다',
        '"' + course.title + '" 을(를) 아직 듣지 않았습니다. ' +
        '교육을 끝까지 들으면 이해도 검증으로 이어집니다.',
        [linkButton('이 교육 들으러 가기', 'learn.html', true)]);
      return;
    }

    var questions = questionsOf(course);
    if (!questions.length) {
      gate('📋', '아직 문항이 없습니다',
        '"' + course.title + '" 에 이해도 검증 문항이 들어 있지 않습니다. ' +
        '문항이 없으면 이해했는지 확인할 수 없어 교육 완료로 기록하지 않습니다.',
        [linkButton('교육 목록 보기', 'learn.html', true)]);
      return;
    }

    start(course);
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('btn-next').addEventListener('click', function () {
    UI.stopSpeak();
    if (run.index < run.questions.length - 1) {
      run.index += 1;
      renderQuestion();
    } else {
      renderResult(grade());
    }
  });

  window.addEventListener('pagehide', UI.stopSpeak);
  UI.onVoicesReady(renderVoiceNote);

  renderVoiceNote();
  begin();
})();
