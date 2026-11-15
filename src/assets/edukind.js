/* ===================================================================
   edukind.js — 「0. 어떤 교육, 어떤 업종」 칸과 법정 안내 상자
   (C06 D-039 범위 ⓑ 「정기교육까지」 · PRD-AD-04 FR-14~23)

   목록 데이터는 `curriculum.js` 한 곳이다 (C06 D-046). 이 파일은
   **고르는 화면 조각과 안내 글**만 만든다 — 법령 숫자를 여기서 다시 적지 않는다.

   ★ 왜 공용 파일인가 — 교육을 만드는 길이 둘이다
     (`admin/content` 손으로 · `admin/autogen` AI 로). 같은 칸을 두 벌 만들면
     언젠가 한쪽만 고쳐진다 (content.js 의 courseBlock 과 같은 이유).

   ★ 서버를 부르지 않는다. 바깥 요청 0건, ES 모듈 아님 (file:// 에서 열린다).

   교육에 저장되는 칸 (courses) — `eduKind` · `industry` · `specialJob`
     · 이 칸이 생기기 전에 발급한 교육은 세 칸이 없다. 그때는 **「미지정」** 으로
       보이고 수강·문항·증빙은 지금처럼 그대로 돈다 (FR-AD-04-21).
   =================================================================== */

