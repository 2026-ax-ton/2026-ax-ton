/* ===================================================================
   scan.js — 설비 촬영 가이드 (시제품, 2026-11-14)

   담당자가 휴대폰으로 설비 둘레를 두 바퀴 찍는다 — 낮게 한 바퀴, 높게 한 바퀴.
   찍은 사진은 나중에 3D 장면(영상 「어디」 컷·퀴즈 여러 각도)의 재료가 된다.

   ★ 카메라 화면 위에 안내를 겹쳐 그린다 — 틀 · 수평선 · 한 바퀴 진행 링 · 경고(아이콘 + 글 + 음성)
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
    PER_SEG: 2,          // 칸마다 남길 사진 수 (선명한 순)
    DONE_RATIO: 0.8,     // 칸 80% 가 차면 그 바퀴는 끝
    DARK: 45,            // 평균 밝기(0~255) 아래면 어둡다
    BRIGHT: 215,         // 위면 역광·과노출
    SHARP_MIN: 60,       // 라플라시안 분산 아래면 흔들림 — ponytail: 고정 문턱, 실물 촬영으로 조정 (화면 아래 숫자를 보고)
    FAST_DEG: 45         // 초당 회전 각도 위면 너무 빠름
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

  /** 칸에 사진을 넣는다 — 칸마다 PER_SEG 장까지, 더 선명한 것으로 바꾼다. 넣었으면 true */
  function keep(list, shot) {
    if (list.length < C.PER_SEG) { list.push(shot); return true; }
    var worst = 0;
    list.forEach(function (s, i) { if (s.sharp < list[worst].sharp) worst = i; });
    if (shot.sharp <= list[worst].sharp) return false;
    list[worst] = shot;
    return true;
  }

  return { C: C, segmentOf: segmentOf, stats: stats, verdict: verdict, coverage: coverage, biggestGap: biggestGap, keep: keep };
})();

