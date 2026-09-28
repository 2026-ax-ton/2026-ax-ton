/* 화면 안내 다국어 (UI-1) — 노동자의 언어로 나오는가

   안전 문구와 문항은 원래부터 노동자의 언어로 나갔다. 이 묶음이 보는 것은
   거기까지 가는 길 — 버튼 · 탭 · 배지 · 안내 음성 — 이다.

   ★★ 이 묶음에서 가장 중요한 것은 "사전에 안전 지시가 섞이지 않았는가" 다.
     안전 지시는 Store.library 를 지나 사람의 검수를 받아야 한다.
     i18n 사전은 검수를 안 지나므로, 여기에 "손을 넣지 마십시오" 같은 문장이
     들어오면 검수를 우회하는 통로가 새로 생긴다. */
const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC, iconName } = require('./harness');

const src = fs.readFileSync(path.join(SRC, 'assets/i18n.js'), 'utf8');

/* 사전을 실제로 돌려서 읽는다 — 글로만 읽으면 문법이 깨져도 통과한다 */
const win = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' }).win;
const I18N = win.I18N;
const KEYS = Object.keys(I18N.DICT);
const LANGS = ['km', 'id', 'vi', 'ne', 'th'];

/* =================================================================
   1. ★★ 사전에 안전 지시가 섞이지 않았는가
   ================================================================= */
{
  /* 안전 지시로 읽힐 수 있는 말투. 이런 것이 사전에 있으면
     검수를 지나지 않은 지시가 화면에 나가게 된다. */
  const DANGER = [
    '마십시오', '마세요', '금지', '착용', '차단', '잠그', '끄십시오',
    '멈추', '위험하니', '만지지', '넣지'
  ];

  const hits = [];
  KEYS.forEach((k) => {
    const ko = I18N.DICT[k].ko || '';
    DANGER.forEach((w) => { if (ko.indexOf(w) !== -1) hits.push(k + ' : ' + ko); });
  });

  ok('★★ 사전에 안전 지시로 읽힐 문장이 없다 (검수를 우회하는 통로가 생기면 안 된다)',
    hits.length === 0, hits.join(' | '));

  has('왜 그런지가 파일에 적혀 있다', src, '안전 지시');
  has('검수 전이라는 것을 밝힌다', src, 'REVIEWED');
}

/* =================================================================
   2. 사전이 성한가
   ================================================================= */
{
  ok('키가 충분히 있다', KEYS.length >= 60, String(KEYS.length));

  const noKo = KEYS.filter((k) => !I18N.DICT[k].ko);
  ok('★ 모든 키에 한국어 원문이 있다 (없으면 되돌아갈 곳이 없다)',
    noKo.length === 0, noKo.join(', '));

  LANGS.forEach((l) => {
    const miss = KEYS.filter((k) => !I18N.DICT[k][l]);
    ok(l + ' 번역이 모든 키에 있다', miss.length === 0,
      miss.length + '개 빠짐: ' + miss.slice(0, 5).join(', '));
  });

  /* 번역이 한국어와 똑같으면 번역하지 않은 것이다 */
  LANGS.forEach((l) => {
    const same = KEYS.filter((k) => I18N.DICT[k][l] === I18N.DICT[k].ko);
    ok(l + ' 번역이 한국어를 그대로 베끼지 않았다', same.length === 0, same.join(', '));
  });
}

/* =================================================================
   3. 읽는 통로 — 없으면 한국어로 내려간다
   ================================================================= */
{
  eq('내 언어로 읽는다', I18N.t('nav.home', 'km'), I18N.DICT['nav.home'].km);
  eq('없는 언어는 한국어로 내려간다', I18N.t('nav.home', 'xx'), '홈');

  /* ★ 빈 글자를 내보내면 버튼 이름이 통째로 사라진다.
     글을 못 읽는 사람에게는 그 자리가 없어진 것과 같다. */
  const empties = KEYS.filter((k) => !I18N.t(k, 'ne') || !I18N.t(k, 'th'));
  ok('★ 어떤 언어로도 빈 글자를 내보내지 않는다', empties.length === 0, empties.join(', '));

  eq('없는 키는 키 이름을 그대로 돌려준다 (빠뜨린 것이 눈에 보이게)',
    I18N.t('없.는키'), '없.는키');

  const s = I18N.say('nav.home', 'km');
  eq('say 는 UI.speak 모양이다 — text', s.text, I18N.DICT['nav.home'].km);
  eq('say 는 UI.speak 모양이다 — lang', s.lang, 'km');
  eq('★ say 에 한국어를 함께 넘긴다 (기기에 그 언어 음성이 없으면 이것을 읽는다)',
    s.ko, '홈');
}

