/* ===================================================================
   scan.js — 설비 촬영 가이드 (시제품, 2026-11-14)

   담당자가 휴대폰으로 설비 둘레를 두 바퀴 찍는다 — 낮게 한 바퀴, 높게 한 바퀴.
   찍은 사진은 나중에 3D 장면(영상 「어디」 컷·퀴즈 여러 각도)의 재료가 된다.

   ★ 카메라 화면 위에 안내를 겹쳐 그린다 — 모서리 틀 · 수평선 · 한 바퀴 진행 링 · 안내/경고 한 줄(아이콘 + 글 + 음성)
   ★ 촬영 중에는 카메라가 휴대폰 화면 전체를 덮는다 (2026-11-15 사용자 요청 — 문서 스캔 앱처럼 화면 위에 가이드)
   ★ 동영상이 아니라 0.5초마다 「선명한 사진만」 남긴다 — 흔들림·어두움·역광·너무 빠름은 찍는 자리에서 거른다
   ★ 방향은 휴대폰 방향 센서(alpha). 센서가 없으면(PC 웹캠) 찍은 장수로 링을 채운다
     큰 철제 기계 옆에서는 나침반이 틀어질 수 있다 — alpha 는 상대 방향이라 한 바퀴를 세는 데만 쓴다
   ★ 카메라는 https 주소(배포)나 localhost 에서만 켜진다 (브라우저 규칙)
   ★ 바깥으로 보내지 않는다 — 사진은 이 화면 메모리에만. 올리기는 사진 저장소를 정한 뒤 (net.js 를 거친다)
   =================================================================== */

/* 계산만 — 검사(tests/test-scan.js)가 본다 */
var ScanMath = window.ScanMath = (function () {   // window — 검사가 화면 스크립트 밖에서 본다
  'use strict';

  var C = {
    SEGMENTS: 24,        // 한 바퀴를 15° 칸 24개로
    PER_SEG: 6,          // 칸마다 남길 사진 수 (선명한 순). 🆕 2026-11-21 2 → 6 — 3D(Blender·Seedance) 재료라 많을수록 좋다. 15° 칸에 6장 = 2.5°마다 한 장 · 두 바퀴 최대 288장(휴대폰 메모리 약 90MB)
    DONE_RATIO: 0.8,     // 칸 80% 가 차면 그 바퀴는 끝
    DARK: 45,            // 평균 밝기(0~255) 아래면 어둡다
    BRIGHT: 215,         // 위면 역광·과노출
    SHARP_MIN: 60,       // 라플라시안 분산 아래면 흔들림 — ponytail: 고정 문턱, 실물 촬영으로 조정 (화면 아래 숫자를 보고)
    FAST_DEG: 45,        // 초당 회전 각도 위면 너무 빠름
    TILT_DEG: 20,        // 좌우 기울기(gamma) 이 넘으면 「기울었어요」
    /* 앞뒤 기울기(beta) — 90 = 똑바로 섬, 0 = 바닥에 눕힘. 바퀴마다 맞는 범위 (ponytail: 실물 촬영으로 조정) */
    PITCH: [[55, 125], [25, 95]]   // [낮게: 기계를 정면으로] · [높게: 위에서 내려다봄]
  };

  function segmentOf(deg, n) {
    var d = ((deg % 360) + 360) % 360;
    return Math.min(n - 1, Math.floor(d / (360 / n)));
  }

  /** 회색 화소 배열 → { mean, sharp } — sharp 는 라플라시안 분산 (초점·흔들림 지표) */
  function stats(gray, w, h) {
    var sum = 0, i;
    for (i = 0; i < gray.length; i++) sum += gray[i];
    var lap = [], ls = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        i = y * w + x;
        var v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        lap.push(v);
        ls += v;
      }
    }
    var m = lap.length ? ls / lap.length : 0, vs = 0;
    for (i = 0; i < lap.length; i++) vs += (lap[i] - m) * (lap[i] - m);
    return { mean: gray.length ? sum / gray.length : 0, sharp: lap.length ? vs / lap.length : 0 };
  }

  /** 이 순간을 찍어도 되나 — '' 이면 된다. 아니면 경고 열쇠 */
  function verdict(s, speed) {
    if (s.mean < C.DARK) return 'dark';
    if (s.mean > C.BRIGHT) return 'bright';
    if (speed > C.FAST_DEG) return 'fast';
    if (s.sharp < C.SHARP_MIN) return 'blur';
    return '';
  }

  function coverage(segs) {
    var n = 0;
    segs.forEach(function (list) { if (list.length) n += 1; });
    return segs.length ? n / segs.length : 0;
  }

  /** 가장 긴 빈 구간의 가운데 칸 (원형) — 「이쪽을 더 찍어 주세요」. 빈 칸이 없으면 -1 */
  function biggestGap(segs) {
    var n = segs.length, best = -1, bestLen = 0;
    if (segs.every(function (l) { return !l.length; })) return 0;
    for (var s = 0; s < n; s++) {
      if (segs[s].length || !segs[(s - 1 + n) % n].length) continue;   // 빈 구간이 시작하는 칸에서만 센다
      var len = 0;
      while (!segs[(s + len) % n].length) len++;
      if (len > bestLen) { bestLen = len; best = (s + Math.floor(len / 2)) % n; }
    }
    return best;
  }

  /** 휴대폰 자세 — '' 이면 바르다. 아니면 고칠 방향 열쇠 (2026-11-15 사용자 요청: 어떻게 고칠지 알려 주기)
      gamma: 좌우 기울기(+ = 오른쪽이 내려감) · beta: 앞뒤(90 = 똑바로) · pass: 0 낮게 / 1 높게 */
  function posture(gamma, beta, pass) {
    if (gamma > C.TILT_DEG) return 'tiltRight';
    if (gamma < -C.TILT_DEG) return 'tiltLeft';
    if (typeof beta !== 'number') return '';
    var r = C.PITCH[pass] || C.PITCH[0];
    if (beta < r[0]) return 'pitchDown';     // 너무 숙였다 (바닥 쪽을 본다)
    if (beta > r[1]) return 'pitchUp';       // 너무 젖혔다 (위쪽을 본다)
    return '';
  }

  /** 칸에 사진을 넣는다 — 칸마다 PER_SEG 장까지, 더 선명한 것으로 바꾼다. 넣었으면 true */
  function keep(list, shot) {
    if (list.length < C.PER_SEG) { list.push(shot); return true; }
    var worst = 0;
    list.forEach(function (s, i) { if (s.sharp < list[worst].sharp) worst = i; });
    if (shot.sharp <= list[worst].sharp) return false;
    list[worst] = shot;
    return true;
  }

  return { C: C, segmentOf: segmentOf, stats: stats, verdict: verdict, posture: posture, coverage: coverage, biggestGap: biggestGap, keep: keep };
})();