(function () {
  'use strict';

  if (typeof UI === 'undefined' || !document.getElementById('scan-video')) return;

  var $ = UI.$;
  var M = ScanMath;
  var C = M.C;
  UI.fillAdminBar(Auth.current());
  UI.warnIfBlocked();

  var SHOT_MS = 500;
  var SAY_GAP_MS = 4000;          // 같은 경고를 다시 말하기까지
  var MAX_EDGE = 1600;            // 남길 사진의 긴 변
  var PASSES = [
    { name: '낮게', say: '허리 높이에서 기계를 화면 틀 안에 두고, 천천히 한 바퀴 도세요.' },
    { name: '높게', say: '이번에는 팔을 들어 위에서 내려다보며, 한 바퀴 더 도세요.' }
  ];
  var WARN = {
    dark: ['alert', '어두워요 — 밝은 쪽으로 가거나 조명을 켜세요'],
    bright: ['alert', '너무 밝아요 — 창문·조명을 등지지 마세요'],
    fast: ['alert-circle', '너무 빨라요 — 천천히 도세요'],
    blur: ['alert-circle', '흔들려요 — 잠깐 멈췄다가 움직이세요'],
    tilt: ['alert-circle', '휴대폰을 똑바로 세우세요']
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
  var sensor = { alpha: null, gamma: 0, speed: 0, seen: false };
  var fallbackSeg = 0;
  var lastSay = { key: '', at: 0 };
  var shots = 0;

  function say(text) { UI.speak({ text: text, lang: 'ko', ko: text }); }

  function warn(key) {
    var box = $('scan-warn');
    if (!key) { box.hidden = true; return; }
    UI.setIcon($('scan-warn-ico'), WARN[key][0]);
    $('scan-warn-text').textContent = WARN[key][1];
    box.hidden = false;
    var now = Date.now();
    if (lastSay.key !== key || now - lastSay.at > SAY_GAP_MS) { say(WARN[key][1]); lastSay = { key: key, at: now }; }
  }

  function onOrient(e) {
    if (e.alpha == null) return;
    sensor.seen = true;
    sensor.alpha = 360 - e.alpha;          // 시계 방향으로 돌면 커지게
    sensor.gamma = e.gamma || 0;
  }
  function onMotion(e) {
    var r = e.rotationRate;
    if (r) sensor.speed = Math.max(Math.abs(r.alpha || 0), Math.abs(r.beta || 0), Math.abs(r.gamma || 0));
  }

  function draw() {
    var w = overlay.width = video.clientWidth, h = overlay.height = video.clientHeight;
    var g = overlay.getContext('2d');
    g.clearRect(0, 0, w, h);
    /* 틀 — 기계를 여기 넣는다 */
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 3;
    g.setLineDash([12, 8]);
    g.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
    g.setLineDash([]);
    /* 수평선 — 기울면 주황, 바르면 초록 */
    var tilt = sensor.seen ? sensor.gamma : 0;
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-tilt * Math.PI / 180);
    g.strokeStyle = Math.abs(tilt) < 6 ? '#22c55e' : '#f59e0b';
    g.beginPath(); g.moveTo(-w * 0.3, 0); g.lineTo(w * 0.3, 0); g.stroke();
    g.restore();
    /* 진행 링 — 오른쪽 위. 찬 칸은 초록, 지금 방향은 흰 바늘, 가장 빈 쪽은 주황 점 */
    var segs = passes[pass], R = Math.min(w, h) * 0.13, cx = w - R - 14, cy = R + 14;
    var step = Math.PI * 2 / C.SEGMENTS;
    g.lineWidth = R * 0.32;
    for (var s = 0; s < C.SEGMENTS; s++) {
      g.strokeStyle = segs[s].length ? '#22c55e' : 'rgba(0,0,0,.45)';
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2 + s * step + 0.03, -Math.PI / 2 + (s + 1) * step - 0.03); g.stroke();
    }
    var cur = sensor.seen ? M.segmentOf(sensor.alpha, C.SEGMENTS) : fallbackSeg;
    var a = -Math.PI / 2 + (cur + 0.5) * step;
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
    var gap = M.biggestGap(segs);
    if (gap >= 0 && M.coverage(segs) > 0) {
      var ga = -Math.PI / 2 + (gap + 0.5) * step;
      g.fillStyle = '#f59e0b';
      g.beginPath(); g.arc(cx + Math.cos(ga) * (R + R * 0.35), cy + Math.sin(ga) * (R + R * 0.35), 6, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff';
    g.font = 'bold ' + Math.round(R * 0.5) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(pass + 1), cx, cy);
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
    if (!bad && sensor.seen && Math.abs(sensor.gamma) > 20) bad = 'tilt';
    $('scan-meter').textContent = '밝기 ' + Math.round(st.mean) + ' · 선명도 ' + Math.round(st.sharp) + ' (기준 ' + C.SHARP_MIN + ')' +
      ' · 회전 ' + Math.round(sensor.speed) + '°/s · 방향 센서 ' + (sensor.seen ? '켜짐' : '없음 — 찍은 장수로 채움') +
      ' · 사진 ' + shots + '장';
    warn(bad);
    draw();
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
      if (!M.keep(segs[seg], { blob: blob, sharp: sharp, at: Date.now() })) return;
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
      say(PASSES[pass].say);
    } else {
      say('다 찍었습니다. 수고하셨습니다.');
      stop();
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
      $('scan-stage').hidden = false;
      $('btn-scan-start').hidden = true;
      $('btn-scan-stop').hidden = false;
      $('scan-status').textContent = '1번째 바퀴 (' + PASSES[0].name + ') — ' + PASSES[0].say;
      say(PASSES[0].say);
      timer = setInterval(tick, SHOT_MS);
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
    $('scan-stage').hidden = true;
    $('btn-scan-stop').hidden = true;
    $('btn-scan-start').hidden = false;
    $('btn-scan-start').textContent = '처음부터 다시 찍기';
    showResult();
  }

  function showResult() {
    var box = $('scan-thumbs');
    box.textContent = '';
    var parts = passes.map(function (segs, i) { return PASSES[i].name + ' ' + Math.round(M.coverage(segs) * 100) + '%'; });
    $('scan-summary').textContent = '사진 ' + shots + '장 · 한 바퀴 채움 ' + parts.join(' · ');
    passes.forEach(function (segs) {
      segs.forEach(function (list) {
        list.forEach(function (shot) {
          var im = UI.el('img', 'scan-thumb');
          im.src = URL.createObjectURL(shot.blob);
          im.alt = '';
          box.appendChild(im);
        });
      });
    });
    $('sec-result').hidden = !shots;
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

  /* ── 서버에 올리기 (/api/scans → Vercel Blob 비공개) — https 배포에서만 (net.js 가 막는다) ── */

  function toDataUrl(b) {
    return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = function () { ok(''); }; r.readAsDataURL(b); });
  }

  function call(body) { return Net.post('/api/scans', body, { token: Auth.token(), timeoutMs: 30000 }); }

  function upload() {
    if (!eq) { UI.toast('설비 목록에서 설비를 골라 들어와야 올릴 수 있습니다.'); return; }
    var scanId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    var jobs = [];
    passes.forEach(function (segs, p) { segs.forEach(function (list, s) { list.forEach(function (shot, i) { jobs.push({ shot: shot, name: p + '-' + s + '-' + i }); }); }); });
    var done = 0, failed = 0, btn = $('btn-scan-upload');
    btn.disabled = true;
    function next(k) {
      if (k >= jobs.length) {
        btn.disabled = false;
        $('scan-upload-status').textContent = failed ? ('올림 ' + done + '장 · 실패 ' + failed + '장 — [서버에 올리기]를 다시 누르면 전부 다시 올립니다.') : ('올림 ' + done + '장 — 설비 촬영 묶음 ' + scanId);
        loadScans();
        return;
      }
      $('scan-upload-status').textContent = '올리는 중 ' + (k + 1) + ' / ' + jobs.length;
      toDataUrl(jobs[k].shot.blob).then(function (data) {
        return call({ op: 'put', equipmentId: eq.id, scanId: scanId, name: jobs[k].name, data: data });
      }).then(function (r) {
        if (r.ok) done += 1; else failed += 1;
        if (!r.ok && (r.failed || r.status === 401)) { failed += jobs.length - k - 1; next(jobs.length); return; }   // 끊김·로그인 만료면 멈춘다
        next(k + 1);
      });
    }
    next(0);
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
      list.forEach(function (s) { box.appendChild(UI.itemRow('camera', UI.formatDate(s.at), '사진 ' + s.count + '장 · 묶음 ' + s.scanId)); });
      $('sec-uploaded').hidden = false;
    });
  }

  $('btn-scan-upload').addEventListener('click', upload);
  loadScans();
})();
