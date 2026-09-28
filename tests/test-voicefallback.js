/* 내 언어 음성이 이 기기에 없을 때 — 조용히 넘어가지 않는가

   ★★ 이 묶음에서 가장 중요한 것은 "뜻이 닿지 않는 소리를 내지 않는가" 다.
     크메르어 노동자에게 한국어 음성은 대부분 뜻이 닿지 않는다. 소리는 나는데
     아무것도 전달되지 않으면 사람은 "들었다" 고 생각하고 넘어간다 —
     그게 이 제품이 막으려는 상황 그 자체다.

   ★ 그런데 소리를 안 내는 것만으로는 부족하다. 안 낼 때는 화면이 그 이유를
     그 사람의 언어로 적어야 하고, 버튼 그림도 음소거로 바뀌어야 한다.
     조용히 아무 일도 안 일어나는 것이 가장 나쁜 실패다.

   ★ 그래도 "한국어로 들려주기" 를 없애지 않는다 — 말은 알아듣는데 글은 못
     읽는 사람이 흔하다. 이 제품이 겨냥한 것은 "문해력 없음" 이지 "한국어
     전혀 모름" 이 아니다. 그 사람에게는 한국어 음성이 유일한 통로다.

   ★ 묶음을 따로 둔 이유 — 이 검사는 "그 언어 음성이 없는 기기" 를 만들어야
     하고, 그러려면 speechSynthesis 를 내가 정한 목록으로 바꿔 끼워야 한다.
     test-voice.js 는 말로 알리기(받아쓰기)의 익명성을 보는 묶음이라 주제가 다르다. */
const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC, iconName, iconNames } = require('./harness');

const ui = fs.readFileSync(path.join(SRC, 'assets/ui.js'), 'utf8');
const myjs = fs.readFileSync(path.join(SRC, 'worker/my.js'), 'utf8');
const myhtml = fs.readFileSync(path.join(SRC, 'worker/my.html'), 'utf8');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

/* 이 기기에 들어 있는 음성을 내가 정한다.
   "크메르어 음성이 없는 폰" 이 이 기능이 겨냥한 상황이고,
   그것을 만들 방법이 이것뿐이다. */
function fakeSpeech(tags) {
  const spoken = [];
  return {
    spoken,
    cancel() {}, pause() {}, resume() {},
    getVoices() { return tags.map((l) => ({ lang: l })); },
    addEventListener() {}, removeEventListener() {},
    speak(u) { spoken.push(u); if (u.onstart) u.onstart(); if (u.onend) u.onend(); },
  };
}

/* voices 기본값은 ['ko-KR'] — 한국어 음성만 들어 있는 기기 */
function open(page, opts = {}) {
  return boot('worker/' + page + '.html', {
    login: opts.login || 'W-4821-07',
    page: 'worker/' + page + '.js',
    before(win) {
      win.speechSynthesis = fakeSpeech(opts.voices || ['ko-KR']);
      win.SpeechSynthesisUtterance = function (t) { this.text = t; };
      if (opts.fallback) {
        win.Store.prefs.update((d) => { d.voiceFallback = opts.fallback; });
      }
      if (opts.prep) opts.prep(win);
    },
  });
}

/* 마이 화면의 칩을 실제로 고른다 — 위임 리스너를 지나야 저장 경로가 검사된다 */
function pickTo(t, code) {
  const input = [...t.$('pick-myvoice').querySelectorAll('input[name="myvoice"]')]
    .find((i) => i.value === code);
  if (!input) return false;
  input.checked = true;
  input.dispatchEvent(new t.win.Event('change', { bubbles: true }));
  return true;
}

