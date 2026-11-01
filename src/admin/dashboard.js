/* ===================================================================
   dashboard.js — 기능6 담당자 대시보드

   담당: P3
   기능번호: 기능6
   읽는 키: progress, reports, setup, courses, library, orders
   쓰는 키: reports (조치 상태만) · orders (재교육 지시)
   근거: SCREEN 기능6 · PRD §5

   ★ 이 화면의 주인공은 이수율이 아니다.

     "어느 언어에서 무엇을 못 알아들었는지" 가 핵심이고,
     그래서 이수 현황 타일은 작게, 언어×항목 정답률 막대는 가장 크게 둔다.
     정보 위계가 뒤바뀌면 담당자는 이수율만 보고 교육을 안 고친다.

   ★ 화면에 반드시 있어야 하는 문장 세 개 (SCREEN 기능6)
     · 이 목록은 노동자 평가가 아니라 콘텐츠 개선 신호입니다
     · 미통과는 노동자의 실패가 아니라 교육의 실패로 기록됩니다
     · 개인별 점수의 인사·평가 목적 내보내기는 제공하지 않습니다
     감시 도구가 되는 순간 제품의 전제가 무너진다. 문장을 지우지 말 것.

   ★ 위험요소 신고는 익명이다.
     reports 에는 신고자를 식별할 값이 없고, 이 화면도 만들지 않는다.

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

  /* 신고 조치 상태 — reports 의 status 로 쓴다 */
  var REPORT_STATUS = {
    urgent:   { label: '긴급', badge: 'stop' },
    received: { label: '접수', badge: 'wait' },
    resolved: { label: '조치 완료', badge: 'ok' }
  };

  var QLABEL = { hotspot: '위험 지점 짚기', choice: '올바른 작업 고르기', match: '보호구 연결하기' };

  /* -----------------------------------------------------------------
     읽기
     ----------------------------------------------------------------- */

  function setup() { return Store.setup.load(); }

  function langName(code) {
    var l = Store.language(code);
    return l ? l.name : (code || '-');
  }

  function hazardOf(code) { return Store.hazard(code); }

  function courseOf(id) { return Store.findBy(Store.courses.load(), 'id', id); }

  function equipmentOf(id) { return Store.findBy(setup().equipments, 'id', id); }

  /* 교육 하나의 대상자 — 설비가 속한 공정의 노동자 전원.
     여기서 누구도 빼지 않는다. 미수강자를 빼면 이수율이 저절로 100% 가 된다. */
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

  /* 한 사람 · 한 교육의 상태 */
  function stateOf(worker, course) {
    var row = progressOf(worker.id, course.id);
    if (!row || !row.learnedAt) return { key: 'none', label: '미수강', row: row };
    if (!row.quiz) return { key: 'noquiz', label: '검증 미실시', row: row };
    return { key: row.quiz.passed ? 'pass' : 'fail', label: row.quiz.passed ? '이수' : '미통과', row: row };
  }


  /* -----------------------------------------------------------------
     기간 걸러 보기 (C2)

     ★ 기준은 "교육을 발급한 날" (course.createdAt) 이다.
       수강한 날이나 검증한 날로 거르면 **아직 아무것도 안 한 사람은
       날짜가 없어서 통째로 빠진다.** 미수강자가 사라지고 이수율이 저절로
       올라간다 — 이 화면이 절대 하면 안 되는 일이다.
       (같은 이유로 audienceOf() 도 누구도 빼지 않는다)

     ★ 날짜가 없는 교육은 숨기지 않는다. 자료가 모자란 것을 "해당 없음" 으로
       바꾸면, 기록이 부실할수록 화면이 깨끗해진다.
     ----------------------------------------------------------------- */

  var range = 'all';        // 'quarter' · 'year' · 'all'. 기본은 전체 — 숨기지 않는 쪽

  var RANGE_LABEL = { quarter: '이번 분기', year: '올해', all: '전체 기간' };

  /* 그 범위가 시작하는 시각. 전체면 null. */
  function rangeStartTime(key) {
    var now = new Date();
    if (key === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
    if (key === 'quarter') {
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime();
    }
    return null;
  }

  function inRange(course) {
    var from = rangeStartTime(range);
    if (from === null) return true;
    if (!course || !course.createdAt) return true;   // 날짜가 없으면 숨기지 않는다
    var at = new Date(course.createdAt).getTime();
    if (isNaN(at)) return true;                      // 못 읽는 날짜도 숨기지 않는다
    return at >= from;
  }

  function coursesInRange() {
    return Store.courses.load().filter(inRange);
  }

  /* ★ 무엇이 빠져 있는지 화면에 적는다.
       조용히 줄이면 담당자는 "전부 본 것" 으로 읽고, 범위 밖의 미이수를 놓친다. */
  function renderRangeNote() {
    var all = Store.courses.load();
    var shown = all.filter(inRange);
    var hidden = all.length - shown.length;

    var note = $('range-note');
    if (note) {
      note.textContent = hidden
        ? RANGE_LABEL[range] + ' 교육 ' + shown.length + '건을 봅니다. ' +
          '이 범위 밖 교육 ' + hidden + '건은 빠져 있습니다.'
        : RANGE_LABEL[range] + ' — 교육 ' + all.length + '건 전부를 봅니다.';
    }

    ['quarter', 'year', 'all'].forEach(function (key) {
      var btn = $('range-' + key);
      if (btn) btn.setAttribute('aria-pressed', range === key ? 'true' : 'false');
    });
  }
  /* 모든 (노동자 × 교육) 조합. 이 화면의 거의 모든 숫자가 여기서 나온다. */
  function allPairs() {
    var out = [];
    coursesInRange().forEach(function (course) {
      audienceOf(course).forEach(function (worker) {
        out.push({ worker: worker, course: course, state: stateOf(worker, course) });
      });
    });
    return out;
  }

  /* -----------------------------------------------------------------
     1. 이수 현황 — 작게
     ----------------------------------------------------------------- */

  function renderStatus(pairs) {
    var box = $('status-tiles');
    box.textContent = '';

    var count = function (key) {
      return pairs.filter(function (p) { return p.state.key === key; }).length;
    };

    // 최초 통과율 — 다시 풀어 통과한 것은 세지 않는다.
    // 100% 면 문항이 쉬운 것이라 지표 실패로 본다 (목표 70~85%).
    var tried = pairs.filter(function (p) {
      return p.state.key === 'pass' || p.state.key === 'fail';
    });
    var firstPass = tried.filter(function (p) {
      var q = p.state.row.quiz;
      return q.firstPassed !== undefined ? q.firstPassed : q.passed;
    }).length;
    var rate = tried.length ? Math.round((firstPass / tried.length) * 100) : null;

    var tiles = [
      { label: '이수', value: count('pass'), unit: '건' },
      { label: '미통과', value: count('fail'), unit: '건', alert: count('fail') > 0 },
      { label: '미수강', value: count('none') + count('noquiz'), unit: '건',
        alert: (count('none') + count('noquiz')) > 0 },
      { label: '최초 통과율', value: rate === null ? '-' : rate, unit: rate === null ? '' : '%',
        hint: rate === null ? '검증 기록 없음'
          : (rate === 100 ? '100% 는 문항이 쉬운 것입니다'
            : (rate < 70 ? '목표 70~85% 보다 낮습니다' : '목표 범위 70~85%')),
        alert: rate === 100 }
    ];

    tiles.forEach(function (t) {
      var cell = UI.el('div', 'kpi' + (t.alert ? ' alert' : ''));
      cell.appendChild(UI.el('dt', null, t.label));
      var dd = UI.el('dd', null, String(t.value));
      if (t.unit) dd.appendChild(UI.el('small', null, t.unit));
      cell.appendChild(dd);
      if (t.hint) cell.appendChild(UI.el('p', 'hint', t.hint));
      box.appendChild(cell);
    });
  }

  /* -----------------------------------------------------------------
     2. ★ 이해도 취약 항목 — 언어 × 위험유형 정답률

     progress.quiz.answers 는 문항별 0/1 이다. 같은 자리의 문항이
     courses.quiz 에 있으므로, 문항의 hazard 로 묶으면
     "어느 언어가 어떤 위험을 못 알아들었는지" 가 나온다.
     ----------------------------------------------------------------- */

  function weakItems() {
    var buckets = {};   // "lang|hazard" -> { right, total }

    Store.progress.load().forEach(function (row) {
      if (!row.quiz || !Array.isArray(row.quiz.answers)) return;
      var course = courseOf(row.courseId);
      if (!course || !Array.isArray(course.quiz)) return;
      if (!inRange(course)) return;      // 기간 걸러 보기 (C2) — 막대도 함께 바뀐다

      row.quiz.answers.forEach(function (correct, i) {
        /* ★ 자리로 찾지 않고 Store.askedQuestion 을 쓴다 (C6).
             answers 의 자리는 "그때 낸 문항" 의 순서지 course.quiz 의
             자리가 아니다. 문항을 내리면 어긋나고, 어긋나면 이 막대가
             조용히 다른 문항의 정답률을 말한다. */
        var q = Store.askedQuestion(course, row.quiz, i);
        if (!q) return;
        // hazard 가 없는 문항은 유형으로 묶는다. 묶을 이름이 없으면 셀 수 없다.
        var topic = q.hazard || ('type:' + q.type);
        var key = (row.lang || '-') + '|' + topic;
        if (!buckets[key]) buckets[key] = { right: 0, total: 0, lang: row.lang, topic: topic };
        buckets[key].total += 1;
        if (correct === 1) buckets[key].right += 1;
      });
    });

    return Object.keys(buckets).map(function (key) {
      var b = buckets[key];
      var haz = hazardOf(b.topic);
      return {
        lang: b.lang,
        label: haz ? haz.label : (QLABEL[b.topic.replace('type:', '')] || b.topic),
        icon: haz ? haz.icon : '📋',
        rate: Math.round((b.right / b.total) * 100),
        right: b.right,
        total: b.total
      };
    }).sort(function (a, b) {
      return a.rate - b.rate;        // 낮은 것이 위로
    });
  }

  /* 색만으로 구분하지 않는다 — 등급 글자를 함께 준다 */
  function grade(rate) {
    if (rate < 60) return { level: 'low', word: '낮음' };
    if (rate < 80) return { level: 'mid', word: '보통' };
    return { level: 'ok', word: '양호' };
  }

  function renderWeak() {
    var box = $('weak-bars');
    box.textContent = '';

    var items = weakItems();

    if (!items.length) {
      box.appendChild(UI.el('p', 'empty',
        '아직 이해도 검증 기록이 없습니다. 노동자가 검증을 마치면 언어별 취약 항목이 여기 나옵니다.'));
      $('weak-hint').textContent = '';
      return;
    }

    items.forEach(function (item) {
      var g = grade(item.rate);

      var wrap = UI.el('div', 'bar-item');
      wrap.setAttribute('data-level', g.level);

      var head = UI.el('div', 'bar-head');

      var what = UI.el('span', 'what');
      what.appendChild(UI.iconBox(item.icon, 'ico'));
      what.appendChild(document.createTextNode(' '));
      what.appendChild(document.createTextNode(langName(item.lang) + ' · ' + item.label));
      what.appendChild(UI.el('em', null, item.right + '/' + item.total + '문항'));
      head.appendChild(what);

      // 숫자 + 등급 글자. 색을 지워도 뜻이 남아야 한다.
      head.appendChild(UI.el('span', 'num', item.rate + '% ' + g.word));
      wrap.appendChild(head);

      var track = UI.el('div', 'bar-track');
      var fill = UI.el('div', 'bar-fill');
      fill.style.width = item.rate + '%';
      track.appendChild(fill);
      wrap.appendChild(track);

      box.appendChild(wrap);
    });

    var worst = items[0];
    $('weak-hint').textContent = worst.rate < 80
      ? '가장 낮은 항목은 ' + langName(worst.lang) + ' ' + worst.label + ' ' + worst.rate + '% 입니다. ' +
        '그 언어의 설명을 다시 만드는 것부터 하시면 됩니다.'
      : '지금은 모든 항목이 양호합니다. 다만 전원이 쉽게 통과하면 문항이 쉬운 것일 수 있습니다.';
  }

  /* -----------------------------------------------------------------
     3. 조치가 필요한 사람
     ----------------------------------------------------------------- */

  /* 이 사람이 어느 항목에서 막혔는지 — 이름을 대야 무엇을 고칠지 알 수 있다 */
  function stuckTopics(pair) {
    var row = pair.state.row;
    if (!row || !row.quiz || !Array.isArray(row.quiz.answers)) return [];

    var course = pair.course;
    var out = [];
    row.quiz.answers.forEach(function (correct, i) {
      if (correct === 1) return;
      // 자리가 아니라 그때 낸 문항으로 찾는다 (C6)
      var q = Store.askedQuestion(course, row.quiz, i);
      if (!q) return;
      var haz = hazardOf(q.hazard);
      /* ★ 글자로 이어 붙이는 자리다 (음성으로도 읽는다). 그림을 섞지 않고
         이름만 쓴다 — 낭독기가 이모지 이름을 읽어 버리면 문장이 이상해진다. */
      out.push(haz ? haz.label : (QLABEL[q.type] || q.type));
    });
    return out;
  }

  /* -----------------------------------------------------------------
     재교육 지시 (D2) — Store.orders

     ★ 이 기록으로 사람을 세지 않는다.
       "이 사람 재교육 3회" 는 인사 평가 자료다. 개인별 점수를 인사·평가
       목적으로 내보내지 않는다는 이 화면의 원칙과 같은 이유로, 누적 횟수를
       세거나 사람을 줄 세우는 화면을 만들지 않는다.
       지시는 "이 교육을 다시 듣게 한다" 는 뜻이지 "이 사람이 못했다" 가 아니다.

     ★ 해소 판정은 Store.orderOpen() 한 곳에서 한다.
       노동자 홈이 같은 함수를 쓴다 — 계산이 두 곳이면 한쪽만 고쳐져서
       담당자는 "보냈다" 고 보는데 노동자 화면에는 안 뜨는 일이 생긴다.
     ----------------------------------------------------------------- */

  /* 이 사람 · 이 교육에 살아 있는 지시. 없으면 null. */
  function openOrderFor(worker, course) {
    var row = progressOf(worker.id, course.id);
    return Store.orders.load().filter(function (o) {
      return o.workerId === worker.id && o.courseId === course.id &&
        Store.orderOpen(o, row);
    })[0] || null;
  }

  /* 지금 지시를 쓰고 있는 대상. null 이면 입력칸이 닫혀 있다. */
  var orderTarget = null;

  function openOrderForm(pair) {
    orderTarget = { workerId: pair.worker.id, courseId: pair.course.id };

    $('order-who').textContent =
      pair.worker.id + ' · ' + pair.course.title;

    var topics = stuckTopics(pair);
    $('order-why').textContent = topics.length
      ? '막힌 항목: ' + topics.join(' · ') + '. 이 부분을 다시 듣게 합니다.'
      : (pair.state.key === 'none'
        ? '아직 수강하지 않았습니다. 다시 안내가 갑니다.'
        : '아직 이해도 검증을 마치지 않았습니다.');

    $('order-note').value = '';
    $('order-form').hidden = false;
    $('order-note').focus();
  }

  function closeOrderForm() {
    orderTarget = null;
    $('order-form').hidden = true;
    $('order-note').value = '';
  }

  function sendOrder() {
    if (!orderTarget) return;

    var note = ($('order-note').value || '').trim();
    if (!note) {
      UI.toast('무엇을 다시 들으면 되는지 한 줄 적어 주세요.');
      $('order-note').focus();
      return;
    }

    var target = orderTarget;
    Store.orders.update(function (list) {
      list.push({
        id: 'or-' + Date.now(),
        workerId: target.workerId,
        courseId: target.courseId,
        note: note,
        at: new Date().toISOString(),
        by: user.userId,
        canceledAt: null
      });
    });

    closeOrderForm();
    render();
    UI.toast('재교육 지시를 보냈습니다. 노동자 홈 화면에 뜹니다.');
  }

  function cancelOrder(order) {
    /* ★ 지우지 않고 취소 표시만 남긴다.
         지워 버리면 지시를 냈다가 거둔 사실이 기록에서 사라진다. */
    Store.orders.update(function (list) {
      var row = Store.findBy(list, 'id', order.id);
      if (row) row.canceledAt = new Date().toISOString();
    });
    render();
    UI.toast('지시를 거뒀습니다. 노동자 화면에서 사라집니다.');
  }

  /* 표 안의 "재교육" 칸 하나 */
  function orderCell(pair) {
    var cell = UI.el('td');
    var open = openOrderFor(pair.worker, pair.course);

    if (open) {
      var box = UI.el('div', 'chips');
      box.appendChild(UI.waitBadge('지시함 · ' + (open.at || '').slice(0, 10)));

      var undo = UI.el('button', 'btn-sm', '거두기');
      undo.type = 'button';
      undo.addEventListener('click', function () { cancelOrder(open); });
      box.appendChild(undo);

      cell.appendChild(box);
      return cell;
    }

    var btn = UI.el('button', 'btn-sm go', '재교육 지시');
    btn.type = 'button';
    btn.addEventListener('click', function () { openOrderForm(pair); });
    cell.appendChild(btn);
    return cell;
  }

  function renderActions(pairs) {
    var body = $('action-rows');
    body.textContent = '';

    var need = pairs.filter(function (p) { return p.state.key !== 'pass'; });

    /* 대상이 사라졌는데 입력칸이 열려 있으면 닫는다 —
       기간을 바꾸거나 그 사이에 통과하면 그럴 수 있다 */
    if (orderTarget && !need.some(function (p) {
      return p.worker.id === orderTarget.workerId && p.course.id === orderTarget.courseId;
    })) closeOrderForm();

    if (!need.length) {
      var tr = UI.el('tr');
      var cell = UI.el('td');
      cell.colSpan = 6;
      cell.appendChild(UI.el('p', 'empty', '조치가 필요한 사람이 없습니다.'));
      tr.appendChild(cell);
      body.appendChild(tr);
      return;
    }

    need.forEach(function (p) {
      var tr = UI.el('tr');
      tr.appendChild(UI.el('td', null, p.worker.id));
      tr.appendChild(UI.el('td', null, langName(p.worker.lang)));
      tr.appendChild(UI.el('td', null, p.course.title));

      var stateCell = UI.el('td');
      if (p.state.key === 'fail') stateCell.appendChild(UI.stopBadge('미통과'));
      else stateCell.appendChild(UI.neutralBadge(p.state.label));
      tr.appendChild(stateCell);

      var topicCell = UI.el('td');
      var topics = stuckTopics(p);
      if (!topics.length) {
        topicCell.appendChild(UI.el('span', 'sub', p.state.key === 'fail' ? '-' : '아직 풀지 않았습니다'));
      } else {
        var chips = UI.el('div', 'chips');
        topics.forEach(function (name) {
          chips.appendChild(UI.el('span', 'badge badge-stop', name));
        });
        topicCell.appendChild(chips);
      }
      tr.appendChild(topicCell);

      tr.appendChild(orderCell(p));

      body.appendChild(tr);
    });
  }

  /* -----------------------------------------------------------------
     4. 위험요소 신고 큐 — 익명 (서버 쪽은 T13 · A02 §14.3)

     ★ 신고는 Store.sync 가 다니는 길(`/api/store`)을 타지 않는다. 계정을 토큰에서
       꺼내 그 자리에서 버리는 별도 경로(`/api/reports`)라, 이 화면이 직접 당겨오고
       직접 올린다. `rid` 는 그 경로가 매긴 서버 쪽 번호일 뿐 사람을 가리키지 않는다.
     ----------------------------------------------------------------- */

  function reportsOnline() {
    return typeof Net !== 'undefined' && Net.available()
      && typeof location !== 'undefined' && location.protocol === 'https:'
      && typeof Auth !== 'undefined' && !!Auth.token();
  }

  /* 서버가 준 목록을 이 기기의 캐시에 얹는다. 없던 신고(다른 폰에서 온 것)는
     더하고, 있던 것은 서버가 최근 본 상태(rid·status)로 맞춘다. */
  function mergeServerReports(list) {
    var result = Store.reports.update(function (rows) {
      list.forEach(function (r) {
        if (!r || !r.id) return;
        var row = Store.findBy(rows, 'id', r.id);
        if (row) {
          row.rid = r.rid;
          row.status = r.status;
        } else {
          rows.push(r);
        }
      });
    });
    return result.ok;
  }

  function pullReports() {
    if (!reportsOnline()) return;
    Net.request('GET', '/api/reports', null, { token: Auth.token() }).then(function (r) {
      if (r.failed || !r.ok) return;
      if (mergeServerReports((r.data && r.data.list) || [])) renderReports();
    });
  }

  /* ★ 위험요소 신고는 기간 걸러 보기를 따르지 않는다.
       조치가 안 끝난 신고는 언제 들어온 것이든 계속 보여야 한다.
       지난 분기 긴급 신고가 범위 밖이라고 사라지면 그게 사고가 된다. */
  function renderReports() {
    var box = $('report-queue');
    box.textContent = '';

    var state = setup();
    var list = Store.reports.load().slice().sort(function (a, b) {
      // 긴급이 위로, 그다음 최신순
      if ((a.status === 'urgent') !== (b.status === 'urgent')) return a.status === 'urgent' ? -1 : 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    if (!list.length) {
      box.appendChild(UI.el('p', 'empty', '접수된 위험요소 신고가 없습니다.'));
      return;
    }

    list.forEach(function (r) {
      var eq = Store.findBy(state.equipments, 'id', r.equipmentId);
      var proc = Store.findBy(state.processes, 'id', r.processId);
      var haz = hazardOf(r.hazard);
      var status = REPORT_STATUS[r.status] || REPORT_STATUS.received;

      var item = UI.el('div', 'queue-item');
      item.setAttribute('data-urgent', r.status === 'urgent' ? 'yes' : 'no');

      var top = UI.el('div', 'queue-top');
      var title = UI.el('strong');
      var ico = UI.iconBox(haz ? haz.icon : 'alert', null);
      ico.setAttribute('aria-hidden', 'true');
      title.appendChild(ico);
      title.appendChild(document.createTextNode(
        (haz ? haz.label : '위험') + ' — ' + (eq ? eq.name : '설비 미지정')));
      top.appendChild(title);

      if (status.badge === 'ok') top.appendChild(UI.okBadge(status.label));
      else if (status.badge === 'stop') top.appendChild(UI.stopBadge(status.label));
      else top.appendChild(UI.waitBadge(status.label));

      item.appendChild(top);

      if (r.memo) item.appendChild(UI.el('p', 'body', r.memo));

      /* ★ 말한 것을 기계가 옮긴 글이면 그렇다고 적는다.
         받아쓰기는 틀린다. 손으로 쓴 글과 똑같이 보이면 담당자가 그 글을
         곧이곧대로 읽고 엉뚱한 곳을 본다.

         ★ 이 표시는 사람을 가리키지 않는다. 목소리는 저장되지 않았고,
           저장된 것은 옮겨진 글자뿐이다. */
      if (r.memoFromVoice) {
        var vb = UI.neutralBadge('말한 것을 옮김 · 잘못 옮겨졌을 수 있습니다');
        vb.classList.add('voice-mark');
        item.appendChild(vb);
      }

      // ★ 신고자를 적지 않는다. reports 에 그런 값이 아예 없다.
      item.appendChild(UI.el('p', 'meta',
        [proc ? proc.name + ' 공정' : null, UI.formatDate(r.createdAt), '익명 신고']
          .filter(Boolean).join(' · ')));

      var row = UI.el('div', 'btn-row');
      [['urgent', '긴급으로'], ['received', '접수로'], ['resolved', '조치 완료']].forEach(function (pair) {
        if (r.status === pair[0]) return;
        var btn = UI.el('button', 'btn-sm' + (pair[0] === 'resolved' ? ' go' : ''), pair[1]);
        btn.type = 'button';
        btn.addEventListener('click', function () { setReportStatus(r.id, pair[0]); });
        row.appendChild(btn);
      });
      item.appendChild(row);

      box.appendChild(item);
    });
  }

  function setReportStatus(id, status) {
    var result = Store.reports.update(function (list) {
      var r = Store.findBy(list, 'id', id);
      // ★ 조치 상태만 바꾼다. 신고자를 식별할 값을 새로 넣지 않는다.
      if (r) r.status = status;
    });
    render();
    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
      return;
    }
    UI.toast('신고 상태를 바꿨습니다.');

    /* 서버에 올라가 있는 신고면(= rid 가 있으면) 같이 바꾼다. 아직 당겨오지
       않은 신고(막 들어와 이 기기가 rid 를 모르는 것)는 다음 당겨오기 때 맞춰진다 —
       그사이엔 이 기기에만 남는 것이 이번 범위의 남는 한계다. */
    var row = Store.findBy(result.data, 'id', id);
    if (reportsOnline() && row && row.rid) {
      Net.request('PATCH', '/api/reports?id=' + encodeURIComponent(row.rid),
        { status: status }, { token: Auth.token() });
    }
  }

  /* -----------------------------------------------------------------
     5. 교육별 실시 상황
     ----------------------------------------------------------------- */

  function renderDue(pairs) {
    var list = $('due-list');
    list.textContent = '';

    var courses = coursesInRange();       // 기한도 교육에 딸린 것이라 범위를 따른다
    if (!courses.length) {
      list.appendChild(UI.emptyRow('발급된 교육이 없습니다. 교육 콘텐츠 생성에서 먼저 만들어 주세요.'));
      return;
    }

    courses.forEach(function (course) {
      var mine = pairs.filter(function (p) { return p.course.id === course.id; });
      var done = mine.filter(function (p) { return p.state.key === 'pass'; }).length;
      var eq = equipmentOf(course.equipmentId);

      var dates = mine.map(function (p) {
        var row = p.state.row;
        return row && (row.quiz && row.quiz.at || row.learnedAt);
      }).filter(Boolean).sort();

      var li = UI.itemRow((eq && eq.icon) || 'gear', course.title,
        [(eq ? eq.name : '삭제된 설비'),
          '이수 ' + done + ' / ' + mine.length + '명',
          dates.length ? '마지막 실시 ' + UI.formatDate(dates[dates.length - 1]) : '실시 기록 없음'
        ].join(' · '));

      var tags = UI.el('div', 'tags');
      // 기한 판정은 UI.dueBadge 한 곳에 있다 — 기능2 의 발급 목록이 같은 것을 쓴다
      tags.appendChild(UI.dueBadge(course.dueAt));
      if (done < mine.length) tags.appendChild(UI.waitBadge('남은 대상 ' + (mine.length - done) + '명'));
      li.querySelector('.body').appendChild(tags);

      list.appendChild(li);
    });
  }

  /* -----------------------------------------------------------------
     그리기
     ----------------------------------------------------------------- */

  function render() {
    var pairs = allPairs();
    renderRangeNote();
    renderStatus(pairs);
    renderWeak();
    renderActions(pairs);
    renderReports();
    renderDue(pairs);
  }


  /* 기간 걸러 보기 (C2) */
  ['quarter', 'year', 'all'].forEach(function (key) {
    var btn = $('range-' + key);
    if (btn) btn.addEventListener('click', function () { range = key; render(); });
  });

  /* 재교육 지시 (D2) */
  $('order-send').addEventListener('click', sendOrder);
  $('order-cancel').addEventListener('click', closeOrderForm);
  $('order-note').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendOrder();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === Store.progress.KEY || e.key === Store.reports.KEY ||
        e.key === Store.courses.KEY || e.key === Store.setup.KEY ||
        e.key === Store.orders.KEY) render();
  });

  /* ── 서버 모드 — 20초마다 당겨온다 (T12 · A02 §14.5) ─────────────────

     ★ 담당자는 이 화면을 띄워 두고 현장을 본다. 노동자 폰에서 푼 결과가
       **20초 안에** 여기에 떠야 "지금 누가 안 들었나" 가 쓸모 있어진다.
     ★ 끊기면 화면을 비우지 않는다. 캐시로 계속 그리고 위에 배지만 띄운다. */

  if (Store.sync.on()) {
    var bar = UI.syncBadge();
    var main = document.querySelector('main');
    if (bar && main) main.insertBefore(bar, main.firstChild);

    Store.sync.onChange(function () { render(); });
    Store.sync.pull();                 // 열자마자 한 번
    Store.sync.every(20000);           // 그 뒤로는 20초마다
  }

  /* 신고는 Store.sync 가 다니는 길과 다르다 (익명 — 별도 경로, T13). 같은 리듬으로
     따로 당겨온다 — 노동자 폰에서 풀면 이 화면에도 20초 안에 뜬다. */
  if (reportsOnline()) {
    pullReports();
    setInterval(pullReports, 20000);
  }

  render();
})();
