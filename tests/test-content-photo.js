/* T17 — 교육 만들기 화면의 「사진으로 위험 지점 찾기」 (PRD-AD-07 · C06 D-037)

   ★ 실제 서버·실제 카메라를 부르지 않는다.
     · fetch 는 가짜다 — 부를 때마다 계획(plan)에서 하나씩 꺼낸다
     · Photo.shrink 는 가짜다 — jsdom 에는 캔버스가 없다. 줄이기 자체는 test-photo.js 가 본다
     · 파일 고르기는 input.files 를 덮어써서 흉내 낸다

   여기서 지키는 것 (PRD-AD-07 §8 수용 기준)
     AC-02  [확정]·[승인] 전에는 courses 에 아무것도 저장되지 않는다
     AC-03  6종 밖 위험유형·문장은 문항·문구로 들어가지 않는다
     AC-04  AI 가 실패하면 이유가 보이고 손 흐름(도해에서 고르기)으로 간다
     AC-05  검수 완료가 아닌 문구는 후보에 나오지 않는다
     AC-06  AI 출력의 <script> 는 글자로만 보인다
     +      사진·AI 이유 문장이 기기 저장소에 남지 않는다 (FR-17 · D-037 B안)
     +      보내는 것은 사진 사본과 형식뿐 — 계정·진도·신고를 붙이지 않는다 (FR-14) */

const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC } = require('./harness');

const TOKEN = 'T'.repeat(64);
const ADMIN = { userId: 'kim@daesung.co.kr', role: 'admin', siteName: '대성정밀' };
const IMG = 'SU1HQUdFLUJBU0U2NC1TVFVC';   // 가짜 사진 몸통 — 저장소에 새는지 찾을 표식

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, node) => node.dispatchEvent(new win.Event('change', { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/** 담당자 화면을 띄운다.
 *  opts.server  — https + 토큰 (서버 로그인). 기본 true
 *  opts.photo   — 가짜 Photo. 기본: 언제나 줄이기 성공
 *  plan         — /api/hazards 응답 계획. 다른 주소(동기화)는 빈 200 */
function open(plan, opts = {}) {
  const calls = [];
  const t = boot('admin/content.html', {
    login: 'kim@daesung.co.kr',
    role: 'admin',
    page: 'admin/content.js',
    before: (win) => {
      win.fetch = function (url, o) {
        calls.push({ url: String(url), opts: o || {} });
        if (String(url).indexOf('/api/hazards') === -1) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
        }
        const r = (plan || []).shift() || { status: 200, body: { person: false, points: [] } };
        if (r.dead) return Promise.reject(new Error('닿지 못함'));
        return Promise.resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          json: () => Promise.resolve(r.body),
        });
      };
      if (opts.server !== false) {
        win.sessionStorage.setItem('safety.token.v1', TOKEN);
        win.sessionStorage.setItem('safety.user.v1', JSON.stringify(ADMIN));
      }
      win.Photo = opts.photo || {
        available: () => true,
        shrink: () => Promise.resolve({ image: IMG, mime: 'image/jpeg', bytes: 18, width: 10, height: 10 }),
      };
    },
  });
  t.calls = calls;
  t.hazardCalls = () => calls.filter((c) => c.url.indexOf('/api/hazards') !== -1);
  return t;
}

/** 사진 하나를 고른 것처럼 한다 */
function pick(t) {
  const input = t.$('photo-input');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{ name: 'press.jpg', type: 'image/jpeg', size: 3 * 1024 * 1024 }],
  });
  change(t.win, input);
}

const GOOD = {
  status: 200,
  body: {
    person: false, retake: false, model: 'gemini-3.1-flash-lite', overlaps: 0,
    dropped: { hazard: 1, range: 0, shape: 0, over: 0 },
    points: [
      { x: 50, y: 52, r: 8, hazard: 'pinch', why: '램과 금형 사이 <script>alert(1)</script>' },
      { x: 20, y: 18, r: 8, hazard: 'shock', why: '전원 스위치' },
      { x: 30, y: 30, r: 8, hazard: 'magic', why: '6종 밖' },     // 화면도 한 번 더 거른다
      { x: 140, y: 30, r: 8, hazard: 'fire', why: '사진 밖' },    // 좌표 범위 밖
    ],
  },
};