/* =================================================================
   1. 저장되는 값 — 기본은 소리 안 냄
   ================================================================= */
{
  const t = open('home');
  const S = t.win.Store;

  eq('★ 기본은 소리 안 냄', S.prefs.load().voiceFallback, 'silent');
  eq('후보는 둘뿐 (silent · ko)', S.VOICE_FALLBACKS.join(','), 'silent,ko');

  /* 이상한 값이 들어오면 기본으로 되돌린다.
     기본이 'ko' 로 새어 나가면 이 기능이 있는 이유가 사라진다. */
  ['en', '', 'KO', 'silent ', null, 0, 'true'].forEach((bad) => {
    S.prefs.save({ voiceFallback: bad });
    eq('이상한 값 ' + JSON.stringify(bad) + ' → 소리 안 냄',
      S.prefs.load().voiceFallback, 'silent');
  });

  /* ★ 두 설정이 서로를 지우지 않는다. prefs 는 값 하나라서
       한쪽만 쓰는 update 가 나머지를 날리면 저시력 사용자가 키워 둔
       글자 크기가 음성 설정을 고칠 때마다 되돌아간다. */
  S.prefs.save({ fontScale: 'large', voiceFallback: 'ko' });
  S.prefs.update((d) => { d.voiceFallback = 'silent'; });
  eq('★ 음성 설정을 고쳐도 글자 크기가 남는다', S.prefs.load().fontScale, 'large');
  S.prefs.update((d) => { d.fontScale = 'normal'; });
  eq('★ 글자 크기를 고쳐도 음성 설정이 남는다', S.prefs.load().voiceFallback, 'silent');

  /* prefs 는 기기 설정이라 예시 데이터가 건드리지 않는다 */
  S.prefs.save({ voiceFallback: 'ko' });
  t.win.Seed.fill();
  eq('★ 예시 데이터를 채워도 되돌아가지 않는다', S.prefs.load().voiceFallback, 'ko');
}

/* =================================================================
   2. ★★ 소리를 안 내고, 왜 안 내는지를 그 사람의 언어로 적는다
   ================================================================= */
{
  const t = open('home');                 // 크메르어 노동자 · 한국어 음성만 있는 기기
  const UI = t.win.UI;
  const I = t.win.I18N;
  const S = t.win.Store;

  ok('홈 화면 오류 0건', t.errors.length === 0, t.errors.join(' | '));
  eq('이 기기에 크메르어 음성이 없다', UI.hasVoice('km'), false);
  eq('브라우저 자체는 멀쩡하다', UI.voiceBlocked(), false);
  eq('★ 그래도 소리가 안 나는 상태로 본다', UI.voiceSilent('km'), true);

  /* ★★ 이 묶음의 핵심 두 줄 */
  eq('★★ 시켜도 아무 말도 안 한다',
    UI.speak({ text: 'សូមកុំ', lang: 'km', ko: '한국어 문장' }), '');
  eq('★★ 한국어로 대신 읽어 버리지 않는다', t.win.speechSynthesis.spoken.length, 0);

  eq('무슨 문제인지 코드로 돌려준다', UI.voiceNoteKey('km'), 'voice.noneSilent');

  /* 화면에 적는 문장은 그 사람의 언어여야 한다 */
  const expect = I.t('voice.noneSilent', 'km').replace('%s', S.language('km').native);
  eq('★ 그 이유가 크메르어로 나온다', UI.voiceNote('km'), expect);
  ok('★ 한국어 원문이 그대로 나오지 않는다',
    UI.voiceNote('km') !== I.t('voice.noneSilent', 'ko'));
  ok('★ 언어 이름이 문장에 채워진다 (%s 가 남아 있지 않다)',
    UI.voiceNote('km').indexOf('%s') === -1, UI.voiceNote('km'));

  /* 화면이 실제로 그 문장을 들고 있어야 한다 — 함수만 맞고 화면이 비면 소용없다 */
  const note = t.$('voicenote');
  ok('★ 화면 안내 줄이 실제로 채워져 있다',
    note && note.hidden === false && text(note) !== '',
    note ? JSON.stringify(text(note)) : 'voicenote 없음');

  /* 글자를 못 읽는 사람에게 문장은 닿지 않는다. 그림이 닿는다. */
  const btn = t.win.document.querySelector('.btn-audio');
  ok('홈에 음성 버튼이 있다', !!btn);
  eq('★ 버튼 그림이 음소거다', iconName(btn), 'speaker-off');
  ok('색만으로 구분하지 않는다 (표시용 class 도 붙는다)',
    btn ? btn.classList.contains('is-mute') : false);

  /* 화면 낭독기를 쓰는 사람에게는 aria-label 이 이유의 전부다.
     원인이 둘로 갈렸으므로 "이 브라우저에서는" 이라고 못 박으면 거짓말이 된다. */
  const aria = btn ? btn.getAttribute('aria-label') : '';
  has('★ 화면 낭독기에도 같은 이유가 간다', aria, expect);
  ok('★ 원인을 브라우저 탓으로 돌리지 않는다',
    aria.indexOf('이 브라우저에서는') === -1, aria);

  /* ★ 문제만 알리고 끝내지 않는다 — 무엇을 하면 되는지가 문장 안에 있어야 한다.
     화면 글자가 아니라 사전의 한국어 원문에서 본다 (번역돼도 안 썩는다). */
  has('★ 빠져나갈 길을 준다 (마이에서 켤 수 있다고 적는다)',
    I.t('voice.noneSilent', 'ko'), '마이');
}