var EduKind = (function () {
  'use strict';

  var INDUSTRIES = [
    { id: 'manufacturing', label: '제조업' },
    { id: 'construction', label: '건설업' }
  ];

  /* 법정 최소 시간 표의 열 이름 (시행규칙 별표 4) — 숫자는 curriculum.js 에 있다 */
  var MIN_LABEL = {
    daily: '일용직·1주 이하',
    other: '그 밖의 근로자',
    office: '사무직',
    shortTerm: '단기작업·간헐작업',
    towerCraneSignalDaily: '타워크레인 신호 일용직'
  };

  function empty() {
    return { industry: 'manufacturing', kind: '', specialNo: 0 };
  }

  function trainings() {
    return (typeof Curriculum === 'undefined' ? [] : Curriculum.TRAININGS) || [];
  }

  function training(kind) {
    var list = trainings();
    for (var i = 0; i < list.length; i++) if (list[i].id === kind) return list[i];
    return null;
  }

  /** 특별교육 대상 작업 — 대표 12개는 세부 사항까지, 나머지 27개는 목록만 (C06 D-039 결정사항 1) */
  function specialJobs() {
    var detailed = ((typeof Curriculum === 'undefined' ? [] : Curriculum.SPECIAL) || []).map(function (s) {
      return { no: s.no, title: s.title, detailed: true, industry: s.industry || '', hazard: s.hazard || '',
        target: s.target || '', items: (s.items || []).map(function (it) { return it.title; }) };
    });
    /* 나머지 27개 작업 — 법정 개별 사항 **이름**은 있고, 영상용 세부 대본만 아직 없다 */
    var later = ((typeof Curriculum === 'undefined' ? [] : Curriculum.SPECIAL_LATER) || []).map(function (row) {
      return { no: row.no, title: row.title, detailed: false, items: row.items || [], industry: '', hazard: '', target: '' };
    });
    return detailed.concat(later).sort(function (a, b) { return a.no - b.no; });
  }

  function specialJob(no) {
    var list = specialJobs();
    for (var i = 0; i < list.length; i++) if (list[i].no === Number(no)) return list[i];
    return null;
  }

  function minutesText(minutes) {
    var n = Number(minutes) || 0;
    if (n >= 60 && n % 60 === 0) return (n / 60) + '시간';
    if (n > 60) return Math.floor(n / 60) + '시간 ' + (n % 60) + '분';
    return n + '분';
  }

  /** 법정 최소 시간을 **표에 적힌 그대로** 한 줄로 (고용 형태를 우리가 고르지 않는다) */
  function minText(kind) {
    var t = training(kind);
    if (!t || !t.minMinutes) return '';
    return Object.keys(t.minMinutes).map(function (k) {
      return (MIN_LABEL[k] || k) + ' ' + minutesText(t.minMinutes[k]);
    }).join(' · ');
  }

  /** 이 교육에서 다뤄야 하는 법정 교육 사항 이름 목록 (별표 5) */
  function contentTitles(state) {
    if (typeof Curriculum === 'undefined') return [];
    var t = training(state && state.kind);
    if (!t) return [];
    var basic = (Curriculum.BASIC || []).filter(function (b) { return b.legal; });
    var out = [];
    if (t.contents === 'regular') {
      out = (Curriculum.REGULAR || []).filter(function (r) { return r.legal !== false; })
        .map(function (r) { return r.title; });
    } else {
      /* 작업내용 변경 시 교육은 현장 작업 사항(focus)을 먼저 보여 준다 (FR-AD-04-25) */
      var focus = t.focus || [];
      var head = focus.length ? basic.filter(function (b) { return focus.indexOf(b.no) !== -1; }) : [];
      var rest = basic.filter(function (b) { return head.indexOf(b) === -1; });
      out = head.concat(rest).map(function (b) { return b.title; });
    }
    /* 특별교육이면 그 작업의 **개별 사항**도 함께 센다 (FR-AD-04-26).
       대표 12개는 영상용 세부까지, 나머지 27개는 법정 사항 이름까지 있다 (C06 D-039 결정사항 1) */
    if (t.contents === 'basic+special' && state.specialNo) {
      var job = specialJob(state.specialNo);
      if (job) job.items.forEach(function (name) { out.push('[' + job.no + '] ' + name); });
    }
    return out;
  }

  /** 교육 제목 앞에 붙는 말 — 「[일용직 채용 시] 」 · 「[특별교육 11] 」 (FR-AD-04-20) */
  function titlePrefix(state) {
    var t = training(state && state.kind);
    if (!t) return '';
    if (t.id === 'special') return '[특별교육' + (state.specialNo ? ' ' + state.specialNo : '') + '] ';
    if (t.id === 'daily-hire') return '[일용직 채용 시] ';
    if (t.id === 'job-change') return '[작업내용 변경 시] ';
    if (t.id === 'regular') return '[정기교육] ';
    return '';
  }

  /** 발급된 교육에 붙는 이름. 칸이 없던 옛 교육은 「미지정」 (FR-AD-04-21) */
  function label(course) {
    var t = training(course && course.eduKind);
    if (!t) return '미지정';
    if (t.id === 'special' && course.specialJob) {
      var job = specialJob(course.specialJob);
      return t.label + ' · ' + (job ? job.no + '. ' + job.title : course.specialJob);
    }
    return t.label;
  }

  /** courses 에 넣는 칸. 고르지 않았으면 빈 값 — 막지 않는다 */
  function fields(state) {
    var t = training(state && state.kind);
    return {
      eduKind: t ? t.id : '',
      industry: (state && state.industry) || '',
      specialJob: t && t.id === 'special' && state.specialNo ? Number(state.specialNo) : 0
    };
  }

  /** 고를 것을 다 골랐는가 — 특별교육이면 대상 작업까지 */
  function ready(state) {
    var t = training(state && state.kind);
    if (!t) return false;
    return t.id !== 'special' || !!(state && state.specialNo);
  }

  /* ── 안내 상자 (FR-AD-04-17·19·22) ─────────────────────────────── */

  function guideBox(state) {
    var box = UI.el('div', 'edu-guide');
    var t = training(state && state.kind);
    if (!t) {
      box.appendChild(UI.el('p', 'muted', '교육 종류를 고르면 법정 최소 시간과 교육 사항을 보여 드립니다.'));
      return box;
    }

    box.appendChild(UI.el('h3', null, t.label));
    box.appendChild(UI.el('p', 'edu-when', '언제 — ' + t.when));

    var min = UI.el('p', 'edu-min');
    min.appendChild(UI.el('b', null, '법정 최소 시간 '));
    min.appendChild(document.createTextNode(minText(t.id) || '표에 없음'));
    box.appendChild(min);

    var titles = contentTitles(state);
    if (titles.length) {
      box.appendChild(UI.el('p', 'edu-sub', '꼭 다뤄야 하는 교육 사항 ' + titles.length + '개'));
      var ul = UI.el('ul', 'edu-items');
      titles.forEach(function (name) { ul.appendChild(UI.el('li', null, name)); });
      box.appendChild(ul);
    }

    if (t.id === 'special' && state.specialNo) {
      var job2 = specialJob(state.specialNo);
      if (job2 && !job2.detailed) {
        box.appendChild(UI.el('p', 'edu-note',
          '이 작업은 법정 개별 사항 ' + job2.items.length + '개 목록까지 있습니다. '
          + '영상용 세부 대본은 대표 12개 작업에만 있습니다 — 문항·영상은 직접 만들어 주세요.'));
      }
      if (job2 && job2.target) {
        box.appendChild(UI.el('p', 'edu-note', '대상 — ' + job2.target));
      }
    }

    if (t.exempt) {
      var ex = UI.el('p', 'edu-exempt');
      ex.appendChild(UI.el('b', null, '면제 '));
      ex.appendChild(document.createTextNode(t.exempt));
      box.appendChild(ex);
    }

    /* 건설업 + 일용직 채용 시 교육 — 기초안전보건교육 이수자 안내 (FR-AD-04-19) */
    if (state.industry === 'construction' && t.id === 'daily-hire') {
      box.appendChild(UI.el('p', 'edu-note',
        '건설업 기초안전보건교육(4시간, 등록 기관)을 이수한 사람은 이 교육을 한 것으로 봅니다.'));
    }

    /* ★ 이 고지를 빼지 않는다 — 앱만으로 법정 시간이 인정되지 않는다 (FR-AD-04-22) */
    box.appendChild(UI.el('p', 'edu-legal',
      '법정 교육시간으로 인정받으려면 담당자(관리감독자 등)가 현장이나 교육장에서 함께 진행하고 '
      + '기록을 보관해야 합니다. 이 화면은 교육 자료와 이해도 기록을 만들어 줍니다.'));

    if (typeof Curriculum !== 'undefined' && Curriculum.SOURCE) {
      box.appendChild(UI.el('p', 'edu-source', '출처 ' + Curriculum.SOURCE));
    }
    return box;
  }

  /* ── 고르는 칸 ─────────────────────────────────────────────────── */

  /** 업종·교육 종류·(특별교육이면) 대상 작업을 고르는 칸을 `host` 안에 그린다.
   *  고를 때마다 `onChange(state)` 를 부른다. 상태는 부르는 쪽이 들고 있는다. */
  function render(host, state, onChange) {
    host.textContent = '';

    var fire = function () { if (onChange) onChange(state); };
    var redraw = function () { render(host, state, onChange); fire(); };

    /* 업종 */
    var indField = UI.el('div', 'field');
    indField.appendChild(UI.el('label', null, '업종'));
    var indPick = UI.el('div', 'picker');
    indPick.id = 'edu-industry';
    INDUSTRIES.forEach(function (ind) {
      var chip = UI.chip({
        type: 'radio', name: 'edu-industry', value: ind.id, label: ind.label,
        checked: state.industry === ind.id
      });
      chip.querySelector('input').addEventListener('change', function () {
        state.industry = ind.id;
        redraw();
      });
      indPick.appendChild(chip);
    });
    indField.appendChild(indPick);
    host.appendChild(indField);

    /* 교육 종류 4종 */
    var kindField = UI.el('div', 'field');
    kindField.appendChild(UI.el('label', null, '교육 종류'));
    var kindPick = UI.el('div', 'picker');
    kindPick.id = 'edu-kind';
    trainings().forEach(function (t) {
      var chip = UI.chip({
        type: 'radio', name: 'edu-kind', value: t.id, label: t.label, sub: t.when,
        checked: state.kind === t.id
      });
      chip.querySelector('input').addEventListener('change', function () {
        state.kind = t.id;
        if (t.id !== 'special') state.specialNo = 0;
        redraw();
      });
      kindPick.appendChild(chip);
    });
    kindField.appendChild(kindPick);
    host.appendChild(kindField);

    /* 특별교육 대상 작업 39종 (FR-AD-04-16) */
    if (state.kind === 'special') {
      var jobField = UI.el('div', 'field');
      var lab = UI.el('label', null, '특별교육 대상 작업');
      lab.setAttribute('for', 'edu-special');
      jobField.appendChild(lab);
      jobField.appendChild(UI.el('p', 'field-hint',
        '시행규칙 별표 5 제1호라목 39종입니다. ★ 가 붙은 작업은 개별 교육 사항까지 들어 있습니다.'));
      var sel = UI.el('select');
      sel.id = 'edu-special';
      var none = UI.el('option', null, '고르지 않음');
      none.value = '';
      sel.appendChild(none);
      /* 업종에 맞는 작업을 목록 위에 둔다 */
      var jobs = specialJobs();
      var mine = jobs.filter(function (j) { return j.industry && j.industry === state.industry; });
      var rest = jobs.filter(function (j) { return mine.indexOf(j) === -1; });
      mine.concat(rest).forEach(function (j) {
        var o = UI.el('option', null, (j.detailed ? '★ ' : '') + j.no + '. ' + j.title);
        o.value = String(j.no);
        if (Number(state.specialNo) === j.no) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        state.specialNo = sel.value ? Number(sel.value) : 0;
        redraw();
      });
      jobField.appendChild(sel);
      host.appendChild(jobField);
    }

    host.appendChild(guideBox(state));
  }

  return {
    INDUSTRIES: INDUSTRIES,
    empty: empty,
    training: training,
    specialJobs: specialJobs,
    specialJob: specialJob,
    minText: minText,
    minutesText: minutesText,
    contentTitles: contentTitles,
    titlePrefix: titlePrefix,
    label: label,
    fields: fields,
    ready: ready,
    guideBox: guideBox,
    render: render
  };
})();
