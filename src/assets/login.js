/* ===================================================================
   login.js — 로그인 화면 (index.html)

   담당: 공용
   쓰는 키: session · prefs(언어, H9) · (첫 방문이면 Seed 가 나머지 7개 키를 한 번 채운다)
   읽는 키: accounts · courses(QR 안내, H9)

   여기서 역할이 갈리고, 그 뒤로는 두 팀의 화면이 서로 만나지 않는다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;

  /* 설비 앞 QR 을 찍었는데 로그인이 안 돼 있으면 여기로 온다 (D1).
     어디로 가려던 것인지가 ?next= 에 담겨 있다.
     Auth.nextFor 가 그 값이 우리 화면인지, 그 역할이 갈 수 있는 자리인지 본다. */
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  var wanted = param('next');

  /* 이미 로그인돼 있으면 자기 자리로 보낸다.
     로그인 화면을 다시 보여 주면 "로그아웃된 건가?" 하고 헷갈린다. */
  var already = Auth.current();
  if (already) {
    location.replace(Auth.nextFor(already.role, wanted) ||
      Store.role(already.role).landing);
    return;
  }

  UI.warnIfBlocked();

  /* 언어 선택 + QR 로 들어왔다는 안내 (H9 · FR-CM-01-08·09).
     언어를 바꾸면 안내 문장도 그 언어로 다시 그려야 한다 — 그래서 콜백으로 준다. */
  function renderQrNote() {
    var box = $('qr-note');
    if (!box) return;

    var m = /[?&]course=([^&]+)/.exec(wanted);
    var course = m ? Store.findBy(Store.courses.load(), 'id', decodeURIComponent(m[1])) : null;
    if (!course) { box.hidden = true; return; }

    box.textContent = '';
    box.appendChild(document.createTextNode(I18N.t('login.qrNote').replace('{course}', course.title)));
    box.appendChild(UI.audioButton(function () {
      return {
        text: I18N.t('login.qrNote').replace('{course}', course.title),
        lang: I18N.lang(),
        ko: I18N.t('login.qrNote', 'ko').replace('{course}', course.title)
      };
    }, I18N.t('action.listenGuide')));
    box.hidden = false;
  }

  UI.preloginLangPicker('lang-gate', renderQrNote);
  renderQrNote();

  /* 처음 여는 브라우저면 예시 데이터를 채운다.
     서버가 없어 계정도 이 브라우저 안에만 있다. 배포 주소에 QR 로 들어온 노동자에게
     "예시 데이터 채우기를 누르세요" 라고 할 수는 없으므로, 빈 브라우저면 알아서 채운다.

     ★ fillIfEmpty 는 계정이 하나라도 있으면 아무것도 하지 않는다.
       fill() 로 바꾸면 담당자가 등록한 사업장이 새로고침마다 예시로 되돌아간다.
     ★ 로그인 확인 뒤에 둔다. 앞에 두면 세션만 남고 계정이 지워진 상태에서
       자동 채우기가 그 세션을 되살려, 로그인하지 않은 사람이 화면 안으로 들어간다.
     ★ 저장이 막힌 브라우저에서는 부르지 않는다. fill() 은 아무것도 저장하지 못한 채
       true 를 돌려주므로, "채웠습니다" 라고 적어 놓고 목록은 비는 화면이 된다. */
  var seededNow = Store.available() && Seed.fillIfEmpty();

  function showError(msg) {
    var box = $('login-error');
    box.textContent = msg;
    box.hidden = false;
  }

  function clearError() {
    $('login-error').hidden = true;
  }

  /* 시연 계정 목록 — 지금 저장돼 있는 계정을 그대로 보여 준다.
     하드코딩한 목록을 보여 주면 초기화한 뒤에도 있는 것처럼 보인다. */
  function renderAccounts() {
    var list = $('demo-accounts');
    list.textContent = '';

    var accounts = Store.accounts.load();
    if (!accounts.length) {
      list.appendChild(UI.emptyRow('아직 계정이 없습니다. 위 버튼을 눌러 예시 데이터를 채우세요.'));
      return;
    }

    accounts.forEach(function (acc) {
      var role = Store.role(acc.role);
      var li = UI.el('li', 'demo-account');

      var body = UI.el('div', 'body');
      body.appendChild(UI.el('strong', null, acc.userId));
      body.appendChild(UI.el('p', 'meta',
        (role ? role.label : acc.role) + (acc.name ? ' · ' + acc.name : '')));
      li.appendChild(body);

      // 누르면 아이디·비밀번호가 채워진다. 시연 중 오타로 막히는 일이 없게 한다.
      var btn = UI.el('button', 'btn-sm', '이 계정으로');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        $('login-id').value = acc.userId;
        $('login-pw').value = acc.pw;
        clearError();
        $('login-pw').focus();
      });
      li.appendChild(btn);

      list.appendChild(li);
    });
  }

  /* ── 들어가기 — 서버 먼저, 안 되면 이 기기 (T11) ────────────────────

     ★ 서버가 "아이디·비밀번호가 틀렸다" 고 하면 **거기서 끝낸다.**
       그때 로컬 목업으로 되돌아가면 목업 비밀번호로 들어가지는 뒷문이 된다.
       되돌아가는 것은 **서버에 닿지 못했을 때(offline)** 뿐이다 (C05 원칙 2). */

  function showMode(msg) {
    var box = $('login-mode');
    box.textContent = msg;
    box.hidden = !msg;
  }

  function setBusy(on) {
    var btn = $('btn-login');
    btn.disabled = on;
    showMode(on ? '서버에 확인하는 중입니다…' : '');
  }

  function land(result) {
    /* 찍고 들어온 자리가 있으면 그리로. 없거나 남의 역할 화면이면 자기 첫 화면으로. */
    location.href = Auth.nextFor(result.account.role, wanted) || result.landing;
  }

  function loginHere(fallbackNote) {
    var result = Auth.login($('login-id').value, $('login-pw').value);
    if (!result.ok) {
      showError(result.reason);
      if (fallbackNote) showMode(fallbackNote);
      $('login-pw').focus();
      return;
    }
    land(result);
  }

  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    showMode('');

    if (!Auth.canServer()) { loginHere(); return; }

    setBusy(true);
    Auth.loginServer($('login-id').value, $('login-pw').value, function (r) {
      setBusy(false);
      if (r.ok) { land(r); return; }

      if (r.code === 'offline') {
        /* 서버가 없거나 닿지 못한다 — 교육이 멈추면 안 되므로 이 기기 계정으로 간다.
           숨기지 않고 **먼저 적고** 넘어간다. 어느 길로 들어왔는지 모르면
           데이터가 어디 있는지도 모른다 (이 기기에만 쌓인다). */
        var note = '서버에 닿지 못해 이 기기에 저장된 계정으로 확인했습니다 (목업).';
        showMode(note);
        loginHere(note);
        return;
      }

      showError(r.reason);
      $('login-pw').focus();
    });
  });

  $('btn-seed').addEventListener('click', function () {
    if (Store.accounts.load().length &&
        !window.confirm('지금 저장된 계정과 데이터를 예시 데이터로 덮어씁니다. 계속할까요?')) return;
    Seed.fill();
    renderAccounts();
    UI.toast('예시 데이터를 채웠습니다.');
  });

  $('btn-reset').addEventListener('click', function () {
    if (!window.confirm('이 브라우저에 저장된 내용을 전부 지웁니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
    Store.resetAll();
    renderAccounts();
    UI.toast('초기화했습니다. 새로고침하면 예시 데이터가 다시 채워집니다.');
  });

  // 조용히 채우면 "내가 넣지도 않았는데 왜 있지" 가 된다. 채웠으면 채웠다고 적는다.
  if (seededNow) $('seed-auto').hidden = false;

  renderAccounts();
})();
