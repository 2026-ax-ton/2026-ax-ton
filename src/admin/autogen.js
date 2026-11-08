/* ===================================================================
   autogen.js — AI로 교육 만들기 (담당자) · PRD-AD-08 S1~S4·S6 + 담당자 판정 + 1클릭 승인

   읽는 키: setup, library, courses
   쓰는 키: courses (승인·발급 때만 — 그 전에는 아무것도 저장하지 않는다)

   흐름: 설비 고르기 → /api/research(주의사항) → 사진 → /api/hazards 안내형(위치)
         → 담당자 판정 → 문항 초안 → [승인·발급] 한 번
   🆕 2026-11-09 서버 없이: [결과 파일 불러오기] — 실측 도구(scripts/measure-pipeline.mjs --out)
         가 남긴 파일로 같은 검토를 한다. 파일은 이 브라우저에서만 읽는다.

   이 파일이 코드로 지키는 것 —

   · 승인 전에는 courses 에 쓰지 않는다 (AC-AD-08-05). 초안은 메모리에만 있다.
   · 🆕 「확인 필요」 항목은 담당자가 하나씩 판정해야 승인이 켜진다 — [맞음] [틀림·빼기] [고치기].
     ok 항목은 판정하지 않아도 들어간다(1클릭은 「확인 필요 0개」일 때). [틀림]은 문항에서 빠진다.
   · 🆕 담당자가 고친 부위·위험유형이 문항에 쓰인다. AI 가 빠뜨린 위험은 담당자가 더한다.
   · 안전 문구는 status === 'reviewed' 만 고를 수 있다 (P-1). AI 는 문구를 쓰지 않는다.
   · AI 가 준 글(설명·이유·출처 제목·막힌 지점)은 textContent 로만 보인다 (FR-AD-08-25).
   · 서버는 net.js 로만 부른다. 결과 파일 모드에서는 서버를 아예 부르지 않는다.
   · 사진 원본은 저장하지 않는다. 문항에 쓰는 것은 긴 변 640px 로 줄인 사본 하나다.

   ponytail: 문항 사진을 courses 안에 data URL 로 둔다 — 파일 저장소(PRD-AD-08 §11 Q4)가 생기면 사진 id 로.
   ponytail: 문항 문장은 한국어 틀 하나다. 문항 번역을 AD-03 흐름에 태우면 풀린다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillAdminBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  /* ── 결정에 걸린 값 ─────────────────────────────────────────────── */
  var SEND_MAX = 1024;        // 서버로 보내는 사진 긴 변 (/api/hazards 상한 1.5MB 안)
  var SEND_QUALITY = 0.85;
  var KEEP_MAX = 640;         // 문항에 남기는 사진 긴 변
  var KEEP_QUALITY = 0.7;
  var TIMEOUT_MS = 60000;     // 리서치는 검색을 몇 번 해서 오래 걸린다
  var MAX_RUN_BYTES = 6 * 1024 * 1024;   // 결과 파일 상한 (사진 data URL 포함)
  var TIER = ['', '제조사', '공공기관', '일반 웹', '동영상'];

  /* 초안 — 메모리에만. 새로고침하면 사라진다 (반쯤 만든 교육이 노동자에게 가지 않게) */
  function emptyState(eq) {
    return {
      equipment: eq || null, research: null, guided: null, keepPhoto: '', source: '',
      judge: {},   // id → 'right' | 'wrong' | 'edit'
      edits: {},   // id → { part, hazard, risk, memo }
      added: []    // 담당자가 더한 위험 [{ id, part, hazard, risk }]
    };
  }
  var state = emptyState(null);

  function setup() { return Store.setup.load(); }
  function equipments() { return setup().equipments || []; }
  function hazardLabel(code) {
    var h = Store.hazard(code);
    return h ? h.label : '위험유형 확인 필요';
  }

  function serverReady() { return Net.onHttps() && Net.available() && !!Auth.token(); }

  function call(path, body) {
    return Net.post(path, body, { token: Auth.token(), timeoutMs: TIMEOUT_MS });
  }

  function failText(r) {
    if (r.failed) return r.failed === 'timeout' ? 'AI 가 제시간에 답하지 못했습니다.' : '서버에 닿지 못했습니다.';
    return (r.data && r.data.message) || ('AI 가 답하지 못했습니다 (' + r.status + ').');
  }

  /* ── 항목 — AI 것 + 담당자 판정을 합친 「지금 보이는 값」 ───────── */

  function aiItems() { return (state.research && state.research.items) || []; }

  /** 담당자가 고쳤으면 고친 값을 쓴다 */
  function effective(it) {
    var e = state.edits[it.id];
    return e ? { id: it.id, part: e.part || it.part, hazard: e.hazard || it.hazard, risk: e.risk || it.risk } : it;
  }

  /** 문항에 들어가나 — [틀림]은 빠지고, 확인 필요는 판정이 있어야, ok 는 판정 없이도 */
  function included(it) {
    var j = state.judge[it.id];
    if (j === 'wrong') return false;
    if (j === 'right' || j === 'edit') return true;
    return it.status === 'ok';
  }

  function undecided() {
    return aiItems().filter(function (it) { return it.status !== 'ok' && !state.judge[it.id]; });
  }

  /* ── S1 설비 ───────────────────────────────────────────────────── */

  function renderEquipments() {
    var sel = $('ag-equip');
    sel.textContent = '';
    var list = equipments();
    if (!list.length) {
      var o = UI.el('option', null, '등록된 설비가 없습니다 — 설비 화면에서 먼저 등록하세요');
      o.value = '';
      sel.appendChild(o);
      $('btn-research').disabled = true;
      return;
    }
    list.forEach(function (e) {
      var opt = UI.el('option', null, e.name);
      opt.value = e.id;
      sel.appendChild(opt);
    });
    showSpec();
  }

  function showSpec() {
    var e = Store.findBy(equipments(), 'id', $('ag-equip').value);
    state.equipment = e || null;
    var spec = e ? [e.maker, e.model, e.year].filter(function (v) { return v; }).join(' · ') : '';
    $('ag-equip-spec').textContent = spec
      ? '제조사·모델: ' + spec
      : '제조사·모델명이 없습니다 — 같은 종류 설비의 일반 자료로 조사합니다.';
  }

  /* ── S2 리서치 (서버) ──────────────────────────────────────────── */

  function startResearch() {
    var e = state.equipment;
    if (!e) return;
    if (!serverReady()) { $('offline-note').hidden = false; return; }

    state = emptyState(e);
    state.source = 'server';
    $('btn-research').disabled = true;
    $('ag-research-status').textContent = 'AI 가 공개 자료를 찾는 중입니다… (30초쯤 걸립니다)';

    call('/api/research', { equipment: { name: e.name, maker: e.maker || '', model: e.model || '', year: e.year || null } })
      .then(function (r) {
        $('btn-research').disabled = false;
        if (!r.ok) {
          $('ag-research-status').textContent = failText(r) + ' 교육 콘텐츠 생성 화면에서 손으로 만들 수 있습니다.';
          return;
        }
        state.research = r.data;
        $('ag-research-status').textContent = '조사를 마쳤습니다.';
        renderAll();
        $('sec-photo').hidden = false;
      });
  }

  /* ── 🆕 결과 파일 모드 ─────────────────────────────────────────── */

  /** 결과 파일 모양 확인 — 모양이 틀리면 null. 여기서 읽은 글도 AI 출력이라 textContent 로만 쓴다 */
  function readRun(obj) {
    if (!obj || obj.kind !== 'safety-ai-run' || !obj.research || !Array.isArray(obj.research.items)) return null;
    var photo = obj.photo && typeof obj.photo.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(obj.photo.data)
      ? obj.photo.data : '';
    var guided = obj.guided && Array.isArray(obj.guided.mapped) && Array.isArray(obj.guided.missing) && !obj.guided.person
      ? obj.guided : null;
    return { research: obj.research, guided: photo ? guided : null, photo: photo, equipment: obj.equipment || {}, model: obj.model || '', provider: obj.provider || '' };
  }

  function onRunFile(file) {
    if (!file) return;
    if (file.size > MAX_RUN_BYTES) { $('ag-research-status').textContent = '파일이 너무 큽니다.'; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var run = null;
      try { run = readRun(JSON.parse(String(reader.result))); } catch (e) { run = null; }
      if (!run) { $('ag-research-status').textContent = '실측 도구가 만든 결과 파일이 아닙니다.'; return; }
      loadRun(run);
    };
    reader.readAsText(file);
  }

  function loadRun(run) {
    var e = state.equipment;
    state = emptyState(e);
    state.source = 'file';
    state.research = run.research;
    state.research.model = state.research.model || run.model;
    state.guided = run.guided;
    var name = run.equipment.name || '';
    $('ag-research-status').textContent = '결과 파일을 불러왔습니다 — 조사한 설비: ' + name
      + (run.provider ? ' · ' + run.provider + ' ' + run.model : '')
      + '. 발급 대상 설비는 위 목록에서 고른 「' + (e ? e.name : '없음') + '」입니다.';
    if (run.photo) {
      var img = new Image();
      img.onload = function () {
        state.keepPhoto = shrink(img, KEEP_MAX, KEEP_QUALITY) || run.photo;
        afterPhoto();
      };
      img.onerror = function () { state.guided = null; afterPhoto(); };
      img.src = run.photo;
    }
    $('sec-photo').hidden = false;
    renderAll();
  }

  /* ── S2 화면 — 담당자 판정 ─────────────────────────────────────── */

  function sourceLine(s) {
    var li = UI.el('li');
    var a = UI.el('a', null, (s.title || s.host) + ' (' + s.host + ')');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.appendChild(a);
    li.appendChild(UI.el('span', 'meta', ' · ' + (TIER[s.tier] || '')));
    return li;
  }

  function mappedOf(id) {
    return state.guided ? Store.findBy(state.guided.mapped || [], 'id', id) : null;
  }

  function hazardSelect(value) {
    var sel = document.createElement('select');
    Store.HAZARDS.forEach(function (h) {
      var o = UI.el('option', null, h.label);
      o.value = h.code;
      if (h.code === value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function judgeButtons(it) {
    var row = UI.el('div', 'ag-judge');
    [['right', '맞음'], ['wrong', '틀림·빼기'], ['edit', '고치기']].forEach(function (p) {
      var b = UI.el('button', 'btn-sm', p[1]);
      b.type = 'button';
      b.setAttribute('data-judge', p[0]);
      b.setAttribute('aria-pressed', state.judge[it.id] === p[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.judge[it.id] = p[0];
        if (p[0] === 'edit' && !state.edits[it.id]) {
          state.edits[it.id] = { part: it.part, hazard: it.hazard === 'unknown' ? Store.HAZARDS[0].code : it.hazard, risk: it.risk, memo: '' };
        }
        if (p[0] !== 'edit') delete state.edits[it.id];
        renderAll();
      });
      row.appendChild(b);
    });
    return row;
  }

  function editForm(it) {
    var e = state.edits[it.id];
    var box = UI.el('div', 'ag-edit');
    function field(label, input, key) {
      var f = UI.el('div', 'field');
      var l = UI.el('label', null, label);
      f.appendChild(l);
      input.value = e[key] || '';
      input.addEventListener('change', function () { e[key] = String(input.value).trim().slice(0, key === 'risk' ? 160 : 60); renderApprove(); });
      f.appendChild(input);
      box.appendChild(f);
    }
    var part = document.createElement('input'); part.type = 'text'; part.maxLength = 40;
    var risk = document.createElement('input'); risk.type = 'text'; risk.maxLength = 160;
    var memo = document.createElement('input'); memo.type = 'text'; memo.maxLength = 120;
    field('부위', part, 'part');
    field('위험유형', hazardSelect(e.hazard), 'hazard');
    field('무엇이 왜 위험한가', risk, 'risk');
    field('메모 (왜 고쳤나)', memo, 'memo');
    return box;
  }

  function renderItems() {
    var data = state.research;
    $('sec-items').hidden = false;
    $('ag-overview').textContent = data.overview || '';
    var items = aiItems();
    var checks = items.filter(function (i) { return i.status !== 'ok'; }).length;
    $('ag-summary').textContent = '항목 ' + items.length + '개 · 확인 필요 ' + checks + '개 (남은 판정 ' + undecided().length + '개) · 출처 사이트 ' + (data.sourceCount || 0) + '곳'
      + (data.general ? ' · 모델명 자료가 없어 일반 자료로 조사했습니다' : '')
      + (data.thin ? ' · 자료가 모자라 전부 확인이 필요합니다' : '');

    var lim = $('ag-limits');
    lim.textContent = '';
    (data.limits || []).forEach(function (l) { lim.appendChild(UI.itemRow('alert-circle', '확인하지 못한 자료', l)); });

    var list = $('ag-items');
    list.textContent = '';
    items.forEach(function (raw) {
      var it = effective(raw);
      var j = state.judge[raw.id];
      var li = UI.el('li', 'item');
      li.setAttribute('data-id', raw.id);
      if (j) li.setAttribute('data-judge', j);
      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, it.part));
      var tags = UI.el('div', 'tags');
      tags.appendChild(UI.badge('badge-wait', (Store.hazard(it.hazard) || {}).icon || '', hazardLabel(it.hazard)));
      tags.appendChild(raw.status === 'ok' ? UI.okBadge('출처 확인') : UI.stopBadge('확인 필요'));
      if (j === 'right') tags.appendChild(UI.okBadge('담당자: 맞음'));
      if (j === 'edit') tags.appendChild(UI.okBadge('담당자: 고침'));
      if (j === 'wrong') tags.appendChild(UI.stopBadge('담당자: 틀림 — 문항에서 뺌'));
      if (mappedOf(raw.id)) tags.appendChild(UI.okBadge('사진 위치 있음'));
      body.appendChild(tags);
      body.appendChild(UI.el('p', 'meta', it.risk));

      var det = UI.el('details');
      if (raw.status !== 'ok' && !j) det.open = true;
      det.appendChild(UI.el('summary', null, raw.status === 'ok' ? '출처 보기' : '왜 확인이 필요한가'));
      if (raw.reasons && raw.reasons.length) det.appendChild(UI.el('p', 'meta', '이유: ' + raw.reasons.join(' · ')));
      if (raw.conflict) det.appendChild(UI.el('p', 'meta', '자료끼리 다른 말: ' + raw.conflict));
      var srcs = UI.el('ul');
      (raw.sources || []).forEach(function (s) { srcs.appendChild(sourceLine(s)); });
      if (!(raw.sources || []).length) srcs.appendChild(UI.el('li', null, '확인된 출처 없음'));
      det.appendChild(srcs);
      body.appendChild(det);

      body.appendChild(judgeButtons(raw));
      if (j === 'edit') body.appendChild(editForm(raw));
      li.appendChild(body);
      list.appendChild(li);
    });

    state.added.forEach(function (a) {
      var li = UI.itemRow('pencil', a.part + ' (담당자 추가)', hazardLabel(a.hazard) + ' · ' + a.risk + ' · 출처 없음 — 사진 위치가 없어 문항은 만들지 않습니다');
      list.appendChild(li);
    });
  }

  function addItem() {
    var part = $('ag-add-part').value.trim().slice(0, 40);
    var risk = $('ag-add-risk').value.trim().slice(0, 160);
    if (!part || !risk) { UI.toast('부위와 위험을 적어 주세요.'); return; }
    state.added.push({ id: 'm' + (state.added.length + 1), part: part, hazard: $('ag-add-hazard').value, risk: risk });
    $('ag-add-part').value = '';
    $('ag-add-risk').value = '';
    renderAll();
  }

  /* ── S3 사진 ───────────────────────────────────────────────────── */

  /** 긴 변을 max 로 줄인 JPEG data URL (canvas 를 못 쓰면 '') */
  function shrink(img, max, quality) {
    try {
      var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', quality);
    } catch (e) { return ''; }
  }

  function onPhoto(file) {
    if (!file || !state.research) return;
    if (state.source === 'file' || !serverReady()) { $('offline-note').hidden = false; return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var send = shrink(img, SEND_MAX, SEND_QUALITY);
      var keep = shrink(img, KEEP_MAX, KEEP_QUALITY);
      URL.revokeObjectURL(url);
      locate(send, keep);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      $('ag-photo-status').textContent = '사진을 읽지 못했습니다. 다른 사진으로 해 주세요.';
    };
    img.src = url;
  }

  function locate(send, keep) {
    var items = aiItems().map(function (it) { var e = effective(it); return { id: it.id, part: e.part, hazard: e.hazard }; });
    $('ag-photo-status').textContent = 'AI 가 사진에서 위치를 찾는 중입니다…';
    call('/api/hazards', { image: send, items: items }).then(function (r) {
      if (!r.ok) {
        $('ag-photo-status').textContent = failText(r) + ' 교육 콘텐츠 생성 화면의 그림에서 직접 고를 수 있습니다.';
        return;
      }
      if (r.data.person) {
        state.guided = null;
        state.keepPhoto = '';
        $('ag-figure').hidden = true;
        $('ag-photo-status').textContent = '사람이 찍혔어요. 설비만 다시 찍어 주세요.';
        renderAll();
        return;
      }
      state.guided = r.data;
      state.keepPhoto = keep;
      afterPhoto();
    });
  }

  function afterPhoto() {
    if (!state.guided || !state.keepPhoto) { renderAll(); return; }
    $('ag-photo-status').textContent = '위치 ' + state.guided.mapped.length + '곳을 찾았습니다'
      + (state.guided.missing.length ? ' · 사진이 더 필요한 곳 ' + state.guided.missing.length + '곳' : '') + '.';
    renderFigure();
    renderMissing();
    renderAll();
  }

  function renderFigure() {
    var fig = $('ag-figure');
    fig.textContent = '';
    fig.hidden = false;
    var img = UI.el('img');
    img.src = state.keepPhoto;
    img.alt = '설비 사진';
    fig.appendChild(img);
    state.guided.mapped.forEach(function (m) {
      var raw = Store.findBy(aiItems(), 'id', m.id);
      var shown = raw ? effective(raw) : m;
      var b = UI.el('div', 'ag-box');
      if (state.judge[m.id] === 'wrong') b.setAttribute('data-judge', 'wrong');
      b.style.left = m.box.x0 + '%';
      b.style.top = m.box.y0 + '%';
      b.style.width = (m.box.x1 - m.box.x0) + '%';
      b.style.height = (m.box.y1 - m.box.y0) + '%';
      b.appendChild(UI.el('span', 'ag-box-label', shown.part + ' · ' + hazardLabel(shown.hazard)));
      fig.appendChild(b);
    });
  }

  function renderMissing() {
    var list = $('ag-missing');
    list.textContent = '';
    state.guided.missing.forEach(function (m) {
      list.appendChild(UI.itemRow('camera', m.part, '필요한 사진: ' + m.needsPhoto));
    });
  }

  /* ── S6 문항 초안 + 승인 ───────────────────────────────────────── */

  /** 들어가는 항목 중 사진 위치가 있는 것 → hotspot 문항 (담당자가 고친 값으로) */
  function draftQuiz() {
    if (!state.guided || !state.keepPhoto) return [];
    var out = [];
    aiItems().forEach(function (raw) {
      if (!included(raw)) return;
      var m = mappedOf(raw.id);
      if (!m) return;
      var it = effective(raw);
      out.push({
        id: 'q' + (out.length + 1),
        type: 'hotspot',
        hazard: it.hazard === 'unknown' ? '' : it.hazard,
        prompt: '사진에서 「' + it.part + '」을(를) 누르세요',
        answer: m.answer,
        figure: 'photo',
        i18n: {}
      });
    });
    return out;
  }

  function renderPhrases() {
    var box = $('ag-phrases');
    box.textContent = '';
    var langs = setup().languages || [];
    var e = state.equipment;
    var usable = Store.library.load().filter(function (p) {
      return langs.some(function (code) { return Store.phraseOk(p, code); }) || Store.phraseOk(p, 'ko');
    });
    if (!usable.length) {
      box.appendChild(UI.el('p', 'field-hint', '검수를 마친 문구가 없습니다. 문구 화면에서 먼저 검수해 주세요.'));
      return;
    }
    usable.forEach(function (p) {
      var match = !!(e && p.category && (e.name.indexOf(p.category) !== -1 || p.category === '공통'));
      var c = UI.chip({ type: 'checkbox', name: 'ag-phrase', value: p.id, label: p.ko, sub: p.category || '', checked: match });
      c.querySelector('input').addEventListener('change', renderApprove);
      box.appendChild(c);
    });
  }

  function steps() {
    var quiz = draftQuiz();
    var left = undecided().length;
    return [
      { what: '설비', done: !!state.equipment, note: state.equipment ? state.equipment.name : '미선택' },
      { what: '주의사항 조사', done: !!state.research, note: state.research ? aiItems().length + '개' : '안 함' },
      { what: '「확인 필요」 판정', done: !!state.research && left === 0, note: left ? left + '개 남음' : '다 봄' },
      { what: '사진 위치', done: !!(state.guided && state.keepPhoto), note: state.guided ? state.guided.mapped.length + '곳' : '사진 없음' },
      { what: '문항 초안', done: quiz.length > 0, note: quiz.length + '문항' },
      { what: '안전 문구 (검수 완료)', done: UI.checkedValues('ag-phrase').length > 0, note: UI.checkedValues('ag-phrase').length + '개' },
      { what: '교육 제목', done: !!$('ag-title').value.trim(), note: $('ag-title').value.trim() || '없음' }
    ];
  }

  function renderApprove() {
    if (!state.research) return;
    $('sec-approve').hidden = false;
    if (!$('ag-title').value && state.equipment) $('ag-title').value = state.equipment.name + ' 안전교육';
    if (!$('ag-phrases').children.length) renderPhrases();

    var list = $('ag-check');
    list.textContent = '';
    var all = steps();
    all.forEach(function (s) {
      var li = UI.el('li');
      li.setAttribute('data-done', s.done ? 'yes' : 'no');
      li.appendChild(UI.el('span', 'what', s.what));
      li.appendChild(s.done ? UI.okBadge(s.note) : UI.neutralBadge(s.note));
      list.appendChild(li);
    });
    var langs = (setup().languages || []).filter(function (c) { return c !== 'ko'; });
    $('ag-lang-note').textContent = langs.length
      ? '문항 문장은 아직 한국어로만 나갑니다 — 노동자 화면은 한국어 문장을 읽어 줍니다. 번역은 교육 콘텐츠 생성 화면에서 더할 수 있습니다.'
      : '';
    $('btn-approve').disabled = !all.every(function (s) { return s.done; });
  }

  function renderAll() {
    if (!state.research) return;
    renderItems();
    if (state.guided && state.keepPhoto) renderFigure();
    renderApprove();
  }

  function reviewRecord() {
    var count = { right: 0, wrong: 0, edit: 0 };
    Object.keys(state.judge).forEach(function (id) { count[state.judge[id]] += 1; });
    return {
      right: count.right, wrong: count.wrong, edited: count.edit, added: state.added.length,
      wrongParts: aiItems().filter(function (it) { return state.judge[it.id] === 'wrong'; }).map(function (it) { return it.part; }),
      addedParts: state.added.map(function (a) { return a.part; })
    };
  }

  function approve() {
    var all = steps();
    if (!all.every(function (s) { return s.done; })) { UI.toast('아직 채우지 않은 단계가 있습니다.'); return; }
    var e = state.equipment;
    var course = {
      id: Store.uid(),
      title: $('ag-title').value.trim().slice(0, 60),
      equipmentId: e.id,
      languages: (setup().languages || []).slice(),
      phraseIds: UI.checkedValues('ag-phrase'),
      quiz: draftQuiz(),
      dueAt: '',
      approved: true,
      createdAt: new Date().toISOString(),
      photo: state.keepPhoto,
      /* 기록일 뿐 판정이 아니다 — AI 가 무엇을 제안했고 담당자가 어떻게 봤나 (성공 지표) */
      aiDraft: {
        model: state.research.model || '',
        at: new Date().toISOString(),
        source: state.source,
        items: aiItems().length,
        checks: aiItems().filter(function (i) { return i.status !== 'ok'; }).length,
        mapped: state.guided.mapped.length,
        review: reviewRecord()
      }
    };
    var result = Store.courses.update(function (list) { list.push(course); });
    if (!result.ok) { UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.'); return; }
    UI.toast('발급했습니다. 「' + course.title + '」이 노동자 수강 화면에 나타납니다.');
    state = emptyState(e);
    ['sec-items', 'sec-photo', 'sec-approve'].forEach(function (id) { $(id).hidden = true; });
    $('ag-figure').hidden = true;
    $('ag-research-status').textContent = '';
    $('ag-photo-status').textContent = '';
  }

  /* ── 연결 ──────────────────────────────────────────────────────── */

  (function fillAddHazard() {
    var sel = $('ag-add-hazard');
    Store.HAZARDS.forEach(function (h) { var o = UI.el('option', null, h.label); o.value = h.code; sel.appendChild(o); });
  })();

  $('ag-equip').addEventListener('change', showSpec);
  $('btn-research').addEventListener('click', startResearch);
  $('ag-runfile').addEventListener('change', function (ev) { onRunFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
  $('ag-photo').addEventListener('change', function (ev) { onPhoto(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
  $('btn-add-item').addEventListener('click', addItem);
  $('ag-title').addEventListener('input', renderApprove);
  $('btn-approve').addEventListener('click', approve);

  renderEquipments();
  if (!serverReady()) $('offline-note').hidden = false;

  /* 검사가 화면 안쪽을 볼 수 있게 — 화면 동작에는 쓰지 않는다 */
  window.__autogen = {
    state: function () { return state; }, draftQuiz: draftQuiz, loadRun: loadRun, readRun: readRun, steps: steps
  };
})();