/* =================================================================
   3. 한국어로 들려주기를 고르면 소리가 난다
      ★ 없애지 않은 쪽도 실제로 동작해야 한다
   ================================================================= */
{
  const t = open('home', { fallback: 'ko' });
  const UI = t.win.UI;
  const spoken = t.win.speechSynthesis.spoken;

  eq('★ 소리가 난다', UI.speak({ text: 'សូមកុំ', lang: 'km', ko: '한국어 문장' }), 'ko');
  eq('실제로 한 번 읽는다', spoken.length, 1);
  eq('★ 한국어 원문을 읽는다 (읽을 수 없는 글자를 읽히지 않는다)',
    spoken[0] ? spoken[0].text : '', '한국어 문장');
  eq('음성 태그도 한국어', spoken[0] ? spoken[0].lang : '', 'ko-KR');
  eq('음소거 상태가 아니다', UI.voiceSilent('km'), false);

  const btn = t.win.document.querySelector('.btn-audio');
  eq('버튼도 스피커 그림', iconName(btn), 'speaker');
  ok('음소거 표시가 없다', btn ? !btn.classList.contains('is-mute') : false);

  /* ★★ 소리가 나도 안내를 없애지 않는다.
     한국어로 듣고 있다는 사실을 모르면 "내 언어로 들었다" 고 착각한다. */
  eq('★★ 무슨 상태인지 여전히 말한다', UI.voiceNoteKey('km'), 'voice.noneKo');
  ok('★ 안내가 비어 있지 않다', UI.voiceNote('km').length > 0, UI.voiceNote('km'));
  const note = t.$('voicenote');
  ok('★ 화면 안내 줄도 그대로 떠 있다',
    note && note.hidden === false && text(note) !== '');
}

/* =================================================================
   4. 골랐으면 새로고침 없이 화면이 따라온다
      ★ 새로고침해야 바뀌는 설정은 바뀌지 않는 설정과 구분되지 않는다
   ================================================================= */
{
  const t = open('home', { fallback: 'ko' });
  const btn = () => t.win.document.querySelector('.btn-audio');

  eq('처음에는 스피커 그림', iconName(btn()), 'speaker');

  t.win.Store.prefs.update((d) => { d.voiceFallback = 'silent'; });
  t.win.UI.notifyVoice();

  eq('★ 새로고침 없이 버튼 그림이 바뀐다', iconName(btn()), 'speaker-off');
  const note = t.$('voicenote');
  has('★ 안내 줄도 함께 바뀐다', text(note),
    t.win.I18N.t('voice.noneSilent', 'km').replace('%s', t.win.Store.language('km').native));

  /* 마이 화면이 그 통로를 실제로 쓰는가.
     ★ render() 로 우회하면 마이 화면 안에서는 우연히 통과하고,
       음성 버튼이 있는 다른 화면에서 조용히 안 바뀐다. */
  has('★ 마이 화면이 그 통로를 쓴다', myjs, 'UI.notifyVoice()');
  has('★ ui.js 가 그 통로를 열어 뒀다', ui, 'notifyVoice: notifyVoice');
}

