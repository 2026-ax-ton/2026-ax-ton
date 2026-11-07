/* ===================================================================
   signup.js — 회원가입 화면 (signup.html)

   담당: 공용
   쓰는 키: accounts, session, prefs(언어, H9)
   읽는 키: setup (노동자 가입 시 언어·공정 선택지)

   ★ 노동자의 언어 선택지는 기능1에서 등록한 언어만 나온다.
     "등록 안 한 언어는 이후 어떤 화면에도 안 나온다"는 규칙이 여기서도 지켜진다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;

  UI.warnIfBlocked();

  /* 로그인 전 언어 선택 (H9 · FR-CM-01-08) — login.js 와 같은 공용 조각 */
  UI.preloginLangPicker('lang-gate');

  function showError(msg) {
    var box = $('join-error');
    box.textContent = msg;
    box.hidden = false;
  }

  /* 역할 칩 3개 */
  var roleBox = $('pick-role');
  Store.ROLES.forEach(function (r, i) {
    roleBox.appendChild(UI.chip({
      type: 'radio', name: 'role', value: r.code,
      icon: r.code === 'worker' ? '👷' : (r.code === 'admin' ? '🛠' : '🔍'),
      label: r.label,
      checked: i === 0
    }));
  });

  var setup = Store.setup.load();

  /* 노동자 언어 선택지 — 기능1에서 등록한 언어만 */
  function fillWorkerFields() {
    var langs = setup.languages.map(function (code) { return Store.language(code); })
                               .filter(Boolean);

    UI.fillSelect($('join-lang'), langs,
      function (l) { return l.code; },
      function (l) { return l.name + '  ' + l.native; });

    UI.fillSelect($('join-proc'), setup.processes,
      function (p) { return p.id; },
      /* ★ <option> 안에는 그림을 넣을 수 없다. 이모지를 남기면 이 목록만
         옛 말투로 남으므로 이름만 쓴다 (그림은 고른 뒤 화면에서 보인다). */
      function (p) { return p.name; });

    // 사업장 설정이 아직 없으면 노동자 가입이 성립하지 않는다. 이유를 적어 준다.
    var hint = $('join-lang-hint');
    if (!langs.length) {
      hint.textContent = '아직 등록된 언어가 없습니다. 담당자가 사업장·설비 등록을 먼저 마쳐야 합니다.';
    } else {
      hint.textContent = '사업장에 등록된 언어만 나옵니다.';
    }
  }

  function currentRole() { return UI.pickedValue('role') || 'worker'; }

  /* ★ 서버 모드(T11)에서는 길이 둘이다.
       노동자 → 가입 코드로 그 사업장에 들어간다 (/api/auth/signup)
       담당자 → 사업장을 새로 만들고 가입 코드를 받는다 (/api/auth/signup-workplace)
       운영자 → 가입으로 만들 수 없다. 사업장을 가로지르는 내부 계정이다 */
  var onServer = Auth.canServer();

  function syncRoleFields() {
    var role = currentRole();
    var isWorker = role === 'worker';

    $('fields-worker').hidden = !isWorker;
    $('fields-admin').hidden = isWorker;
    $('field-code').hidden = !(isWorker && onServer);

    var mode = $('join-mode');
    if (onServer && role === 'operator') {
      mode.textContent = '운영자 계정은 가입으로 만들지 않습니다. 내부에서 만들어 드립니다.';
      mode.hidden = false;
    } else if (onServer && role === 'admin') {
      mode.textContent = '사업장이 새로 만들어지고, 노동자에게 나눠 줄 가입 코드를 받습니다.';
      mode.hidden = false;
    } else {
      mode.hidden = true;
    }

    $('join-id').placeholder = isWorker ? 'W-4821-07' : 'name@company.co.kr';
    $('join-id-hint').textContent = isWorker
      ? '사업장에서 받은 식별번호입니다.'
      : '업무용 이메일을 아이디로 씁니다.';

    if (role === 'operator') $('join-title').value = '시스템 운영자 (내부)';
  }

  roleBox.addEventListener('change', syncRoleFields);

  $('form-signup').addEventListener('submit', function (e) {
    e.preventDefault();
    $('join-error').hidden = true;

    var role = currentRole();
    var input = {
      userId: $('join-id').value,
      pw: $('join-pw').value,
      role: role
    };

    if (role === 'worker') {
      input.lang = $('join-lang').value;
      input.processId = $('join-proc').value;
      input.siteName = setup.site.name;
      if (!input.lang) {
        showError('등록된 언어가 없어 가입할 수 없습니다. 담당자에게 사업장 설정을 요청하세요.');
        return;
      }
    } else {
      input.name = $('join-name').value;
      input.title = $('join-title').value;
      input.siteName = $('join-site').value;
    }

    if (onServer && role !== 'operator') {
      joinOnServer(role, input);
      return;
    }

    joinHere(input);
  });

  /* ── 이 기기에만 (목업) ───────────────────────────────────────────── */

  function joinHere(input) {
    var result = Auth.signup(input);
    if (!result.ok) { showError(result.reason); return; }

    // 가입하면 바로 로그인시킨다. 방금 만든 계정을 다시 치게 하지 않는다.
    var logged = Auth.login(input.userId, input.pw);
    if (!logged.ok) { showError(logged.reason); return; }
    location.href = logged.landing;
  }

  /* ── 서버에 (T11) ─────────────────────────────────────────────────
     ★ 서버가 "이미 있는 아이디" 처럼 **사람이 고칠 수 있는 이유**로 거절하면
       거기서 끝낸다. 이 기기에만 만들어 주면 로그인은 되는데 다른 기기에서는
       없는 계정이 된다 — 그게 더 나쁘다.
       이 기기로 되돌아가는 것은 **서버에 닿지 못했을 때** 뿐이다. */

  function joinOnServer(role, input) {
    var done = function (r) {
      if (r.ok) {
        if (r.joinCode) {
          /* ★ 담당자에게는 가입 코드를 반드시 보여 준다. 이걸 놓치면 노동자가 못 들어온다.
             넘어가기 전에 한 번 멈춰 세우는 것이 여기서는 맞다 — 다시 볼 곳은
             담당자 화면(기능1)이지만, 지금 적어 두지 않으면 찾으러 가야 한다. */
          window.alert([
            '사업장이 등록됐습니다.',
            '',
            '노동자 가입 코드: ' + r.joinCode,
            '',
            '이 코드를 노동자에게 알려 주세요.'
          ].join(String.fromCharCode(10)));
        }
        location.href = r.landing;
        return;
      }
      if (r.code === 'offline') {
        showError('서버에 닿지 못해 이 기기에만 만들었습니다 (목업).');
        joinHere(input);
        return;
      }
      showError(r.reason);
    };

    if (role === 'worker') {
      input.joinCode = $('join-code').value;
      if (!input.joinCode) { showError('담당자에게 받은 가입 코드를 넣어 주세요.'); return; }
      Auth.signupServer(input, done);
      return;
    }

    Auth.signupWorkplaceServer({
      siteName: input.siteName, userId: input.userId, pw: input.pw,
      name: input.name, title: input.title
    }, done);
  }

  /* 어느 길인지 아래 안내도 맞춘다 — 목업이 아닌데 목업이라고 적혀 있으면 안 된다 */
  if (onServer) {
    $('join-note').textContent =
      '비밀번호는 서버에서 암호화해 저장합니다. 이 기기에는 남지 않습니다.';
  }

  fillWorkerFields();
  syncRoleFields();
})();
