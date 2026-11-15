/* ===================================================================
   proof.js — 기능5 교육 증빙 생성

   담당: P4
   기능번호: 기능5
   읽는 키: progress, courses, setup, library
   쓰는 키: 없음
   근거: SCREEN 기능5 · PRD §4.3

   증빙 작성 2시간 → 5분. 사업주 쪽 도입 유인은 사실상 이것 하나다.

   ★ 쓰는 키가 없는 것이 이 화면의 설계다.

     증빙을 따로 저장하지 않고 progress 를 그대로 읽어서 그린다.
     사본을 만들지 않으므로 고칠 경로가 아예 없다 — "생성 후 수정 불가" 를
     규칙으로 적어 두는 대신 구조로 만든다.
     내용을 바꾸려면 교육 기록 자체가 바뀌어야 한다.

   ★ 미이수자와 이해도 미달자를 숨기는 경로를 넣지 않는다.
     걸러 보기 기능도, 정렬로 아래로 밀어내는 것도 두지 않는다.
     숨길 수 있는 증빙은 증빙이 아니다.

   ★ 기간 단위로 묶을 수 있다 (C1). 그래도 거르는 것은 "사람" 이 아니라
     "무엇을 한 문서에 담을지" 다.

     고른 범위 안의 모든 교육이 들어가고, 그 교육의 대상자는 전원 들어간다.
     미이수·미통과를 빼는 경로는 여전히 없다.

     ★ 대신 문서에 범위를 적고, 그 범위 밖 교육이 몇 건인지도 적는다.
       범위를 골라 뽑을 수 있게 된 이상, 받는 쪽이 "이게 전부가 아니다" 를
       알 수 있어야 한다. 조용히 줄이면 그것이 곧 숨기는 것이 된다.

   ★ "면책" 이라고 쓰지 않는다.
     이 문서는 교육을 실시했다는 기록이고, 법적 책임을 대신하지 않는다.

   PDF 는 window.print() 와 @media print 로만 만든다.
   외부 라이브러리를 넣으면 외부 요청 0건 규칙이 깨진다.

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

  var QLABEL = { hotspot: '위험 지점 짚기', choice: '올바른 작업 고르기', match: '보호구 연결하기' };

  /* -----------------------------------------------------------------
     읽기
     ----------------------------------------------------------------- */

  function setup() { return Store.setup.load(); }

  function langName(code) {
    var l = Store.language(code);
    return l ? l.name : (code || '-');
  }

  function courseOf(id) { return Store.findBy(Store.courses.load(), 'id', id); }

  /* 이 교육의 대상자 — 설비가 속한 공정의 노동자 전원.
     ★ 여기서 아무도 빼지 않는다. 미수강자가 빠지면 이수율이 저절로 100% 가 된다. */
  function audienceOf(course) {
    var state = setup();
    var eq = Store.findBy(state.equipments, 'id', course.equipmentId);
    if (!eq) return [];
    return state.workers.filter(function (w) { return w.processId === eq.processId; });
  }

  function progressOf(workerId, courseId) {
    return Store.progress.load().filter(function (r) {
      return r.workerId === workerId && r.courseId === courseId;
    })[0] || null;
  }

  /* 한 사람의 결과. 통과하지 못하면 이수가 아니다 (SCREEN 기능4). */
  function resultOf(worker, course) {
    var row = progressOf(worker.id, course.id);

    if (!row || !row.learnedAt) {
      return { state: 'none', label: '미수강', learnedAt: null, quizAt: null, score: null };
    }
    if (!row.quiz) {
      return { state: 'noquiz', label: '검증 미실시', learnedAt: row.learnedAt, quizAt: null, score: null };
    }
    return {
      state: row.quiz.passed ? 'pass' : 'fail',
      label: row.quiz.passed ? '이수' : '미통과',
      learnedAt: row.learnedAt,
      quizAt: row.quiz.at,
      score: row.quiz.score,
      attempt: row.quiz.attempt,
      firstPassed: row.quiz.firstPassed,
      lang: row.lang
    };
  }


  /* -----------------------------------------------------------------
     묶는 단위 (C1)

     ★ 거르는 것은 사람이 아니라 "무엇을 한 문서에 담을지" 다.
       고른 범위 안의 모든 교육이 들어가고 대상자는 전원 들어간다.

     ★ 기준은 교육을 발급한 날(course.createdAt) 이다.
       수강한 날로 묶으면 아직 아무것도 안 한 교육이 어느 기간에도 안 들어가고,
       그 교육의 미수강자가 통째로 사라진다.
     ----------------------------------------------------------------- */

  var scope = 'course';       // 'course' · 'quarter' · 'year'

  function courseTime(c) {
    var at = c && c.createdAt ? new Date(c.createdAt).getTime() : NaN;
    return isNaN(at) ? null : at;
  }

  /* 발급일이 있는 교육들이 실제로 걸쳐 있는 기간만 고를 수 있게 만든다.
     없는 기간을 고를 수 있으면 빈 문서가 나온다. */
  function periodsFor(kind) {
    var seen = {};
    var out = [];

    Store.courses.load().forEach(function (c) {
      var at = courseTime(c);
      if (at === null) return;              // 날짜 없는 교육은 아래에서 따로 알린다
      var d = new Date(at);
      var key = kind === 'year'
        ? String(d.getFullYear())
        : d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        key: key,
        label: kind === 'year' ? d.getFullYear() + '년'
          : d.getFullYear() + '년 ' + (Math.floor(d.getMonth() / 3) + 1) + '분기'
      });
    });

    return out.sort(function (a, b) { return b.key.localeCompare(a.key); });  // 최신이 위로
  }

  function periodKeyOf(course, kind) {
    var at = courseTime(course);
    if (at === null) return null;
    var d = new Date(at);
    return kind === 'year'
      ? String(d.getFullYear())
      : d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
  }

  /* 이 문서에 들어갈 교육들 */
  function pickedCourses() {
    var all = Store.courses.load();

    if (scope === 'course') {
      var one = courseOf($('pick-course').value) || all[0];
      return one ? [one] : [];
    }

    var key = $('pick-period').value;
    return all.filter(function (c) { return periodKeyOf(c, scope) === key; });
  }

  /* 지금 문서가 담는 범위를 사람 말로 */
  function scopeLabel() {
    if (scope === 'course') return '교육 1건';
    var sel = $('pick-period');
    var opt = sel && sel.options[sel.selectedIndex];
    return opt ? opt.textContent : '';
  }
  /* -----------------------------------------------------------------
     요약 타일 — 고른 범위 전체를 합쳐서 센다
     ----------------------------------------------------------------- */

  function renderSummary(courses) {
    var box = $('summary');
    box.textContent = '';
    if (!courses.length) return;

    var results = [];
    courses.forEach(function (course) {
      audienceOf(course).forEach(function (w) { results.push(resultOf(w, course)); });
    });

    var count = function (state) {
      return results.filter(function (r) { return r.state === state; }).length;
    };

    // 최초 통과율 — 다시 풀어서 통과한 것은 세지 않는다.
    // 이 값이 100% 면 문항이 쉬운 것이라 지표 실패로 본다 (목표 70~85%).
    var tried = results.filter(function (r) { return r.state === 'pass' || r.state === 'fail'; });
    var firstPass = tried.filter(function (r) {
      return r.firstPassed !== undefined ? r.firstPassed : r.state === 'pass';
    }).length;
    var rate = tried.length ? Math.round((firstPass / tried.length) * 100) : null;

    var tiles = [
      { label: '교육', value: courses.length, unit: '건', hint: '이 문서가 담는 교육' },
      { label: '대상', value: results.length, unit: '명', hint: '교육별 대상자 전원의 합' },
      { label: '이수', value: count('pass'), unit: '명', hint: '이해도 검증 통과' },
      { label: '미통과', value: count('fail'), unit: '명', hint: '교육을 다시 만들 신호', alert: count('fail') > 0 },
      { label: '미수강', value: count('none') + count('noquiz'), unit: '명',
        hint: '아직 안 들었거나 검증 전', alert: (count('none') + count('noquiz')) > 0 },
      { label: '최초 통과율', value: rate === null ? '-' : rate, unit: rate === null ? '' : '%',
        hint: rate === null ? '검증 기록이 없습니다'
          : (rate === 100 ? '100% 는 문항이 쉬운 것입니다' : '목표 70~85%'),
        alert: rate === 100 }
    ];

    tiles.forEach(function (t) {
      var cell = UI.el('div', 'kpi' + (t.alert ? ' alert' : ''));
      cell.appendChild(UI.el('dt', null, t.label));
      var dd = UI.el('dd', null, String(t.value));
      if (t.unit) dd.appendChild(UI.el('small', null, t.unit));
      cell.appendChild(dd);
      cell.appendChild(UI.el('p', 'hint', t.hint));
      box.appendChild(cell);
    });
  }

  /* -----------------------------------------------------------------
     교육일지
     ----------------------------------------------------------------- */

  function metaRow(label, value) {
    var tr = UI.el('tr');
    tr.appendChild(UI.el('th', null, label));
    tr.appendChild(UI.el('td', null, value));
    return tr;
  }

  /* 전달한 안전 문구.
     ★ 지금 검수 상태도 함께 적는다. 교육 당시에는 쓸 수 있었지만 그 뒤
       오역으로 중지된 문구가 있으면, 그 사실이 증빙에 남아야 한다. */
  function phrasesList(course) {
    var box = UI.el('ol', 'proof-phrases');

    var library = Store.library.load();
    var ids = course.phraseIds || [];

    if (!ids.length) {
      box.appendChild(UI.el('li', null, '기록된 안전 문구가 없습니다.'));
      return box;
    }

    ids.forEach(function (id) {
      var p = Store.findBy(library, 'id', id);
      var li = UI.el('li');
      if (!p) {
        li.appendChild(document.createTextNode('(삭제된 문구 ' + id + ')'));
      } else {
        li.appendChild(document.createTextNode(p.ko));
        if (p.status !== 'reviewed') {
          li.appendChild(UI.el('span', 'proof-flag',
            p.status === 'stopped'
              ? ' — 교육 이후 사용 중지된 문구입니다'
              : ' — 현재 검수 대기 상태입니다'));
        } else {
          /* 문구 전체는 살아 있어도 어느 한 언어에서만 내려갔을 수 있다.
             그 언어 노동자는 이 문구를 받지 못했다는 뜻이므로 증빙에 적는다.
             ★ 숨기지 않는다. 무엇이 전달되지 않았는지가 이 문서의 내용이다. */
          var out = (course.languages || []).filter(function (code) {
            return !Store.phraseOk(p, code);
          });
          if (out.length) {
            li.appendChild(UI.el('span', 'proof-flag',
              ' — ' + out.map(langName).join(' · ') + ' 노동자에게는 전달되지 않았습니다'));
          }
        }
      }
      box.appendChild(li);
    });

    return box;
  }

  function quizList(course) {
    var box = UI.el('ol', 'proof-quiz');

    var quiz = course.quiz || [];
    if (!quiz.length) {
      box.appendChild(UI.el('li', null,
        '이해도 검증 문항이 없습니다. 문항이 없는 교육은 이수로 기록되지 않습니다.'));
      return box;
    }

    /* 문항 문구는 한국어를 적는다 — 이 서식은 감독기관에 내는 한국어 문서다.
       대신 그 문항이 어느 언어로 제공됐는지를 함께 적는다.
       "번역된 문항으로 이해를 확인했다" 가 이 증빙이 서명과 다른 이유다.

       ★ 한국어로만 제공된 문항을 숨기지 않는다. 옅게 만들지도 않는다.
         숨길 수 있는 증빙은 증빙이 아니다. */
    var langs = (course.languages || []).filter(function (c) { return c !== 'ko'; });

    quiz.forEach(function (q) {
      var li = UI.el('li');
      li.appendChild(document.createTextNode(q.prompt));
      li.appendChild(UI.el('span', 'proof-qtype', ' (' + (QLABEL[q.type] || q.type) + ')'));

      /* ★ 나중에 내린 문항도 빼지 않는다 (C6).
           그 문항으로 이해를 확인한 사람이 실제로 있었다. 문서에서 빼면
           증빙이 실제와 달라진다. 대신 지금은 안 나간다는 것을 적는다. */
      if (q.retired) {
        li.appendChild(UI.el('span', 'proof-qtype', ' — 지금은 내려진 문항입니다'));
      }

      if (langs.length) {
        var got = langs.filter(function (code) { return Store.qhas(q, code); });
        var line = got.length
          ? '제공 언어 — 한국어 · ' + got.map(langName).join(' · ')
          : '제공 언어 — 한국어';
        var missed = langs.filter(function (code) { return got.indexOf(code) === -1; });
        if (missed.length) {
          line += ' (' + missed.map(langName).join(' · ') + ' 는 한국어로 제공)';
        }
        li.appendChild(UI.el('span', 'proof-qlang', line));
      }

      box.appendChild(li);
    });

    return box;
  }

  /* 대상자별 기록.
     ★ 순서를 결과로 바꾸지 않는다. 식별번호 순 그대로 둔다 —
       정렬만 바꿔도 미통과자를 아래로 밀어내는 통로가 된다. */
  function rowsTable(people, results) {
    var wrap = UI.el('div', 'tablewrap');
    var table = UI.el('table', 'data proof-table');

    var thead = UI.el('thead');
    var htr = UI.el('tr');
    ['식별번호', '언어', '수강 일시', '검증 일시', '점수', '결과'].forEach(function (h) {
      var th = UI.el('th', null, h);
      th.setAttribute('scope', 'col');
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var body = UI.el('tbody', 'proof-rows');

    if (!people.length) {
      var tr = UI.el('tr');
      var cell = UI.el('td');
      cell.colSpan = 6;
      cell.appendChild(UI.el('p', 'empty',
        '이 공정에 등록된 노동자가 없습니다. 사업장 등록에서 노동자를 추가해 주세요.'));
      tr.appendChild(cell);
      body.appendChild(tr);
    }

    people.forEach(function (w, i) {
      var r = results[i];
      var tr = UI.el('tr');
      tr.setAttribute('data-state', r.state);

      tr.appendChild(UI.el('td', null, w.id));
      tr.appendChild(UI.el('td', null, langName(r.lang || w.lang)));
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
      else resultCell.appendChild(UI.neutralBadge(r.label));
      tr.appendChild(resultCell);

      body.appendChild(tr);
    });

    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  /* 🆕 실제 걸린 시간 (C06 D-039 · PRD-AD-04 FR-17 계열)
     교육을 연 시각(learnedAt) ~ 검증을 마친 시각(quizAt) 을 **그대로** 센다.
     ★ 고치거나 법정 시간으로 환산하지 않는다 — 짧게 나오면 짧게 적는다.
       증빙은 우리가 보이고 싶은 숫자가 아니라 실제로 일어난 일을 적는 문서다. */
  function minutesSpent(r) {
    if (!r || !r.learnedAt || !r.quizAt) return null;
    var ms = new Date(r.quizAt) - new Date(r.learnedAt);
    if (!(ms > 0)) return null;
    return Math.round(ms / 60000);
  }

  /** 대상자들의 실제 시간을 한 줄로 — 「가장 짧게 n분 ~ 가장 길게 m분 (기록 k명)」 */
  function spentText(results) {
    var mins = results.map(minutesSpent).filter(function (n) { return n !== null; });
    if (!mins.length) return '기록 없음';
    mins.sort(function (x, y) { return x - y; });
    var lo = mins[0];
    var hi = mins[mins.length - 1];
    var one = function (n) { return EduKind.minutesText(n); };
    return (lo === hi ? one(lo) : one(lo) + ' ~ ' + one(hi)) + ' (기록 ' + mins.length + '명)';
  }

  /* 교육 하나가 문서에서 차지하는 덩어리.
     ★ 교육 하나짜리 증빙도 이 함수를 쓴다 — 코드가 두 벌이 되면
       한쪽만 고쳐지는 날이 온다. */
  function courseBlock(course) {
    var state = setup();
    var eq = Store.findBy(state.equipments, 'id', course.equipmentId);
    var proc = eq ? Store.findBy(state.processes, 'id', eq.processId) : null;

    var people = audienceOf(course);
    var results = people.map(function (w) { return resultOf(w, course); });
    var doneAt = results.map(function (r) { return r.quizAt || r.learnedAt; })
      .filter(Boolean).sort();

    var sec = UI.el('section', 'proof-course');
    sec.appendChild(UI.el('h3', 'proof-course-title', course.title));

    var meta = UI.el('table', 'proof-meta');
    var tb = UI.el('tbody');
    tb.appendChild(metaRow('대상 공정 · 설비',
      [proc ? proc.name : '-', eq ? eq.name : '삭제된 설비'].join(' · ')));
    tb.appendChild(metaRow('교육 언어', (course.languages || []).map(langName).join(' · ') || '-'));
    /* 🆕 교육 종류 — 칸이 없던 옛 교육은 「미지정」 (PRD-AD-04 FR-21) */
    tb.appendChild(metaRow('교육 종류', EduKind.label(course)));
    tb.appendChild(metaRow('교육 방식',
      '설비별 다국어 음성 · 픽토그램 자율 학습 후 이해도 검증'));
    /* 🆕 실제 시간과 법정 최소 시간을 **나란히** 적는다 (C06 D-039).
       환산하지 않는다 — 둘을 같은 칸에 두면 보는 사람이 직접 견준다 */
    var legal = EduKind.minText(course.eduKind);
    tb.appendChild(metaRow('실제 교육 시간',
      spentText(results) + (legal ? ' · 법정 최소 ' + legal : ' · 법정 최소 시간은 교육 종류를 고른 교육에만 적습니다')));
    if (legal) {
      tb.appendChild(metaRow('법정 시간 인정 조건',
        '담당자(관리감독자 등)가 현장이나 교육장에서 함께 진행하고 기록을 보관해야 법정 교육시간으로 인정됩니다.'));
    }
    tb.appendChild(metaRow('발급일', course.createdAt ? UI.formatDate(course.createdAt) : '기록 없음'));
    tb.appendChild(metaRow('실시 기간', doneAt.length
      ? UI.formatDate(doneAt[0]) + ' ~ ' + UI.formatDate(doneAt[doneAt.length - 1])
      : '실시 기록 없음'));
    tb.appendChild(metaRow('대상 인원', people.length + '명'));
    meta.appendChild(tb);
    sec.appendChild(meta);

    sec.appendChild(UI.el('h4', null, '교육 내용 — 전달한 안전 문구'));
    sec.appendChild(phrasesList(course));

    sec.appendChild(UI.el('h4', null, '이해도 검증 — 문항'));
    sec.appendChild(quizList(course));

    sec.appendChild(UI.el('h4', null, '대상자별 기록'));
    sec.appendChild(UI.el('p', 'proof-note',
      '이 표의 결과는 서명이 아니라 이해도 검증 결과입니다. ' +
      '서명은 참석의 증거일 뿐 이해의 증거가 아니라는 데서 이 서식이 출발했습니다. ' +
      '미이수자와 미통과자도 그대로 적습니다.'));
    sec.appendChild(rowsTable(people, results));

    return sec;
  }

  /* 표지 — 사업장과 이 문서가 담는 범위 */
  function renderCover(courses) {
    var state = setup();

    $('proof-issued-at').textContent = '발급 ' + UI.formatDate(new Date().toISOString());
    $('proof-issued-by').textContent = [user.name, user.title].filter(Boolean).join(' · ') || user.userId;
    $('sign-admin').textContent = user.name || user.userId;

    var metas = $('proof-cover-rows');
    metas.textContent = '';
    metas.appendChild(metaRow('사업장', state.site.name || '(미등록)'));
    metas.appendChild(metaRow('규모', state.site.sizeBand || '-'));
    metas.appendChild(metaRow('담은 범위', scopeLabel()));
    metas.appendChild(metaRow('담은 교육', courses.length + '건'));

    /* ★ 무엇이 이 문서에 없는지 적는다.
         범위를 골라 뽑을 수 있게 된 이상, 받는 쪽이 "이게 전부가 아니다" 를
         알 수 있어야 한다. 조용히 줄이면 그것이 곧 숨기는 것이 된다. */
    var all = Store.courses.load();
    var outside = all.length - courses.length;
    var undated = all.filter(function (c) { return courseTime(c) === null; }).length;

    var parts = [];
    if (outside > 0) {
      parts.push('이 사업장에 발급된 교육 ' + all.length + '건 가운데 ' + courses.length +
        '건을 담았습니다. 나머지 ' + outside + '건은 이 문서에 없습니다.');
    } else {
      parts.push('이 사업장에 발급된 교육 ' + all.length + '건 전부를 담았습니다.');
    }
    if (scope !== 'course' && undated > 0) {
      parts.push('발급일이 없는 교육 ' + undated + '건은 어느 기간에도 넣을 수 없어 빠져 있습니다.');
    }
    $('proof-scope').textContent = parts.join(' ');
  }

  function renderProof(courses) {
    var box = $('proof-courses');
    box.textContent = '';

    if (!courses.length) {
      $('proof').hidden = true;
      return;
    }
    $('proof').hidden = false;

    renderCover(courses);
    courses.forEach(function (course) { box.appendChild(courseBlock(course)); });
  }

  /* -----------------------------------------------------------------
     그리기
     ----------------------------------------------------------------- */

  function render() {
    var all = Store.courses.load();

    /* 고르는 칸을 지금 단위에 맞춘다 */
    $('field-course').hidden = scope !== 'course';
    $('field-period').hidden = scope === 'course';

    UI.fillSelect($('pick-course'), all,
      function (c) { return c.id; },
      function (c) { return c.title; });

    if (scope !== 'course') {
      UI.fillSelect($('pick-period'), periodsFor(scope),
        function (p) { return p.key; },
        function (p) { return p.label; });
    }

    $('summary').textContent = '';

    if (!all.length) {
      $('proof').hidden = true;
      $('btn-print').disabled = true;
      $('summary').appendChild(UI.el('p', 'empty',
        '발급된 교육이 없습니다. 교육 콘텐츠 생성(기능2)에서 교육을 먼저 만들어 주세요.'));
      return;
    }

    var courses = pickedCourses();

    if (!courses.length) {
      $('proof').hidden = true;
      $('btn-print').disabled = true;
      $('summary').appendChild(UI.el('p', 'empty',
        '이 기간에 발급된 교육이 없습니다. 다른 기간을 골라 주세요.'));
      return;
    }

    $('btn-print').disabled = false;
    renderSummary(courses);
    renderProof(courses);
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('pick-scope').addEventListener('change', function () {
    scope = $('pick-scope').value;
    render();
  });

  $('pick-course').addEventListener('change', render);
  $('pick-period').addEventListener('change', render);

  $('btn-print').addEventListener('click', function () {
    // 발급 시각을 누르는 순간으로 다시 적는다
    render();
    window.print();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === Store.progress.KEY || e.key === Store.courses.KEY ||
        e.key === Store.setup.KEY || e.key === Store.library.KEY) render();
  });

  render();
})();