/* =================================================================
   5. 한국어를 쓰는 노동자에게는 되돌림이 없다
      ★ 한국어도 노동자의 언어 중 하나다. 되돌림의 대상이 아니다.
   ================================================================= */
{
  const t = open('home', { login: 'W-4821-31', voices: ['km-KH'] });   // 한국어 음성조차 없는 기기
  const UI = t.win.UI;

  ok('한국어 노동자 홈에 오류 0건', t.errors.length === 0, t.errors.join(' | '));
  eq('★ 한국어는 되돌림의 대상이 아니다', UI.voiceSilent(), false);
  eq('언어를 넘겨도 같다', UI.voiceSilent('ko'), false);
  eq('문제 없음으로 본다', UI.voiceNoteKey('ko'), '');
  eq('안내를 띄우지 않는다 (늘 뜨면 무시하게 된다)', UI.voiceNote('ko'), '');

  /* ★ 한국어는 마지막 통로다. 여기서 막으면 되돌아갈 곳이 없다. */
  eq('★ 소리 안 냄이어도 한국어 사용자는 듣는다',
    UI.speak({ text: '프레스에 손을 넣지 마십시오', lang: 'ko' }), 'ko');
  eq('실제로 읽는다', t.win.speechSynthesis.spoken.length, 1);

  /* ★ 한국어 사용자에게는 원문이 곧 그 사람의 언어다.
     translations.ko 는 앞으로도 생기지 않으므로, 없다고 "번역 준비 중" 을
     띄우면 그 배지가 영원히 남는다 — 화면이 거짓말을 하게 된다. */
  ok('★ 오늘의 문구에 "번역 준비 중" 이 뜨지 않는다',
    text(t.$('today-note')).indexOf('준비 중') === -1, text(t.$('today-note')));

  const l = open('learn', { login: 'W-4821-31', voices: ['km-KH'] });
  ok('한국어 노동자 수강 화면에 오류 0건', l.errors.length === 0, l.errors.join(' | '));
  ok('★ 수강 화면에도 "번역 준비 중" 이 뜨지 않는다',
    text(l.win.document.body).indexOf(l.win.I18N.t('learn.transPending', 'ko')) === -1);

  /* ★★ 배지를 없앤 것이 아니라 한국어에만 안 띄운 것이다.
     이 짝이 없으면 "배지를 통째로 지웠다" 와 구분되지 않는다.
     W-4821-11(인도네시아어)의 문구 풀에는 그 언어 번역이 있는 것과
     없는 것(ph-6)이 섞여 있다. 없는 쪽에서는 배지가 뜨고, 있는 쪽에서는
     안 뜬다 — 숨기지 않으면서 거짓말도 하지 않는다는 규칙이 살아 있다.

     ★ 오늘 무엇이 걸렸는지로 단정하지 않는다. 오늘의 문구는 날짜로 돌기
       때문에(home.js todayIndex) 어느 날에 검사를 돌리느냐로 통과와 실패가
       갈린다. 실제로 그렇게 격일로 깨졌다 — 09-handover 함정 표에 적어 둔
       "날짜가 지나면 썩는 단정" 을 이 검사가 그대로 밟고 있었다.
       그래서 좌우 넘기기로 한 바퀴 돌며 모든 자리를 본다. 날짜가 바뀌어도
       뜻이 그대로 남고, 오히려 원래 보려던 것(둘 다 있는가)을 더 정확히 본다. */
  const id = open('home', { login: 'W-4821-11' });
  const idTotal = Number(text(id.$('today-pos')).split('/')[1].trim());
  ok('★ 인도네시아어 노동자에게는 넘겨 볼 문구가 둘 이상이다 (아래 짝의 전제)',
    idTotal >= 2, '문구 ' + idTotal + '개');

  const idNotes = [];
  for (let i = 0; i < idTotal; i++) {
    idNotes.push(text(id.$('today-note')));
    click(id.win, id.$('today-next'));
  }
  const seen = idNotes.join(' | ');

  const pending = id.win.I18N.t('learn.transPending', 'id');
  const reviewed = id.win.I18N.t('home.reviewedOk', 'id');
  ok('★★ 번역이 없는 사람에게는 그대로 알린다 (숨긴 것이 아니다)',
    idNotes.some((n) => n.indexOf(pending) !== -1), seen);
  ok('★ 번역이 있는 문구에서는 그 배지를 띄우지 않는다 (늘 뜨면 뜻이 없다)',
    idNotes.some((n) => n.indexOf(pending) === -1), seen);
  ok('★ 어느 자리에서도 "검수 완료" 는 빠지지 않는다',
    idNotes.every((n) => n.indexOf(reviewed) !== -1), seen);

  /* 판정이 두 화면에 같은 모양으로 있는지 — 한쪽만 고치면 두 화면이 다른 말을 한다 */
  const homejs = fs.readFileSync(path.join(SRC, 'worker/home.js'), 'utf8');
  const learnjs = fs.readFileSync(path.join(SRC, 'worker/learn.js'), 'utf8');
  has('홈이 언어로 판정한다', homejs, "me.lang !== 'ko'");
  has('수강 화면도 언어로 판정한다', learnjs, "me.lang !== 'ko'");
  has('홈이 그 판정을 배지에 쓴다', homejs, 'needsTranslation()');
  has('수강 화면도 그 판정을 배지에 쓴다', learnjs, 'needsTranslation()');
}