/* =================================================================
   4. 검수 상태를 숨기지 않는가
   ================================================================= */
{
  ok('한국어는 원문이라 검수된 것으로 본다', I18N.reviewed('ko') === true);
  ok('★ 검수 전 언어를 검수된 것처럼 말하지 않는다', I18N.reviewed('km') === false);
  eq('검수된 언어에는 고지를 띄우지 않는다 (늘 뜨면 무시하게 된다)', I18N.note('ko'), '');
  ok('검수 전 언어에는 고지 문장이 있다', I18N.note('km').length > 0);
}

/* =================================================================
   5. 화면이 실제로 그 언어로 뜨는가
   ================================================================= */
{
  /* W-4821-07 은 크메르어다 */
  const b = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  ok('홈이 오류 없이 뜬다', b.errors.length === 0, b.errors.join(' | '));

  const doc = b.win.document;
  eq('★ 문서 언어가 그 사람의 언어로 바뀐다 (브라우저가 글꼴을 맞춘다)',
    doc.documentElement.getAttribute('lang'), 'km');

  const tabs = Array.prototype.slice.call(doc.querySelectorAll('.tabbar a'));
  eq('하단 탭이 5개다', tabs.length, 5);
  has('★ 하단 탭이 크메르어로 뜬다', tabs[0].textContent, I18N.DICT['nav.home'].km);
  ok('탭에 한국어가 남아 있지 않다', tabs[0].textContent.indexOf('홈') === -1);

  const out = doc.getElementById('btn-logout');
  has('로그아웃 버튼도 그 언어로', out.textContent, I18N.DICT['action.logout'].km);

  /* 아이콘은 그대로여야 한다 — 글을 못 읽는 사람에게 닿는 것이 그림이다 */
  eq('★ 탭 아이콘이 그대로 남아 있다 (글자가 번역돼도 그림은 그 자리)', iconName(tabs[0]), 'home');

  /* 다른 언어 사용자에게는 그 언어로 — 언어가 정말 사람마다 갈리는지 */
  const idb = boot('worker/home.html', { login: 'W-4821-11', page: 'worker/home.js' });
  const idTabs = idb.win.document.querySelectorAll('.tabbar a');
  ok('★ 인도네시아어 사용자에게는 인도네시아어로 (언어가 사람마다 갈린다)',
    idTabs[0].textContent.indexOf(I18N.DICT['nav.home'].id) !== -1,
    idTabs[0].textContent);
  eq('그 사람의 문서 언어도 따라 바뀐다',
    idb.win.document.documentElement.getAttribute('lang'), 'id');
}

/* =================================================================
   6. HTML 에 한국어 원문을 남겨 뒀는가
      ★ JS 가 멈춰도 화면이 비지 않아야 한다
   ================================================================= */
{
  const PAGES = ['home', 'learn', 'quiz', 'report', 'talk', 'my'];
  PAGES.forEach((p) => {
    const html = fs.readFileSync(path.join(SRC, 'worker/' + p + '.html'), 'utf8');
    ok(p + ' 이 i18n.js 를 읽는다', html.indexOf('assets/i18n.js') !== -1);
    /* data-i18n 을 단 곳에 한국어가 그대로 있어야 한다 */
    const empty = html.match(/data-i18n="[^"]+"\s*>\s*</g) || [];
    ok(p + ' 의 data-i18n 자리에 한국어 원문이 남아 있다 (JS 가 멈춰도 안 빈다)',
      empty.length === 0, String(empty.length));
  });
}

/* =================================================================
   7. 검수 전이라는 사실을 화면에 적는가
   ================================================================= */
{
  const b = boot('worker/my.html', { login: 'W-4821-07', page: 'worker/my.js' });
  const note = b.$('i18n-note');
  ok('내 언어 칸에 고지 자리가 있다', note !== null);
  ok('★ 검수 전 언어에는 고지가 뜬다', note && note.hidden === false);
  has('무엇이 검수 전인지 말한다', note ? note.textContent : '', I18N.t('i18n.unreviewed', 'km'));

  /* 한국어를 쓰는 노동자에게는 뜨지 않는다 — 한국어는 원문이라 검수 대상이 아니다 */
  const kb = boot('worker/my.html', {
    login: 'W-4821-07', page: 'worker/my.js',
    before: function (win) {
      win.Store.accounts.update(function (list) {
        var acc = win.Store.findBy(list, 'userId', 'W-4821-07');
        if (acc) acc.lang = 'ko';
      });
    }
  });
  const kn = kb.$('i18n-note');
  ok('★ 한국어 사용자에게는 고지가 뜨지 않는다 (늘 뜨면 무시하게 된다)',
    kn !== null && kn.hidden === true);
}

