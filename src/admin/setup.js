/* ===================================================================
   setup.js — 기능1 사업장 · 설비 등록

   담당: P1
   기능번호: 기능1
   읽는 키: setup
   쓰는 키: setup

   상태는 localStorage 한 곳에만 있다. 이 파일은 상태를 들고 있지 않고,
   바뀔 때마다 Store.setup.load() 로 다시 읽어서 화면 전체를 다시 그린다.
   화면이 여러 곳에 흩어져 있어서, 부분 갱신을 하면 어느 한 군데가
   금방 실제 데이터와 어긋난다.

   문서에서 온 규칙 중 이 파일이 코드로 지키는 것 두 가지 —
   · 등록하지 않은 언어는 어디에도 나오지 않는다 (노동자 언어 select)
   · 공정이 없으면 설비를 만들 수 없다 (설비 폼 잠금)
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillAdminBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  function badge(node, done, doneText, todoText) {
    node.className = 'badge ' + (done ? 'badge-ok' : 'badge-neutral');
    node.textContent = '';
    var icon = UI.iconBox(done ? 'check' : 'circle', null);
    icon.setAttribute('aria-hidden', 'true');
    node.appendChild(icon);
    node.appendChild(document.createTextNode(' ' + (done ? doneText : todoText)));
  }

  function langName(code) {
    var l = Store.language(code);
    return l ? l.name : code;
  }

  function processName(state, id) {
    var p = Store.findBy(state.processes, 'id', id);
    return p ? p.name : '삭제된 공정';
  }

  /* -----------------------------------------------------------------
     한 번만 만드는 부분 — 고정 목록에서 나오는 칩과 select
     ----------------------------------------------------------------- */

  function buildStaticControls() {
    UI.fillSelect($('site-size'), Store.SIZE_BANDS,
      function (s) { return s; }, function (s) { return s; });

    var langBox = $('pick-lang');
    Store.LANGUAGES.forEach(function (lang) {
      langBox.appendChild(UI.chip({
        type: 'checkbox', name: 'lang', value: lang.code,
        label: lang.name, sub: lang.native
      }));
    });

    var hazBox = $('pick-hazard');
    Store.HAZARDS.forEach(function (h) {
      hazBox.appendChild(UI.chip({
        type: 'checkbox', name: 'hazard', value: h.code,
        icon: h.icon, label: h.label
      }));
    });

    [['pick-proc-icon', 'proc-icon'], ['pick-equip-icon', 'equip-icon']].forEach(function (pair) {
      var box = $(pair[0]);
      Store.ICONS.forEach(function (icon, idx) {
        box.appendChild(UI.chip({
          type: 'radio', name: pair[1], value: icon,
          icon: icon, checked: idx === 0
        }));
      });
    });
  }

  /* -----------------------------------------------------------------
     그리기 — 상태가 바뀔 때마다 전부 다시 그린다
     ----------------------------------------------------------------- */

  function render() {
    var state = Store.setup.load();

    /* --- 상단 머리띠 --- */
    $('head-site').textContent = state.site.name || '사업장 미등록';

    /* --- 1. 사업장 --- */
    if (document.activeElement !== $('site-name')) $('site-name').value = state.site.name;
    $('site-size').value = state.site.sizeBand;
    badge($('b-site'), !!state.site.name, '등록됨', '미설정');

    /* --- 2. 언어 --- */
    UI.$$('input[name="lang"]').forEach(function (input) {
      input.checked = state.languages.indexOf(input.value) !== -1;
    });
    badge($('b-lang'), state.languages.length > 0, state.languages.length + '개 언어', '미설정');

    /* --- 3. 공정 --- */
    renderProcesses(state);
    badge($('b-proc'), state.processes.length > 0, state.processes.length + '개 공정', '미설정');

    /* --- 4. 설비 --- */
    // 공정이 없으면 설비를 만들 수 없다. 문구가 아니라 폼 자체를 잠근다.
    var hasProcess = state.processes.length > 0;
    $('equip-lock').hidden = hasProcess;
    $('equip-fields').disabled = !hasProcess;
    UI.fillSelect($('equip-proc'), state.processes,
      function (p) { return p.id; },
      /* ★ <option> 안에는 그림을 넣을 수 없다. 이모지를 남기면 이 목록만
         옛 말투로 남으므로 이름만 쓴다 (그림은 고른 뒤 화면에서 보인다). */
      function (p) { return p.name; });
    renderEquipments(state);
    badge($('b-equip'), state.equipments.length > 0, state.equipments.length + '대', '미설정');

    /* --- 5. 노동자 --- */
    // 언어 select 에는 2번에서 켠 언어만 나온다.
    // "등록 안 한 언어는 이후 어떤 화면에도 안 나온다"는 규칙이 여기서 실제로 지켜진다.
    var ready = hasProcess && state.languages.length > 0;
    $('worker-lock').hidden = ready;
    $('worker-fields').disabled = !ready;
    UI.fillSelect($('worker-lang'), state.languages,
      function (code) { return code; },
      function (code) { return langName(code); });
    UI.fillSelect($('worker-proc'), state.processes,
      function (p) { return p.id; },
      /* ★ <option> 안에는 그림을 넣을 수 없다. 이모지를 남기면 이 목록만
         옛 말투로 남으므로 이름만 쓴다 (그림은 고른 뒤 화면에서 보인다). */
      function (p) { return p.name; });
    renderWorkers(state);
    badge($('b-worker'), state.workers.length > 0, state.workers.length + '명', '미설정');

    renderSummary(state);
  }

  function deleteButton(label, onClick) {
    var row = UI.el('div', 'btn-row');
    var btn = UI.el('button', 'btn-sm danger', '삭제');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
    return row;
  }

  function renderProcesses(state) {
    var list = $('list-proc');
    list.textContent = '';
    if (!state.processes.length) {
      list.appendChild(UI.emptyRow('아직 등록된 공정이 없습니다. 위에서 하나 추가해 주세요.'));
      return;
    }
    state.processes.forEach(function (p) {
      var used = state.equipments.filter(function (e) { return e.processId === p.id; }).length;
      var li = UI.itemRow(p.icon, p.name, used ? '설비 ' + used + '대' : '설비 없음');
      li.appendChild(deleteButton(p.name + ' 공정 삭제', function () { removeProcess(p); }));
      list.appendChild(li);
    });
  }

  function renderEquipments(state) {
    var list = $('list-equip');
    list.textContent = '';
    if (!state.equipments.length) {
      list.appendChild(UI.emptyRow('아직 등록된 설비가 없습니다.'));
      return;
    }
    state.equipments.forEach(function (eq) {
      var spec = [eq.maker, eq.model, eq.year].filter(function (v) { return v; }).join(' · ');
      var li = UI.itemRow(eq.icon, eq.name,
        processName(state, eq.processId) + (spec ? ' · ' + spec : ''));

      var tags = UI.el('div', 'tags');
      var hazards = Array.isArray(eq.hazards) ? eq.hazards : [];
      if (!hazards.length) {
        tags.appendChild(UI.el('span', 'badge badge-neutral', '위험유형 없음'));
      } else {
        hazards.forEach(function (code) {
          var h = Store.hazard(code);
          if (h) tags.appendChild(UI.badge('badge-wait', h.icon, h.label));
        });
      }
      li.querySelector('.body').appendChild(tags);

      li.appendChild(deleteButton(eq.name + ' 설비 삭제', function () { removeEquipment(eq); }));
      list.appendChild(li);
    });
  }

  function renderWorkers(state) {
    var list = $('list-worker');
    list.textContent = '';
    if (!state.workers.length) {
      list.appendChild(UI.emptyRow('아직 등록된 노동자가 없습니다.'));
      return;
    }
    state.workers.forEach(function (w) {
      var li = UI.itemRow('helmet', w.id, langName(w.lang) + ' · ' + processName(state, w.processId));
      li.appendChild(deleteButton(w.id + ' 삭제', function () { removeWorker(w); }));
      list.appendChild(li);
    });
  }

  function renderSummary(state) {
    var steps = [
      { what: '1. 사업장 기본정보', done: !!state.site.name,          note: state.site.name || '미입력' },
      { what: '2. 사용 언어',      done: state.languages.length > 0,  note: state.languages.length + '개' },
      { what: '3. 공정',           done: state.processes.length > 0,  note: state.processes.length + '개' },
      { what: '4. 설비',           done: state.equipments.length > 0, note: state.equipments.length + '대' },
      { what: '5. 노동자',         done: state.workers.length > 0,    note: state.workers.length + '명' }
    ];

    var list = $('checklist');
    list.textContent = '';
    steps.forEach(function (s) {
      var li = UI.el('li');
      li.setAttribute('data-done', s.done ? 'yes' : 'no');
      li.appendChild(UI.el('span', 'what', s.what));
      li.appendChild(s.done ? UI.okBadge(s.note) : UI.neutralBadge(s.note));
      list.appendChild(li);
    });

    function kpi(node, value, unit) {
      node.textContent = '';
      node.appendChild(document.createTextNode(String(value)));
      node.appendChild(UI.el('small', null, unit));
    }
    kpi($('kpi-equip'), state.equipments.length, '대');
    kpi($('kpi-worker'), state.workers.length, '명');

    var at = Store.setup.updatedAt();
    $('updated-at').textContent = at
      ? '마지막 저장 ' + UI.formatDate(at)
      : '아직 저장된 내용이 없습니다.';
  }

  /* -----------------------------------------------------------------
     쓰기 — 전부 Store.setup.update 한 사이클을 지난다
     ----------------------------------------------------------------- */

  function commit(fn, message) {
    var result = Store.setup.update(fn);
    render();
    if (!result.ok) {
      UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
    } else if (message) {
      UI.toast(message);
    }
  }

  function removeProcess(p) {
    var state = Store.setup.load();
    var equipCount = state.equipments.filter(function (e) { return e.processId === p.id; }).length;
    var workerCount = state.workers.filter(function (w) { return w.processId === p.id; }).length;

    // 공정을 지우면 그 아래 설비와 노동자의 소속이 사라진다. 무엇이 함께 지워지는지 먼저 말한다.
    var msg = '"' + p.name + '" 공정을 삭제할까요?';
    if (equipCount || workerCount) {
      msg += '\n\n설비 ' + equipCount + '대와 노동자 ' + workerCount + '명도 함께 삭제됩니다.';
    }
    if (!window.confirm(msg)) return;

    commit(function (s) {
      s.processes = s.processes.filter(function (x) { return x.id !== p.id; });
      s.equipments = s.equipments.filter(function (x) { return x.processId !== p.id; });
      s.workers = s.workers.filter(function (x) { return x.processId !== p.id; });
    }, '공정을 삭제했습니다.');
  }

  function removeEquipment(eq) {
    if (!window.confirm('"' + eq.name + '" 설비를 삭제할까요?')) return;
    commit(function (s) {
      s.equipments = s.equipments.filter(function (x) { return x.id !== eq.id; });
    }, '설비를 삭제했습니다.');
  }

  function removeWorker(w) {
    if (!window.confirm('"' + w.id + '" 을(를) 삭제할까요?')) return;
    commit(function (s) {
      s.workers = s.workers.filter(function (x) { return x.id !== w.id; });
    }, '노동자를 삭제했습니다.');
  }

  function bindEvents() {
    /* 1. 사업장 */
    $('form-site').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('site-name').value.trim();
      if (!name) { UI.toast('사업장명을 입력해 주세요.'); $('site-name').focus(); return; }
      var size = $('site-size').value;
      commit(function (s) { s.site.name = name; s.site.sizeBand = size; }, '사업장 정보를 저장했습니다.');
    });

    /* 2. 언어 — 고르는 즉시 저장 */
    $('pick-lang').addEventListener('change', function () {
      var picked = UI.checkedValues('lang');
      commit(function (s) { s.languages = picked; });
    });

    /* 3. 공정 */
    $('form-proc').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('proc-name').value.trim();
      if (!name) { UI.toast('공정 이름을 입력해 주세요.'); $('proc-name').focus(); return; }

      if (Store.findBy(Store.setup.load().processes, 'name', name)) {
        UI.toast('같은 이름의 공정이 이미 있습니다.');
        return;
      }

      var icon = UI.pickedValue('proc-icon') || Store.ICONS[0];
      commit(function (s) {
        s.processes.push({ id: Store.uid(), name: name, icon: icon });
      }, '공정을 추가했습니다.');
      $('proc-name').value = '';
      $('proc-name').focus();
    });

    /* 4. 설비 */
    $('form-equip').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('equip-name').value.trim();
      if (!name) { UI.toast('설비 이름을 입력해 주세요.'); $('equip-name').focus(); return; }

      var processId = $('equip-proc').value;
      if (!processId) { UI.toast('소속 공정을 골라 주세요.'); return; }

      var hazards = UI.checkedValues('hazard');
      var icon = UI.pickedValue('equip-icon') || Store.ICONS[0];

      /* 제조사·모델명·연식 — AI 리서치(PRD-AD-08 S1)용. 선택이라 비어도 된다.
         연식은 숫자로만 받고, 범위 밖이면 버린다 (잘못된 값으로 리서치하지 않게) */
      var maker = $('equip-maker').value.trim().slice(0, 60);
      var model = $('equip-model').value.trim().slice(0, 60);
      var yearNum = Number($('equip-year').value);
      var year = Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? yearNum : null;

      commit(function (s) {
        s.equipments.push({
          id: Store.uid(), processId: processId, name: name,
          icon: icon, hazards: hazards, note: '',
          maker: maker, model: model, year: year
        });
      }, '설비를 추가했습니다.');

      $('equip-name').value = '';
      $('equip-maker').value = '';
      $('equip-model').value = '';
      $('equip-year').value = '';
      // 위험유형은 초기화한다. 다음 설비에 앞 설비의 위험이 딸려 들어가면 안 된다.
      UI.$$('input[name="hazard"]').forEach(function (n) { n.checked = false; });
      $('equip-name').focus();
    });

    /* 5. 노동자 */
    $('form-worker').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = $('worker-id').value.trim();
      if (!id) { UI.toast('식별번호를 입력해 주세요.'); $('worker-id').focus(); return; }

      if (Store.findBy(Store.setup.load().workers, 'id', id)) {
        UI.toast('이미 등록된 식별번호입니다.');
        return;
      }

      var lang = $('worker-lang').value;
      var processId = $('worker-proc').value;
      if (!lang || !processId) { UI.toast('언어와 공정을 골라 주세요.'); return; }

      commit(function (s) {
        s.workers.push({ id: id, lang: lang, processId: processId });
      }, '노동자를 추가했습니다.');

      $('worker-id').value = '';
      $('worker-id').focus();
    });

    /* 데이터 주고받기 — 8개 키 전부를 함께 다룬다.
       설비만 옮기고 교육 이력을 두고 오면 화면이 서로 어긋난다. */
    $('btn-export').addEventListener('click', function () {
      $('jsonbox').value = Store.exportAll();
      $('jsonbox').select();
      UI.toast('JSON 을 아래 상자에 꺼냈습니다. 복사해 두세요.');
    });

    $('btn-import').addEventListener('click', function () {
      var text = $('jsonbox').value.trim();
      if (!text) { UI.toast('불러올 JSON 을 아래 상자에 붙여넣어 주세요.'); return; }
      if (!window.confirm('지금 저장된 내용을 붙여넣은 JSON 으로 덮어씁니다. 계속할까요?')) return;

      var result = Store.importAll(text);
      if (!result.ok) { UI.toast('불러오지 못했습니다 — ' + result.reason); return; }
      render();
      UI.toast('불러왔습니다.');
    });

    $('btn-reset').addEventListener('click', function () {
      if (!window.confirm('이 브라우저에 저장된 내용을 전부 지웁니다.\n계정과 로그인도 함께 지워집니다.\n계속할까요?')) return;
      Store.resetAll();
      location.href = '../index.html';
    });

    /* 다른 탭에서 같은 페이지를 열어 두고 고쳤을 때 이 탭도 따라간다 */
    window.addEventListener('storage', function (e) {
      if (e.key === Store.setup.KEY) render();
    });
  }

  buildStaticControls();
  bindEvents();
  render();
})();