/* 🆕 2026-11-21 동영상으로 넣기 — 설비 화면(setup.html)에서 사진 대신 동영상을 고르면
   가이드 촬영과 **같은 기준**(어두움·역광·흔들림 거르기)으로 장면을 뽑고 — 통과한 장면은 3D 재료라 **전부** 남긴다 (최대 300장),
   같은 촬영 묶음(/api/scans put)으로 올린다. setup.html 도 이 파일을 싣는다 —
   아래 화면 코드는 #scan-video 가 없으면 돌지 않는다.
   ★ 영상 앞 절반 = 낮게(허리 높이) 바퀴, 뒤 절반 = 높게(팔 들고) 바퀴 — 촬영 안내와 같은 순서로 찍었다고 본다.
     방향 센서가 없으니 칸은 시간 순서로 채운다 (ponytail: 시간 = 방향 가정, 걸음이 고르지 않으면 칸이 치우친다)
   ★ 회전 속도는 영상에서 모른다 — 「너무 빠름」 대신 흔들림(선명도)이 그 몫을 한다 */
var ScanShots = window.ScanShots = (function () {
  'use strict';

  var M = ScanMath, C = M.C;
  var PASSES = 2;
  var PROBE_W = 160;          // 거르기용 작은 사본 — 가이드 촬영과 같은 크기
  var MAX_EDGE = 1600;        // 남길 사진의 긴 변 — 가이드 촬영과 같은 값
  var QUALITY = 0.85;
  var MAX_SAMPLES = 300;      // 긴 영상도 300번만 들여다본다 — 🆕 2026-11-21 3D 재료라 거르기를 통과한 장면은 **전부** 남긴다 (최대 300장)
  var MIN_STEP = 0.2;         // 초 — 짧은 영상은 0.2초마다
  var PER_SEG = 99;           // 칸마다 상한 — 올릴 이름(바퀴-칸-번호)의 번호가 두 자리라서. 사실상 「전부」

  function emptyPasses() {
    var out = [];
    for (var p = 0; p < PASSES; p++) { var segs = []; for (var s = 0; s < C.SEGMENTS; s++) segs.push([]); out.push(segs); }
    return out;
  }

  /** 표본 [{ t, mean, sharp }] → 바퀴·칸마다 남길 장면 [[[{ t, sharp, pass, seg }]]] */
  function pick(samples, duration) {
    var passes = emptyPasses();
    (samples || []).forEach(function (s) {
      if (M.verdict(s, 0)) return;
      var f = duration > 0 ? Math.min(0.999999, Math.max(0, s.t / duration)) : 0;
      var pass = Math.min(PASSES - 1, Math.floor(f * PASSES));
      var seg = Math.min(C.SEGMENTS - 1, Math.floor((f * PASSES - pass) * C.SEGMENTS));
      var list = passes[pass][seg];
      if (list.length < PER_SEG) list.push({ t: s.t, sharp: s.sharp, pass: pass, seg: seg });
    });
    return passes;
  }

  function flat(passes) {
    var out = [];
    passes.forEach(function (segs) { segs.forEach(function (list) { list.forEach(function (s) { out.push(s); }); }); });
    return out;
  }

  /** 가장 선명한 한 장 — 낮은 바퀴(정면)에서 먼저 고른다 (가이드 촬영의 설비 사진과 같은 규칙) */
  function best(passes) {
    var b = null;
    passes.forEach(function (segs) {
      if (b) return;
      segs.forEach(function (list) { list.forEach(function (s) { if (!b || s.sharp > b.sharp) b = s; }); });
    });
    return b;
  }

  function seek(video, t) {
    return new Promise(function (ok) {
      var done = false;
      function fin() { if (done) return; done = true; video.removeEventListener('seeked', fin); clearTimeout(timer); ok(); }
      var timer = setTimeout(fin, 4000);   // 멈춘 영상에서 기다리기만 하지 않게
      video.addEventListener('seeked', fin);
      video.currentTime = t;
    });
  }

  /** 동영상 파일 → { passes, count, duration }. onProgress(0~1). 못 읽으면 Error('video') 로 거절 */
  function fromVideo(file, onProgress) {
    var tell = typeof onProgress === 'function' ? onProgress : function () {};
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    var ready = new Promise(function (ok, no) {
      v.addEventListener('loadeddata', ok, { once: true });
      v.addEventListener('error', function () { no(new Error('video')); }, { once: true });
    });
    v.src = url;
    return ready.then(function () {
      var dur = v.duration, vw = v.videoWidth, vh = v.videoHeight;
      if (!isFinite(dur) || dur <= 0 || !vw || !vh) throw new Error('video');
      var step = Math.max(MIN_STEP, dur / MAX_SAMPLES), times = [];
      for (var t = step / 2; t < dur; t += step) times.push(t);
      var probe = document.createElement('canvas');
      probe.width = PROBE_W; probe.height = Math.max(1, Math.round(PROBE_W * vh / vw));
      var pg = probe.getContext('2d');
      var samples = [];
      var chain = Promise.resolve();
      times.forEach(function (time, i) {
        chain = chain.then(function () { return seek(v, time); }).then(function () {
          pg.drawImage(v, 0, 0, probe.width, probe.height);
          var px = pg.getImageData(0, 0, probe.width, probe.height).data, gray = new Array(probe.width * probe.height);
          for (var a = 0, b = 0; a < px.length; a += 4, b++) gray[b] = 0.299 * px[a] + 0.587 * px[a + 1] + 0.114 * px[a + 2];
          var st = M.stats(gray, probe.width, probe.height);
          samples.push({ t: time, mean: st.mean, sharp: st.sharp });
          tell(0.8 * (i + 1) / times.length);
        });
      });
      return chain.then(function () {
        var passes = pick(samples, dur), shots = flat(passes);
        var k = Math.min(1, MAX_EDGE / Math.max(vw, vh));
        var c = document.createElement('canvas');
        c.width = Math.round(vw * k); c.height = Math.round(vh * k);
        var g = c.getContext('2d');
        var keepChain = Promise.resolve();
        shots.forEach(function (s, i) {
          keepChain = keepChain.then(function () { return seek(v, s.t); }).then(function () {
            g.drawImage(v, 0, 0, c.width, c.height);
            return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', QUALITY); });
          }).then(function (blob) {
            s.blob = blob; s.w = c.width; s.h = c.height;
            tell(0.8 + 0.2 * (i + 1) / shots.length);
          });
        });
        return keepChain.then(function () {
          /* 사진으로 못 만든 장면은 뺀다 */
          passes.forEach(function (segs) { segs.forEach(function (list, si) { segs[si] = list.filter(function (s) { return !!s.blob; }); }); });
          return { passes: passes, count: flat(passes).length, duration: dur };
        });
      });
    }).then(function (r) { URL.revokeObjectURL(url); return r; }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  function toDataUrl(b) {
    return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = function () { ok(''); }; r.readAsDataURL(b); });
  }

  /** 촬영 묶음 하나로 올린다 (/api/scans put → Vercel Blob 비공개). 이름은 바퀴-칸-번호.
      돌려주는 값 { done, failed, scanId }. 끊김·로그인 만료면 남은 것을 실패로 세고 멈춘다 */
  function upload(equipmentId, passes, onProgress) {
    var tell = typeof onProgress === 'function' ? onProgress : function () {};
    var scanId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    var jobs = [];
    passes.forEach(function (segs, p) { segs.forEach(function (list, s) { list.forEach(function (shot, i) { jobs.push({ shot: shot, name: p + '-' + s + '-' + i }); }); }); });
    var done = 0, failed = 0;
    function next(k) {
      if (k >= jobs.length) return Promise.resolve({ done: done, failed: failed, scanId: scanId });
      tell(k + 1, jobs.length);
      return toDataUrl(jobs[k].shot.blob).then(function (data) {
        return Net.post('/api/scans', { op: 'put', equipmentId: equipmentId, scanId: scanId, name: jobs[k].name, data: data }, { token: Auth.token(), timeoutMs: 30000 });
      }).then(function (r) {
        if (r.ok) done += 1; else failed += 1;
        if (!r.ok && (r.failed || r.status === 401)) { failed += jobs.length - k - 1; return next(jobs.length); }
        return next(k + 1);
      });
    }
    return next(0);
  }

  return { pick: pick, best: best, count: function (passes) { return flat(passes).length; }, fromVideo: fromVideo, upload: upload, toDataUrl: toDataUrl };
})();