/* =================================================================
   6. 마이 화면에서 고를 수 있는가
   ================================================================= */
{
  const t = open('my');
  const I = t.win.I18N;
  const S = t.win.Store;

  ok('마이 화면 오류 0건', t.errors.length === 0, t.errors.join(' | '));

  const box = t.$('pick-myvoice');
  ok('고르는 칸이 있다', !!box);
  const inputs = box ? [...box.querySelectorAll('input[name="myvoice"]')] : [];
  eq('두 가지를 고를 수 있다', inputs.length, 2);

  const chip = (code) => inputs.find((i) => i.value === code);
  eq('★ 지금 값이 골라져 있다', chip('silent') ? chip('silent').checked : null, true);

  /* 아이콘 + 글자 두 겹 — 색만으로 구분하지 않는다 */
  const boxText = text(box);
  const chipIcons = iconNames(box);
  ok('소리 안 냄 쪽에 음소거 그림', chipIcons.indexOf('speaker-off') !== -1, chipIcons.join(','));
  ok('한국어로 듣기 쪽에 스피커 그림', chipIcons.indexOf('speaker') !== -1, chipIcons.join(','));

  /* 글자도 그 사람의 언어로 */
  has('★ 칩 글자가 크메르어다', boxText, I.t('my.voiceSilent', 'km'));
  has('★ 다른 칩도 크메르어다', boxText, I.t('my.voiceKo', 'km'));
  ok('한국어 원문을 그대로 쓰지 않는다',
    I.t('my.voiceSilent', 'km') !== I.t('my.voiceSilent', 'ko'));

  const page = text(t.win.document.body);
  has('★ 칸 제목이 크메르어다', page, I.t('my.voiceFallback', 'km'));
  has('★ 왜 소리를 안 내는 쪽이 기본인지 적혀 있다', page, I.t('my.voiceFallbackWhy', 'km'));

  /* JS 가 멈춰도 화면이 비지 않아야 한다 (UI-1 규칙) */
  ok('★ HTML 에 한국어 원문이 남아 있다',
    myhtml.indexOf('소리를 안 내는 쪽이 기본입니다') !== -1);
  ok('★ 인쇄물에는 안 나온다 (noprint 구역 안에 있다)',
    myhtml.indexOf('pick-myvoice') > myhtml.indexOf('class="card noprint"'));

  /* 실제로 골라 본다 */
  ok('한국어로 듣기를 고를 수 있다', pickTo(t, 'ko'));
  eq('★ 저장된다', S.prefs.load().voiceFallback, 'ko');
  eq('★ 고른 것이 다시 그려도 남는다',
    [...t.$('pick-myvoice').querySelectorAll('input')].find((i) => i.value === 'ko').checked, true);
  has('바뀌었다고 그 사람의 언어로 알린다', text(t.$('toast')), I.t('my.voiceKo', 'km'));

  /* ★ 같은 화면의 안내 줄이 바로 바뀐다 */
  has('★ 안내 줄이 즉시 바뀐다', text(t.$('voicenote')),
    I.t('voice.noneKo', 'km').replace('%s', S.language('km').native));

  ok('되돌릴 수 있다', pickTo(t, 'silent'));
  eq('★ 되돌아간다', S.prefs.load().voiceFallback, 'silent');
  eq('★ 글자 크기 설정을 지우지 않는다', S.prefs.load().fontScale, 'normal');

  /* ★ 마이 화면이 쓰는 키가 늘지 않았다 (accounts · prefs 뿐) */
  ok('★ Store 를 거친다 (localStorage 직접 호출 없음)',
    myjs.indexOf('localStorage') === -1);
}

