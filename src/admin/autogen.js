/* ===================================================================
   autogen.js — AI로 교육 만들기 (담당자) · PRD-AD-08 + 2026-11-11 개선 요청

   읽는 키: setup, library, courses
   쓰는 키: setup (설비의 AI 분석 결과·사진 — 설비 탭이 원천), courses (승인·발급 때만)

   흐름 ① 설비 고르기(설비 탭에서 불러옴) → ② AI 위험요소 분석(조사·사진 위치·참고 사진) + 담당자 판정
        → ③ 교육자료(그 설비 종류의 검수 문구 자동) → ④ AI 평가문항 자동 생성·선정(/api/questions, 규칙 문서)
        → ⑤ 검토 후 발급

   이 파일이 코드로 지키는 것 —
   · 설비는 id 로 잇는다. 설비를 바꾸면 앞 설비의 분석·문항을 버린다. 서버 응답·결과 파일의 설비가 고른 설비와
     다르면 쓰지 않는다 (요청 3).
   · 문구는 Store.phrasesFor(설비 종류) 만 — 다른 설비 문구는 고를 수 없다.
   · 문항 수·유형·난이도는 서버 규칙이 정한다. 담당자는 문항을 고르지 않는다 — [수정 요청]·[전체 다시 만들기]·[발급 보류]만.
   · AI 가 쓴 문항은 「AI 작성」으로 보이고, 담당자가 검토 표시를 해야 발급된다. 정답이 검수 문구면 「검수 문구」.
   · 사진 위 박스 번호 = 목록 번호. 좌표가 없는 항목은 「위치 확인 필요」 — 좌표를 지어내지 않는다.
   · 외부 참고 사진·영상 썸네일은 실제 설비 사진(탐지)과 구분해 보이고, 저장·발급하지 않는다(남의 사진).
   · 승인 전에는 courses 에 쓰지 않는다. AI 가 준 글은 textContent 로만 보인다. 서버는 net.js 로만 부른다.
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
  var KEEP_MAX = 640;         // 설비에 저장하는 사진 긴 변 (설비 탭과 같다)
  var KEEP_QUALITY = 0.7;
  var TIMEOUT_MS = 60000;
  var MAX_RUN_BYTES = 12 * 1024 * 1024;
  var TIER = ['', '제조사', '공공기관', '일반 웹', '동영상', '판매·중계'];
  var KIND = { experience: '현장 경험 글', journal: '업계 전문지' };
  var SUBTYPE = { location: '위치 짚기', action: '행동 고르기', ox: 'OX', situation: '상황 판단' };
  var LEVEL = { easy: '쉬움', medium: '보통', hard: '어려움' };

  function emptyState(eq) {
    return {
      equipment: eq || null, research: null, guided: null, keepPhoto: '', source: '',
      judge: {}, edits: {}, moves: {}, moving: '', added: [],
      itemTab: 'ok', runName: '', active: '',
      images: {},        // 항목 id → 참고 사진 (메모리만 — 저장하지 않는다)
      quiz: null,        // /api/questions 결과 { plan, quiz, excluded, missing, rulesVersion }
      quizFor: '',       // 문항을 만든 때의 위험요소 판정 — 바뀌면 다시 만들어야 한다
      hold: false
    };
  }
  var state = emptyState(null);

  function setup() { return Store.setup.load(); }
  function equipments() { return setup().equipments || []; }
  function hazardLabel(code) { var h = Store.hazard(code); return h ? h.label : '위험유형 확인 필요'; }
  function kindId() { return Store.kindOf(state.equipment).id; }
  function serverReady() { return Net.onHttps() && Net.available() && !!Auth.token(); }
  function call(path, body) { return Net.post(path, body, { token: Auth.token(), timeoutMs: TIMEOUT_MS }); }
  function failText(r) {
    if (r.failed) return r.failed === 'timeout' ? 'AI 가 제시간에 답하지 못했습니다.' : '서버에 닿지 못했습니다.';
    return (r.data && r.data.message) || ('AI 가 답하지 못했습니다 (' + r.status + ').');
  }
  /** 서버가 돌려준 설비 id 가 고른 설비와 같은가 — 다르면 쓰지 않는다 */
  function sameEquipment(data) {
    var got = data && data.equipment && data.equipment.id;
    return !got || (!!state.equipment && got === state.equipment.id);
  }

  /* ── 항목 — AI 것 + 담당자 판정 ─────────────────────────────────── */

  function aiItems() { return (state.research && state.research.items) || []; }
  function effective(it) {
    var e = state.edits[it.id];
    return e ? { id: it.id, part: e.part || it.part, hazard: e.hazard || it.hazard, risk: e.risk || it.risk } : it;
  }
  function included(it) {
    var j = state.judge[it.id];
    if (j === 'wrong') return false;
    if (j === 'right' || j === 'edit') return true;
    return it.status === 'ok';
  }
  function undecided() { return aiItems().filter(function (it) { return it.status !== 'ok' && !state.judge[it.id]; }); }
  function number(id) {
    var n = -1;
    aiItems().forEach(function (it, i) { if (it.id === id) n = i + 1; });
    return n;
  }
  function mappedOf(id) { return state.guided ? Store.findBy(state.guided.mapped || [], 'id', id) : null; }
  function placed(m) {
    var mv = state.moves[m.id];
    if (!mv) return m;
    var w = m.box.x1 - m.box.x0, h = m.box.y1 - m.box.y0;
    var x0 = Math.max(0, Math.min(100 - w, mv.x - w / 2)), y0 = Math.max(0, Math.min(100 - h, mv.y - h / 2));
    return { id: m.id, part: m.part, hazard: m.hazard, box: { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h }, answer: { x: mv.x, y: mv.y, r: m.answer.r } };
  }

  /** 문항을 만들 위험요소 — 들어가는 AI 항목(담당자가 고친 값) + 담당자가 더한 것. 사진 좌표는 사진이 있을 때만 */
  function includedHazards() {
    var photo = !!(state.guided && state.keepPhoto);
    return aiItems().filter(included).map(function (raw) {
      var it = effective(raw);
      var m = photo ? mappedOf(raw.id) : null;
      return {
        id: raw.id, part: it.part, hazard: it.hazard, risk: it.risk, partEn: raw.partEn || '',
        official: raw.official ? { code: raw.official.code, section: raw.official.section } : null,
        specific: !!raw.specific, status: raw.status,
        sources: (raw.sources || []).map(function (s) { return { title: s.title, url: s.url, host: s.host }; }),
        answer: m ? placed(m).answer : null,
        box: m ? placed(m).box : null
      };
    }).concat(state.added.map(function (a) {
      return { id: a.id, part: a.part, hazard: a.hazard, risk: a.risk, partEn: '', official: null, specific: false, status: 'manager', sources: [], answer: null, box: null };
    }));
  }
  function signature() {
    return JSON.stringify(includedHazards().map(function (h) { return [h.id, h.part, h.hazard, h.risk, h.answer && [h.answer.x, h.answer.y]]; }));
  }
  function quizStale() { return !!state.quiz && state.quizFor !== signature(); }
  function quizItems() { return (state.quiz && state.quiz.quiz) || []; }

  /* ── ① 설비 ─────────────────────────────────────────────────────── */

  function hashEquip() {
    var m = /(?:^|[#&])eq=([^&]+)/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function renderEquipments() {
    var sel = $('ag-equip');
    sel.textContent = '';
    var list = equipments();
    $('ag-no-equip').hidden = list.length > 0;
    if (!list.length) {
      var o = UI.el('option', null, '등록된 설비가 없습니다');
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
    var want = hashEquip();
    if (want && Store.findBy(list, 'id', want)) sel.value = want;
    showSpec();
  }

  /** 설비를 고르면 — ★ 앞 설비의 분석·문항·판정을 모두 버리고(재검증), 이 설비에 저장된 분석을 불러온다 */
  function showSpec() {
    var e = Store.findBy(equipments(), 'id', $('ag-equip').value) || null;
    state = emptyState(e);
    ['sec-items', 'sec-material', 'sec-quiz', 'sec-approve'].forEach(function (id) { $(id).hidden = true; });
    $('ag-figure').hidden = true;
    $('ag-photo-status').textContent = '';
    $('ag-research-status').textContent = '';
    if ($('ag-title').getAttribute('data-auto') !== 'no') $('ag-title').value = e ? e.name + ' 안전교육' : '';
    $('ag-reviewed').checked = false;
    if (!e) return;
    try { history.replaceState(null, '', '#eq=' + encodeURIComponent(e.id)); } catch (x) { /* file:// */ }

    var k = Store.kindOf(e);
    var kl = (Store.equipmentKind(k.id) || {}).label || '종류 모름';
    $('ag-equip-spec').textContent = '종류: ' + kl + (k.guessed ? ' (설비 탭에서 종류를 확인해 주세요)' : '')
      + (e.model ? '' : ' · 모델명이 없어 같은 종류 설비의 일반 자료로 조사합니다');
    var ph = $('ag-equip-photo');
    ph.hidden = !(e.photo && /^data:image\//.test(e.photo));
    if (!ph.hidden) ph.src = e.photo;
    state.keepPhoto = ph.hidden ? '' : e.photo;

    /* 설비 탭에 저장된 분석 — 다시 조사하지 않고 불러온다 */
    var a = e.analysis;
    if (a && a.research && Array.isArray(a.research.items)) {
      state.research = a.research;
      state.guided = state.keepPhoto && a.guided && Array.isArray(a.guided.mapped) ? a.guided : null;
      state.source = a.source || 'saved';
      $('ag-research-status').textContent = '설비에 저장된 AI 분석을 불러왔습니다 (' + (a.at ? UI.formatDate(a.at) : '') + '). 새로 하려면 [AI 위험요소 분석 시작].';
      renderAll();
    }
  }

  /** 분석 결과를 설비에 저장한다 — 설비 탭이 원천. 참고 사진(외부 그림)은 넣지 않는다 (동기화 512KB) */
  function saveAnalysis() {
    var e = state.equipment;
    if (!e || !state.research) return;
    var research = JSON.parse(JSON.stringify(state.research));
    (research.items || []).forEach(function (it) { delete it.image; });
    var photo = state.keepPhoto;
    var src = state.source;
    var kind = kindId();
    var guided = state.guided;
    var r = Store.setup.update(function (s) {
      var eq = Store.findBy(s.equipments, 'id', e.id);
      if (!eq) return;
      if (photo) eq.photo = photo;
      eq.analysis = { at: new Date().toISOString(), model: research.model || '', source: src, kind: kind, research: research, guided: guided };
    });
    if (!r.ok) UI.toast('분석 결과를 설비에 저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
    state.equipment = Store.findBy(equipments(), 'id', e.id) || e;
  }

  /* ── ② 분석 (서버) ──────────────────────────────────────────────── */

  function startResearch() {
    var e = state.equipment;
    if (!e) return;
    if (!serverReady()) {
      $('offline-note').hidden = false;
      $('ag-research-status').textContent = '여기서는 AI 서버를 부를 수 없습니다 (배포 주소에서 로그인했을 때만 됩니다). [결과 파일 불러오기]로 실측 결과를 열어 주세요.';
      return;
    }
    var keep = state.keepPhoto;
    state = emptyState(e);
    state.keepPhoto = keep;
    state.source = 'server';
    $('btn-research').disabled = true;
    $('ag-research-status').textContent = 'AI 가 공개 자료를 찾는 중입니다… (30초쯤 걸립니다)';
    call('/api/research', { equipment: { id: e.id, kind: kindId(), name: e.name, maker: e.maker || '', model: e.model || '', year: e.year || null } })
      .then(function (r) {
        $('btn-research').disabled = false;
        if (!r.ok) { $('ag-research-status').textContent = failText(r) + ' 교육 콘텐츠 화면에서 직접 만들 수 있습니다.'; return; }
        if (!sameEquipment(r.data)) { $('ag-research-status').textContent = '다른 설비의 결과가 왔습니다. 다시 조사해 주세요.'; return; }
        state.research = r.data;
        $('ag-research-status').textContent = '조사를 마쳤습니다.' + (keep ? ' 설비 사진에서 위치를 찾습니다…' : ' 설비 사진을 넣으면 위치도 찾습니다.');
        saveAnalysis();
        renderAll();
        if (keep) locate(keep, keep); else afterAnalysis();
      });
  }

  /** 분석이 끝난 뒤 — 참고 사진 찾기, 판정할 것이 없으면 문항 만들기 */
  function afterAnalysis() {
    findPhotos();
    if (!undecided().length) makeQuiz();
  }

  /* ── 결과 파일 모드 ───────────────────────────────────────────── */

  function readRun(obj) {
    if (!obj || obj.kind !== 'safety-ai-run' || !obj.research || !Array.isArray(obj.research.items)) return null;
    var photo = obj.photo && typeof obj.photo.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(obj.photo.data) ? obj.photo.data : '';
    var guided = obj.guided && Array.isArray(obj.guided.mapped) && Array.isArray(obj.guided.missing) && !obj.guided.person ? obj.guided : null;
    var questions = obj.questions && Array.isArray(obj.questions.quiz) ? obj.questions : null;
    return { research: obj.research, guided: photo ? guided : null, photo: photo, equipment: obj.equipment || {}, model: obj.model || '', provider: obj.provider || '', questions: questions };
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

  /** ★ 다른 종류 설비의 결과 파일은 받지 않는다 (프레스를 골랐는데 도장 결과가 섞이지 않게) */
  function loadRun(run) {
    var e = state.equipment;
    if (!e) return false;
    var fileKind = Store.equipmentKind(run.equipment.kind) ? run.equipment.kind : Store.kindOf({ name: run.equipment.name }).id;
    var mine = kindId();
    if (fileKind && mine && fileKind !== mine) {
      $('ag-research-status').textContent = '이 결과 파일은 다른 종류 설비(' + (Store.equipmentKind(fileKind) || {}).label + ')의 것입니다. 「'
        + e.name + '」(' + (Store.equipmentKind(mine) || {}).label + ')에는 쓸 수 없습니다.';
      return false;
    }
    state = emptyState(e);
    state.source = 'file';
    state.research = run.research;
    state.research.model = state.research.model || run.model;
    state.guided = run.photo ? run.guided : null;
    state.keepPhoto = run.photo || (e.photo || '');
    state.runName = (run.equipment.name || '') + (run.provider ? ' · ' + run.provider + ' ' + run.model : '');
    aiItems().forEach(function (it) { if (it.image) state.images[it.id] = it.image; });
    if (run.questions) {
      /* 파일의 문항은 출처 확인 항목으로 만든 것 — 지금 판정과 같을 때만 그대로 쓴다 (다르면 서버에서 다시 만든다) */
      state.quiz = run.questions;
      state.quizFor = signature();
    }
    $('ag-research-status').textContent = '결과 파일을 불러왔습니다 — 조사한 설비: ' + state.runName + '. 발급 대상: 「' + e.name + '」. 분석을 이 설비에 저장했습니다.';
    saveAnalysis();
    if (run.photo) { var ph = $('ag-equip-photo'); ph.src = run.photo; ph.hidden = false; }
    renderAll();
    return true;
  }

  /* ── ② 화면 ───────────────────────────────────────────────────── */

  function sourceLine(s) {
    var li = UI.el('li');
    var a = UI.el('a', null, (s.title || s.host) + ' (' + s.host + ')');
    if (/^https?:\/\//i.test(String(s.url))) a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.appendChild(a);
    li.appendChild(UI.el('span', 'meta', ' · ' + (KIND[s.kind] || TIER[s.tier] || '')));
    return li;
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

  function setIncluded(it, on) {
    if (on) { if (state.judge[it.id] !== 'edit') state.judge[it.id] = 'right'; }
    else { state.judge[it.id] = 'wrong'; delete state.edits[it.id]; }
  }

  function includeBox(it) {
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'ag-include';
    box.checked = included(it);
    box.indeterminate = it.status !== 'ok' && !state.judge[it.id];
    box.setAttribute('aria-label', it.part + ' — 교육에 넣기');
    box.addEventListener('change', function () { setIncluded(it, box.checked); judged(); });
    return box;
  }

  /** 판정이 바뀌면 — 다 봤고 서버가 되면 문항을 자동으로 만든다 */
  function judged() {
    renderAll();
    if (state.source !== 'file' && serverReady() && !undecided().length && (!state.quiz || quizStale())) makeQuiz();
  }

  function editForm(it) {
    var e = state.edits[it.id];
    var box = UI.el('div', 'ag-edit');
    function field(label, input, key) {
      var f = UI.el('div', 'field');
      f.appendChild(UI.el('label', null, label));
      input.value = e[key] || '';
      input.addEventListener('change', function () { e[key] = String(input.value).trim().slice(0, key === 'risk' ? 160 : 60); renderAll(); });
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

  /** 참고 사진 — 실제 설비 사진(탐지)과 구분한다. data URL(jpeg·png·webp)만 (제3자 요청 0건) */
  function refImage(raw) {
    var im = state.images[raw.id] || raw.image;
    if (!im || typeof im.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(im.data)) return null;
    var fig = UI.el('figure', 'ag-ref');
    fig.setAttribute('data-kind', im.kind === 'video' ? 'video' : 'page');
    var img = UI.el('img');
    img.src = im.data;
    img.alt = raw.part + (im.kind === 'video' ? ' 영상 썸네일' : ' 외부 참고 사진');
    fig.appendChild(img);
    var cap = UI.el('figcaption');
    cap.appendChild(UI.el('b', null, im.kind === 'video' ? '영상 썸네일 (참고)' : '외부 참고 사진'));
    cap.appendChild(document.createTextNode(' · 실제 설비 사진 아님 · 이용 조건: ' + String(im.license || '확인 필요') + ' · '));
    var a = UI.el('a', null, '출처 ' + String(im.host || ''));
    if (/^https?:\/\//i.test(String(im.page))) a.href = im.page;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    cap.appendChild(a);
    fig.appendChild(cap);
    return fig;
  }

  function focusItem(id) {
    state.active = id;
    var raw = Store.findBy(aiItems(), 'id', id);
    if (raw) state.itemTab = raw.status === 'ok' ? 'ok' : 'check';
    renderItems();
    renderFigure();
    var li = document.querySelector('#ag-items li[data-id="' + id + '"]');
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'center' });
  }

  function renderCounts() {
    var items = aiItems();
    var photo = !!(state.guided && state.keepPhoto);
    var m = photo ? items.filter(function (it) { return mappedOf(it.id); }).length : 0;
    $('ag-counts').textContent = '위험요소 ' + items.length + '개' + (state.added.length ? ' (+ 담당자 추가 ' + state.added.length + ')' : '')
      + ' · 설비 사진 ' + (state.keepPhoto ? '1장' : '없음') + ' · 사진 위치 ' + m + '곳 · 위치 확인 필요 ' + (items.length - m) + '개'
      + ' · 문항 ' + quizItems().length + '개';
  }

  function renderItems() {
    var data = state.research;
    $('sec-items').hidden = false;
    var items = aiItems();
    renderCounts();

    var lim = $('ag-limits');
    lim.textContent = '';
    var gaps = data.limits || [];
    (data.officialDocs || []).forEach(function (d) { lim.appendChild(UI.itemRow('check', '공식 문서 · ' + d.code, d.title)); });
    if (data.thin) lim.appendChild(UI.itemRow('alert', '자료가 모자랍니다', '모든 항목이 「확인 필요」입니다.'));
    if (data.noOfficial) lim.appendChild(UI.itemRow('alert', '공식 기준 문서를 찾지 못했습니다', 'KOSHA GUIDE·산업안전보건기준에 관한 규칙에서 이 설비 기준을 확인해 주세요. 그 전까지 모든 항목이 「확인 필요」입니다.'));
    var nums = data.docNumbers || [];
    if (gaps.length || nums.length) {
      var gli = UI.el('li');
      var gdet = UI.el('details');
      gdet.appendChild(UI.el('summary', null, 'AI 가 확인하지 못한 자료 ' + (gaps.length + nums.length) + '개 — 자세히 보기'));
      var gul = UI.el('ul', 'item-list');
      nums.forEach(function (n) { gul.appendChild(UI.itemRow('alert', '문서번호 ' + n, '원문 표지에서 번호 확인')); });
      gaps.forEach(function (l) { gul.appendChild(UI.itemRow('alert-circle', '확인하지 못한 자료', l)); });
      gdet.appendChild(gul);
      gli.appendChild(gdet);
      lim.appendChild(gli);
    }

    var okItems = items.filter(function (i) { return i.status === 'ok'; });
    var chkItems = items.filter(function (i) { return i.status !== 'ok'; });
    var left = undecided().length;
    var tabs = $('ag-tabs');
    tabs.textContent = '';
    [['ok', '출처 확인 ' + okItems.length + '개'],
     ['check', '확인 필요 ' + chkItems.length + '개' + (left ? ' · 남은 판정 ' + left + '개' : '')]].forEach(function (t) {
      var b = UI.el('button', 'ag-tab', t[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', t[0]);
      b.setAttribute('aria-selected', state.itemTab === t[0] ? 'true' : 'false');
      if (t[0] === 'check' && left) b.setAttribute('data-left', 'yes');
      b.addEventListener('click', function () { state.itemTab = t[0]; renderItems(); });
      tabs.appendChild(b);
    });

    var list = $('ag-items');
    list.textContent = '';
    var shown = state.itemTab === 'check' ? chkItems : okItems;
    var allBox = $('ag-all-box');
    var on = shown.filter(included).length;
    $('ag-all').hidden = !shown.length;
    allBox.checked = !!shown.length && on === shown.length;
    allBox.indeterminate = on > 0 && on < shown.length;
    $('ag-all-text').textContent = '전체 선택 (' + on + '/' + shown.length + ')';
    allBox.onchange = function () { shown.forEach(function (it) { setIncluded(it, allBox.checked); }); judged(); };

    if (!shown.length) list.appendChild(UI.el('li', 'field-hint', state.itemTab === 'check' ? '확인이 필요한 항목이 없습니다.' : '출처가 확인된 항목이 없습니다 — 「확인 필요」 탭을 보세요.'));
    var photo = !!(state.guided && state.keepPhoto);
    shown.forEach(function (raw) {
      var it = effective(raw);
      var j = state.judge[raw.id];
      var li = UI.el('li', 'item');
      li.setAttribute('data-id', raw.id);
      if (state.active === raw.id) li.setAttribute('data-active', 'yes');
      if (j) li.setAttribute('data-judge', j);
      li.appendChild(includeBox(raw));
      var body = UI.el('div', 'body');
      var head = UI.el('button', 'ag-item-head', '#' + number(raw.id) + ' ' + it.part);
      head.type = 'button';
      head.setAttribute('aria-label', '#' + number(raw.id) + ' ' + it.part + ' — 사진에서 보기');
      head.addEventListener('click', function () { focusItem(raw.id); var f = $('ag-figure'); if (!f.hidden && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); });
      body.appendChild(head);
      var tags = UI.el('div', 'tags');
      tags.appendChild(UI.badge('badge-wait', (Store.hazard(it.hazard) || {}).icon || '', hazardLabel(it.hazard)));
      if (raw.official) tags.appendChild(UI.okBadge('공식 문서 · ' + raw.official.code + ' ' + raw.official.section));
      else tags.appendChild(raw.status === 'ok' ? UI.okBadge('출처 확인') : UI.stopBadge('확인 필요'));
      if (raw.specific) tags.appendChild(UI.neutralBadge('기계 고유'));
      if (j === 'edit') tags.appendChild(UI.okBadge('담당자: 고침'));
      /* 좌표가 없으면 지어내지 않는다 */
      if (photo && !mappedOf(raw.id)) tags.appendChild(UI.neutralBadge('위치 확인 필요'));
      var linked = quizItems().filter(function (q) { return q.hazardId === raw.id; }).map(function (q) { return q.id; });
      if (linked.length) tags.appendChild(UI.okBadge('연결 문항 ' + linked.join(', ')));
      body.appendChild(tags);
      body.appendChild(UI.el('p', 'meta', it.risk));
      if (photo && !mappedOf(raw.id) && raw.needsPhoto) body.appendChild(UI.el('p', 'meta', '필요한 사진: ' + raw.needsPhoto));
      var ref = refImage(raw);
      if (ref) body.appendChild(ref);

      var det = UI.el('details');
      det.appendChild(UI.el('summary', null, raw.status === 'ok' ? '출처 보기' : '왜 확인이 필요한가'));
      if (raw.status !== 'ok' && raw.reasons && raw.reasons.length) det.appendChild(UI.el('p', 'meta', '이유: ' + raw.reasons.join(' · ')));
      if (raw.conflict) det.appendChild(UI.el('p', 'meta', '자료끼리 다른 말: ' + raw.conflict));
      var srcs = UI.el('ul');
      (raw.sources || []).forEach(function (s) { srcs.appendChild(sourceLine(s)); });
      if (!(raw.sources || []).length) srcs.appendChild(UI.el('li', null, '확인된 출처 없음'));
      det.appendChild(srcs);
      body.appendChild(det);

      var row = UI.el('div', 'ag-judge');
      var ed = UI.el('button', 'btn-sm', '고치기');
      ed.type = 'button';
      ed.setAttribute('data-judge', 'edit');
      ed.setAttribute('aria-pressed', j === 'edit' ? 'true' : 'false');
      ed.addEventListener('click', function () {
        state.judge[raw.id] = 'edit';
        if (!state.edits[raw.id]) state.edits[raw.id] = { part: raw.part, hazard: raw.hazard === 'unknown' ? Store.HAZARDS[0].code : raw.hazard, risk: raw.risk, memo: '' };
        judged();
      });
      row.appendChild(ed);
      if (mappedOf(raw.id) && j !== 'wrong' && photo) {
        var mv = UI.el('button', 'btn-sm', state.moving === raw.id ? '사진에서 맞는 자리를 누르세요…' : '위치 고치기');
        mv.type = 'button';
        mv.setAttribute('data-move', raw.id);
        mv.addEventListener('click', function () { state.moving = state.moving === raw.id ? '' : raw.id; renderAll(); });
        row.appendChild(mv);
      }
      body.appendChild(row);
      if (j === 'edit') body.appendChild(editForm(raw));
      li.appendChild(body);
      list.appendChild(li);
    });

    if (state.itemTab === 'ok') state.added.forEach(function (a) {
      list.appendChild(UI.itemRow('pencil', a.part + ' (담당자 추가)', hazardLabel(a.hazard) + ' · ' + a.risk));
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

  /* ── 사진 — 실제 설비 사진에서 위치 찾기 ───────────────────────── */

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
    img.onerror = function () { URL.revokeObjectURL(url); $('ag-photo-status').textContent = '사진을 읽지 못했습니다. 다른 사진으로 해 주세요.'; };
    img.src = url;
  }

  function locate(send, keep) {
    var e = state.equipment;
    var items = aiItems().map(function (it) { var x = effective(it); return { id: it.id, part: x.part, hazard: x.hazard }; });
    $('ag-photo-status').textContent = 'AI 가 사진에서 위치를 찾는 중입니다…';
    call('/api/hazards', { image: send, items: items, equipment: { id: e.id } }).then(function (r) {
      if (!r.ok) { $('ag-photo-status').textContent = failText(r); afterAnalysis(); return; }
      if (!sameEquipment(r.data)) { $('ag-photo-status').textContent = '다른 설비의 결과가 왔습니다. 다시 찍어 주세요.'; return; }
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
      $('ag-photo-status').textContent = '위치 ' + r.data.mapped.length + '곳을 찾았습니다 · 위치 확인 필요 ' + (aiItems().length - r.data.mapped.length) + '개.';
      saveAnalysis();
      renderAll();
      afterAnalysis();
    });
  }

  /** 사진 위 박스 — 번호 = 목록 번호. 좌표는 %라 사진 크기가 바뀌어도 그 자리다 */
  function renderFigure() {
    var fig = $('ag-figure');
    fig.textContent = '';
    if (!(state.guided && state.keepPhoto)) { fig.hidden = true; return; }
    fig.hidden = false;
    var img = UI.el('img');
    img.src = state.keepPhoto;
    img.alt = '실제 설비 사진 (AI 위치 탐지)';
    fig.appendChild(img);
    fig.appendChild(UI.el('span', 'ag-fig-tag', '실제 설비 사진 · AI 탐지'));
    (state.guided.mapped || []).map(placed).forEach(function (m) {
      var raw = Store.findBy(aiItems(), 'id', m.id);
      if (!raw) return;
      var shown = effective(raw);
      var b = UI.el('button', 'ag-box');
      b.type = 'button';
      b.setAttribute('data-id', m.id);
      if (!included(raw)) b.setAttribute('data-judge', 'wrong');
      if (state.active === m.id) b.setAttribute('data-active', 'yes');
      b.setAttribute('aria-label', '#' + number(m.id) + ' ' + shown.part + ' — 목록에서 보기');
      b.style.left = m.box.x0 + '%';
      b.style.top = m.box.y0 + '%';
      b.style.width = (m.box.x1 - m.box.x0) + '%';
      b.style.height = (m.box.y1 - m.box.y0) + '%';
      b.appendChild(UI.el('span', 'ag-box-label', '#' + number(m.id) + ' ' + shown.part + ' · ' + hazardLabel(shown.hazard)));
      b.addEventListener('click', function (ev) { if (state.moving) return; ev.stopPropagation(); focusItem(m.id); });
      fig.appendChild(b);
    });
  }

  /* ── 참고 사진 (서버 /api/photos) — 메모리만, 저장하지 않는다 ───── */

  function findPhotos() {
    if (!serverReady() || !state.research) return;
    var e = state.equipment;
    var items = aiItems().map(function (it) {
      return { id: it.id, part: it.part, partEn: it.partEn || '', sources: (it.sources || []).map(function (s) { return { url: s.url, host: s.host, tier: s.tier }; }) };
    });
    call('/api/photos', { equipment: { id: e.id, kind: kindId(), name: e.name, maker: e.maker || '', model: e.model || '' }, items: items }).then(function (r) {
      if (!r.ok || !sameEquipment(r.data) || !r.data.images) return;
      state.images = r.data.images;
      renderItems();
    });
  }

  /* ── ③ 교육자료 — 이 설비 종류의 검수 문구 (자동) ───────────────── */

  function usablePhrases() {
    var langs = setup().languages || [];
    return Store.phrasesFor(kindId()).filter(function (p) {
      return Store.phraseOk(p, 'ko') && (!langs.length || langs.some(function (code) { return Store.phraseOk(p, code); }));
    });
  }

  function renderMaterial() {
    $('sec-material').hidden = false;
    var list = $('ag-phrases');
    list.textContent = '';
    var ps = usablePhrases();
    if (!ps.length) {
      list.appendChild(UI.itemRow('alert', '이 설비 종류의 검수 문구가 없습니다', '문구 화면에서 「' + ((Store.equipmentKind(kindId()) || {}).label || '종류') + '」 문구를 검수해 주세요. 다른 설비 문구는 쓰지 않습니다.'));
      return;
    }
    ps.forEach(function (p) {
      var li = UI.itemRow('check', p.ko, '검수 완료 · ' + p.category);
      li.setAttribute('data-phrase', p.id);
      list.appendChild(li);
    });
  }

  /* ── ④ AI 평가문항 ─────────────────────────────────────────────── */

  function quizBody(slots, avoid) {
    var e = state.equipment;
    var b = { equipment: { id: e.id, kind: kindId(), name: e.name }, hazards: includedHazards(), phrases: usablePhrases().map(function (p) { return { id: p.id, ko: p.ko }; }) };
    if (slots) b.slots = slots;
    if (avoid) b.avoid = avoid;
    return b;
  }

  function makeQuiz() {
    if (!state.research || !serverReady()) return;
    if (!includedHazards().length) { $('ag-quiz-status').textContent = '문항을 만들 위험요소가 없습니다.'; return; }
    var sig = signature();
    $('sec-quiz').hidden = false;
    $('ag-quiz-status').textContent = 'AI 가 규칙에 따라 문항을 만들고 고르는 중입니다… (30초쯤)';
    $('btn-regen-all').disabled = true;
    call('/api/questions', quizBody()).then(function (r) {
      $('btn-regen-all').disabled = false;
      if (!r.ok) { $('ag-quiz-status').textContent = failText(r); return; }
      if (!sameEquipment(r.data)) { $('ag-quiz-status').textContent = '다른 설비의 문항이 왔습니다. 다시 만들어 주세요.'; return; }
      state.quiz = r.data;
      state.quizFor = sig;
      $('ag-reviewed').checked = false;
      $('ag-quiz-status').textContent = '';
      renderAll();
    });
  }

  /** [수정 요청] — 그 칸만 같은 위험·유형·난이도로 다시 (계획은 그대로) */
  function regenOne(q) {
    if (!serverReady() || state.source === 'file') return;
    var slot = Store.findBy((state.quiz.plan && state.quiz.plan.slots) || [], 'slot', q.slot);
    if (!slot) return;
    $('ag-quiz-status').textContent = q.id + ' 을 다시 만드는 중입니다…';
    call('/api/questions', quizBody([slot], [q.prompt])).then(function (r) {
      if (!r.ok || !sameEquipment(r.data) || !r.data.quiz || !r.data.quiz.length) { $('ag-quiz-status').textContent = r.ok ? '다시 만들지 못했습니다.' : failText(r); return; }
      var fresh = r.data.quiz[0];
      fresh.id = q.id;
      state.quiz.quiz = quizItems().map(function (x) { return x.slot === q.slot ? fresh : x; });
      $('ag-reviewed').checked = false;
      $('ag-quiz-status').textContent = q.id + ' 을 다시 만들었습니다.';
      renderAll();
    });
  }

  function renderQuiz() {
    $('sec-quiz').hidden = false;
    var server = serverReady() && state.source !== 'file';
    $('btn-regen-all').textContent = state.quiz ? '전체 다시 만들기' : 'AI 문항 만들기';
    $('btn-regen-all').disabled = !server;
    $('btn-hold').textContent = state.hold ? '보류 풀기' : '발급 보류';
    var plan = $('ag-plan');
    plan.textContent = '';
    var ol = $('ag-quiz');
    ol.textContent = '';
    if (!state.quiz) {
      $('ag-quiz-status').textContent = undecided().length
        ? '「확인 필요」 판정이 끝나면 AI 가 문항을 만듭니다.'
        : (server ? '' : '서버 없이는 문항을 만들 수 없습니다 — 문항이 든 결과 파일을 불러오세요.');
      return;
    }
    if (quizStale()) plan.appendChild(UI.itemRow('alert', '위험요소 판정이 바뀌었습니다', server ? '[전체 다시 만들기]를 눌러 문항에 반영하세요.' : '서버에서 다시 만들어야 반영됩니다. 지금 문항은 결과 파일의 판정 기준입니다.'));
    var p = state.quiz.plan || {};
    plan.appendChild(UI.itemRow('list', '문항 ' + quizItems().length + '개 · 규칙 ' + (state.quiz.rulesVersion || p.rulesVersion || ''), (p.reasons || []).join(' / ')));
    if ((state.quiz.missing || []).length) plan.appendChild(UI.itemRow('alert', '못 채운 칸 ' + state.quiz.missing.length + '개', '규칙을 통과한 후보가 없었습니다. [전체 다시 만들기]를 눌러 주세요.'));
    if ((state.quiz.excluded || []).length) {
      var li0 = UI.el('li');
      var det = UI.el('details');
      det.appendChild(UI.el('summary', null, '규칙에 걸려 뺀 후보 ' + state.quiz.excluded.length + '개 — 자세히 보기'));
      var ul = UI.el('ul', 'item-list');
      state.quiz.excluded.forEach(function (x) { ul.appendChild(UI.itemRow('alert-circle', '칸 ' + x.slot + ' · ' + (x.prompt || '(글 없음)'), (x.why || []).join(', '))); });
      det.appendChild(ul);
      li0.appendChild(det);
      plan.appendChild(li0);
    }

    quizItems().forEach(function (q) {
      var li = UI.el('li', 'ag-q');
      li.setAttribute('data-q', q.id);
      var head = UI.el('div', 'tags');
      head.appendChild(UI.el('strong', null, q.id));
      head.appendChild(UI.neutralBadge(SUBTYPE[q.subtype] || q.type));
      if (LEVEL[q.difficulty]) head.appendChild(UI.neutralBadge(LEVEL[q.difficulty]));
      if (q.answerFrom && q.answerFrom.indexOf('phrase:') === 0) head.appendChild(UI.okBadge('정답: 검수 문구'));
      else if (q.answerFrom === 'photo') head.appendChild(UI.okBadge('사진 위치 (AI 탐지 좌표)'));
      else head.appendChild(UI.waitBadge('AI 작성 — 검토 필요'));
      li.appendChild(head);
      var hz = Store.findBy(aiItems(), 'id', q.hazardId) || Store.findBy(state.added, 'id', q.hazardId);
      var link = UI.el('button', 'ag-item-head', '위험요소 #' + (number(q.hazardId) > 0 ? number(q.hazardId) : q.hazardId) + ' ' + (hz ? effective(hz).part : '(빠진 위험)'));
      link.type = 'button';
      link.addEventListener('click', function () { if (number(q.hazardId) > 0) focusItem(q.hazardId); });
      li.appendChild(link);
      li.appendChild(UI.el('p', 'ag-q-prompt', q.prompt));
      if (q.options) {
        var opts = UI.el('ul', 'ag-q-options');
        q.options.forEach(function (o, i) {
          var row = UI.el('li', null, (i === q.answer ? '● 정답 — ' : '○ ') + o);
          if (i === q.answer) row.setAttribute('data-right', 'yes');
          opts.appendChild(row);
        });
        li.appendChild(opts);
      } else {
        li.appendChild(UI.el('p', 'meta', '정답 위치: 사진의 #' + number(q.hazardId) + ' 박스 (반지름 ' + (q.answer && q.answer.r) + '%)'));
      }
      (q.warnings || []).forEach(function (w) { li.appendChild(UI.itemRow('alert', '검토할 점: ' + w, '규칙상 버리지는 않았지만 담당자가 확인할 부분입니다.')); });
      if (q.why) li.appendChild(UI.el('p', 'meta', '해설: ' + q.why));
      if (q.prevention) li.appendChild(UI.el('p', 'meta', '안전수칙·예방조치: ' + q.prevention));
      if (q.evidence) li.appendChild(UI.el('p', 'meta', '탐지 근거: ' + q.evidence));
      if ((q.sources || []).length) {
        var srcs = UI.el('ul', 'meta');
        q.sources.forEach(function (s) {
          var sl = UI.el('li');
          var a = UI.el('a', null, s.title || s.url);
          if (/^https?:\/\//i.test(String(s.url))) a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          sl.appendChild(a);
          srcs.appendChild(sl);
        });
        li.appendChild(srcs);
      }
      if (server && q.type !== 'hotspot') {
        var re = UI.el('button', 'btn-sm', '수정 요청 (이 문항 다시 만들기)');
        re.type = 'button';
        re.setAttribute('data-regen', q.id);
        re.addEventListener('click', function () { regenOne(q); });
        li.appendChild(re);
      }
      ol.appendChild(li);
    });
    if (!server) $('ag-quiz-status').textContent = '결과 파일의 문항입니다. 수정 요청·다시 만들기는 배포 주소(서버)에서 됩니다.';
  }

  /* ── ⑤ 검토 후 발급 ──────────────────────────────────────────── */

  function aiWrittenCount() { return quizItems().filter(function (q) { return q.aiWritten; }).length; }

  function steps() {
    var left = undecided().length;
    var qs = quizItems();
    var slots = (state.quiz && state.quiz.plan && state.quiz.plan.slots) || [];
    var missingReq = state.quiz ? (state.quiz.missing || []).filter(function (n) { var s = Store.findBy(slots, 'slot', n); return s && s.required; }).length : 0;
    var aiN = aiWrittenCount();
    var ps = usablePhrases().length;
    /* 규칙 §9.4 발급 막기 — 서버가 판정한 이유 (필수 주제 빠짐·최소 문항 미달 등) */
    var blocked = state.quiz && state.quiz.issuable && !state.quiz.issuable.ok ? (state.quiz.issuable.why || []) : [];
    return [
      { what: '설비', done: !!state.equipment, note: state.equipment ? state.equipment.name : '미선택' },
      { what: 'AI 위험요소 분석', done: !!state.research, note: state.research ? aiItems().length + '개' : '안 함' },
      { what: '「확인 필요」 판정', done: !!state.research && left === 0, note: left ? left + '개 남음' : '다 봄' },
      { what: '교육자료 (검수 문구)', done: ps > 0, note: ps + '개' },
      { what: 'AI 평가문항', done: qs.length > 0 && !quizStale() && !missingReq && !blocked.length,
        note: quizStale() ? '다시 만들어야 함' : (missingReq ? '필수 칸 ' + missingReq + '개 비어 있음' : (blocked.length ? blocked.join(' · ') : qs.length + '문항')) },
      { what: 'AI 작성 문항 검토', done: !aiN || $('ag-reviewed').checked, note: aiN ? (aiN + '개 · ' + ($('ag-reviewed').checked ? '검토함' : '검토 표시 필요')) : '없음' },
      { what: '발급 보류 아님', done: !state.hold, note: state.hold ? '보류 중' : '진행' },
      { what: '교육 제목', done: !!$('ag-title').value.trim(), note: $('ag-title').value.trim() || '없음' }
    ];
  }

  function renderApprove() {
    if (!state.research) return;
    $('sec-approve').hidden = false;
    var aiN = aiWrittenCount();
    $('ag-reviewed-row').hidden = !aiN;
    $('ag-reviewed-text').textContent = 'AI 작성 문항 ' + aiN + '개의 문장·정답·해설을 검토했습니다';
    var list = $('ag-check');
    list.textContent = '';
    var all = steps();
    all.forEach(function (s) {
      var li = UI.el('li');
      li.setAttribute('data-done', s.done ? 'yes' : 'no');
      li.appendChild(UI.el('span', 'what', s.what));
      li.appendChild(s.done ? UI.okBadge(s.note) : UI.neutralBadge(s.note));
      if (s.what === '「확인 필요」 판정' && !s.done) {
        var go = UI.el('button', 'btn-sm', '확인 필요 보기');
        go.type = 'button';
        go.addEventListener('click', function () { state.itemTab = 'check'; renderItems(); $('sec-items').scrollIntoView(); });
        li.appendChild(go);
      }
      list.appendChild(li);
    });
    var langs = (setup().languages || []).filter(function (c) { return c !== 'ko'; });
    $('ag-lang-note').textContent = langs.length ? '문항 문장은 아직 한국어로만 나갑니다 (음성으로 읽어 줍니다).' : '';
    $('btn-approve').disabled = !all.every(function (s) { return s.done; });
  }

  function renderAll() {
    if (!state.research) return;
    renderItems();
    renderFigure();
    renderMaterial();
    renderQuiz();
    renderApprove();
  }

  function reviewRecord() {
    var count = { right: 0, wrong: 0, edit: 0 };
    Object.keys(state.judge).forEach(function (id) { count[state.judge[id]] += 1; });
    return {
      right: count.right, wrong: count.wrong, edited: count.edit, added: state.added.length, moved: Object.keys(state.moves).length,
      wrongParts: aiItems().filter(function (it) { return state.judge[it.id] === 'wrong'; }).map(function (it) { return it.part; }),
      addedParts: state.added.map(function (a) { return a.part; })
    };
  }

  function approve() {
    if (!steps().every(function (s) { return s.done; })) { UI.toast('아직 채우지 않은 단계가 있습니다.'); return; }
    var e = state.equipment;
    var quiz = quizItems().map(function (q) { var c = JSON.parse(JSON.stringify(q)); delete c.slot; return c; });
    var usesPhoto = quiz.some(function (q) { return q.type === 'hotspot'; });
    var course = {
      id: Store.uid(),
      title: $('ag-title').value.trim().slice(0, 60),
      equipmentId: e.id,
      languages: (setup().languages || []).slice(),
      phraseIds: usablePhrases().map(function (p) { return p.id; }),
      quiz: quiz,
      dueAt: '',
      approved: true,
      createdAt: new Date().toISOString(),
      photo: usesPhoto ? state.keepPhoto : '',
      /* 문항 ↔ 위험요소 추적 — 서버(api/_courses.mjs)가 equipmentId·hazardId 를 맞춰 본다 */
      hazards: includedHazards().map(function (h) {
        return { id: h.id, equipmentId: e.id, part: h.part, hazard: h.hazard, risk: h.risk, status: h.status, official: h.official, specific: h.specific, box: h.box, sources: h.sources };
      }),
      rulesVersion: (state.quiz && (state.quiz.rulesVersion || (state.quiz.plan && state.quiz.plan.rulesVersion))) || '',
      aiDraft: {
        model: state.research.model || '', at: new Date().toISOString(), source: state.source,
        items: aiItems().length, checks: aiItems().filter(function (i) { return i.status !== 'ok'; }).length,
        mapped: state.guided ? state.guided.mapped.length : 0,
        questions: quiz.length, aiWritten: aiWrittenCount(), excluded: (state.quiz.excluded || []).length,
        review: reviewRecord()
      }
    };
    var result = Store.courses.update(function (list) { list.push(course); });
    if (!result.ok) { UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.'); return; }
    UI.toast('발급했습니다. 「' + course.title + '」이 노동자 수강 화면에 나타납니다.');
    state = emptyState(e);
    ['sec-items', 'sec-material', 'sec-quiz', 'sec-approve'].forEach(function (id) { $(id).hidden = true; });
    $('ag-figure').hidden = true;
    $('btn-approve').disabled = true;
    $('ag-title').value = '';
    $('ag-title').removeAttribute('data-auto');
    $('ag-reviewed').checked = false;
    $('ag-research-status').textContent = '「' + course.title + '」을 발급했습니다. 다른 설비를 고르거나 다시 분석하세요.';
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
  $('btn-regen-all').addEventListener('click', makeQuiz);
  $('btn-hold').addEventListener('click', function () {
    state.hold = !state.hold;
    UI.toast(state.hold ? '발급을 보류했습니다. 문항·위험요소를 고친 뒤 보류를 풀어 주세요.' : '보류를 풀었습니다.');
    renderAll();
  });
  $('ag-reviewed').addEventListener('change', renderApprove);
  $('ag-title').addEventListener('input', function (ev) {
    if (ev.isTrusted) $('ag-title').setAttribute('data-auto', 'no');
    renderApprove();
  });
  $('btn-approve').addEventListener('click', approve);
  /* 위치 고치기 — 사진을 한 번 누르면 그 자리가 새 정답 중심이 된다 */
  $('ag-figure').addEventListener('click', function (ev) {
    if (!state.moving) return;
    var r = $('ag-figure').getBoundingClientRect();
    if (!r.width || !r.height) return;
    var x = Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10;
    var y = Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10;
    state.moves[state.moving] = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    state.moving = '';
    renderAll();
  });

  renderEquipments();
  if (!serverReady()) $('offline-note').hidden = false;

  /* 검사가 화면 안쪽을 볼 수 있게 — 화면 동작에는 쓰지 않는다 */
  window.__autogen = {
    state: function () { return state; }, loadRun: loadRun, readRun: readRun, steps: steps,
    includedHazards: includedHazards, signature: signature, usablePhrases: usablePhrases
  };
})();
