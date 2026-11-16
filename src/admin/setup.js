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

    UI.fillSelect($('equip-kind'), Store.EQUIPMENT_KINDS,
      function (k) { return k.id; }, function (k) { return k.label; });

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

  /* ── 특별교육 대상 안내 (PRD-AD-01 FR-08·09) ─────────────────────────

     ★ **판정이 아니라 안내다.** 「5대 이상」·「1톤 이상」·「75V 이상」 같은
       조건은 담당자만 안다. 그래서 조건을 함께 적고 **저장을 막지 않는다.**
     ★ 체크칸은 **기본 해제**다 (FR-09). 낱말이 걸렸다고 우리가 표시해 두면
       조건을 모르는 채로 「특별교육 대상」이라고 단정하는 셈이 된다.
     ★ 낱말 표는 `assets/curriculum.js` 한 곳이다 (C06 D-046). 여기에 다시 적지 않는다. */

  /** 지금 이름으로 걸리는 작업 번호들 — 체크했을 때 설비에 저장할 값 */
  function specialJobs() {
    var m = Curriculum.equipMatch($('equip-name').value);
    return m.length ? m[0].jobs : [];
  }

  function renderSpecialNote(keepChecked) {
    var box = $('equip-special');
    var was = keepChecked === undefined ? (($('equip-special-on') || {}).checked || false) : keepChecked;
    box.textContent = '';
    var m = Curriculum.equipMatch($('equip-name').value);
    if (!m.length) { box.hidden = true; return; }
    box.hidden = false;

    var hit = m[0];
    var names = hit.jobs.map(function (no) {
      var j = Curriculum.job(no);
      return j ? j.title + '(별표 5 제' + no + '호)' : '별표 5 제' + no + '호';
    }).join(' · ');

    var note = UI.el('div', 'special-note');
    var head = UI.el('p', 'head');
    head.appendChild(document.createTextNode('⚠ 특별교육 대상일 수 있습니다'));
    note.appendChild(head);
    note.appendChild(UI.el('span', 'what', names));
    note.appendChild(UI.el('span', 'when', hit.when
      ? '해당 조건 — ' + hit.when + '. 이 설비에서 일할 사람은 특별교육을 받아야 합니다 (일용직 2시간 · 그 밖 16시간).'
      : '이 설비에서 일할 사람은 특별교육을 받아야 합니다 (일용직 2시간 · 그 밖 16시간).'));

    /* 조건에 맞는지는 담당자가 안다 — 표시할지 말지도 담당자가 고른다 (FR-09) */
    var pick = UI.el('label', 'pick');
    var box2 = UI.el('input');
    box2.type = 'checkbox';
    box2.id = 'equip-special-on';
    box2.checked = !!was;
    pick.appendChild(box2);
    pick.appendChild(UI.el('span', null, '특별교육 대상 설비로 표시'));
    note.appendChild(pick);

    box.appendChild(note);
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
      li.setAttribute('data-id', eq.id);

      var tags = UI.el('div', 'tags');
      /* 종류 — 없던 옛 설비는 이름으로 짐작한 값을 「확인 필요」로 보인다 */
      var kind = Store.kindOf(eq);
      var kLabel = (Store.equipmentKind(kind.id) || {}).label;
      tags.appendChild(kind.guessed
        ? UI.stopBadge('종류 확인 필요' + (kLabel ? ' (' + kLabel + '?)' : ''))
        : UI.okBadge('종류 · ' + kLabel));
      /* 🆕 담당자가 표시한 설비에만 단다 (FR-AD-01-09). 우리가 짐작해서 달지 않는다 */
      if (Array.isArray(eq.specialWork) && eq.specialWork.length) {
        var jobNames = eq.specialWork.map(function (no) {
          var j = Curriculum.job(no);
          return j ? j.title : '제' + no + '호';
        }).join(' · ');
        tags.appendChild(UI.waitBadge('특별교육 · ' + jobNames));
      }
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

      /* 설비 탭이 원천 — 사진과 AI 위험요소 분석 결과를 여기서 보인다 */
      if (eq.photo && /^data:image\//.test(eq.photo)) {
        var im = UI.el('img', 'equip-photo');
        im.src = eq.photo;
        im.alt = eq.name + ' 사진';
        li.querySelector('.body').appendChild(im);
      }
      li.querySelector('.body').appendChild(UI.el('p', 'meta', analysisLine(eq)));
      var go = UI.el('a', 'btn-sm', eq.analysis ? '분석 결과 보기 · 교육 만들기' : 'AI 분석 · 교육 만들기');
      go.href = 'autogen.html#eq=' + encodeURIComponent(eq.id);
      li.querySelector('.body').appendChild(go);
      /* 휴대폰으로 설비 둘레 찍기 — 3D·여러 각도 재료 (시제품) */
      var cam = UI.el('a', 'equip-scan-btn', '둘레 촬영');
      cam.insertBefore(UI.iconBox('camera', 'ico'), cam.firstChild);
      cam.href = 'scan.html?equipment=' + encodeURIComponent(eq.id);
      cam.setAttribute('aria-label', eq.name + ' 둘레 촬영 — 카메라 위 안내를 따라 두 바퀴');
      li.querySelector('.body').appendChild(cam);

      var ed = UI.el('button', 'btn-sm', '수정');
      ed.type = 'button';
      ed.setAttribute('aria-label', eq.name + ' 설비 수정');
      ed.addEventListener('click', function () { startEdit(eq); });
      li.appendChild(ed);
      li.appendChild(deleteButton(eq.name + ' 설비 삭제', function () { removeEquipment(eq); }));
      list.appendChild(li);
    });
  }

  /** 「AI 분석: 위험 16 · 사진 위치 9 · 위치 확인 필요 7 · 11월 11일」 */
  function analysisLine(eq) {
    var a = eq.analysis;
    if (!a || !a.research || !Array.isArray(a.research.items)) return 'AI 분석 없음' + (eq.photo ? '' : ' · 사진 없음');
    var n = a.research.items.length;
    var m = a.guided && Array.isArray(a.guided.mapped) ? a.guided.mapped.length : 0;
    return 'AI 분석: 위험 ' + n + ' · 사진 위치 ' + m + ' · 위치 확인 필요 ' + (n - m) + (a.at ? ' · ' + UI.formatDate(a.at) : '');
  }

  /* ── 설비 사진 · 수정 ─────────────────────────────────────────── */

  var PHOTO_MAX = 640;      // 긴 변 — 동기화 상한(512KB)에 설비 여러 대가 들어가게
  var PHOTO_QUALITY = 0.7;
  var pendingPhoto = null;  // null = 그대로 · '' = 지움 · data URL = 새 사진

  function shrinkPhoto(file, done) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var out = '';
      try {
        var scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', PHOTO_QUALITY);
      } catch (e) { out = ''; }
      URL.revokeObjectURL(url);
      done(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); done(''); };
    img.src = url;
  }

  function showPreview(data) {
    var p = $('equip-photo-preview');
    p.hidden = !data;
    if (data) p.src = data; else p.removeAttribute('src');
  }

  /** 사진 칸 아래 [둘레 촬영] — 저장된 설비(수정 중)만 연다. 새 설비는 저장해야 id 가 생긴다 */
  function scanEntry(id) {
    var a = $('btn-equip-scan');
    a.hidden = !id;
    $('equip-scan-hint').hidden = !!id;
    if (id) a.href = 'scan.html?equipment=' + encodeURIComponent(id);
  }

  function startEdit(eq) {
    $('equip-edit-id').value = eq.id;
    $('equip-name').value = eq.name || '';
    $('equip-proc').value = eq.processId || '';
    $('equip-kind').value = Store.kindOf(eq).id || 'other';
    $('equip-maker').value = eq.maker || '';
    $('equip-model').value = eq.model || '';
    $('equip-year').value = eq.year || '';
    UI.$$('input[name="hazard"]').forEach(function (n) { n.checked = (eq.hazards || []).indexOf(n.value) !== -1; });
    /* 🆕 저장해 둔 특별교육 표시를 되살린다 — 수정하다 꺼지면 조용히 표시가 풀린다 */
    renderSpecialNote(Array.isArray(eq.specialWork) && eq.specialWork.length > 0);
    pendingPhoto = null;
    showPreview(eq.photo || '');
    scanEntry(eq.id);
    $('btn-equip-save').lastChild.textContent = ' 수정 저장';
    $('btn-equip-cancel').hidden = false;
    $('equip-name').focus();
  }

  function resetEquipForm() {
    $('equip-edit-id').value = '';
    $('equip-name').value = '';
    $('equip-maker').value = '';
    $('equip-model').value = '';
    $('equip-year').value = '';
    // 위험유형은 초기화한다. 다음 설비에 앞 설비의 위험이 딸려 들어가면 안 된다.
    UI.$$('input[name="hazard"]').forEach(function (n) { n.checked = false; });
    renderSpecialNote(false);   // 🆕 특별교육 표시도 다음 설비로 딸려 가지 않는다
    pendingPhoto = null;
    showPreview('');
    scanEntry('');
    $('btn-equip-save').lastChild.textContent = ' 설비 추가';
    $('btn-equip-cancel').hidden = true;
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

    /* 🆕 설비 이름을 적는 동안 특별교육 대상 안내 (PRD-AD-01 FR-08·09) */
    $('equip-name').addEventListener('input', function () { renderSpecialNote(); });

    /* 4. 설비 */
    $('form-equip').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('equip-name').value.trim();
      if (!name) { UI.toast('설비 이름을 입력해 주세요.'); $('equip-name').focus(); return; }

      var processId = $('equip-proc').value;
      if (!processId) { UI.toast('소속 공정을 골라 주세요.'); return; }

      var hazards = UI.checkedValues('hazard');
      var icon = UI.pickedValue('equip-icon') || Store.ICONS[0];
      var kind = Store.equipmentKind($('equip-kind').value) ? $('equip-kind').value : 'other';
      var editId = $('equip-edit-id').value;

      /* 제조사·모델명·연식 — AI 리서치(PRD-AD-08 S1)용. 선택이라 비어도 된다.
         연식은 숫자로만 받고, 범위 밖이면 버린다 (잘못된 값으로 리서치하지 않게) */
      var maker = $('equip-maker').value.trim().slice(0, 60);
      var model = $('equip-model').value.trim().slice(0, 60);
      var yearNum = Number($('equip-year').value);
      var year = Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? yearNum : null;

      /* 🆕 체크했을 때만 작업 번호를 남긴다. 이름이 바뀌어 낱말이 사라졌으면 빈 배열 (FR-09) */
      var special = ($('equip-special-on') || {}).checked ? specialJobs() : [];

      var photo = pendingPhoto;
      var message = '설비를 추가했습니다.';
      commit(function (s) {
        if (!editId) {
          s.equipments.push({
            id: Store.uid(), processId: processId, name: name, kind: kind,
            icon: icon, hazards: hazards, note: '',
            maker: maker, model: model, year: year,
            photo: photo || '', analysis: null,
            /* 🆕 특별교육 대상 표시 — 담당자가 체크했을 때만 (FR-AD-01-09) */
            specialWork: special
          });
          return;
        }
        var eq = Store.findBy(s.equipments, 'id', editId);
        if (!eq) return;
        /* ★ 종류·제조사·모델·사진이 바뀌면 예전 AI 분석은 이 설비의 것이 아니다 — 지운다 (다시 분석) */
        var changed = eq.kind !== kind || (eq.maker || '') !== maker || (eq.model || '') !== model || (photo !== null && photo !== eq.photo);
        eq.processId = processId; eq.name = name; eq.kind = kind; eq.icon = icon; eq.hazards = hazards;
        eq.maker = maker; eq.model = model; eq.year = year;
        eq.specialWork = special;
        if (photo !== null) eq.photo = photo;
        if (changed && eq.analysis) { eq.analysis = null; message = '수정했습니다. 종류·모델·사진이 바뀌어 AI 분석 결과를 지웠습니다 — 다시 분석해 주세요.'; }
        else message = '수정했습니다.';
      }, editId ? null : message);
      if (editId) UI.toast(message);

      resetEquipForm();
      if (new URLSearchParams(location.search).get('return') === 'content') {
        $('return-note').hidden = false;
        $('return-link').focus();
      } else {
        $('equip-name').focus();
      }
    });

    $('equip-photo').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      shrinkPhoto(f, function (data) {
        if (!data) { UI.toast('사진을 읽지 못했습니다. 다른 사진으로 해 주세요.'); return; }
        pendingPhoto = data;
        showPreview(data);
      });
    });
    $('btn-equip-cancel').addEventListener('click', resetEquipForm);

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
  /* 콘텐츠에서 「설비 등록하러 가기」로 왔다 — 돌아가는 길을 처음부터 보인다 */
  if (new URLSearchParams(location.search).get('return') === 'content') $('return-note').hidden = false;
})();