/* =================================================================
   7. ★ 되돌림 표가 사전과 어긋나지 않는가

   ui.js 의 VOICE_NOTE_KO 는 i18n.js 가 안 실린 화면(관리자)용 되돌림 표다.
   사전과 어긋나면 같은 상황을 두 화면이 서로 다르게 말한다.

   ★ 예전에는 ui.js 주석이 test-voice.js 를 가리켰지만 그 검사는 없었다 —
     주석만 지키는 척하고 아무것도 지키지 않는 상태였다. 그래서 주석이
     가리키는 파일 이름 자체도 검사한다.
   ================================================================= */
{
  const t = open('home');
  const I = t.win.I18N;

  /* ★ 키 목록을 검사 쪽에 따로 적는다. 코드의 표를 가져다 쓰면
       표가 틀려도 둘이 사이좋게 틀린다. */
  const KEYS = ['voice.blocked', 'voice.noneSilent', 'voice.noneKo'];

  const from = ui.indexOf('var VOICE_NOTE_KO');
  ok('되돌림 표가 ui.js 에 있다', from !== -1);
  const table = from === -1 ? '' : ui.slice(from, ui.indexOf('};', from));

  KEYS.forEach((k) => {
    ok('사전에 ' + k + ' 가 있다', I.has(k, 'ko'), k);
    has('되돌림 표에 ' + k + ' 가 있다', table, "'" + k + "'");
    /* 어느 쪽을 고쳐도 여기서 잡힌다 */
    has('★ 되돌림 표가 사전의 한국어와 같다 — ' + k, table, I.t(k, 'ko'));
  });

  eq('표에 그 셋만 있다', (table.match(/'voice\.[a-zA-Z]+'/g) || []).length, 3);

  has('★ ui.js 주석이 이 파일을 가리킨다', ui, 'test-voicefallback.js');

  /* 사전 쪽도 6개 언어가 다 차 있어야 한다 (test-i18n.js 와 겹치지만,
     이 세 키는 소리가 안 날 때 유일하게 남는 통로라 여기서도 본다) */
  ['km', 'id', 'vi', 'ne', 'th'].forEach((lang) => {
    const miss = KEYS.filter((k) => !I.has(k, lang));
    ok(lang + ' 번역이 세 문장 모두에 있다', miss.length === 0, miss.join(', '));
  });
}

report('내 언어 음성이 없을 때 — 조용히 넘어가지 않는가');
