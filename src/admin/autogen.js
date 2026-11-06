/* ===================================================================
   autogen.js — AI로 교육 만들기 (담당자) · PRD-AD-08 S1~S4·S6 + 1클릭 승인

   읽는 키: setup, library, courses
   쓰는 키: courses (승인·발급 때만 — 그 전에는 아무것도 저장하지 않는다)

   흐름: 설비 고르기 → /api/research(주의사항) → 사진 → /api/hazards 안내형(위치)
         → 문항 초안 → [승인·발급] 한 번

   이 파일이 코드로 지키는 것 —

   · 승인 전에는 courses 에 쓰지 않는다 (AC-AD-08-05). 초안은 메모리에만 있다.
   · 「확인 필요」 항목은 펼쳐 보이고 문항에 기본으로 넣지 않는다 (FR-AD-08-14).
     담당자가 직접 체크해야 들어간다.
   · 안전 문구는 status === 'reviewed' 만 고를 수 있다 (P-1). AI 는 문구를 쓰지 않는다.
   · AI 가 준 글(설명·이유·출처 제목)은 textContent 로만 보인다 (FR-AD-08-25).
   · 서버는 net.js 로만 부른다. https 가 아니면 부르지 않고 손 흐름으로 안내한다.
   · 사진 원본은 저장하지 않는다. 문항에 쓰는 것은 긴 변 640px 로 줄인 사본 하나다.

   ponytail: 문항 사진을 courses 안에 data URL 로 둔다 — 교육 1건에 사진 1장(약 50~90KB)이
             동기화 상한(512KB)·localStorage(5MB)를 먹는다. 파일 저장소(PRD-AD-08 §11 Q4)가
             생기면 사진 id 로 바꾼다.
   ponytail: 문항 문장은 한국어 틀 하나다. 노동자는 한국어로 본다(번역 없음 안내를 띄운다).
             문항 번역을 AD-03 운영자 AI 번역·검수 흐름에 태우면 풀린다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillAdminBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  /* ── 결정에 걸린 값 ─────────────────────────────────────────────── */
  var SEND_MAX = 1024;        // 서버로 보내는 사진 긴 변 (FR-AD-07-03 · /api/hazards 상한 1.5MB 안)
  var SEND_QUALITY = 0.85;
  var KEEP_MAX = 640;         // 문항에 남기는 사진 긴 변
  var KEEP_QUALITY = 0.7;
  var TIMEOUT_MS = 60000;     // 리서치는 검색을 몇 번 해서 오래 걸린다 (서버 45초 + 여유)

  /* 초안 — 메모리에만. 새로고침하면 사라진다 (반쯤 만든 교육이 노동자에게 가지 않게) */
  var state = { equipment: null, research: null, guided: null, keepPhoto: '', include: {} };

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

  /** 실패를 사람 말로. 서버가 준 message 가 있으면 그것을 쓴다 */
  function failText(r) {
    if (r.failed) return r.failed === 'timeout' ? 'AI 가 제시간에 답하지 못했습니다.' : '서버에 닿지 못했습니다.';
    return (r.data && r.data.message) || ('AI 가 답하지 못했습니다 (' + r.status + ').');
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

  /* ── S2 리서치 ─────────────────────────────────────────────────── */

  function startResearch() {
    var e = state.equipment;
    if (!e) return;
    if (!serverReady()) { $('offline-note').hidden = false; return; }

    state.research = null;
    state.guided = null;
    state.include = {};
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
        (r.data.items || []).forEach(function (it) { state.include[it.id] = it.status === 'ok'; });
        $('ag-research-status').textContent = '조사를 마쳤습니다.';
        renderItems();
        $('sec-photo').hidden = false;
        renderApprove();
      });
  }

  function sourceLine(s) {
    var li = UI.el('li');
    var a = UI.el('a', null, (s.title || s.host) + ' (' + s.host + ')');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.appendChild(a);
    li.appendChild(UI.el('span', 'meta', ' · ' + ['', '제조사', '공공기관', '일반 웹', '동영상'][s.tier]));
    return li;
  }

  function mappedOf(id) {
    return state.guided ? Store.findBy(state.guided.mapped || [], 'id', id) : null;
  }

  function renderItems() {
    var data = state.research;
    $('sec-items').hidden = false;
    $('ag-overview').textContent = data.overview || '';
    var items = data.items || [];
    var checks = items.filter(function (i) { return i.status !== 'ok'; }).length;
    $('ag-summary').textContent = '항목 ' + items.length + '개 · 확인 필요 ' + checks + '개 · 출처 사이트 ' + data.sourceCount + '곳'
      + (data.general ? ' · 모델명 자료가 없어 일반 자료로 조사했습니다' : '')
      + (data.thin ? ' · 자료가 모자라 전부 확인이 필요합니다' : '');

    var list = $('ag-items');
    list.textContent = '';
    items.forEach(function (it) {
      var li = UI.el('li', 'item');
      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, it.part));
      var tags = UI.el('div', 'tags');
      tags.appendChild(UI.badge('badge-wait', (Store.hazard(it.hazard) || {}).icon || '', hazardLabel(it.hazard)));
      tags.appendChild(it.status === 'ok' ? UI.okBadge('출처 확인') : UI.stopBadge('확인 필요'));
      var m = mappedOf(it.id);
      if (m) tags.appendChild(UI.okBadge('사진 위치 있음'));
      body.appendChild(tags);
      body.appendChild(UI.el('p', 'meta', it.risk));

      /* 확인 필요는 펼쳐 둔다 — 이유 · 충돌 · 출처를 바로 본다 */
      var det = UI.el('details');
      if (it.status !== 'ok') det.open = true;
      det.appendChild(UI.el('summary', null, it.status === 'ok' ? '출처 보기' : '왜 확인이 필요한가'));
      if (it.reasons && it.reasons.length) det.appendChild(UI.el('p', 'meta', '이유: ' + it.reasons.join(' · ')));
      if (it.conflict) det.appendChild(UI.el('p', 'meta', '자료끼리 다른 말: ' + it.conflict));
      var srcs = UI.el('ul');
      (it.sources || []).forEach(function (s) { srcs.appendChild(sourceLine(s)); });
      if (!(it.sources || []).length) srcs.appendChild(UI.el('li', null, '확인된 출처 없음'));
      det.appendChild(srcs);
      body.appendChild(det);

      var pick = UI.chip({ type: 'checkbox', name: 'ag-include', value: it.id, label: '문항에 넣기', checked: !!state.include[it.id] });
      pick.querySelector('input').addEventListener('change', function (ev) {
        state.include[it.id] = ev.target.checked;
        renderApprove();
      });
      body.appendChild(pick);

      li.appendChild(body);
      list.appendChild(li);
    });
  }

  /* ── S3 사진 ───────────────────────────────────────────────────── */

  /** 긴 변을 max 로 줄인 JPEG data URL */
  function shrink(img, max, quality) {
    var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }

  function onPhoto(file) {
    if (!file || !state.research) return;
    if (!serverReady()) { $('offline-note').hidden = false; return; }
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
    var items = (state.research.items || []).map(function (it) { return { id: it.id, part: it.part, hazard: it.hazard }; });
    $('ag-photo-status').textContent = 'AI 가 사진에서 위치를 찾는 중입니다…';
    call('/api/hazards', { image: send, items: items }).then(function (r) {
      if (!r.ok) {
        $('ag-photo-status').textContent = failText(r) + ' 교육 콘텐츠 생성 화면의 그림에서 직접 고를 수 있습니다.';
        return;
      }
      if (r.data.person) {
        /* 사람이 찍힌 사진은 남기지 않는다 (FR-AD-07-20) */
        state.guided = null;
        state.keepPhoto = '';
        $('ag-figure').hidden = true;
        $('ag-photo-status').textContent = '사람이 찍혔어요. 설비만 다시 찍어 주세요.';
        renderItems();
        renderApprove();
        return;
      }
      state.guided = r.data;
      state.keepPhoto = keep;
      $('ag-photo-status').textContent = '위치 ' + r.data.mapped.length + '곳을 찾았습니다'
        + (r.data.missing.length ? ' · 사진이 더 필요한 곳 ' + r.data.missing.length + '곳' : '') + '.';
      renderFigure();
      renderMissing();
      renderItems();
      renderApprove();
    });
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
      var b = UI.el('div', 'ag-box');
      b.style.left = m.box.x0 + '%';
      b.style.top = m.box.y0 + '%';
      b.style.width = (m.box.x1 - m.box.x0) + '%';
      b.style.height = (m.box.y1 - m.box.y0) + '%';
      b.appendChild(UI.el('span', 'ag-box-label', m.part + ' · ' + hazardLabel(m.hazard)));
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

  /** 넣기로 한 항목 중 사진 위치가 있는 것 → hotspot 문항 */
  function draftQuiz() {
    if (!state.guided || !state.keepPhoto) return [];
    var out = [];
    (state.research.items || []).forEach(function (it) {
      if (!state.include[it.id]) return;
      var m = mappedOf(it.id);
      if (!m) return;
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
      /* 미리 체크: 문구 분류가 설비 이름에 들어 있거나 「공통」 — 담당자가 바꿀 수 있다 */
      var match = !!(e && p.category && (e.name.indexOf(p.category) !== -1 || p.category === '공통'));
      var c = UI.chip({ type: 'checkbox', name: 'ag-phrase', value: p.id, label: p.ko, sub: p.category || '', checked: match });
      c.querySelector('input').addEventListener('change', renderApprove);
      box.appendChild(c);
    });
  }

  function steps() {
    var quiz = draftQuiz();
    return [
      { what: '설비', done: !!state.equipment, note: state.equipment ? state.equipment.name : '미선택' },
      { what: '주의사항 조사', done: !!state.research, note: state.research ? (state.research.items || []).length + '개' : '안 함' },
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
      /* 기록일 뿐 판정이 아니다 — 무엇을 AI 가 제안했고 몇 개를 사람이 넣었나 (성공 지표) */
      aiDraft: {
        model: state.research.model || '',
        at: new Date().toISOString(),
        items: (state.research.items || []).length,
        checks: (state.research.items || []).filter(function (i) { return i.status !== 'ok'; }).length,
        mapped: state.guided.mapped.length
      }
    };
    var result = Store.courses.update(function (list) { list.push(course); });
    if (!result.ok) { UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.'); return; }
    UI.toast('발급했습니다. 「' + course.title + '」이 노동자 수강 화면에 나타납니다.');
    state = { equipment: e, research: null, guided: null, keepPhoto: '', include: {} };
    ['sec-items', 'sec-photo', 'sec-approve'].forEach(function (id) { $(id).hidden = true; });
    $('ag-figure').hidden = true;
    $('ag-research-status').textContent = '';
    $('ag-photo-status').textContent = '';
  }

  /* ── 연결 ──────────────────────────────────────────────────────── */

  $('ag-equip').addEventListener('change', showSpec);
  $('btn-research').addEventListener('click', startResearch);
  $('ag-photo').addEventListener('change', function (ev) { onPhoto(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
  $('ag-title').addEventListener('input', renderApprove);
  $('btn-approve').addEventListener('click', approve);

  renderEquipments();
  if (!serverReady()) $('offline-note').hidden = false;

  /* 검사가 화면 안쪽을 볼 수 있게 — 화면 동작에는 쓰지 않는다 */
  window.__autogen = { state: function () { return state; }, draftQuiz: draftQuiz };
})();
