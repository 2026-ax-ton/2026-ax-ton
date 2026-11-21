/* 음성 듣기 ↔ 그만 듣기 — 노동자 교육·검증 화면 (2026-11-11 사용자 요청 4)

   이 묶음이 지키는 것
     1. ★★ 읽는 중에 누르면 멈추고, 다시 누르면 처음부터 다시 읽는다
     2. ★★ 다 읽은 뒤에도 다시 들을 수 있다 (버튼이 「듣기」로 돌아온다)
     3. ★ 상태에 따라 그림·aria 가 바뀐다 (읽는 중 = ■ · aria-pressed true)
     4. ★★ 빠르게 여러 번 눌러도 겹쳐 읽지 않는다
     5. ★★ 다음 문항으로 가면 앞 문항 음성은 끊긴다
     6. ★ 그 언어 음성이 기기에 없으면 조용히 아무 일도 안 하지 않는다 — 이유를 내 언어로 알린다
     7. ★ 언어를 바꾸면 음성을 끊고 화면을 그 언어로 다시 그린다 (새로고침 없이) */

const { boot, ok, eq, has, report, iconName } = require('./harness');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

/* 끝 신호를 사람이 정한다 — 「읽는 중」을 붙잡아 두려고 */
function fakeSpeech(tags) {
  const s = {
    spoken: [], cancels: 0, live: null,
    cancel() { s.cancels += 1; const u = s.live; s.live = null; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
    pause() {}, resume() {},
    getVoices() { return tags.map((l) => ({ lang: l })); },
    addEventListener() {}, removeEventListener() {},
    speak(u) { s.spoken.push(u); s.live = u; if (u.onstart) u.onstart(); },
    finish() { const u = s.live; s.live = null; if (u && u.onend) u.onend(); },
  };
  return s;
}

function open(page, query, voices, login) {
  return boot('worker/' + page + '.html' + (query || ''), {
    login: login || 'W-4821-07', page: 'worker/' + page + '.js',
    before(win) {
      win.speechSynthesis = fakeSpeech(voices || ['ko-KR', 'km-KH']);
      win.SpeechSynthesisUtterance = function (t) { this.text = t; };
    },
  });
}

/* ── 검증 화면 ── */
{
  const t = open('quiz', '?course=c-press');
  const sp = t.win.speechSynthesis;
  const btn = () => t.$('prompt-audio').querySelector('.btn-audio');
  const realNow = t.win.Date.now;
  let clock = 1000000;
  t.win.Date.now = () => clock;

  eq('문항이 열리면 스스로 읽는다', sp.spoken.length, 1);
  eq('★ 읽는 중 — 버튼이 「그만 듣기」(■) 모양', iconName(btn()) + '|' + btn().getAttribute('aria-pressed'), 'stop|true');
  has('읽는 중 이름도 내 언어로', btn().getAttribute('aria-label'), t.win.I18N.t('voice.stop', 'km'));

  clock += 1000;
  click(t.win, btn());
  eq('★★ 읽는 중에 누르면 멈춘다 (새로 읽지 않는다)', sp.spoken.length + '|' + (sp.live === null), '1|true');
  eq('★ 멈추면 「듣기」(스피커) 모양으로', iconName(btn()) + '|' + btn().getAttribute('aria-pressed'), 'speaker|false');

  clock += 1000;
  click(t.win, btn());
  eq('★★ 다시 누르면 처음부터 다시 읽는다', sp.spoken.length, 2);
  sp.finish();
  eq('★★ 다 읽으면 「듣기」로 돌아온다', iconName(btn()), 'speaker');
  clock += 1000;
  click(t.win, btn());
  eq('★★ 다 읽은 뒤에도 다시 들을 수 있다', sp.spoken.length, 3);

  sp.finish();
  clock += 1000;
  click(t.win, btn());
  click(t.win, btn());
  click(t.win, btn());
  eq('★★ 빠르게 여러 번 눌러도 한 번만 읽는다 (겹치지 않는다)', sp.spoken.length, 4);
  ok('그 한 번은 읽는 중', btn().classList.contains('is-playing'));

  /* 다음 문항 — 앞 음성 끊고 새 문항을 읽는다 */
  const zone = [...t.$('quiz-body').querySelectorAll('.zone')][0];
  click(t.win, zone);
  click(t.win, t.$('btn-hotspot-submit'));
  const before = sp.cancels;
  clock += 1000;
  click(t.win, t.$('btn-next'));
  ok('★★ 다음 문항으로 가면 앞 음성을 끊는다', sp.cancels > before);
  has('★ 새 문항을 읽는다', sp.spoken[sp.spoken.length - 1].text, t.win.Store.qtext(t.win.Store.courses.load().find((c) => c.id === 'c-press').quiz[1], 'km', 'prompt'));

  /* 언어 바꾸기 — 음성을 끊고 그 자리에서 다시 그린다 */
  const sel = t.$('lang-switch').querySelector('select');
  ok('★ 머리에 언어 바꾸기가 있다 (모국어 글자)', !!sel && [...sel.options].some((o) => o.textContent === 'नेपाली'));
  const cancels = sp.cancels;
  sel.value = 'ne';
  sel.dispatchEvent(new t.win.Event('change', { bubbles: true }));
  ok('★ 언어를 바꾸면 읽던 음성을 끊는다', sp.cancels > cancels);
  has('★★ 새로고침 없이 문항이 그 언어로', t.$('quiz-prompt').textContent, 'प्रेस मेसिन रोकियो। के गर्नुपर्छ?');
  has('화면 글자도 그 언어로', t.$('step-count').textContent, t.win.I18N.t('quiz.stepLabel', 'ne'));
  eq('★ 계정에 저장된다 (다음 문항·새로고침에도 남는다)', t.win.Store.accounts.load().find((a) => a.userId === 'W-4821-07').lang, 'ne');
  t.win.Date.now = realNow;
  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
}

/* ── 그 언어 음성이 없는 기기 — 조용히 아무 일도 안 하지 않는다 ── */
{
  const t = open('quiz', '?course=c-press', ['ko-KR']);
  const sp = t.win.speechSynthesis;
  const btn = t.$('prompt-audio').querySelector('.btn-audio');
  eq('크메르어 음성이 없으면 읽지 않는다 (기본: 소리 안 냄)', sp.spoken.length, 0);
  eq('버튼은 음소거 그림', iconName(btn), 'speaker-off');
  click(t.win, btn);
  has('★ 누르면 왜 안 나는지 내 언어로 알린다', t.$('toast').textContent, t.win.UI.voiceNote('km').slice(0, 12));
}

/* ── 수강 화면도 같은 버튼 ── */
{
  const t = open('learn');
  const sp = t.win.speechSynthesis;
  click(t.win, t.$('course-list').querySelector('.course-open'));
  const btn = () => t.$('phrase-card').querySelector('.btn-audio');
  eq('문구 장이 열리면 읽는다 · 읽는 중 모양', sp.spoken.length + '|' + iconName(btn()), '1|stop');
  sp.finish();
  eq('다 읽으면 「듣기」', iconName(btn()), 'speaker');
  ok('★★ 한국어 원문 줄이 없다', !t.$('phrase-card').querySelector('.original'));
  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
}

report('음성 듣기 ↔ 그만 듣기 · 언어 바꾸기 (2026-11-11)');