/* =================================================================
   8. ★★ 만들어 놓고 안 붙인 번역이 없는가

   2026-09-28 에 실제로 그랬다. 사전 92개 중 45개(49%)가 화면에
   연결조차 안 돼 있었다 — 번역은 다 있는데 화면은 한국어로 나갔다.

   ★ 번역이 없는 것보다 이쪽이 더 잡기 어렵다. 사전만 보면 다 있어 보이고,
     화면을 한국어로 보는 사람에게는 아무 이상이 없기 때문이다.
     크메르어로 열어 봐야 보이는데, 그 일을 사람이 매번 하지는 않는다.
   ================================================================= */
{
  /* ★ 안 쓰는 것이 맞는 키. 왜 그런지를 함께 적는다 —
       이유 없이 목록만 길어지면 이 검사는 곧 무시된다. */
  const OK_UNUSED = {
    'state.passed': '인쇄되는 증빙에만 쓰는 말. 증빙은 감독기관에 내는 서류라 한국어로 둔다',
    'state.failed': '같은 이유 — 증빙은 한국어',
    'action.back': '아직 놓을 자리가 없다. 화면이 생기면 붙인다',
    'learn.startQuiz': '수강이 끝나면 버튼 없이 바로 검증으로 넘어간다 (learn.js)',
    'speech.anonNotice': '더 긴 speech.anonReport 가 그 자리를 쓴다',
    'voice.fromVoice': '담당자 대시보드에서 쓰는 말. 관리자 화면은 번역하지 않는다',
  };

  /* i18n.js 자신도 본다 (note() 가 i18n.unreviewed 를 부른다).
     다만 사전 정의 줄은 빼야 한다 — 정의를 사용으로 세면 안 잡힌다. */
  const selfCode = fs.readFileSync(path.join(SRC, 'assets/i18n.js'), 'utf8')
    .split(/\r?\n/).filter((ln) => !/^\s*'[a-z][\w.]*':\s*\{/.test(ln)).join('\n');
  const scan = (dir) => fs.readdirSync(path.join(SRC, dir))
    .filter((n) => /\.(html|js)$/.test(n) && n !== 'i18n.js')
    .map((n) => fs.readFileSync(path.join(SRC, dir, n), 'utf8'));
  const sources = [...scan('worker'), ...scan('assets'), selfCode];

  const unused = KEYS.filter((k) => !OK_UNUSED[k] &&
    !sources.some((src) => src.includes("'" + k + "'") || src.includes('"' + k + '"')));

  ok('★★ 사전에 있는 말은 화면에도 붙어 있다 (만들어만 두지 않는다)',
    unused.length === 0,
    unused.length + '개가 어디서도 안 쓰인다: ' + unused.join(', '));
}

/* =================================================================
   9. HTML 에 적어 둔 한국어 원문이 사전과 어긋나지 않는가

   HTML 은 JS 가 멈춰도 화면이 비지 않게 한국어를 그대로 들고 있다.
   그 원문과 사전의 ko 가 갈라지면, 사람은 화면(HTML)을 믿고
   번역은 사전을 따라가서 둘이 다른 말을 하게 된다.
   ================================================================= */
{
  const drift = [];
  for (const n of fs.readdirSync(path.join(SRC, 'worker')).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(SRC, 'worker', n), 'utf8');
    const re = /data-i18n="([^"]+)"[^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const [, key, shown] = m;
      const ko = I18N.DICT[key] && I18N.DICT[key].ko;
      if (!ko) { drift.push(n + ' ' + key + ' → 사전에 없는 키'); continue; }
      /* 줄바꿈과 들여쓰기는 같은 말로 본다 — HTML 은 보기 좋게 접어 쓴다 */
      const flat = (x) => x.trim().replace(/\s+/g, ' ');
      if (flat(shown) !== flat(ko)) drift.push(n + ' ' + key + ': HTML "' + flat(shown) + '" ≠ 사전 "' + flat(ko) + '"');
    }
  }
  ok('★ HTML 의 한국어 원문과 사전이 같은 말을 한다', drift.length === 0, drift.join(' | '));
}

/* =================================================================
   10. 배지 글자를 어느 언어로든 꺼낼 수 있는가

   "한글이 아닌 것은 아이콘" 으로 걸러내던 코드가 있었다. 배지 글자가
   노동자의 언어가 되는 순간 크메르어 배지는 통째로 사라졌고,
   소리로 읽어 주는 데서도 함께 빠졌다 — 글을 못 읽는 사람에게는
   그 정보가 아예 없는 것이 된다.
   ================================================================= */
{
  const UI = win.UI;
  const b = UI.okBadge(I18N.t('state.done', 'km'));
  eq('★ 크메르어 배지에서도 글자가 나온다', UI.badgeText(b), I18N.t('state.done', 'km'));
  eq('한국어 배지도 그대로', UI.badgeText(UI.okBadge('완료')), '완료');
  ok('아이콘은 섞여 나오지 않는다', UI.badgeText(b).indexOf('<') === -1);
  eq('빈 것을 넣어도 터지지 않는다', UI.badgeText(null), '');
}

report('화면 안내 다국어 — 노동자의 언어로 나오는가 (UI-1)');
