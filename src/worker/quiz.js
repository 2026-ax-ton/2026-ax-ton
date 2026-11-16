/* ===================================================================
   quiz.js — 기능4 이해도 검증

   담당: P1
   기능번호: 기능4
   읽는 키: courses, setup, progress
   쓰는 키: progress (+ 언어를 바꾸면 accounts[].lang — UI.langSwitch)
   근거: SCREEN 기능4 · PRD §4.2 · 🆕 2026-11-11 노동자 화면 개선 요청

   ★ 이 화면이 제품의 심장이다.
     교육 완료의 기준을 출석부 서명에서 "이해했는가"로 옮기는 곳이다.
     통과하지 못하면 progress 에 passed:false 로 남고 교육 완료로 기록되지 않는다.

   문항 세 유형 —
     hotspot  사진·도해에서 위험 지점을 짚는다   answer { x, y, r } 퍼센트 좌표
     choice   올바른 작업을 고른다               options [] · answer 인덱스
     match    작업과 보호구를 연결한다           pairs [[작업, 보호구], ...]

   이 파일이 코드로 지키는 것 —

   · 한 문항에 한 번만 답한다. 다시 풀기는 처음부터 한다 (최초 통과율이 뜻을 잃지 않게).
   · 답한 직후 "지금 이대로 하면 무슨 일이 생기는지"를 말한다.
   · 미통과 화면에 "노동자의 실패가 아니라 교육의 실패" 를 적는다.
   · 문항은 음성으로 읽어 준다. 🆕 버튼은 듣기 ↔ 그만 듣기로 바뀌고, 끝난 뒤에도 다시 들을 수 있다.
     다음 문항으로 가면 앞 문항 음성은 끊긴다.
   · 🆕 2026-11-11 고른 언어로만 보인다 — 한국어를 섞지 않는다 (사용자 요청).
     화면 글자는 전부 I18N, 문항은 Store.qtext. 문항 번역이 하나라도 빠졌으면 한국어를 띄우지 않고
     「아직 내 언어로 준비되지 않았습니다」로 막는다 (담당자 화면이 발급 전에 번역을 채운다).
     설비 이름(고유명사)만 원문 그대로다.
   · 🆕 사진 문항은 누를 때마다 표시가 그 자리로 옮겨 가고, [선택 취소]로 지울 수 있고,
     [제출]을 누를 때의 마지막 한 점만 채점한다. 제출 전에는 정답 자리를 화면 어디에도 두지 않는다.
   · ★ answer 는 options 의 인덱스다. 번역 배열의 길이 검사는 store.js 의 qtext 한 곳에만 있다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillWorkerBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  /* 통과 기준. 안전 지시는 하나라도 놓치면 안 되므로 전 문항 정답이다. */
  var PASS_SCORE = 100;

  var KIND = {
    hotspot: { ico: '👆', key: 'quiz.kindHotspot' },
    choice:  { ico: '☑',  key: 'quiz.kindChoice' },
    match:   { ico: '🔗', key: 'quiz.kindMatch' }
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

  /** 화면 글자 — 내 언어로. {n} {t} {r} 는 숫자로 바꾼다 */
  function T(key, vars) {
    var s = I18N.t(key, me.lang);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }

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

  /** 교육 이름 — 한국어 노동자는 담당자가 쓴 제목, 그 밖의 언어는 「설비 이름 · 안전교육」.
   *  담당자가 쓴 제목은 한국어라 섞이지 않게 한다. 설비 이름은 고유명사라 원문 그대로 */
  function courseTitle(course) {
    if (me.lang === 'ko') return course.title;
    var eq = Store.findBy(Store.setup.load().equipments, 'id', course.equipmentId);
    return (eq ? eq.name + ' · ' : '') + T('learn.course');
  }

  /* 실제로 낼 수 있는 문항만 남긴다. 모르는 유형은 조용히 통과시키지 않고 뺀다 */
  function questionsOf(course) {
    return (Array.isArray(course.quiz) ? course.quiz : []).filter(function (q) {
      if (!q || !KIND[q.type]) return false;
      if (q.retired) return false;   // ★ 내린 문항은 앞으로 내지 않는다 (C6)
      if (q.type === 'hotspot') return !!(q.answer && typeof q.answer.x === 'number');
      if (q.type === 'choice') return Array.isArray(q.options) && q.options.length > 1 && typeof q.answer === 'number';
      if (q.type === 'match') return Array.isArray(q.pairs) && q.pairs.length > 0;
      return false;
    });
  }

  function qt(q, field) { return Store.qtext(q, me.lang, field); }

  /** 이 문항을 내 언어로 낼 수 있는가 — 묻는 칸(문항·선택지·짝)이 다 번역됐는가 (Store.qhas).
   *  결과·해설은 번역이 없으면 한국어 대신 「맞습니다/틀렸습니다」(내 언어)로 말한다 (tr) */
  function ready(q) { return me.lang === 'ko' || Store.qhas(q, me.lang); }

  /** 번역된 값만 — 한국어로 되돌아가면 null (한국어를 섞지 않는다) */
  function tr(q, field) {
    if (q[field] === undefined || q[field] === null || q[field] === '') return null;
    var got = qt(q, field);
    if (me.lang === 'ko') return got;
    return JSON.stringify(got) === JSON.stringify(q[field]) ? null : got;
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
    UI.stopSpeak();
    UI.setIcon($('gate-ico'), ico);
    $('gate-title').textContent = title;
    $('gate-why').textContent = why;
    $('gate-why').hidden = !why;
    var box = $('gate-actions');
    box.textContent = '';
    actions.forEach(function (node) { box.appendChild(node); });
    show('gate');
  }

  /* -----------------------------------------------------------------
     문항 진행
     ----------------------------------------------------------------- */

  var run = null;        // { course, equipment, questions, index, answers, locked, feedback }
  var lastResult = null;

  function start(course) {
    var setup = Store.setup.load();
    run = {
      course: course,
      equipment: Store.findBy(setup.equipments, 'id', course.equipmentId),
      questions: questionsOf(course),
      index: 0,
      answers: [],
      locked: false,
      feedback: null
    };
    show('quiz');
    renderQuestion(true);
    /* 🆕 저장소 그림(media:)은 처음 문항을 띄우면서 전부 미리 받아 둔다 — 중간에 끊겨도 뒤 문항 그림이 보이게 */
    var refs = [course.photo];
    (course.quiz || []).forEach(function (q) { (Array.isArray(q.pics) ? q.pics : []).forEach(function (p) { refs.push(p); }); });
    Net.prefetchMedia(refs, { token: Auth.token() });
  }

  function renderVoiceNote() {
    var note = UI.voiceNote(me.lang);
    var box = $('voicenote');
    box.textContent = note;
    box.hidden = !note;
  }

  function say(text, koText) { return { text: text, lang: me.lang, ko: koText || text }; }

  /* 진행(n/총)과 "한 번만" 을 먼저 알리고 이어서 문항을 읽는다 — 한 번의 발화로 (끊기지 않게) */
  function promptSpeech(q) {
    var head = function (l) {
      return I18N.t('quiz.stepLabel', l) + ' ' + (run.index + 1) + ' / ' + run.questions.length + '. ' + I18N.t('quiz.onceOnly', l);
    };
    return say(head(me.lang) + ' ' + qt(q, 'prompt'), head('ko') + ' ' + q.prompt);
  }

  function renderQuestion(autoSpeak) {
    var q = run.questions[run.index];
    var kind = KIND[q.type];
    run.locked = false;

    $('quiz-course').textContent = courseTitle(run.course);
    $('step-count').textContent = T('quiz.stepLabel') + ' ' + (run.index + 1) + ' / ' + run.questions.length + ' · ' + T(kind.key);

    var dots = $('step-dots');
    dots.textContent = '';
    run.questions.forEach(function (_, i) {
      var dot = UI.el('span');
      dot.setAttribute('data-state', i < run.index ? 'done' : (i === run.index ? 'now' : 'todo'));
      dots.appendChild(dot);
    });

    /* 「한 번만 답할 수 있어요」는 음성으로 읽어 준다 — 글자 줄은 두지 않는다 (2026-11-11 단순화) */
    $('step-once').textContent = '';
    $('step-once').hidden = true;

    UI.setIcon($('quiz-kind'), kind.ico);
    $('quiz-prompt').textContent = qt(q, 'prompt');

    var audio = $('prompt-audio');
    audio.textContent = '';
    var listen = UI.audioButton(function () { return promptSpeech(q); }, I18N.t('quiz.listenAgain', me.lang));
    audio.appendChild(listen);
    $('prompt-note').hidden = true;

    $('consequence').hidden = true;
    $('btn-next').hidden = true;
    $('btn-next').textContent = run.index === run.questions.length - 1 ? T('quiz.seeResult') + ' ▶' : T('quiz.nextQuestion') + ' ▶';

    var body = $('quiz-body');
    body.textContent = '';
    if (q.type === 'hotspot') renderHotspot(body, q);
    else if (q.type === 'choice') renderChoice(body, q);
    else renderMatch(body, q);

    if (autoSpeak) listen.play();
  }

  /* 답이 정해졌다. 결과를 말하고 다음으로 갈 수 있게 한다 */
  function answered(correct, consequenceText, consequenceKo) {
    if (run.locked) return;
    run.locked = true;
    run.answers[run.index] = correct ? 1 : 0;
    run.feedback = { correct: correct };
    showFeedback(correct, consequenceText, consequenceKo, true);
  }

  function showFeedback(correct, text, ko, speakIt) {
    var box = $('consequence');
    box.setAttribute('data-correct', correct ? 'yes' : 'no');   // 결과 시트 색 (Figma WK-03) — 아이콘이 뜻을 함께 나른다
    if (text) {
      UI.setIcon($('consequence-ico'), correct ? 'check-circle' : 'alert');
      $('consequence-text').textContent = text;
      box.hidden = false;
      if (speakIt) UI.speak(say(text, ko));
    } else {
      box.hidden = true;
    }
    $('btn-next').hidden = false;
  }

  /* 결과 문장 — 문항의 해설(내 언어). 없으면 맞음·틀림만 (한국어 문장을 대신 띄우지 않는다) */
  function feedbackOf(q, correct, okKey, noKey) {
    var why = tr(q, 'why');
    var generic = T(correct ? (okKey || 'state.correct') : (noKey || 'state.wrong'));
    return { text: why || generic, ko: why ? (q.why || '') : I18N.t(correct ? (okKey || 'state.correct') : (noKey || 'state.wrong'), 'ko') };
  }

  /* --- hotspot — 누를 때마다 표시가 옮겨 가고, [제출] 때의 마지막 한 점만 채점한다 --- */

  function renderHotspot(body, q) {
    var photo = q.figure === 'photo' && typeof run.course.photo === 'string'
      && (run.course.photo.indexOf('data:image/') === 0 || Net.isMediaRef(run.course.photo));   // 🆕 저장소 그림(media:)도
    var figure = UI.el('div', 'quiz-figure' + (photo ? ' photo' : ''));
    var zones = [];
    if (photo) {
      var img = UI.el('img');
      img.alt = '';
      figure.appendChild(img);
      /* 🆕 받은 적 없는 그림을 끊긴 곳에서 열면 — 그 사람 언어로 끊김을 알리고, 다시 연결되면 저절로 받는다.
         ★ 설비 도해로 바꾸지 않는다 — 정답 좌표는 사진 기준이라 도해 위에서는 채점이 틀어진다 */
      Net.mediaInto(img, run.course.photo, { token: Auth.token() }).then(function (shown) {
        if (shown || !figure.parentNode) return;
        var note = UI.el('p', 'quiz-media-note', T('sync.offline'));
        figure.parentNode.insertBefore(note, figure.nextSibling);
        window.addEventListener('online', function retry() {
          window.removeEventListener('online', retry);
          Net.mediaInto(img, run.course.photo, { token: Auth.token() }).then(function (ok) { if (ok && note.parentNode) note.parentNode.removeChild(note); });
        });
      });
    } else {
      var name = Diagrams.nameFor(run.equipment);
      figure.appendChild(Diagrams.svg(name));
      /* 도해 구역 중 정답 원 안에 드는 것이 있을 때만 구역으로 고르게 한다 */
      zones = Diagrams.zones(name);
      if (!zones.some(function (z) { return Diagrams.inAnswer(q.answer, z.x, z.y); })) zones = [];
    }

    var sel = null;              // { x, y } 또는 { zone, btn } — 제출 전까지 몇 번이든 바뀐다
    var marker = null;
    var submit = UI.el('button', 'btn btn-primary', T('quiz.submit'));
    submit.type = 'button';
    submit.id = 'btn-hotspot-submit';
    var clear = UI.el('button', 'btn btn-quiet', T('quiz.clear'));
    clear.type = 'button';
    clear.id = 'btn-hotspot-clear';

    function paintSel() {
      submit.disabled = !sel;
      clear.disabled = !sel;
      submit.setAttribute('aria-disabled', sel ? 'false' : 'true');
    }

    var zoneBtns = zones.map(function (z) {
      var btn = UI.el('button', 'zone');
      btn.type = 'button';
      btn.setAttribute('aria-label', z.label);
      btn.style.left = z.x + '%';
      btn.style.top = z.y + '%';
      btn.style.width = z.w + '%';
      btn.style.height = z.h + '%';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (run.locked) return;
        zoneBtns.forEach(function (b) { b.removeAttribute('data-selected'); });
        btn.setAttribute('data-selected', 'yes');
        sel = { zone: z, btn: btn };
        paintSel();
      });
      figure.appendChild(btn);
      return btn;
    });

    if (!zones.length) {
      /* 좌표는 사진 크기에 대한 퍼센트 — 화면 크기·확대가 바뀌어도 같은 자리 */
      figure.addEventListener('click', function (e) {
        if (run.locked) return;
        var box = figure.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var x = Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100));
        var y = Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100));
        sel = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
        if (!marker) { marker = UI.el('div', 'tapmark'); figure.appendChild(marker); }
        marker.style.left = sel.x + '%';
        marker.style.top = sel.y + '%';
        paintSel();
      });
    }

    clear.addEventListener('click', function () {
      if (run.locked) return;
      sel = null;
      if (marker) { marker.parentNode.removeChild(marker); marker = null; }
      zoneBtns.forEach(function (b) { b.removeAttribute('data-selected'); });
      paintSel();
    });

    submit.addEventListener('click', function () {
      if (run.locked) return;
      if (!sel) { UI.toast(T('quiz.pickFirst')); return; }
      var correct = sel.zone ? Diagrams.inAnswer(q.answer, sel.zone.x, sel.zone.y) : Diagrams.inAnswer(q.answer, sel.x, sel.y);
      run.picked = sel.zone ? { x: sel.zone.x, y: sel.zone.y } : { x: sel.x, y: sel.y };
      submit.disabled = true;
      clear.disabled = true;
      revealHotspot(figure, q, zones, zoneBtns, sel, marker, correct);
      var fb = feedbackOf(q, correct, 'quiz.rightSpot', 'quiz.wrongSpot');
      if (sel.zone && sel.zone.consequence && me.lang === 'ko') fb = { text: sel.zone.consequence, ko: sel.zone.consequence };
      answered(correct, fb.text, fb.ko);
    });

    body.appendChild(figure);
    body.appendChild(UI.el('p', 'zonehint', T('quiz.tapPhoto')));
    var row = UI.el('div', 'big-actions hotspot-actions');
    row.appendChild(clear);
    row.appendChild(submit);
    body.appendChild(row);
    paintSel();
  }

  /** 제출 뒤에만 — 내가 고른 곳(맞음·틀림)과 정답 자리를 보인다. 어디가 정답인지 모르면 배울 것이 없다 */
  function revealHotspot(figure, q, zones, zoneBtns, sel, marker, correct) {
    zoneBtns.forEach(function (b, i) {
      b.disabled = true;
      /* 틀렸으면 정답 구역도 함께 — 어디가 맞는지 모르면 배울 것이 없다 */
      if (!correct && b !== (sel && sel.btn) && Diagrams.inAnswer(q.answer, zones[i].x, zones[i].y)) b.setAttribute('data-mark', 'ok');
    });
    if (sel && sel.btn) sel.btn.setAttribute('data-mark', correct ? 'ok' : 'no');
    if (marker) marker.setAttribute('data-mark', correct ? 'ok' : 'no');
    if (!correct && !zoneBtns.length) {
      var ring = UI.el('div', 'answer-ring');
      ring.style.left = q.answer.x + '%';
      ring.style.top = q.answer.y + '%';
      ring.style.width = (2 * (q.answer.r || 12)) + '%';
      ring.style.height = (2 * (q.answer.r || 12)) + '%';
      figure.appendChild(ring);
    }
  }

  /* --- choice — 올바른 작업 고르기 --- */

  function renderChoice(body, q) {
    var list = UI.el('ul', 'choice-list');
    var options = qt(q, 'options');

    options.forEach(function (option, i) {
      var li = UI.el('li', 'choice-row');
      var btn = UI.el('button', 'choice-btn');
      btn.type = 'button';
      btn.appendChild(UI.el('span', 'no', String(i + 1)));
      /* 그림 보기 — 영상의 3D 장면·AI 그림 (scripts/make-video-quiz.mjs). data:image 만 (제3자 요청 0건) */
      var pic = q.pics && typeof q.pics[i] === 'string' && (q.pics[i].indexOf('data:image/') === 0 || Net.isMediaRef(q.pics[i])) ? q.pics[i] : '';
      if (pic) {
        btn.className = 'choice-btn has-pic';
        var img = UI.el('img', 'pic');
        img.alt = option;
        Net.mediaInto(img, pic, { token: Auth.token() });   // 🆕 저장소 그림(media:)이면 받아서
        btn.appendChild(img);
      } else {
        btn.appendChild(UI.el('span', 'text', option));
      }

      btn.addEventListener('click', function () {
        if (run.locked) return;
        var correct = i === q.answer;
        UI.$$('.choice-btn', list).forEach(function (other, k) {
          other.disabled = true;
          if (k === i) other.setAttribute('data-mark', correct ? 'ok' : 'no');
          else if (!correct && k === q.answer) other.setAttribute('data-mark', 'ok');
        });
        var results = tr(q, 'results') || [];
        var fb = feedbackOf(q, correct);
        answered(correct, results[i] || fb.text, results[i] ? q.results[i] : fb.ko);
      });

      li.appendChild(btn);
      li.appendChild(UI.audioButton(function () { return say(option, q.options[i]); }, T('quiz.option', { n: i + 1 })));
      list.appendChild(li);
    });

    body.appendChild(list);
  }

  /* --- match — 작업과 보호구 연결하기 (드래그 없이 왼쪽 → 오른쪽 누르기) --- */

  function shuffled(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function renderMatch(body, q) {
    var pairs = qt(q, 'pairs');
    var lefts = pairs.map(function (p, i) { return { i: i, text: p[0] }; });
    var rights = shuffled(pairs.map(function (p, i) { return { i: i, text: p[1] }; }));
    var picked = null;
    var links = {};

    var board = UI.el('div', 'match-board');
    var head = UI.el('div', 'match-col-head');
    head.appendChild(UI.el('span', null, T('quiz.matchTask')));
    head.appendChild(UI.el('span', null, T('quiz.matchGear')));
    board.appendChild(head);

    var leftBtns = [];
    var rightBtns = [];

    function pairNumberOf(leftIndex) {
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
          if (links[item.i] !== undefined) { delete links[item.i]; picked = null; }
          else picked = (picked === item.i) ? null : item.i;
        } else {
          if (picked === null) { UI.toast(T('quiz.matchPickLeft')); return; }
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

    var confirmBtn = UI.el('button', 'btn btn-primary', T('quiz.matchConfirm') + ' ✓');
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
      var fb = feedbackOf(q, allRight);
      answered(allRight, fb.text, fb.ko);
    });

    var wrap = UI.el('div', 'big-actions');
    wrap.appendChild(confirmBtn);
    body.appendChild(board);
    body.appendChild(wrap);
    repaint();
  }

  /* -----------------------------------------------------------------
     채점과 저장 — progress.quiz 의 기존 필드는 그대로 (기능5·6 이 읽는다)
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
      var firstPassed = prev ? (prev.firstPassed !== undefined ? prev.firstPassed : !!prev.passed) : passed;
      row.lang = me.lang;
      row.quiz = {
        score: score,
        passed: passed,
        answers: run.answers.slice(),
        at: new Date().toISOString(),
        attempt: attempt,
        firstPassed: firstPassed,
        /* ★ 그때 실제로 낸 문항의 id (C6) — 읽는 쪽은 Store.askedQuestion() 하나만 쓴다 */
        asked: run.questions.map(function (q) { return q.id; })
      };
    });

    if (!result.ok) UI.toast(T('common.saveFail'));
    return { score: score, right: right, total: total, passed: passed };
  }

  function renderResult(r, first) {
    lastResult = r;
    var panel = $('result-panel');
    panel.className = 'result-panel ' + (r.passed ? 'pass' : 'fail');

    UI.setIcon($('result-ico'), r.passed ? 'check-circle' : 'repeat');
    $('result-title').textContent = T(r.passed ? 'quiz.passTitle' : 'quiz.failTitle');
    /* ★ 점수(%)가 아니라 문항 수로 (H2) — 셈을 몰라도 그림처럼 읽힌다 */
    $('result-score').textContent = r.total ? T('quiz.score', { t: r.total, r: r.right }) : '';
    $('result-note').textContent = r.total ? T('quiz.passRule') : '';

    var fault = $('result-fault');
    if (r.passed) fault.hidden = true;
    else {
      // SCREEN 기능4 — 이 문장이 빠지면 이 기능은 노동자를 걸러 내는 시험이 된다
      fault.textContent = T('quiz.notYourFault');
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
      li.appendChild(body);
      li.appendChild(run.answers[i] === 1 ? UI.okBadge(T('state.correct')) : UI.stopBadge(T('state.wrong')));
      review.appendChild(li);
    });

    /* ★ 공용 폰 대응 — 통과하면 로그아웃 (다음 사람이 이어받지 않게). 미통과는 다시 풀기가 이어져야 한다 */
    if (r.passed && first) Auth.endSession();

    var actions = $('result-actions');
    actions.textContent = '';
    if (r.passed) {
      actions.appendChild(linkButton(T('action.home'), 'home.html', true));
      actions.appendChild(linkButton(T('quiz.myRecord'), 'my.html'));
    } else {
      actions.appendChild(linkButton(T('quiz.relearn'), 'learn.html', true));
      var again = UI.el('button', 'btn btn-quiet', T('quiz.retry'));
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
    var toList = function () { return linkButton(T('quiz.toList'), 'learn.html', true); };

    if (!courses.length) { gate('🎧', T('quiz.noCourse'), '', [toList()]); return; }

    var course = wanted
      ? Store.findBy(courses, 'id', wanted)
      : courses.filter(function (c) {
          var row = progressOf(c.id);
          return row && row.learnedAt && !(row.quiz && row.quiz.passed);
        })[0];

    if (!course) { gate('🎧', T('quiz.noCourse'), '', [toList()]); return; }

    // ★ 순서를 지킨다. 듣지 않고 문항만 풀어 통과하는 길을 만들지 않는다.
    var row = progressOf(course.id);
    if (!row || !row.learnedAt) {
      gate('🎧', T('quiz.learnFirst'), courseTitle(course), [linkButton(T('quiz.goLearn'), 'learn.html', true)]);
      return;
    }

    var questions = questionsOf(course);
    if (!questions.length) { gate('📋', T('quiz.noCourse'), courseTitle(course), [toList()]); return; }

    /* ★ 문항 하나라도 내 언어가 없으면 한국어를 띄우지 않고 막는다 (2026-11-11 요청 1-6) */
    if (!questions.every(ready)) { gate('📋', T('quiz.notReady'), courseTitle(course), [toList()]); return; }

    start(course);
  }

  /** 언어를 바꾸면 지금 화면을 그 언어로 다시 그린다 — 답한 문항은 답한 그대로 */
  function relang() {
    user = Auth.current();
    me = whoAmI();
    renderVoiceNote();
    if (!run || $('view-gate').hidden === false) { begin(); return; }
    if ($('view-result').hidden === false && lastResult) { renderResult(lastResult, false); return; }
    if (!run.questions.every(ready)) { begin(); return; }
    var done = run.answers[run.index] !== undefined;
    renderQuestion(false);
    if (done) {
      run.locked = true;
      UI.$$('#quiz-body button').forEach(function (b) { b.disabled = true; });
      var q = run.questions[run.index];
      var fb = feedbackOf(q, run.feedback && run.feedback.correct);
      showFeedback(run.feedback && run.feedback.correct, fb.text, fb.ko, false);
    }
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('btn-next').addEventListener('click', function () {
    UI.stopSpeak();      // 앞 문항의 음성은 여기서 끊는다
    if (run.index < run.questions.length - 1) {
      run.index += 1;
      run.feedback = null;
      renderQuestion(true);
    } else {
      renderResult(grade(), true);
    }
  });

  window.addEventListener('pagehide', UI.stopSpeak);
  UI.onVoicesReady(renderVoiceNote);
  UI.langSwitch($('lang-switch'), relang);

  renderVoiceNote();
  begin();
})();