(function () {
  'use strict';

  if (typeof UI === 'undefined' || !document.getElementById('scan-video')) return;

  var $ = UI.$;
  var M = ScanMath;
  var C = M.C;
  UI.fillAdminBar(Auth.current());
  UI.warnIfBlocked();
  UI.$$('[data-ico]').forEach(function (n) { UI.setIcon(n, n.getAttribute('data-ico')); });

  var SHOT_MS = 350;               // 🆕 2026-11-21 500 → 350 — 3D 재료를 더 많이 (거르기는 그대로)
  var SAY_GAP_MS = 4000;          // 같은 경고를 다시 말하기까지
  var MAX_EDGE = 1600;            // 남길 사진의 긴 변
  var PASSES = [
    { name: '낮게', label: '허리 높이', say: '허리 높이에서 기계를 화면 틀 안에 두고, 천천히 한 바퀴 도세요.', tip: '기계를 틀 안에 두고 천천히 도세요' },
    { name: '높게', label: '팔을 들고', say: '이번에는 팔을 들어 위에서 내려다보며, 한 바퀴 더 도세요.', tip: '위에서 내려다보며 천천히 도세요' }
  ];
  /* 카메라 위쪽 띠 — 무엇이 문제인지 + 어떻게 고치는지 (글 + 아이콘 + 음성) */
  var WARN = {
    dark: ['alert', '어두워요', '조명을 켜거나 밝은 쪽에서 찍으세요'],
    bright: ['alert', '역광이에요', '창문·조명을 등지고 서세요'],
    fast: ['alert-circle', '너무 빨라요', '한 걸음에 1초씩, 천천히 도세요'],
    blur: ['alert-circle', '흔들려요', '팔꿈치를 몸에 붙이고 잠깐 멈추세요'],
    tiltRight: ['alert-circle', '오른쪽으로 기울었어요', '휴대폰 오른쪽을 올려 가운데 선을 초록으로 맞추세요'],
    tiltLeft: ['alert-circle', '왼쪽으로 기울었어요', '휴대폰 왼쪽을 올려 가운데 선을 초록으로 맞추세요'],
    pitchDown: ['alert-circle', '바닥을 보고 있어요', '휴대폰 위쪽을 뒤로 젖혀 기계를 보세요'],
    pitchUp: ['alert-circle', '위쪽을 보고 있어요', '휴대폰 위쪽을 앞으로 숙여 기계를 보세요']
  };

  var params = new URLSearchParams(location.search);
  var eq = Store.findBy((Store.setup.load().equipments || []), 'id', params.get('equipment') || '');
  $('scan-equip').textContent = eq ? eq.name : '설비 (목록에서 고르지 않음)';

  /* --- PC 에서 열었으면 QR — 휴대폰이 같은 주소를 연다 --- */
  (function phoneQr() {
    var touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    if (touch || !/^https?:$/.test(location.protocol)) { $('sec-phone').hidden = true; return; }
    var img = QR.svg(location.href, { label: '이 촬영 화면을 휴대폰에서 여는 QR 코드' });
    if (img) $('scan-qr').appendChild(img);
    else $('scan-qr').appendChild(UI.el('p', 'empty', '주소가 너무 길어 QR 로 만들지 못했습니다.'));
    $('scan-url').textContent = location.href;
    $('btn-copy-url').addEventListener('click', function () {
      var done = function () { UI.toast('주소를 복사했습니다.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, function () { UI.toast('복사하지 못했습니다. 주소를 길게 눌러 복사하세요.'); });
      else UI.toast('이 브라우저는 복사를 지원하지 않습니다. 주소를 길게 눌러 복사하세요.');
    });
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      $('scan-url').textContent += ' — 이 PC 주소라 휴대폰에서는 열리지 않습니다. 배포 주소에서 쓰세요.';
    }
  })();

  var video = $('scan-video');
  var overlay = $('scan-overlay');
  var probe = document.createElement('canvas');
  var stream = null, timer = null;
  var pass = 0;
  var passes = PASSES.map(function () { var a = []; for (var i = 0; i < C.SEGMENTS; i++) a.push([]); return a; });
  var sensor = { alpha: null, gamma: 0, beta: null, speed: 0, seen: false };
  var fallbackSeg = 0;
  var lastSay = { key: '', at: 0 };
  var shots = 0;

  function say(text) { UI.speak({ text: text, lang: 'ko', ko: text }); }

  /** 아래 한 줄 = 이번 바퀴 안내(늘 보임) · 위쪽 띠 = 자세 교정(문제 + 고칠 방향, 있을 때만). 멈추면 둘 다 숨긴다 */
  function warn(key) {
    var box = $('scan-warn'), coach = $('scan-coach');
    if (!timer) { box.hidden = true; coach.hidden = true; return; }
    UI.setIcon($('scan-warn-ico'), 'camera');
    $('scan-warn-text').textContent = PASSES[pass].tip;
    box.hidden = false;
    coach.hidden = !key;
    if (!key) return;
    UI.setIcon($('scan-coach-ico'), WARN[key][0]);
    $('scan-coach-what').textContent = WARN[key][1];
    $('scan-coach-fix').textContent = WARN[key][2];
    var now = Date.now();
    if (lastSay.key !== key || now - lastSay.at > SAY_GAP_MS) { say(WARN[key][1] + '. ' + WARN[key][2]); lastSay = { key: key, at: now }; }
  }

  /** 수평 자세 센서 띠 — 좌우 기울기 0° = 100%, 40° 이상 = 0% (센서가 없으면 「센서 없음」) */
  function level() {
    var pct = sensor.seen ? Math.max(0, Math.round(100 - Math.abs(sensor.gamma) * 2.5)) : 0;
    $('scan-level-fill').style.width = pct + '%';
    $('scan-level-fill').className = pct >= 85 ? 'ok' : 'bad';
    $('scan-level-text').textContent = sensor.seen ? pct + '% ' + (pct >= 85 ? '안정' : '기울어짐') : '센서 없음';
  }

  function onOrient(e) {
    if (e.alpha == null) return;
    sensor.seen = true;
    sensor.alpha = 360 - e.alpha;          // 시계 방향으로 돌면 커지게
    sensor.gamma = e.gamma || 0;
    sensor.beta = typeof e.beta === 'number' ? e.beta : null;
  }
  function onMotion(e) {
    var r = e.rotationRate;
    if (r) sensor.speed = Math.max(Math.abs(r.alpha || 0), Math.abs(r.beta || 0), Math.abs(r.gamma || 0));
  }

  /* 화면 장식 아이콘 — 이모지 대신 선 아이콘 */
  UI.setIcon($('scan-stop-ico'), 'stop');
  /* 촬영 전 안내 셋째 줄 — 「알아서 올라갑니다」는 번호가 아니라 체크 표시다 */
  UI.setIcon(document.querySelector('.scan-steps .n.done'), 'check');

  /** 위쪽 칩 — 몇 바퀴째 · 어디서 */
  function showPass() {
    var chip = $('scan-pass');
    chip.textContent = '';
    chip.appendChild(UI.el('span', 'step', (pass + 1) + '/' + PASSES.length));
    chip.appendChild(document.createTextNode(PASSES[pass].label + ' 한 바퀴'));
  }

  /** 카메라 위 안내 — 모서리 틀 · 수평 · 진행 링. bad 가 없으면 틀이 초록(찍는 중), 있으면 흰색(위쪽 띠가 이유를 글로 말한다) */
  function draw(bad) {
    var w = overlay.width = video.clientWidth, h = overlay.height = video.clientHeight;
    var g = overlay.getContext('2d');
    g.clearRect(0, 0, w, h);
    var GOOD = '#22c55e', WARN_C = '#f59e0b';
    g.shadowColor = 'rgba(0,0,0,.35)';
    g.shadowBlur = 6;
    g.lineCap = 'round';
    /* 모서리 틀 — 기계를 여기 넣는다 (문서 스캔 앱처럼 네 모서리만). 위: 칩·자세 띠 / 아래: 안내·멈추기 사이 */
    var fx = w * 0.08, fy = h * 0.24, fw = w * 0.84, fh = h * 0.44, L = Math.min(fw, fh) * 0.16, r = Math.min(14, L / 2);
    g.strokeStyle = bad ? 'rgba(255,255,255,.95)' : GOOD;
    g.lineWidth = 5;
    [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]].forEach(function (c) {
      g.beginPath();
      g.moveTo(c[0] + c[2] * L, c[1]);
      g.arcTo(c[0], c[1], c[0], c[1] + c[3] * L, r);
      g.lineTo(c[0], c[1] + c[3] * L);
      g.stroke();
    });
    /* 수평 — 가운데 원 + 양쪽 선. 기울면 주황, 바르면 초록 */
    var tilt = sensor.seen ? sensor.gamma : 0;
    var level = Math.abs(tilt) < 6;
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-tilt * Math.PI / 180);
    g.strokeStyle = level ? GOOD : WARN_C;
    g.lineWidth = 2.5;
    var half = Math.min(w * 0.22, 140), gap = 14;
    g.beginPath(); g.moveTo(-half, 0); g.lineTo(-gap, 0); g.moveTo(gap, 0); g.lineTo(half, 0); g.stroke();
    g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.stroke();
    g.restore();
    /* 진행 링 — 오른쪽 위 칩 줄. 찬 칸 초록 · 빈 칸 옅은 흰색 · 지금 방향 흰 점 · 가장 빈 쪽 주황 점 */
    var segs = passes[pass], R = 26, cx = w - R - 22, cy = 16 + R + 4;
    var step = Math.PI * 2 / C.SEGMENTS;
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(17,17,17,.5)';
    g.beginPath(); g.arc(cx, cy, R + 9, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6;
    for (var s = 0; s < C.SEGMENTS; s++) {
      g.strokeStyle = segs[s].length ? GOOD : 'rgba(255,255,255,.25)';
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2 + s * step + 0.06, -Math.PI / 2 + (s + 1) * step - 0.06); g.stroke();
    }
    var cur = sensor.seen ? M.segmentOf(sensor.alpha, C.SEGMENTS) : fallbackSeg;
    var a = -Math.PI / 2 + (cur + 0.5) * step;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 5, 0, Math.PI * 2); g.fill();
    var gp = M.biggestGap(segs);
    if (gp >= 0 && M.coverage(segs) > 0) {
      var ga = -Math.PI / 2 + (gp + 0.5) * step;
      g.fillStyle = WARN_C;
      g.beginPath(); g.arc(cx + Math.cos(ga) * (R + 9), cy + Math.sin(ga) * (R + 9), 4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff';
    g.font = '800 15px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(Math.round(M.coverage(segs) * 100) + '%', cx, cy + 1);
  }

  function tick() {
    if (!video.videoWidth) return;
    var pw = 160, ph = Math.round(160 * video.videoHeight / video.videoWidth);
    probe.width = pw; probe.height = ph;
    var pg = probe.getContext('2d');
    pg.drawImage(video, 0, 0, pw, ph);
    var px = pg.getImageData(0, 0, pw, ph).data, gray = new Array(pw * ph);
    for (var i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    var st = M.stats(gray, pw, ph);
    var bad = M.verdict(st, sensor.speed);
    /* 자세가 틀리면 흔들림보다 먼저 말한다 — 자세를 고치면 흔들림도 대개 사라진다 */
    var pose = sensor.seen ? M.posture(sensor.gamma, sensor.beta, pass) : '';
    if (pose && (!bad || bad === 'blur')) bad = pose;
    $('scan-meter').textContent = '밝기 ' + Math.round(st.mean) + ' · 선명도 ' + Math.round(st.sharp) + ' (기준 ' + C.SHARP_MIN + ')' +
      ' · 회전 ' + Math.round(sensor.speed) + '°/s' + (sensor.beta != null ? ' · 앞뒤 ' + Math.round(sensor.beta) + '° 좌우 ' + Math.round(sensor.gamma) + '°' : '') + ' · 방향 센서 ' + (sensor.seen ? '켜짐' : '없음 — 찍은 장수로 채움');
    $('scan-count').textContent = '사진 ' + shots + '장';
    level();
    warn(bad);
    draw(bad);
    if (bad) return;
    var seg = sensor.seen ? M.segmentOf(sensor.alpha, C.SEGMENTS) : fallbackSeg;
    grab(seg, st.sharp);
  }

  function grab(seg, sharp) {
    var k = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    c.toBlob(function (blob) {
      if (!blob || !timer) return;          // 멈춘 뒤 늦게 온 사진은 버린다
      var segs = passes[pass];
      if (!M.keep(segs[seg], { blob: blob, sharp: sharp, at: Date.now(), w: c.width, h: c.height, pass: pass, seg: seg })) return;
      shots = passes.reduce(function (n, p) { return n + p.reduce(function (m, l) { return m + l.length; }, 0); }, 0);
      if (!sensor.seen) fallbackSeg = (fallbackSeg + 1) % C.SEGMENTS;
      if (M.coverage(segs) >= C.DONE_RATIO) nextPass();
    }, 'image/jpeg', 0.85);
  }

  function nextPass() {
    if (pass + 1 < PASSES.length) {
      pass += 1;
      fallbackSeg = 0;
      $('scan-status').textContent = (pass + 1) + '번째 바퀴 (' + PASSES[pass].name + ') — ' + PASSES[pass].say;
      showPass();
      say(PASSES[pass].say);
    } else {
      say('다 찍었습니다. 서버에 올립니다.');
      stop();
      if (eq && Net.onHttps()) upload();     // 두 바퀴를 다 찍으면 알아서 올린다 (2026-11-15 사용자 요청). 중간에 멈추면 버튼으로
    }
  }

  function start() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('scan-status').textContent = '이 주소에서는 카메라를 켤 수 없습니다. https 배포 주소나 이 PC 의 localhost 에서 여세요.';
      return;
    }
    var ask = window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function'
      ? DeviceOrientationEvent.requestPermission().catch(function () { return 'denied'; })   // 아이폰 — 버튼을 누른 순간에만 물을 수 있다
      : Promise.resolve('granted');
    ask.then(function () {
      window.addEventListener('deviceorientation', onOrient);
      window.addEventListener('devicemotion', onMotion);
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      $('scan-stage').classList.add('live');
      $('scan-stage').classList.add('full');
      $('scan-live').textContent = '● 실시간 카메라 켜짐';
      $('scan-live').classList.add('on');
      $('btn-scan-stop2').disabled = false;                 // 카메라가 화면 전체를 덮는다
      document.documentElement.classList.add('scan-on');     // 뒤 페이지가 스크롤되지 않게
      $('btn-scan-start').hidden = true;
      $('btn-scan-stop').hidden = false;
      $('scan-status').textContent = '1번째 바퀴 (' + PASSES[0].name + ') — ' + PASSES[0].say;
      showPass();
      $('scan-count').textContent = '사진 ' + shots + '장';
      say(PASSES[0].say);
      timer = setInterval(tick, SHOT_MS);
      warn('');
    }).catch(function (e) {
      $('scan-status').textContent = '카메라를 켜지 못했습니다 (' + (e && e.name || '오류') + '). 브라우저의 카메라 허용을 확인하세요.';
    });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('devicemotion', onMotion);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    warn('');
    $('scan-stage').classList.remove('live');
    $('scan-stage').classList.remove('full');
    $('scan-live').textContent = '카메라 꺼짐';
    $('scan-live').classList.remove('on');
    $('btn-scan-stop2').disabled = true;
    document.documentElement.classList.remove('scan-on');
    $('btn-scan-stop').hidden = true;
    $('btn-scan-start').hidden = false;
    $('btn-scan-start').textContent = '처음부터 다시 찍기';
    showResult();
    savePhoto();
  }

  /* 🆕 2026-11-16 설비 화면의 [카메라로 찍기] — 가장 선명한 한 장을 설비 사진으로 (긴 변 640, setup.js 와 같은 값).
     낮은 바퀴(정면)에서 먼저 고른다. 사진이 바뀌면 예전 AI 위치 분석은 그 사진의 것이 아니라 지운다 */
  var PHOTO_MAX = 640, PHOTO_QUALITY = 0.7;
  function bestShot() {
    var best = null;
    [passes[0], passes[1]].forEach(function (segs) {
      if (best) return;
      segs.forEach(function (list) { list.forEach(function (s) { if (!best || s.sharp > best.sharp) best = s; }); });
    });
    return best;
  }
  function savePhoto() {
    var shot = eq && bestShot();
    if (!shot) return;
    var url = URL.createObjectURL(shot.blob), img = new Image();
    img.onload = function () {
      var k = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      var data = c.toDataURL('image/jpeg', PHOTO_QUALITY);
      Store.setup.update(function (s) {
        var e = Store.findBy(s.equipments, 'id', eq.id);
        if (!e) return;
        if (e.photo !== data && e.analysis) e.analysis = null;
        e.photo = data;
      });
      $('scan-photo-note').hidden = false;
      $('scan-photo-note').textContent = '가장 선명한 한 장을 「' + eq.name + '」의 설비 사진으로 저장했습니다.';
    };
    img.src = url;
  }

  function showResult() {
    var box = $('scan-thumbs');
    box.textContent = '';
    var parts = passes.map(function (segs, i) { return PASSES[i].name + ' ' + Math.round(M.coverage(segs) * 100) + '%'; });
    $('scan-summary').textContent = '흔들리지 않은 사진 ' + shots + '장 · 한 바퀴 채움 ' + parts.join(' · ');
    passes.forEach(function (segs) {
      segs.forEach(function (list) {
        list.forEach(function (shot) {
          var card = UI.el('figure', 'scan-shot');
          var im = UI.el('img', 'scan-thumb');
          im.src = URL.createObjectURL(shot.blob);
          im.alt = '';
          card.appendChild(im);
          var cap = UI.el('figcaption');
          cap.appendChild(UI.el('b', null, (PASSES[shot.pass] || PASSES[0]).name + ' 바퀴 · ' + Math.round((shot.seg || 0) * 360 / C.SEGMENTS) + '° 방향'));
          cap.appendChild(UI.el('small', null, (shot.w || '?') + ' × ' + (shot.h || '?') + ' · 선명도 ' + Math.round(shot.sharp)));
          card.appendChild(cap);
          box.appendChild(card);
        });
      });
    });
    $('sec-result').hidden = !shots;
    if (shots && $('sec-result').scrollIntoView) $('sec-result').scrollIntoView({ block: 'start' });
  }

  $('btn-scan-start').addEventListener('click', function () {
    if ($('btn-scan-start').textContent !== '촬영 시작') {
      pass = 0; shots = 0; fallbackSeg = 0;
      passes.forEach(function (segs) { segs.forEach(function (l) { l.length = 0; }); });
      $('sec-result').hidden = true;
    }
    start();
  });
  $('btn-scan-stop').addEventListener('click', stop);
  $('btn-scan-stop2').addEventListener('click', stop);

  /* ── 서버에 올리기 (/api/scans → Vercel Blob 비공개) — https 배포에서만 (net.js 가 막는다) ── */

  function call(body) { return Net.post('/api/scans', body, { token: Auth.token(), timeoutMs: 30000 }); }

  function upload() {
    if (!eq) { UI.toast('설비 목록에서 설비를 골라 들어와야 올릴 수 있습니다.'); return; }
    var btn = $('btn-scan-upload');
    btn.disabled = true;
    ScanShots.upload(eq.id, passes, function (k, n) {
      $('scan-upload-status').textContent = '올리는 중 ' + k + ' / ' + n;
    }).then(function (r) {
      btn.disabled = false;
      $('scan-upload-status').textContent = r.failed ? ('올림 ' + r.done + '장 · 실패 ' + r.failed + '장 — [서버에 올리기]를 다시 누르면 전부 다시 올립니다.') : ('올림 ' + r.done + '장 — 설비 촬영 묶음 ' + r.scanId);
      loadScans();
    });
  }

  /** 이 설비에 올린 촬영 — PC 에서 보면 폰에서 올린 것이 여기 나온다 */
  function loadScans() {
    var box = $('scan-list');
    if (!eq || !Net.onHttps()) { $('sec-uploaded').hidden = true; return; }
    call({ op: 'list', equipmentId: eq.id }).then(function (r) {
      box.textContent = '';
      var list = (r.ok && r.data && r.data.scans) || [];
      if (!r.ok) box.appendChild(UI.el('li', 'meta', (r.data && r.data.message) || '목록을 불러오지 못했습니다.'));
      else if (!list.length) box.appendChild(UI.el('li', 'meta', '아직 올린 촬영이 없습니다.'));
      list.forEach(function (s) {
        var li = UI.itemRow('check-circle', '촬영 묶음 ' + s.scanId, UI.formatDate(s.at) + ' 올림 · 사진 ' + s.count + '장');
        li.appendChild(UI.okBadge('서버 보관'));
        var dl = UI.el('button', 'btn-sm', '사진 내려받기');
        dl.type = 'button';
        dl.setAttribute('data-download', s.scanId);
        dl.setAttribute('aria-label', '촬영 묶음 ' + s.scanId + ' 사진 ' + s.count + '장 내려받기');
        dl.addEventListener('click', function () { downloadScan(s.scanId, dl); });
        li.appendChild(dl);
        box.appendChild(li);
      });
      $('scan-list-count').textContent = list.length ? '최근 ' + list.length + '건' : '';
      $('sec-uploaded').hidden = false;
    });
  }

  /* ── 🆕 2026-11-21 올린 촬영 사진 내려받기 — 3D(COLMAP·Blender) 재료를 PC 폴더로 ──
     폴더 고르기(showDirectoryPicker — 크롬·엣지 PC)가 되면 고른 폴더에 한 번에 쓴다. 안 되면 한 장씩 내려받는다.
     ★ 폴더 창은 버튼을 누른 그 순간에만 열 수 있다 (브라우저 규칙) — 그래서 콘솔이 아니라 버튼이다
     ★ 같은 사이트 /api/scans 만 부른다 (net.js · 토큰은 헤더로만). 비공개 저장소라 주소를 내주지 않고 이 함수를 거쳐 받는다
     ★ 파일 이름 = <묶음>_<바퀴-칸-번호>.jpg — 여러 묶음을 한 폴더에 받아도 겹치지 않는다 */
  function dataUrlBytes(data) {
    var bin = atob(String(data).split(',')[1] || ''), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function saveFile(dir, name, data) {
    if (dir) {
      return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(dataUrlBytes(data)).then(function () { return w.close(); }); });
    }
    var a = document.createElement('a');
    a.href = data;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    return new Promise(function (ok) { setTimeout(ok, 250); });   // 여러 장을 한꺼번에 누르면 브라우저가 빠뜨린다
  }

  function downloadScan(scanId, btn) {
    var label = btn.textContent;
    var pick = typeof window.showDirectoryPicker === 'function'
      ? window.showDirectoryPicker({ mode: 'readwrite' }).catch(function () { return 'cancel'; })
      : Promise.resolve(null);
    pick.then(function (dir) {
      if (dir === 'cancel') return null;
      btn.disabled = true;
      btn.textContent = '목록 받는 중…';
      return call({ op: 'list', equipmentId: eq.id, scanId: scanId }).then(function (r) {
        var paths = r.ok && r.data && Array.isArray(r.data.paths) ? r.data.paths : [];
        if (!paths.length) { UI.toast(r.ok ? '받을 사진이 없습니다.' : ((r.data && r.data.message) || '목록을 받지 못했습니다.')); return; }
        var done = 0, chain = Promise.resolve();
        paths.forEach(function (p, k) {
          chain = chain.then(function () {
            btn.textContent = '받는 중 ' + (k + 1) + ' / ' + paths.length;
            return call({ op: 'get', path: p });
          }).then(function (g) {
            var data = g.ok && g.data && typeof g.data.data === 'string' && g.data.data.indexOf('data:image/') === 0 ? g.data.data : '';
            if (!data) return null;
            return saveFile(dir, scanId + '_' + p.split('/').pop(), data).then(function () { done += 1; });
          }).catch(function () { /* 한 장 실패는 건너뛴다 — 끝에 장수로 알린다 */ });
        });
        return chain.then(function () {
          UI.toast('사진 ' + done + ' / ' + paths.length + '장을 ' + (dir ? '고른 폴더에 저장했습니다.' : '내려받았습니다 (다운로드 폴더).'));
        });
      });
    }).then(function () { btn.disabled = false; btn.textContent = label; });
  }

  $('btn-scan-upload').addEventListener('click', upload);
  loadScans();
})();