(async () => {
  /* =================================================================
     1. 쓸 수 없을 때 — 버튼을 숨기지 않고 이유를 적는다 (FR-11)
     ================================================================= */
  {
    const t = open([], { server: false });
    ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
    ok('★ 사진 찾기 칸이 보인다 (숨기지 않음)', !t.$('photo-ai').hidden);
    eq('★ 이 기기 안 로그인이면 버튼이 잠긴다', t.$('btn-photo').disabled, true);
    has('★ 왜 안 되는지 적는다', text(t.$('photo-status')), '서버 로그인일 때만');
    has('★ 손 흐름을 알려 준다', text(t.$('photo-status')), '직접 고르실 수 있습니다');
    has('AI 는 제안까지라고 적는다', text(t.$('photo-ai')), 'AI 는 제안까지 · 확정은 담당자');
    has('사진을 저장하지 않는다고 적는다', text(t.$('photo-ai')), '사진은 저장하지 않습니다');
    has('얼굴·이름표 안내', text(t.$('photo-guide')), '이름표');

    const noPhoto = open([], { photo: { available: () => false, shrink: () => Promise.resolve({}) } });
    eq('★ 사진을 줄일 수 없는 브라우저면 잠긴다', noPhoto.$('btn-photo').disabled, true);
    has('그 이유를 적는다', text(noPhoto.$('photo-status')), '줄일 수 없습니다');

    const fresh = open([]);
    eq('서버 로그인 + https 면 쓸 수 있다', fresh.$('btn-photo').disabled, false);
    /* D-038 개정 — 안드로이드 14+ 크롬은 capture 없는 칸에서 카메라를 안 보여 준다. 칸을 둘로 */
    eq('★ 찍기 칸은 카메라를 연다 (capture)', fresh.$('photo-camera').getAttribute('capture'), 'environment');
    ok('★ 고르기 칸은 앨범을 연다 (capture 없음)', !fresh.$('photo-input').hasAttribute('capture'));
    eq('그림 파일이면 받는다 (찍기)', fresh.$('photo-camera').getAttribute('accept'), 'image/*');
    eq('그림 파일이면 받는다 (고르기)', fresh.$('photo-input').getAttribute('accept'), 'image/*');
    eq('앨범 버튼도 쓸 수 있다', fresh.$('btn-photo-album').disabled, false);
    eq('★ 잠길 때는 둘 다 잠긴다', t.$('btn-photo-album').disabled, true);
  }

  /* =================================================================
     2. 정상 — 제안을 보여 주고, 아무것도 저장하지 않는다
     ================================================================= */
  {
    const t = open([GOOD]);
    const before = JSON.stringify(t.win.Store.courses.load());
    pick(t);
    await settle();

    const calls = t.hazardCalls();
    eq('★ /api/hazards 를 한 번 부른다', calls.length, 1);
    eq('POST 로', calls[0] && calls[0].opts.method, 'POST');
    eq('★ 토큰은 헤더로만', calls[0] && calls[0].opts.headers.Authorization, 'Bearer ' + TOKEN);
    const sent = JSON.parse((calls[0] && calls[0].opts.body) || '{}');
    eq('★ 보내는 것은 사진 사본과 형식뿐 (FR-14)', Object.keys(sent).sort().join(','), 'image,mime');
    eq('사진 사본 그대로', sent.image, IMG);

    const marks = t.$('photo-figure').querySelectorAll('.photo-pt');
    eq('★ 6종 밖·사진 밖 제안은 화면이 한 번 더 거른다 (AC-03)', marks.length, 2);
    eq('번호가 붙는다', text(marks[0]), '1');
    has('지점마다 위험유형을 글자로 읽는다 (색만 쓰지 않음)', marks[0].getAttribute('aria-label'), '끼임');
    has('AI 제안 표시', text(t.$('photo-points')), 'AI 제안');
    has('★ 버린 수를 적는다 (FR-05)', text(t.$('photo-status')), '쓸 수 없는 제안 1개');

    /* AC-06 — AI 이유 문장은 글자로만 */
    ok('★ AI 출력의 <script> 가 요소로 들어가지 않는다',
      t.$('photo-points').querySelectorAll('script').length === 0);
    has('글자로는 보인다', text(t.$('photo-points')), '<script>');

    eq('★★ 확정 전 courses 는 그대로다 (AC-02)', JSON.stringify(t.win.Store.courses.load()), before);

    /* 사진·이유가 기기 저장소에 남지 않는다 */
    const ls = t.win.localStorage;
    let leaked = false;
    for (let i = 0; i < ls.length; i++) {
      const v = ls.getItem(ls.key(i)) || '';
      if (v.indexOf(IMG) !== -1 || v.indexOf('램과 금형 사이') !== -1) leaked = true;
    }
    ok('★★ 사진·AI 이유가 localStorage 에 없다 (FR-17 · D-037)', !leaked);

    /* 담당자가 고친다 — 유형 바꾸기 · 지우기 */
    const sel = t.$('photo-hz-1');
    sel.value = 'fire';
    change(t.win, sel);
    const delBtn = t.$('photo-points').querySelectorAll('.photo-row')[1].querySelector('button');
    click(t.win, delBtn);
    eq('지우면 지점이 하나 준다', t.$('photo-figure').querySelectorAll('.photo-pt').length, 1);

    /* 확정 → 위험유형 · 문항 초안 · 문구 후보 */
    click(t.win, t.$('btn-photo-confirm'));
    ok('확정하면 결과가 열린다', !t.$('photo-result').hidden);
    has('확정한 위험유형', text(t.$('photo-result')), '끼임');
    eq('★★ 확정해도 courses 는 그대로다', JSON.stringify(t.win.Store.courses.load()), before);

    const cands = [...t.$('photo-result').querySelectorAll('input[name="photo-phrase"]')].map((i) => i.value);
    ok('끼임 → 프레스 문구가 후보로 나온다', cands.indexOf('ph-1') !== -1, cands.join(','));
    cands.forEach((id) => {
      const p = t.win.Store.library.load().find((x) => x.id === id);
      ok('★ 후보는 검수 완료 문구뿐 (' + id + ')', p && p.status === 'reviewed');
    });

    /* 문구를 2단계에 더한다 */
    t.$('photo-result').querySelectorAll('input[name="photo-phrase"]').forEach((i) => {
      i.checked = i.value === 'ph-1';
    });
    click(t.win, t.$('btn-photo-phrases'));
    const step2 = [...t.$('pick-phrase').querySelectorAll('input[name="phrase"]:checked')].map((i) => i.value);
    ok('★ 고른 후보가 2단계 선택에 들어간다', step2.indexOf('ph-1') !== -1, step2.join(','));

    /* 이 위험으로 문항 쓰기 → 도해에서 정답 구역 → 문항 더하기 */
    const go = t.$('photo-result').querySelector('button[data-hazard="pinch"]');
    click(t.win, go);
    ok('hotspot 폼이 열린다', !t.$('q-hotspot').hidden);
    eq('★ 문항 초안은 고정표 문장 (AI 가 쓰지 않음)', t.$('q-hot-prompt').value,
      '이 설비에서 손이 끼일 수 있는 곳을 누르세요');
    has('어떤 위험유형인지 적는다', text(t.$('q-hot-hazard')), '끼임');

    const zone = t.$('q-hot-figure').querySelector('.zone');
    ok('도해에 구역이 있다 (프레스)', !!zone);
    click(t.win, zone);
    const n = t.$('quiz-list').querySelectorAll('.item').length;
    click(t.win, t.$('btn-add-q'));
    eq('문항이 초안에 하나 붙는다', t.$('quiz-list').querySelectorAll('.item').length, n + 1);
    eq('★★ 그래도 courses 는 그대로다 — 승인 전 (AC-02)', JSON.stringify(t.win.Store.courses.load()), before);
    ok('위험유형 안내가 지워진다', t.$('q-hot-hazard').hidden);

    /* 담당자가 [승인·발급] 을 눌러야 비로소 저장된다 — 그때 문항에 위험유형이 붙어 있다 */
    t.$('draft-title').value = '프레스 사진 교육';
    t.$('draft-title').dispatchEvent(new t.win.Event('input', { bubbles: true }));
    t.$('pick-lang').querySelectorAll('input[name="lang"]').forEach((i) => { i.checked = i.value === 'km'; });
    change(t.win, t.$('pick-lang'));
    eq('발급할 수 있다', t.$('btn-approve').disabled, false);
    const count = t.win.Store.courses.load().length;
    click(t.win, t.$('btn-approve'));
    const courses = t.win.Store.courses.load();
    eq('승인하면 교육이 하나 늘어난다', courses.length, count + 1);
    const made = courses[courses.length - 1];
    eq('★ 문항에 확정한 위험유형이 붙는다 (대시보드 언어×위험유형)', made.quiz[0].hazard, 'pinch');
    ok('★ 저장된 교육에 사진·AI 이유가 없다',
      JSON.stringify(made).indexOf(IMG) === -1 && JSON.stringify(made).indexOf('램과 금형 사이') === -1);
    eq('문구 후보로 더한 ph-1 이 들어 있다', made.phraseIds.indexOf('ph-1') !== -1, true);
  }

  /* 2-1. 찍기 칸으로 들어와도 같은 흐름이다 */
  {
    const t = open([GOOD]);
    const cam = t.$('photo-camera');
    Object.defineProperty(cam, 'files', { configurable: true,
      value: [{ name: 'cam.jpg', type: 'image/jpeg', size: 2 * 1024 * 1024 }] });
    cam.dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await settle();
    eq('★ 카메라로 찍은 사진도 /api/hazards 로 간다', t.hazardCalls().length, 1);
    eq('지점이 그려진다', t.$('photo-figure').querySelectorAll('.photo-pt').length, 2);
  }

  /* =================================================================
     3. 사람이 찍혔다 — 지점을 그리지 않고 다시 찍게 한다 (FR-20)
     ================================================================= */
  {
    const t = open([{ status: 200, body: { person: true, retake: true, points: [], dropped: null, overlaps: 0 } }]);
    pick(t);
    await settle();
    eq('★ 지점이 하나도 그려지지 않는다', t.$('photo-figure').querySelectorAll('.photo-pt').length, 0);
    ok('사진 칸도 닫힌다', t.$('photo-figure').hidden);
    has('★ 다시 찍으라고 한다', text(t.$('photo-status')), '설비만 다시 찍어 주세요');
  }

  /* =================================================================
     4. 실패 — 이유를 적고 손 흐름으로 (AC-04)
     ================================================================= */
  {
    const dead = open([{ dead: true }]);
    pick(dead);
    await settle();
    has('★ 닿지 못하면 이유', text(dead.$('photo-status')), '서버에 닿지 못했습니다');
    has('★ 손 흐름 안내', text(dead.$('photo-status')), '직접 고르실 수 있습니다');
    eq('버튼이 다시 풀린다', dead.$('btn-photo').disabled, false);

    const limit = open([{ status: 429, body: { error: 'limit', message: '오늘 사진 분석 한도를 넘었습니다. 직접 만드실 수 있습니다.' } }]);
    pick(limit);
    await settle();
    has('★ 서버가 거절하면 서버 안내 그대로', text(limit.$('photo-status')), '한도를 넘었습니다');

    const shrinkFail = open([], {
      photo: { available: () => true, shrink: () => Promise.resolve({ failed: 'too_big', message: '사진이 너무 큽니다. 조금 멀리서 다시 찍어 주세요.' }) },
    });
    pick(shrinkFail);
    await settle();
    eq('★ 못 줄이면 서버를 부르지 않는다', shrinkFail.hazardCalls().length, 0);
    has('그 이유를 적는다', text(shrinkFail.$('photo-status')), '너무 큽니다');

    /* 손 흐름은 그대로 동작한다 — 사진 없이 hotspot 문항 */
    const radio = dead.win.document.querySelector('input[name="qtype"][value="hotspot"]');
    radio.checked = true;
    change(dead.win, dead.$('pick-qtype'));
    dead.$('q-hot-prompt').value = '손이 끼이는 곳을 누르세요';
    click(dead.win, dead.$('q-hot-figure').querySelector('.zone'));
    const before = dead.$('quiz-list').querySelectorAll('.item').length;
    click(dead.win, dead.$('btn-add-q'));
    eq('★ AI 가 실패해도 손으로 문항을 만든다', dead.$('quiz-list').querySelectorAll('.item').length, before + 1);
  }

  /* =================================================================
     5. 질식 → 검수 대기 문구는 후보에 없다 (AC-05)
     ================================================================= */
  {
    const t = open([{ status: 200, body: { person: false, points: [{ x: 40, y: 60, r: 8, hazard: 'choke', why: '' }], dropped: {}, overlaps: 0 } }]);
    pick(t);
    await settle();
    click(t.win, t.$('btn-photo-confirm'));
    const cands = [...t.$('photo-result').querySelectorAll('input[name="photo-phrase"]')].map((i) => i.value);
    ok('질식 → 방독마스크 문구(ph-4) 후보', cands.indexOf('ph-4') !== -1, cands.join(','));
    ok('★★ 환기팬 문구(ph-5, 검수 대기)는 후보에 없다', cands.indexOf('ph-5') === -1, cands.join(','));
  }

  /* =================================================================
     6. 사진을 눌러 직접 더하기 · 5개 상한 · 지우기
     ================================================================= */
  {
    const t = open([{ status: 200, body: { person: false, points: [], dropped: {}, overlaps: 0 } }]);
    pick(t);
    await settle();
    has('찾지 못하면 직접 더하라고 한다', text(t.$('photo-status')), '직접 더하실 수 있습니다');
    const fig = t.$('photo-figure');
    fig.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
    for (let i = 0; i < 7; i++) {
      fig.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, clientX: 20 + i * 20, clientY: 50 }));
    }
    eq('★ 직접 더해도 5개까지', fig.querySelectorAll('.photo-pt').length, 5);
    has('직접 추가 표시', text(t.$('photo-points')), '직접 추가');
    eq('누른 자리가 퍼센트로', fig.querySelectorAll('.photo-pt')[0].style.left, '10%');

    /* 고른 뒤 다른 곳을 누르면 옮긴다 */
    click(t.win, fig.querySelectorAll('.photo-pt')[0]);
    fig.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, clientX: 100, clientY: 90 }));
    eq('★ 옮기기', fig.querySelectorAll('.photo-pt')[0].style.top, '90%');

    click(t.win, t.$('btn-photo-clear'));
    ok('사진 지우기 → 칸이 닫힌다', t.$('photo-figure').hidden);
    has('저장되지 않았다고 적는다', text(t.$('photo-status')), '저장되지 않았습니다');
  }

  /* =================================================================
     7. 코드 규칙
     ================================================================= */
  {
    const js = fs.readFileSync(path.join(SRC, 'admin/content.js'), 'utf8');
    ok('★ 화면 코드가 fetch 를 직접 부르지 않는다 (net.js 만)', !/\bfetch\s*\(/.test(js));
    ok('★ innerHTML 을 쓰지 않는다', !/innerHTML/.test(js));
    ok('★ 사진 칸을 저장소(Store)에 쓰지 않는다',
      !/Store\.[a-z]+\.(save|update)\([^)]*photo/.test(js));
    const html = fs.readFileSync(path.join(SRC, 'admin/content.html'), 'utf8');
    ok('photo.js 를 net.js 뒤에 싣는다',
      html.indexOf('assets/photo.js') > html.indexOf('assets/net.js') && html.indexOf('assets/photo.js') !== -1);
  }

  report('T17 교육 만들기 — 사진으로 위험 지점 찾기 (제안만 · 저장 없음)');
})();
