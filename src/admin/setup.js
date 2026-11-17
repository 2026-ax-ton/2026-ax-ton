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

    /* 6종 밖의 공식 분류 — 묶음별 드롭다운 */
    var more = $('hazard-add');
    var first = UI.el('option', null, '목록에서 더 고르기…');
    first.value = '';
    more.appendChild(first);
    Store.HAZARD_GROUPS.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g.label;
      Store.HAZARD_TYPES.forEach(function (h) {
        if (h.group !== g.id || Store.findBy(Store.HAZARDS, 'code', h.code)) return;
        var o = UI.el('option', null, h.label);
        o.value = h.code;
        og.appendChild(o);
      });
      more.appendChild(og);
    });

    UI.fillSelect($('equip-kind'), Store.EQUIPMENT_KINDS,
      function (k) { return k.id; }, function (k) { return k.label; });
    /* 🆕 2026-11-16 픽토그램 고르기 없음 (공정·설비 둘 다) — 저장 칸(icon)은 다른 화면이 읽어 값만 자동으로 둔다 */
  }

  /** 위험유형 칩 — 6종은 늘 있고, 목록·직접 입력으로 더한 것은 그때 붙인다 */
  function addHazardChip(code, checked) {
    var h = Store.hazard(code);
    if (!h) return;
    var have = UI.$$('input[name="hazard"]').filter(function (n) { return n.value === code; })[0];
    if (have) { have.checked = checked !== false; return; }
    $('pick-hazard').appendChild(UI.chip({ type: 'checkbox', name: 'hazard', value: code, icon: h.icon, label: h.label, checked: checked !== false }));
  }
  /** 폼의 위험유형을 이 목록으로 맞춘다 — 6종 밖의 칩은 지우고 다시 붙인다 */
  function setHazards(codes) {
    UI.$$('input[name="hazard"]').forEach(function (n) {
      if (Store.findBy(Store.HAZARDS, 'code', n.value)) n.checked = codes.indexOf(n.value) !== -1;
      else n.closest('label').remove();
    });
    codes.forEach(function (c) { addHazardChip(c, true); });
  }

  /* -----------------------------------------------------------------
     화면 나누기 — 상세 메뉴(설비 ▾)의 항목마다 한 부분만 보인다
     ----------------------------------------------------------------- */
  var VIEWS = ['site', 'equip', 'list', 'workers', 'backup'];
  var forcedView = '';   // 주소의 # 를 못 바꾸는 곳(검사·옛 브라우저)에서 코드가 정한 화면
  function currentView() {
    var v = location.hash.replace('#', '');
    if (VIEWS.indexOf(v) !== -1) return v;
    if (forcedView) return forcedView;
    return Store.setup.load().processes.length ? 'equip' : 'site';
  }
  /** 코드가 화면을 옮긴다 — 주소도 바꿔 뒤로 가기·메뉴 표시가 따라오게 한다 */
  function goView(v) {
    forcedView = v;
    try { if (location.hash !== '#' + v) location.hash = '#' + v; } catch (e) { /* 주소를 못 바꿔도 화면은 옮긴다 */ }
    showView();
  }
  function showView() {
    var v = currentView();
    UI.$$('[data-view]').forEach(function (n) { n.hidden = n.getAttribute('data-view') !== v; });
    UI.$$('.viewtabs a').forEach(function (a) {
      if (a.getAttribute('href') === '#' + v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    /* 수정 중에 다른 화면으로 가면 수정을 접는다 — 등록 폼에 남은 값이 새 설비로 들어가지 않게 */
    if (v !== 'list' && $('equip-edit-id').value) resetEquipForm();
    if (v !== 'equip') $('equip-added').hidden = true;
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
      li.removeChild(li.firstChild);   // 픽토그램은 보이지 않는다 (2026-11-16)
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
      li.removeChild(li.firstChild);   // 픽토그램은 보이지 않는다 (2026-11-16)
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
      /* 검수 대기 설비는 교육을 만들 수 없다 — 버튼 대신 이유를 보인다 */
      if (Store.equipmentReady(eq)) {
        var go = UI.el('a', 'btn-sm', eq.analysis ? '분석 결과 보기 · 교육 만들기' : 'AI 분석 · 교육 만들기');
        go.href = 'autogen.html#eq=' + encodeURIComponent(eq.id);
        li.querySelector('.body').appendChild(go);
      } else {
        li.querySelector('.body').appendChild(UI.el('p', 'meta', '검수 대기 — 아래 AI 검수를 승인해야 교육을 만들 수 있습니다'));
      }
      /* 가이드 촬영 — 카메라 위 틀·수평선·자세 교정, 선명한 장면을 알아서 찍는다 */
      var cam = UI.el('a', 'equip-scan-btn', '카메라로 찍기 (가이드 촬영)');
      cam.insertBefore(UI.iconBox('camera', 'ico'), cam.firstChild);
      cam.href = scanUrl(eq.id);
      cam.setAttribute('aria-label', eq.name + ' 카메라로 찍기 — 카메라 위 안내를 따라 둘레를 돈다');
      li.querySelector('.body').appendChild(cam);
      li.querySelector('.body').appendChild(reviewBlock(eq));

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

  /* ── 등록 정보 AI 1차 검수 (🆕 2026-11-16) ───────────────────────────
     /api/research 에 verify 를 붙여 부른다 — 「설비 자료조사」(autogen)와 같은 함수·같은 출처 규칙.
     ★ AI 는 제안만 한다. 설비 값은 담당자가 항목마다 [승인]할 때만 바뀐다.
     ★ 서버를 못 부르는 곳(file://·끊김)에서는 「검수 못 함」으로 남기고 등록은 그대로 둔다 */
  var REVIEW_TIMEOUT_MS = 70000;
  var REVIEW_STALE_MS = 2 * 60 * 1000;   // 확인 중에 화면을 떠나 멈춘 것 — 다시 검수 버튼을 보인다

  function kindLabelOf(id) { return (Store.equipmentKind(id) || {}).label || '기타'; }

  /** 확인할 항목 — 담당자가 적은 값만 (빈 칸은 묻지 않는다) */
  function claimsOf(eq) {
    var list = [{ key: 'kind', field: '설비 종류', value: kindLabelOf(Store.kindOf(eq).id) }];
    if (eq.maker) list.push({ key: 'maker', field: '제조사', value: eq.maker });
    if (eq.model) list.push({ key: 'model', field: '모델명', value: eq.model });
    if (eq.year) list.push({ key: 'year', field: '연식', value: String(eq.year) });
    (eq.hazards || []).forEach(function (code, i) {
      var h = Store.hazard(code);
      if (h) list.push({ key: 'hazard:' + i, field: '위험유형', value: h.label, code: code });
    });
    return list;
  }

  function sameItem(a, b) { return a.key === b.key && (a.claim || '') === (b.claim || '') && (a.suggest || '') === (b.suggest || ''); }

  function runReview(id) {
    var eq = Store.findBy(Store.setup.load().equipments, 'id', id);
    if (!eq) return;
    var old = eq.review && Array.isArray(eq.review.items) ? eq.review.items : [];
    var claims = claimsOf(eq).map(function (c) {
      var o = old.filter(function (x) { return x.key === c.key && x.claim === c.value && x.decision === 'redo'; })[0];
      return { key: c.key, field: c.field, value: c.value, code: c.code, note: o ? o.note || '' : '' };
    });
    setReview(id, function (r) { r.status = 'checking'; r.at = new Date().toISOString(); r.message = ''; });
    Net.post('/api/research', {
      equipment: { id: eq.id, kind: Store.kindOf(eq).id, name: eq.name, maker: eq.maker || '', model: eq.model || '', year: eq.year || null },
      verify: {
        claims: claims.map(function (c) { return { key: c.key, field: c.field, value: c.value, note: c.note }; }),
        allowed: Store.HAZARD_TYPES.map(function (h) { return h.label; })
      }
    }, { token: Auth.token(), timeoutMs: REVIEW_TIMEOUT_MS }).then(function (r) {
      if (!r.ok || !r.data || !r.data.verify) {
        var why = r.failed ? 'AI 검수는 배포 주소(https)에서 서버에 닿을 때만 됩니다.' : ((r.data && r.data.message) || 'AI 가 답하지 못했습니다.');
        setReview(id, function (rv) { rv.status = 'error'; rv.message = why + ' 등록 정보는 그대로 저장돼 있습니다.'; });
        return;
      }
      var v = r.data.verify;
      var fresh = (v.checks || []).concat(v.missing || []).map(function (x) {
        var c = claims.filter(function (k) { return k.key === x.key; })[0];
        return {
          key: x.key, field: x.field, claim: x.claim || '', code: c ? c.code || '' : '',
          verdict: x.verdict, suggest: x.suggest || '', label: x.label || '', reason: x.reason || '',
          sources: (x.sources || []).slice(0, 3).map(function (s) { return { title: s.title, url: s.url, host: s.host }; }),
          decision: '', note: c ? c.note : ''
        };
      });
      setReview(id, function (rv) {
        /* 담당자가 이미 승인·삭제한 같은 항목은 그 판정을 지킨다 */
        rv.items = fresh.map(function (x) {
          var kept = old.filter(function (o) { return (o.decision === 'approved' || o.decision === 'deleted') && sameItem(o, x); })[0];
          return kept || x;
        });
        /* ★ 항목이 하나도 없으면 저절로 승인되지 않는다 — 사람이 [AI 없이 담당자가 확인 · 승인]으로 정한다 */
        if (!rv.items.length) { rv.status = 'error'; rv.message = 'AI 가 확인한 항목이 없습니다.'; }
        else rv.status = rv.items.some(function (x) { return !x.decision; }) ? 'waiting' : 'approved';
        rv.model = r.data.model || '';
        rv.at = new Date().toISOString();
      });
    });
  }

  function setReview(id, fn) {
    commit(function (s) {
      var eq = Store.findBy(s.equipments, 'id', id);
      if (!eq) return;
      eq.review = eq.review && typeof eq.review === 'object' ? eq.review : { items: [] };
      if (!Array.isArray(eq.review.items)) eq.review.items = [];
      fn(eq.review);
    });
  }

  /** 승인했을 때 바뀌는 것 — 버튼 옆에 미리 말한다 */
  function applyText(it) {
    if (it.key.indexOf('add:') === 0) return '승인하면 위험유형에 「' + it.label + '」을(를) 더합니다';
    if (it.verdict !== 'wrong') return '승인하면 적은 값을 그대로 확정합니다';
    if (it.key.indexOf('hazard:') === 0) return '승인하면 위험유형에서 「' + it.claim + '」을(를) 뺍니다';
    if (!it.suggest) return '승인하면 적은 값을 그대로 둡니다 (AI 가 바른 값을 못 냄)';
    return '승인하면 ' + it.field + '을(를) 「' + it.suggest + '」(으)로 바꿉니다';
  }

  function decide(eqId, idx, decision, note) {
    var message = '';
    commit(function (s) {
      var eq = Store.findBy(s.equipments, 'id', eqId);
      var it = eq && eq.review && eq.review.items[idx];
      if (!it) return;
      it.decision = decision;
      if (note !== undefined) it.note = note;
      if (decision === 'approved') {
        var hz = Array.isArray(eq.hazards) ? eq.hazards : [];
        var before = eq.kind + '|' + eq.maker + '|' + eq.model;
        if (it.key.indexOf('add:') === 0) {
          var code = Store.customHazard(it.label);
          if (code && hz.indexOf(code) === -1) hz.push(code);
        } else if (it.verdict === 'wrong' && it.key.indexOf('hazard:') === 0) {
          hz = hz.filter(function (c) { return c !== it.code; });
        } else if (it.verdict === 'wrong' && it.suggest) {
          if (it.key === 'kind') {
            var k = Store.EQUIPMENT_KINDS.filter(function (x) { return it.suggest.indexOf(x.label) !== -1; })[0];
            if (k) { eq.kind = k.id; eq.icon = Store.kindIcon(k.id); }
            else message = 'AI 가 낸 종류 「' + it.suggest + '」는 목록에 없어 바꾸지 않았습니다.';
          }
          if (it.key === 'maker') eq.maker = it.suggest.slice(0, 60);
          if (it.key === 'model') eq.model = it.suggest.slice(0, 60);
          if (it.key === 'year') { var y = parseInt(it.suggest, 10); if (y >= 1950 && y <= 2100) eq.year = y; }
        }
        eq.hazards = hz;
        if (before !== eq.kind + '|' + eq.maker + '|' + eq.model && eq.analysis) eq.analysis = null;   // 다른 설비의 분석이 남지 않게
      }
      eq.review.status = eq.review.items.some(function (x) { return !x.decision || x.decision === 'redo'; }) ? 'waiting' : 'approved';
    }, message || (decision === 'approved' ? '승인했습니다.' : decision === 'deleted' ? '이 AI 결과를 버렸습니다. 적은 값은 그대로입니다.' : ''));
  }

  var VERDICT = {
    ok:      function () { return UI.okBadge('AI 조사 · 자료로 확인됨'); },
    wrong:   function () { return UI.stopBadge('AI 조사 · 자료와 다름'); },
    unknown: function () { return UI.waitBadge('AI 조사 · 자료를 못 찾음'); }
  };

  /** 설비 한 줄 아래의 검수 칸 */
  function reviewBlock(eq) {
    var box = UI.el('div', 'review');
    var rv = eq.review;
    var head = UI.el('div', 'review-head');
    box.appendChild(head);
    var again = UI.el('button', 'btn-sm', 'AI 검수 다시 받기');
    again.type = 'button';
    again.addEventListener('click', function () { runReview(eq.id); });
    /* AI 를 못 쓸 때(서버 없음·실패) — 담당자가 직접 확인하고 승인한다. 승인은 사람만 (AI 결과는 늘 대기) */
    var manual = UI.el('button', 'btn-sm', 'AI 없이 담당자가 확인 · 승인');
    manual.type = 'button';
    manual.addEventListener('click', function () {
      if (!window.confirm('"' + eq.name + '" 의 종류·제조사·모델·위험유형을 담당자가 직접 확인했습니까? 승인하면 교육 만들기에 쓸 수 있습니다.')) return;
      setReview(eq.id, function (r) { r.status = 'approved'; r.manual = true; r.at = new Date().toISOString(); });
    });

    var stale = rv && rv.status === 'checking' && (Date.now() - new Date(rv.at).getTime() > REVIEW_STALE_MS);
    if (!rv || stale) {
      head.appendChild(stale ? UI.waitBadge('검수 대기 · AI 검수가 멈췄습니다') : UI.neutralBadge('AI 검수 전'));
      head.appendChild(again);
      if (stale) head.appendChild(manual);
      return box;
    }
    if (rv.status === 'checking' || rv.status === 'queued') {
      head.appendChild(UI.waitBadge(rv.status === 'queued' ? '검수 대기 · 촬영 뒤 AI 검수를 시작합니다' : '검수 대기 · AI 가 공개 자료로 확인하는 중… (30초쯤)'));
      return box;
    }
    if (rv.status === 'error') {
      head.appendChild(UI.stopBadge('검수 대기 · AI 검수 못 함'));
      head.appendChild(UI.el('span', 'meta', rv.message || ''));
      head.appendChild(again);
      head.appendChild(manual);
      return box;
    }
    var open = rv.items.filter(function (x) { return !x.decision || x.decision === 'redo'; }).length;
    head.appendChild(open ? UI.waitBadge('검수 대기 · 승인할 항목 ' + open + '건') : UI.okBadge('AI 검수 · 담당자 승인 완료'));
    head.appendChild(again);

    var ul = UI.el('ul', 'review-items');
    rv.items.forEach(function (it, idx) {
      var li = UI.el('li', 'review-item' + (it.decision === 'deleted' ? ' is-deleted' : ''));
      var line = UI.el('div', 'review-line');
      line.appendChild(UI.el('b', null, it.field));
      if (it.claim) line.appendChild(UI.el('span', null, '적은 값: ' + it.claim));
      line.appendChild((VERDICT[it.verdict] || VERDICT.unknown)());
      li.appendChild(line);
      /* AI 가 조사한 부분 — 색 띠 + 「AI 조사」 글자 (색만으로 구분하지 않는다) */
      var ai = UI.el('div', 'ai-found');
      ai.appendChild(UI.el('span', 'ai-mark', 'AI 조사'));
      if (it.suggest) ai.appendChild(UI.el('b', null, (it.key.indexOf('add:') === 0 ? '추가 제안: ' : 'AI 가 찾은 값: ') + it.suggest));
      if (it.reason) ai.appendChild(UI.el('span', null, it.reason));
      (it.sources || []).forEach(function (s) {
        var a = UI.el('a', 'src', s.title || s.host);
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        ai.appendChild(a);
      });
      if (!(it.sources || []).length) ai.appendChild(UI.el('span', 'meta', '확인된 출처 없음'));
      li.appendChild(ai);

      if (it.decision === 'approved' || it.decision === 'deleted') {
        li.appendChild(UI.el('p', 'meta', it.decision === 'approved' ? '담당자 승인됨' : '삭제됨 — 적은 값 그대로'));
      } else {
        li.appendChild(UI.el('p', 'meta', applyText(it)));
        var row = UI.el('div', 'btn-row');
        var ok = UI.el('button', 'btn-sm', '승인');
        ok.type = 'button';
        ok.addEventListener('click', function () { decide(eq.id, idx, 'approved'); });
        var fix = UI.el('button', 'btn-sm', '수정');
        fix.type = 'button';
        var del = UI.el('button', 'btn-sm danger', '삭제');
        del.type = 'button';
        del.addEventListener('click', function () { decide(eq.id, idx, 'deleted'); });
        row.appendChild(ok); row.appendChild(fix); row.appendChild(del);
        li.appendChild(row);

        /* 수정 — 이 항목에 메모(지시)를 달아 AI 가 다시 조사한다 */
        var memo = UI.el('div', 'review-memo');
        memo.hidden = it.decision !== 'redo';
        var ta = UI.el('textarea');
        ta.rows = 2; ta.maxLength = 200;
        ta.placeholder = '예: 제조사는 화천기계가 맞는지, 영문 표기 Hwacheon 으로 다시 찾아 줘';
        ta.setAttribute('aria-label', it.field + ' 재조사 메모');
        ta.value = it.note || '';
        var go = UI.el('button', 'btn-sm', '이 메모로 재조사');
        go.type = 'button';
        go.addEventListener('click', function () {
          if (!ta.value.trim()) { UI.toast('AI 에게 다시 확인할 점을 적어 주세요.'); ta.focus(); return; }
          decide(eq.id, idx, 'redo', ta.value.trim().slice(0, 200));
          runReview(eq.id);
        });
        memo.appendChild(ta); memo.appendChild(go);
        fix.addEventListener('click', function () { memo.hidden = false; ta.focus(); });
        li.appendChild(memo);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
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

  /** 수정은 「등록 설비 확인·수정」 안에서 한다 — 같은 폼을 그 자리로 옮겨 온다 (등록 화면으로 돌아가지 않는다) */
  function startEdit(eq) {
    goView('list');
    var slot = $('equip-edit-slot');
    slot.appendChild($('form-equip'));
    slot.hidden = false;
    $('equip-edit-title').textContent = '설비 수정 — ' + (eq.name || '');
    $('equip-edit-id').value = eq.id;
    $('equip-name').value = eq.name || '';
    $('equip-proc').value = eq.processId || '';
    $('equip-kind').value = Store.kindOf(eq).id || 'other';
    $('equip-maker').value = eq.maker || '';
    $('equip-model').value = eq.model || '';
    $('equip-year').value = eq.year || '';
    setHazards(Array.isArray(eq.hazards) ? eq.hazards : []);
    /* 🆕 저장해 둔 특별교육 표시를 되살린다 — 수정하다 꺼지면 조용히 표시가 풀린다 (FR-AD-01-09) */
    renderSpecialNote(Array.isArray(eq.specialWork) && eq.specialWork.length > 0);
    pendingPhoto = null;
    showPreview(eq.photo || '');
    $('btn-equip-save').lastChild.textContent = ' 수정 저장';
    $('btn-equip-cancel').hidden = false;
    if (slot.scrollIntoView) slot.scrollIntoView({ block: 'start' });
    $('equip-name').focus();
  }

  function resetEquipForm() {
    $('equip-edit-id').value = '';
    $('equip-name').value = '';
    $('equip-maker').value = '';
    $('equip-model').value = '';
    $('equip-year').value = '';
    // 위험유형은 초기화한다. 다음 설비에 앞 설비의 위험이 딸려 들어가면 안 된다.
    setHazards([]);
    renderSpecialNote(false);   // 🆕 특별교육 표시도 다음 설비로 딸려 가지 않는다
    pendingPhoto = null;
    showPreview('');
    $('btn-equip-save').lastChild.textContent = ' 설비 추가';
    $('btn-equip-cancel').hidden = true;
    /* 폼을 등록 화면으로 되돌린다 */
    $('equip-form-home').appendChild($('form-equip'));
    $('equip-edit-slot').hidden = true;
  }

  /* ── 카메라로 찍기 (🆕 2026-11-16) = 가이드 촬영(scan.html) ──────────────────────
     틀·수평선·자세 교정이 카메라 위에 나오고, 둘레를 돌면 선명한 장면만 알아서 찍힌다.
     촬영 화면은 저장된 설비(id)에 사진을 붙인다 — 새 설비는 먼저 저장(검수 대기)하고 넘어간다 */
  function scanUrl(id) { return 'scan.html?equipment=' + encodeURIComponent(id) + '&return=list'; }
  var goScanAfterSave = false;
  function openGuidedCamera() {
    var editId = $('equip-edit-id').value;
    if (editId) { location.href = scanUrl(editId); return; }
    goScanAfterSave = true;   // 아래 저장이 끝나면 촬영으로 넘어간다
    $('form-equip').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    goScanAfterSave = false;
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

      var icon = '🏭';   // 고르지 않는다 — 다른 화면이 읽는 칸이라 값만 둔다
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
      var kind = Store.equipmentKind($('equip-kind').value) ? $('equip-kind').value : 'other';
      var icon = Store.kindIcon(kind);   // 픽토그램은 고르지 않는다 — 종류에서 정한다
      var editId = $('equip-edit-id').value;

      /* 🆕 2026-11-16 같은 이름의 설비는 받지 않는다 (교육·증빙에서 어느 설비인지 구분이 안 된다) */
      var norm = function (v) { return String(v || '').replace(/\s+/g, '').toLowerCase(); };
      if (Store.setup.load().equipments.some(function (x) { return x.id !== editId && norm(x.name) === norm(name); })) {
        UI.toast('동일한 이름을 가진 설비가 존재합니다. 다른 이름을 적거나 등록 설비에서 그 설비를 수정해 주세요.');
        $('equip-name').focus();
        return;
      }

      /* 제조사·모델명·연식 — AI 리서치(PRD-AD-08 S1)용. 선택이라 비어도 된다.
         연식은 숫자로만 받고, 범위 밖이면 버린다 (잘못된 값으로 리서치하지 않게) */
      var maker = $('equip-maker').value.trim().slice(0, 60);
      var model = $('equip-model').value.trim().slice(0, 60);
      var yearNum = Number($('equip-year').value);
      var year = Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? yearNum : null;

      /* 🆕 체크했을 때만 작업 번호를 남긴다. 이름이 바뀌어 낱말이 사라졌으면 빈 배열 (FR-AD-01-09) */
      var special = ($('equip-special-on') || {}).checked ? specialJobs() : [];
      var photo = pendingPhoto;
      var message = '설비를 추가했습니다.';
      var newId = editId ? '' : Store.uid();
      var recheck = !editId;   // 등록 정보가 바뀌었으면 AI 검수를 다시 한다
      commit(function (s) {
        if (!editId) {
          s.equipments.push({
            id: newId, processId: processId, name: name, kind: kind,
            icon: icon, hazards: hazards, note: '',
            maker: maker, model: model, year: year,
            photo: photo || '', analysis: null,
            /* 🆕 특별교육 대상 표시 — 담당자가 체크했을 때만 (FR-AD-01-09) */
            specialWork: special,
            /* 처음부터 검수 대기 — 담당자가 승인하기 전에는 교육 만들기에서 고를 수 없다 */
            review: { status: goScanAfterSave ? 'queued' : 'checking', at: new Date().toISOString(), items: [] }
          });
          return;
        }
        var eq = Store.findBy(s.equipments, 'id', editId);
        if (!eq) return;
        /* ★ 종류·제조사·모델·사진이 바뀌면 예전 AI 분석은 이 설비의 것이 아니다 — 지운다 (다시 분석) */
        var changed = eq.kind !== kind || (eq.maker || '') !== maker || (eq.model || '') !== model || (photo !== null && photo !== eq.photo);
        recheck = eq.kind !== kind || (eq.maker || '') !== maker || (eq.model || '') !== model || (eq.year || null) !== year ||
          (eq.hazards || []).join() !== hazards.join() || !eq.review;
        eq.processId = processId; eq.name = name; eq.kind = kind; eq.icon = icon; eq.hazards = hazards;
        eq.maker = maker; eq.model = model; eq.year = year;
        eq.specialWork = special;
        if (photo !== null) eq.photo = photo;
        if (changed && eq.analysis) { eq.analysis = null; message = '수정했습니다. 종류·모델·사진이 바뀌어 AI 분석 결과를 지웠습니다 — 다시 분석해 주세요.'; }
        else message = '수정했습니다.';
      }, editId ? null : message);
      if (editId) UI.toast(message + (recheck ? ' 바뀐 정보를 AI 가 다시 확인합니다.' : ''));

      resetEquipForm();
      /* [카메라로 찍기]로 저장했으면 바로 가이드 촬영으로 — AI 검수는 돌아온 뒤 시작한다 (넘어가면 요청이 끊긴다) */
      if (goScanAfterSave && newId) { location.href = scanUrl(newId); return; }
      if (recheck) runReview(editId || newId);
      if (!editId) {
        $('equip-added-text').textContent = '「' + name + '」을(를) 등록했습니다. AI 가 등록 정보를 공개 자료로 확인합니다 — 결과는 등록 설비에서 승인해 주세요.';
        $('equip-added').hidden = false;
      }
      if (new URLSearchParams(location.search).get('return') === 'content') {
        $('return-note').hidden = false;
        $('return-link').focus();
      } else {
        $('equip-name').focus();
      }
    });

    function onPhotoFile(ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      shrinkPhoto(f, function (data) {
        if (!data) { UI.toast('사진을 읽지 못했습니다. 다른 사진으로 해 주세요.'); return; }
        pendingPhoto = data;
        showPreview(data);
      });
    }
    $('equip-photo').addEventListener('change', onPhotoFile);
    $('btn-equip-camera').addEventListener('click', openGuidedCamera);
    $('btn-equip-cancel').addEventListener('click', resetEquipForm);

    /* 위험유형 — 목록에서 더하기 · 직접 적기 */
    $('hazard-add').addEventListener('change', function () {
      if (this.value) addHazardChip(this.value, true);
      this.value = '';
    });
    function addCustom() {
      var code = Store.customHazard($('hazard-custom').value);
      if (!code) { UI.toast('더할 위험유형을 적어 주세요.'); $('hazard-custom').focus(); return; }
      addHazardChip(code, true);
      $('hazard-custom').value = '';
    }
    $('btn-hazard-custom').addEventListener('click', addCustom);
    $('hazard-custom').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });

    window.addEventListener('hashchange', showView);

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
  showView();
  /* 촬영으로 먼저 넘어갔던 새 설비 — 돌아왔으니 AI 검수를 시작한다 */
  Store.setup.load().equipments.forEach(function (e) { if (e.review && e.review.status === 'queued') runReview(e.id); });
  /* 콘텐츠에서 「설비 등록하러 가기」로 왔다 — 돌아가는 길을 처음부터 보인다 */
  if (new URLSearchParams(location.search).get('return') === 'content') $('return-note').hidden = false;
})();
