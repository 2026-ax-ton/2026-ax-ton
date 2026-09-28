/* ===================================================================
   ui.js — 화면 다섯 개가 똑같이 다시 만들게 되는 조각들

   ★ 여기 있는 것을 각자 화면에서 다시 만들지 말 것.
     같은 배지를 네 사람이 네 가지 모양으로 만들면 그때부터 디자인이 흩어진다.

   ★ 새로 필요한 공용 조각이 생기면 팀에 말하고 여기 추가한다.
     이 파일은 네 명이 공유하므로, 말없이 고치면 충돌한다.

   문서에서 온 규칙 중 이 파일이 지키는 것
     · 상태는 색만으로 구분하지 않는다 — 배지는 아이콘 + 글자 + 색 3중
     · 사용자가 넣은 문자열은 항상 textContent 로만 넣는다 (innerHTML 금지)
   =================================================================== */

var UI = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* 요소 하나 만들기.
     텍스트를 textContent 로만 넣는다 — 설비 이름 한 줄로 화면이 깨지면 안 된다. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* 아이콘 하나. 이름이든 이모지든 받는다.
     ★ icons.js 가 없거나 모르는 값이면 글자를 그대로 넣는다 —
       조용히 사라지지 않는다 (담당자가 넣은 그림문자도 그대로 보인다). */
  function iconNode(value) {
    if (typeof Icons !== 'undefined' && Icons && typeof Icons.node === 'function') {
      return Icons.node(value);
    }
    return document.createTextNode(value == null ? '' : String(value));
  }

  /* 아이콘을 담는 칸. 뜻은 옆 글자가 나르므로 낭독기에서는 숨긴다. */
  function iconBox(value, className, tag) {
    var box = el(tag || 'span', className || null);
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(iconNode(value));
    return box;
  }

  /* 이미 있는 칸의 그림만 갈아 끼운다 (화면이 다시 그릴 때).
     ★ textContent = 이모지 대신 이것을 쓴다. */
  function setIcon(node, value) {
    if (!node) return node;
    node.textContent = '';
    node.setAttribute('aria-hidden', 'true');
    node.appendChild(iconNode(value));
    return node;
  }

  /* 상태 배지 — 아이콘 + 글자 + 색.
     흑백으로 봐도 뜻이 남아야 한다 (SCREEN §4 · PRD §9.4)

     ★ 아이콘 이름은 모양이 서로 달라야 한다 — 체크 / 찬 원 / 삼각형 / 빈 원.
       색이 사라지는 흑백 인쇄에서 뜻을 나르는 것은 모양이다. */
  function badge(kind, icon, text) {
    var node = el('span', 'badge ' + kind);
    node.appendChild(iconBox(icon, 'ico'));
    node.appendChild(document.createTextNode(' ' + text));
    return node;
  }

  /* 배지에서 아이콘을 뺀 글자만.

     ★ "한글이 아닌 것은 아이콘" 으로 걸러내면 안 된다. 배지 글자는
       노동자의 언어라서, 크메르어 배지는 통째로 사라지고 소리에서도
       빠진다 — 글을 못 읽는 사람에게는 그 정보가 아예 없는 것이 된다.
       badge() 가 아이콘 다음에 글자를 텍스트 노드로 붙이므로
       텍스트 노드만 모으면 어느 언어든 남는다. */
  function badgeText(node) {
    if (!node || !node.childNodes) return '';
    return [].slice.call(node.childNodes)
      .filter(function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.nodeValue || ''; })
      .join('').trim();
  }

  function okBadge(text)      { return badge('badge-ok', 'check', text); }
  function waitBadge(text)    { return badge('badge-wait', 'dot', text); }
  function stopBadge(text)    { return badge('badge-stop', 'alert', text); }
  function neutralBadge(text) { return badge('badge-neutral', 'circle', text); }

  /* 교육 기한 배지 — courses[].dueAt 을 기능2(발급 목록)와 기능6(대시보드)이
     같은 판정으로 읽는다. 이 계산을 화면마다 두면 한쪽만 고쳐져서
     두 화면이 서로 다른 날짜를 말하게 된다.

     ★ 기한은 선택이다. 없을 때 배지를 그리지 않고 넘기지 않는다 —
       "미정" 도 담당자가 알아야 하는 상태다. */
  function dueBadge(dueAt) {
    if (!dueAt) return neutralBadge('기한 미정');
    var due = new Date(dueAt);
    if (isNaN(due.getTime())) return neutralBadge('기한 미정');

    var days = Math.ceil((due - new Date()) / 86400000);
    if (days < 0) return stopBadge('기한 ' + (-days) + '일 지남');
    return days <= 7 ? waitBadge('D-' + days) : neutralBadge('D-' + days);
  }

  /* 검수 상태 배지 — library 의 status 를 그대로 받는다 */
  function phraseBadge(status) {
    var s = Store.PHRASE_STATUS[status] || Store.PHRASE_STATUS.waiting;
    return badge(s.badge, s.icon, s.label);
  }

  /* 선택 칩 — 언어 / 위험유형 / 픽토그램.
     체크박스를 감춘 label 이다. :has() 없이 :checked + span 으로 칠해서
     구형 안드로이드 웹뷰에서도 상태가 보인다 (PRD §9.1 저사양 지원). */
  function chip(opts) {
    var label = el('label');
    var input = document.createElement('input');
    input.type = opts.type || 'checkbox';
    input.name = opts.name;
    input.value = opts.value;
    if (opts.checked) input.checked = true;
    if (opts.disabled) input.disabled = true;

    var box = el('span', 'chip');
    if (opts.icon) box.appendChild(iconBox(opts.icon, 'ico'));
    if (opts.label) box.appendChild(el('span', null, opts.label));
    if (opts.sub) box.appendChild(el('span', 'sub', opts.sub));
    box.appendChild(iconBox('check', 'mark'));

    label.appendChild(input);
    label.appendChild(box);
    return label;
  }

  function checkedValues(name, root) {
    return $$('input[name="' + name + '"]:checked', root).map(function (n) { return n.value; });
  }

  function pickedValue(name, root) {
    var node = (root || document).querySelector('input[name="' + name + '"]:checked');
    return node ? node.value : '';
  }

  /* select 를 다시 채우되 고르던 값은 살린다.
     목록을 갈아끼울 때마다 선택이 첫 항목으로 튀면 입력하다 말고 다시 골라야 한다. */
  function fillSelect(select, items, getValue, getLabel) {
    var keep = select.value;
    select.textContent = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = getValue(item);
      opt.textContent = getLabel(item);
      select.appendChild(opt);
    });
    if (keep) select.value = keep;
    if (!select.value && items.length) select.selectedIndex = 0;
  }

  /* 저장됐다는 사실이 눈에 보여야 한다 */
  var toastTimer = null;
  function toast(msg) {
    var box = $('toast');
    if (!box) {                       // 페이지에 자리가 없으면 하나 만들어 둔다
      box = el('div', 'toast');
      box.id = 'toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 2200);
  }

  /* 빈 목록 — 무엇을 하면 되는지 한 줄로 말한다 */
  function emptyRow(text) {
    var li = el('li');
    li.appendChild(el('p', 'empty', text));
    return li;
  }

  /* 목록 한 줄 — 아이콘 + 제목 + 부제 */
  function itemRow(icon, title, meta) {
    var li = el('li', 'item');
    li.appendChild(iconBox(icon, 'ico'));
    var body = el('div', 'body');
    body.appendChild(el('strong', null, title));
    if (meta) body.appendChild(el('p', 'meta', meta));
    li.appendChild(body);
    return li;
  }

  /* 관리자 화면 상단 머리띠를 채운다. 세 화면이 똑같이 필요하다. */
  function fillAdminBar(user) {
    var setup = Store.setup.load();
    var nameNode = $('head-site');
    var subNode = $('head-sub');
    if (nameNode) nameNode.textContent = setup.site.name || user.siteName || '사업장 미등록';
    if (subNode) {
      subNode.textContent = [user.name, user.title].filter(Boolean).join(' · ') || user.userId;
    }
    var chipNode = $('role-chip');
    if (chipNode) {
      chipNode.className = 'role-chip ' + (user.role === 'operator' ? 'operator' : 'admin');
      chipNode.textContent = '';
      var ico = iconBox(user.role === 'operator' ? 'search' : 'tools', 'ico');
      ico.setAttribute('aria-hidden', 'true');
      chipNode.appendChild(ico);
      chipNode.appendChild(document.createTextNode(' ' + Store.role(user.role).label));
    }
    var out = $('btn-logout');
    if (out) out.addEventListener('click', Auth.logout);
  }

  /* 노동자 화면 상단 머리띠.
     관리자 화면과 색이 달라야 한다 — 같은 폰을 돌려 쓸 때 지금 누구 화면인지 헷갈리면 안 된다. */
  function fillWorkerBar(user) {
    var setup = Store.setup.load();
    var nameNode = $('head-site');
    var subNode = $('head-sub');
    if (nameNode) nameNode.textContent = setup.site.name || user.siteName || '';
    if (subNode) {
      var lang = Store.language(user.lang);
      var proc = Store.findBy(setup.processes, 'id', user.processId);
      subNode.textContent = [user.userId, lang && lang.name, proc && proc.name]
        .filter(Boolean).join(' · ');
    }
    var out = $('btn-logout');
    if (out) out.addEventListener('click', Auth.logout);
  }

  /* 하단 탭에서 지금 페이지에 표시를 준다.
     탭은 페이지마다 복사되므로, 현재 위치 표시만 여기서 공통으로 한다. */
  function markCurrentTab() {
    var here = location.pathname.split('/').pop();
    $$('.tabbar a').forEach(function (a) {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* 저장소가 막힌 환경(시크릿 모드 등)이면 화면 위에 알린다 */
  function warnIfBlocked() {
    var node = $('blocked');
    if (node) node.hidden = Store.available();
  }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('ko-KR'); } catch (e) { return ''; }
  }

  /* -------------------------------------------------------------------
     음성 — 문해력을 전제하지 않는다 (SCREEN §4 · PRD §9.1)

     브라우저 내장 speechSynthesis 만 쓴다. 외부 요청 0건 규칙 때문에
     클라우드 TTS 를 부를 수 없고, 부르지 않아도 대부분의 기기에서 소리가 난다.

     ★ 그 언어 음성이 기기에 없을 때 조용히 실패하지 않는다.
       크메르어 음성이 깔린 안드로이드는 흔하지 않다. 소리가 안 났는데
       난 줄 알고 넘어가면, 글자를 못 읽는 사람은 아무것도 못 받은 채 통과한다.
       그래서 그 사실을 화면에 적는다 (voiceNote).

     ★★ 그때 한국어로 대신 읽지 않는다 — 기본은 소리를 내지 않는 것이다.
       크메르어 노동자에게 한국어 음성은 대부분 뜻이 닿지 않는다. 소리는
       나는데 아무것도 전달되지 않으면 사람은 "들었다" 고 생각하고 넘어간다.
       그게 이 제품이 막으려는 상황 그 자체다.

       그래도 없애지는 않았다. 말은 알아듣는데 글은 못 읽는 사람이 흔하고,
       그 사람에게는 한국어 음성이 유일한 통로다. 그래서 마이 화면에서
       고르게 한다 (Store.prefs.voiceFallback · voiceSilent).

     ★★ "있다고 대답해 놓고 소리를 안 내는 브라우저" 도 조용히 실패하지 않는다.
       카카오톡 안에서 열리는 브라우저가 그렇다. speechSynthesis 가 있다고
       대답하고, 목소리 목록도 주고, speak() 도 받아 놓고, 아무 소리도 안 난다.
       그런데 현장에서 교육 링크를 보내는 가장 흔한 방법이 카톡이다.

       그래서 브라우저 이름을 넘겨짚지 않고 실제 결과를 본다 — 읽으라고 시킨 뒤
       소리가 시작됐다는 신호가 안 오면 소리가 안 나는 것으로 본다 (markVoiceDead).
       그러면 카톡이든 나중에 나올 무엇이든 같은 방법으로 걸린다.
       걸리면 화면에 적고(voiceNote), 버튼 그림도 🔇 로 바꾼다 —
       글자를 못 읽는 사람에게 문장은 닿지 않고 그림이 닿는다.
     ------------------------------------------------------------------- */

  var VOICE_TAG = {
    km: 'km-KH', id: 'id-ID', vi: 'vi-VN',
    ne: 'ne-NP', th: 'th-TH', ko: 'ko-KR'
  };

  function speechReady() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /* 지금 화면을 보는 사람의 언어. i18n.js 와 같은 통로를 쓴다. */
  function myLang() {
    try {
      var u = (typeof Auth !== 'undefined') && Auth.current();
      return (u && u.lang) || 'ko';
    } catch (e) {
      return 'ko';
    }
  }

  /* 내 언어 음성이 이 기기에 없을 때 무엇을 할지 (마이 화면에서 고른다).
     기본은 'silent' — 뜻이 안 닿는 소리가 나면 사람은 "들었다" 고 넘어간다. */
  function voiceFallback() {
    try { return Store.prefs.load().voiceFallback || 'silent'; } catch (e) { return 'silent'; }
  }

  /* 눌러도 소리가 안 나는 상태인가.

     ★ 이걸 따로 두는 이유 — voiceBlocked() 는 "브라우저가 소리를 못 낸다" 이고,
       이건 "낼 수는 있는데 이 사람 언어로는 못 낸다" 다. 원인이 다르면
       사람이 할 수 있는 일도 다르다. 한쪽은 다른 브라우저로 열기,
       한쪽은 마이에서 한국어로 듣기를 켜기다. */
  function voiceSilent(langCode) {
    var l = langCode || myLang();
    if (!l || l === 'ko') return false;        // 한국어는 되돌림의 대상이 아니다
    if (hasVoice(l) !== false) return false;   // 있거나 아직 모른다
    return voiceFallback() !== 'ko';
  }

  var voiceWatchers = [];   // 음성 사정이 바뀌면 다시 그릴 화면 함수들
  var audioButtons = [];    // 만들어 둔 🔊 버튼들 — 상태가 바뀌면 그림을 바꾼다
  var voiceDead = false;    // 시켰는데 소리가 안 난 것이 확인됐다
  var userTapped = false;   // 사람이 화면을 한 번이라도 눌렀다
  var voiceWaitMs = 2000;   // 이만큼 기다려도 안 나면 안 나는 것으로 본다

  /* 저절로 읽는 것은 멀쩡한 브라우저도 막는다. 그것까지 "고장" 이라고 적으면
     거짓말이 되므로, 사람이 눌러서 시킨 것만 판정에 쓴다. */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function () { userTapped = true; }, true);
  }

  /* 검사에서 기다리는 시간을 줄이려고 열어 둔다. 인자 없이 부르면 지금 값. */
  function voiceWait(ms) {
    if (typeof ms === 'number' && ms >= 0) voiceWaitMs = ms;
    return voiceWaitMs;
  }

  function notifyVoice() {
    paintAudioButtons();
    for (var i = 0; i < voiceWatchers.length; i++) {
      try { voiceWatchers[i](); } catch (e) {}
    }
  }

  function markVoiceDead() {
    if (voiceDead) return;
    voiceDead = true;
    notifyVoice();
  }

  function markVoiceAlive() {
    if (!voiceDead) return;
    voiceDead = false;
    notifyVoice();
  }

  /* 이 화면에서 음성이 나가지 못하는가.
     ★ 두 경우를 한 판정으로 모은다 —
       ① speechSynthesis 가 아예 없다 (기능 자체가 없는 브라우저)
       ② 있다고 대답해 놓고 소리를 안 낸다 (카카오톡 안 브라우저)
     쓰는 사람 입장에서는 똑같이 "눌러도 아무 일이 없다" 이므로,
     화면이 하는 말도 버튼 그림도 같아야 한다. 한쪽만 챙기면 나머지 한쪽에서
     글자를 못 읽는 사람이 또 조용히 아무것도 못 받는다. */
  function voiceBlocked() { return !speechReady() || voiceDead; }

  /* 이 기기에 그 언어 음성이 실제로 있는지.
     getVoices() 는 첫 호출에서 빈 배열을 주는 브라우저가 있다(목록을 비동기로 읽는다).
     그때는 false 가 아니라 null — "아직 모른다" 를 돌려준다.
     모르는 것을 없다고 답하면 있는 음성을 안 쓰고 한국어로 읽어 버린다. */
  function hasVoice(langCode) {
    if (!speechReady()) return false;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    var head = (VOICE_TAG[langCode] || langCode || '').split('-')[0];
    for (var i = 0; i < voices.length; i++) {
      if ((voices[i].lang || '').split('-')[0] === head) return true;
    }
    return false;
  }

  /* 음성 사정이 바뀌면 부른다. 화면이 안내 문구를 다시 그릴 기회다.
     ★ 목록이 준비된 때뿐 아니라 "소리가 안 나는 것이 확인된 때" 도 부른다.
       그래서 화면 쪽은 손대지 않아도 안내가 저절로 따라온다. */
  function onVoicesReady(fn) {
    if (typeof fn !== 'function') return;
    voiceWatchers.push(fn);
    if (!speechReady()) return;
    if (window.speechSynthesis.getVoices().length) { fn(); return; }
    if (typeof window.speechSynthesis.addEventListener !== 'function') return;
    window.speechSynthesis.addEventListener('voiceschanged', function once() {
      window.speechSynthesis.removeEventListener('voiceschanged', once);
      fn();
    });
  }

  function stopSpeak() {
    if (speechReady()) window.speechSynthesis.cancel();
  }

  /* 읽어 준다.
     speech 는 문자열이거나 { text, lang, ko } — ko 는 그 언어 음성이 없을 때 읽을 한국어.
     돌려주는 값은 실제로 읽은 언어 코드다. 화면이 "지금 한국어로 읽었다"를 적을 수 있어야 한다. */
  function speak(speech, langCode) {
    if (!speechReady()) return '';

    var text = (speech && speech.text != null) ? speech.text : speech;
    var lang = (speech && speech.lang) || langCode || 'ko';
    var ko = (speech && speech.ko) || '';
    if (!text) return '';

    window.speechSynthesis.cancel();

    if (hasVoice(lang) === false) {      // 없다고 확인된 경우에만 판단한다
      /* ★★ 기본은 소리를 내지 않는 것이다.
         크메르어 노동자에게 한국어 음성은 대부분 뜻이 닿지 않는다.
         소리는 나는데 아무것도 전달되지 않으면 사람은 "들었다" 고 생각하고
         넘어간다 — 그게 이 제품이 막으려는 상황이다.

         ★ 그래도 없애지 않고 고르게 둔 이유는, 말은 알아듣는데 글은 못 읽는
           사람이 흔하기 때문이다. 그 사람에게는 한국어 음성이 유일한 통로다.

         ★ 안 낼 때는 화면이 그 사실을 이미 적고 있어야 한다 (voiceNote).
           조용히 아무 일도 안 일어나면 그게 가장 나쁜 실패다. */
      if (lang !== 'ko' && voiceFallback() !== 'ko') return '';
      lang = 'ko';
      if (ko) text = ko;
    }

    var u = new SpeechSynthesisUtterance(String(text));
    u.lang = VOICE_TAG[lang] || lang;
    u.rate = 0.9;      // 모국어가 아닌 사람이 듣는다. 기본 속도는 빠르다

    /* 소리가 났는지 지켜본다 (위 ★★). 시작 신호나 끝 신호가 하나라도 오면
       살아 있는 것으로 본다. */
    var heard = false;
    u.onstart = function () { heard = true; markVoiceAlive(); };
    u.onend = function () { if (!heard) { heard = true; markVoiceAlive(); } };
    u.onerror = function (e) {
      var kind = (e && e.error) || '';
      // 우리가 cancel() 해서 끊긴 것은 브라우저 잘못이 아니다
      if (kind === 'interrupted' || kind === 'canceled') return;
      if (userTapped) markVoiceDead();
    };
    if (userTapped) {
      setTimeout(function () { if (!heard) markVoiceDead(); }, voiceWaitMs);
    }

    window.speechSynthesis.speak(u);
    return lang;
  }

  /* 60px 원형 음성 버튼. style.css 의 .btn-audio 를 쓴다.
     getSpeech 를 함수로 받는 이유 — 내용이 바뀌어도 버튼을 다시 만들지 않는다. */
  function audioButton(getSpeech, label) {
    var btn = el('button', 'btn-audio');
    btn.type = 'button';
    btn.setAttribute('aria-label', label || '소리로 듣기');
    var ico = iconBox('speaker', 'ico');
    btn.appendChild(ico);
    btn.addEventListener('click', function () {
      speak(typeof getSpeech === 'function' ? getSpeech() : getSpeech);
    });

    audioButtons.push({ btn: btn, ico: ico, label: label || '소리로 듣기' });
    paintAudioButtons();
    return btn;
  }

  /* 소리가 안 나는 것이 확인되면 버튼도 그렇게 보여야 한다.
     ★ 색만 바꾸지 않는다 — 그림(🔊 → 🔇)이 함께 바뀌고, 옆 안내 줄에 이유가 글로 남는다.
       흑백으로 봐도, 글자를 못 읽어도 뜻이 남아야 한다. */
  function paintAudioButtons() {
    /* 브라우저가 못 내는 것과, 이 사람 언어로 못 내는 것 둘 다 🔇 다.
       버튼 그림이 멀쩡한데 눌러도 소리가 안 나면 고장으로 읽힌다. */
    var off = voiceBlocked() || voiceSilent();

    /* ★ 왜 안 나는지를 화면 낭독기에도 같은 말로 준다.
       "이 브라우저에서는" 이라고 못 박으면, 원인이 이 사람 언어의 음성일 때
       거짓말이 된다 — 원인이 둘로 갈렸으므로 하나로 뭉뚱그리지 않는다.
       voiceNote 와 한 통로를 쓴다. 두 곳에 적으면 언젠가 갈린다. */
    var why = off ? voiceNote() : '';

    for (var i = 0; i < audioButtons.length; i++) {
      var a = audioButtons[i];
      a.ico.textContent = '';
      a.ico.appendChild(iconNode(off ? 'speaker-off' : 'speaker'));
      a.btn.setAttribute('aria-label', why ? a.label + ' — ' + why : a.label);
      if (off) a.btn.classList.add('is-mute');
      else a.btn.classList.remove('is-mute');
    }
  }

  /* 지금 소리에 무슨 문제가 있는지. 없으면 ''.
     ★ 원인마다 사람이 할 수 있는 일이 다르므로 하나로 뭉뚱그리지 않는다. */
  function voiceNoteKey(langCode) {
    if (voiceBlocked()) return 'voice.blocked';
    var l = langCode || myLang();
    if (l && l !== 'ko' && hasVoice(l) === false) {
      return voiceFallback() === 'ko' ? 'voice.noneKo' : 'voice.noneSilent';
    }
    return '';
  }

  /* i18n.js 가 없는 화면(관리자)에서도 말은 나와야 하므로 한국어를 남겨 둔다.
     ★ 이 표가 사전과 어긋나면 검사가 잡는다 (test-voicefallback.js). */
  var VOICE_NOTE_KO = {
    'voice.blocked': '이 화면에서는 소리가 나지 않습니다. 오른쪽 위 ⋮ 를 눌러 다른 브라우저로 열어 주세요.',
    'voice.noneKo': '이 기기에 %s 음성이 없어 한국어로 읽어 드립니다.',
    'voice.noneSilent': '이 기기에 %s 음성이 없어 소리가 나지 않습니다. 마이에서 한국어로 들을 수 있습니다.'
  };

  /* 화면에 적을 한 줄. 문제가 없으면 빈 문자열 — 아무 말도 하지 않는다. */
  function voiceNote(langCode) {
    var key = voiceNoteKey(langCode);
    if (!key) return '';

    /* ★ 문장과 %s 가 같은 언어여야 한다. I18N 에 코드를 넘기지 않으면
       "지금 로그인한 사람" 의 언어를 쓰고, 그러면 한국어 문장 안에
       크메르어 언어 이름이 들어간 반쪽 문장이 나온다. */
    var l = langCode || myLang();

    var name = '';
    try {
      var L = Store.language(l);
      name = (L && (L.native || L.name)) || '';
    } catch (e) { name = ''; }

    var text = (typeof I18N !== 'undefined' && I18N.has(key, l))
      ? I18N.t(key, l) : VOICE_NOTE_KO[key];
    return String(text || '').replace('%s', name);
  }

  /* HTML 에 박혀 있는 이모지를 선 아이콘으로 바꿔 끼운다.

     ★ HTML 의 이모지를 지우지 않는 이유 — JS 가 멈추면 탭이 통째로 비어 보인다.
       i18n.js 가 한국어 원문을 남겨 두는 것과 같은 대비책이다.
       여기서 하는 일은 "있으면 더 좋게 바꾸는 것" 이다. */
  function upgradeIcons() {
    if (typeof Icons === 'undefined' || !Icons || typeof Icons.upgrade !== 'function') return;
    try { Icons.upgrade(document); } catch (e) {}
  }

  /* -------------------------------------------------------------------
     오프라인 — 현장 인터넷이 약한 것을 전제한다 (E1)

     화면 파일을 미리 담아 두는 일은 sw.js 가 하고, 여기서는 두 가지만 한다.
       1. 등록한다 (13화면이 전부 이 파일을 읽으므로 여기가 유일한 자리다)
       2. 지금 끊겼다는 것을 화면에 적는다

     ★ file:// 에서는 등록하지 않는다.
       더블클릭으로 열어 보는 것이 이 프로젝트의 확인 방법 전체다.
       Service Worker 는 file:// 에서 등록되지 않을 뿐 아니라, 부르는 것만으로
       예외가 나는 브라우저도 있다. 그래서 https 검사와 try/catch 둘 다 둔다.

     ★ 끊긴 것을 조용히 넘기지 않는다.
       음성이 안 나는 것을 화면에 적는 것(voiceNote)과 같은 이유다.
       글을 못 읽는 사람에게 "왜 안 되는지" 를 말해 주지 않으면
       그 화면은 그냥 고장난 화면이다.
     ------------------------------------------------------------------- */

  /* 배포 루트가 sw.js 의 자리다. worker/ · admin/ 아래 화면은 한 칸 위다.
     절대경로(/sw.js)를 쓰면 file:// 에서 깨지므로 상대경로로 만든다. */
  function swPath() {
    var p = (typeof location !== 'undefined' && location.pathname) || '';
    return (/\/(worker|admin)\//.test(p) ? '../' : './') + 'sw.js';
  }

  function registerSW() {
    try {
      if (typeof location === 'undefined' || location.protocol !== 'https:') return false;
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
      navigator.serviceWorker.register(swPath()).catch(function () {
        /* 등록이 안 돼도 화면은 그대로 돌아야 한다. 오프라인만 못 쓸 뿐이다. */
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 이 기기에 실제로 담겨 있는가.
     ★ "담겼을 것이다" 로 넘겨짚지 않는다. controller 가 있어야 진짜다.
       음성을 브라우저 이름으로 넘겨짚지 않는 것과 같은 규칙이다. */
  function offlineReady() {
    try {
      return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch (e) {
      return false;
    }
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  function offlineNote() {
    if (!isOffline()) return '';
    if (offlineReady()) {
      return '인터넷이 끊겼습니다. 이 기기에 저장된 화면으로 그대로 이어집니다. ' +
        '입력한 것도 이 기기에 남습니다.';
    }
    /* 아직 담기지 않았다. 이 화면은 지금 보이지만 다음 화면은 안 열릴 수 있다.
       된다고 말해 놓고 안 되는 쪽이 훨씬 위험하다. */
    return '인터넷이 끊겼습니다. 이 화면은 아직 이 기기에 저장되지 않아, ' +
      '다른 화면으로 넘어가면 열리지 않을 수 있습니다.';
  }

  var offlineBar = null;

  /* ★ 띠를 13개 HTML 에 같은 줄로 넣지 않는다.
     같은 것을 열세 곳에 두면 언젠가 한 곳만 고쳐진다. #blocked 앞에 끼운다. */
  function offlineBarNode() {
    if (offlineBar) return offlineBar;

    var bar = el('p', 'offline-note');
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');

    /* 아이콘 + 글자 + 색 3중. 흑백으로 봐도 뜻이 남아야 한다. */
    var ico = iconBox('wifi-off', 'ico');
    ico.setAttribute('aria-hidden', 'true');
    bar.appendChild(ico);
    bar.appendChild(document.createTextNode(' '));
    bar.appendChild(el('b', null, '오프라인'));
    bar.appendChild(document.createTextNode(' — '));
    bar.appendChild(el('span', 'offline-body'));

    var anchor = $('blocked');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor);
    } else {
      var main = document.querySelector('main');
      if (!main) return null;
      main.insertBefore(bar, main.firstChild);
    }

    offlineBar = bar;
    return bar;
  }

  function renderOffline() {
    var note = offlineNote();
    if (!note) {
      if (offlineBar) offlineBar.hidden = true;
      return;
    }
    var bar = offlineBarNode();
    if (!bar) return;
    bar.querySelector('.offline-body').textContent = note;
    bar.hidden = false;
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', renderOffline);
    window.addEventListener('offline', renderOffline);
  }

  /* -------------------------------------------------------------------
     받아쓰기 — 말한 것을 글자로 (음성 신고)

     ★★ 목소리를 저장하지 않는다.

       reports 는 익명이다. 그런데 목소리는 사람을 식별한다 — 10~50인
       사업장에서 담당자가 녹음을 들으면 누구인지 거의 확실히 안다.
       녹음을 붙이는 순간 익명 신고가 익명이 아니게 되고, 그러면 신고가
       멈춘다. 기능이 하나 늘어나는 것이 아니라 제품의 전제가 무너진다.

       그래서 브라우저가 글자로 바꾼 결과만 받고 소리는 어디에도 담지 않는다.
       SpeechRecognition 은 원래 오디오를 돌려주지 않는다 —
       여기서는 그것이 제약이 아니라 우리가 원하는 성질이다.

     ★ 외부 요청 0건 규칙의 유일한 예외다.
       브라우저의 받아쓰기는 대부분 소리를 인식 서버로 보낸다. 우리가 부르는
       것은 아니지만 결과는 같으므로 그 사실을 화면에 적는다.
       그래서 오프라인에서는 안 된다 — 그것도 화면에 적는다.

     ★ 조용히 실패하지 않는다 (V4 와 같은 규칙).
       안 되는 브라우저에서 버튼만 없애면 사람은 그것을 고장으로 읽는다.
       왜 안 되는지를 글과 그림으로 말하고, 손으로 쓰는 길을 남겨 둔다.

     ★ 여기서는 한국어 문장을 만들지 않는다. 무엇이 문제인지 코드만 돌려주고
       화면(report.js)이 그 사람의 언어로 옮긴다. ui.js 는 관리자 화면도
       읽으므로 i18n.js 에 기대지 않는다.
     ------------------------------------------------------------------- */

  function listenReady() {
    try {
      return !!(typeof window !== 'undefined' &&
        (window.SpeechRecognition || window.webkitSpeechRecognition));
    } catch (e) {
      return false;
    }
  }

  /* 지금 받아쓰기를 할 수 있나. 못 하면 왜 못 하는지 코드로 돌려준다.
     '' 이면 할 수 있다. */
  function listenProblem() {
    if (!listenReady()) return 'unsupported';
    if (isOffline()) return 'offline';
    return '';
  }

  function listen(opts) {
    opts = opts || {};
    var fail = function (code) { if (opts.onError) opts.onError(code); return null; };

    if (!listenReady()) return fail('unsupported');

    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec;
    try { rec = new Rec(); } catch (e) { return fail('unsupported'); }

    /* 말하는 사람의 언어로 알아듣는다. 음성 낭독과 같은 표를 쓴다 —
       두 곳에 두면 언젠가 한쪽만 고쳐진다. */
    rec.lang = VOICE_TAG[opts.lang] || opts.lang || 'ko-KR';
    rec.continuous = true;      // 한 문장에서 끊기지 않게. 멈추는 것은 사람이
    rec.interimResults = true;  // 옮겨지는 중에도 보여 준다 — 반응이 없으면 고장으로 읽힌다

    var finalText = '';

    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (opts.onText) opts.onText(finalText, interim);
    };

    rec.onerror = function (e) {
      var kind = (e && e.error) || 'error';
      /* 사람이 멈춘 것은 잘못이 아니다 */
      if (kind === 'aborted') return;
      if (opts.onError) opts.onError(kind);
    };

    rec.onend = function () { if (opts.onEnd) opts.onEnd(finalText); };

    try { rec.start(); } catch (e) { return fail('start'); }

    return {
      stop: function () { try { rec.stop(); } catch (e) { /* 이미 멈췄다 */ } },
      cancel: function () { try { rec.abort(); } catch (e) { /* 같음 */ } }
    };
  }

  /* 화면 글자를 노동자의 언어로 바꾼다 (UI-1).

     ★ i18n.js 는 노동자 화면에만 실린다. 관리자·운영자 화면은 한국어 사용자가
       쓰고, 번역하지 않은 화면에 반쪽짜리 번역이 섞이는 것이 더 나쁘다.
       그래서 있으면 부르고 없으면 그냥 넘어간다.

     ★ HTML 에 한국어 원문을 그대로 두었으므로, 이 줄이 안 돌아도
       화면이 비지 않는다 — 한국어로 보일 뿐이다. */
  function applyI18n() {
    try {
      if (typeof I18N === 'undefined') return false;
      I18N.apply();
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ui.js 는 문서 끝에서 읽히므로 DOM 이 이미 있다. */
  applyI18n();
  upgradeIcons();
  registerSW();
  renderOffline();

  return {
    $: $, $$: $$, el: el,
    badge: badge, badgeText: badgeText, okBadge: okBadge, waitBadge: waitBadge,
    stopBadge: stopBadge, neutralBadge: neutralBadge, phraseBadge: phraseBadge,
    dueBadge: dueBadge,
    chip: chip, checkedValues: checkedValues, pickedValue: pickedValue,
    fillSelect: fillSelect, toast: toast,
    emptyRow: emptyRow, itemRow: itemRow,
    fillAdminBar: fillAdminBar, fillWorkerBar: fillWorkerBar,
    markCurrentTab: markCurrentTab,
    warnIfBlocked: warnIfBlocked, formatDate: formatDate,

    // 아이콘 — 이름이든 이모지든 받아 선 그림으로 (icons.js)
    icon: iconNode, iconBox: iconBox, setIcon: setIcon, upgradeIcons: upgradeIcons,

    // 음성 — 노동자 화면 전부가 쓴다
    speak: speak, stopSpeak: stopSpeak, audioButton: audioButton,
    hasVoice: hasVoice, onVoicesReady: onVoicesReady, voiceNote: voiceNote,
    voiceNoteKey: voiceNoteKey, voiceSilent: voiceSilent, voiceFallback: voiceFallback,
    /* 음성 사정이 바뀌었다고 알린다 — 🔊/🔇 버튼과 안내 줄이 함께 다시 그려진다.
       마이 화면에서 되돌림을 고르면 이것을 부른다. 안 부르면 고른 사람은
       "골랐는데 아무것도 안 바뀌었다" 를 보고 안 먹힌 줄 안다. */
    notifyVoice: notifyVoice,
    voiceBlocked: voiceBlocked, voiceWait: voiceWait,

    // 오프라인 (E1) — 담긴 것으로 이어 가는지, 지금 끊겼는지
    registerSW: registerSW, offlineReady: offlineReady,
    offlineNote: offlineNote, renderOffline: renderOffline,

    // 화면 글자를 노동자의 언어로 (UI-1)
    applyI18n: applyI18n,

    // 받아쓰기 — 말한 것을 글자로. 목소리는 저장하지 않는다
    listen: listen, listenReady: listenReady, listenProblem: listenProblem
  };
})();
