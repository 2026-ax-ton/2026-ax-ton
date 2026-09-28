/* 기능9 안전 문구 라이브러리 — 실제 DOM 검증 */
const { boot, ok, eq, has, report } = require('./harness');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

/* 신고 접수 — 이제 어느 언어인지 반드시 골라야 한다.
   lang 을 'ALL' 로 주면 문구 전체, 언어 코드로 주면 그 언어만 내려간다. */
function fileFlag(t, phraseId, lang, note) {
  t.$('flag-phrase').value = phraseId;
  t.$('flag-phrase').dispatchEvent(new t.win.Event('change', { bubbles: true }));
  t.$('flag-lang').value = lang;
  t.$('flag-note').value = note;
  t.$('form-flag').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));
}

function open(opts = {}) {
  return boot('admin/library.html',
    Object.assign({ login: 'oper@safety.kr', role: 'operator', page: 'admin/library.js' }, opts));
}

/* =================================================================
   1. 첫 화면 — AI 경계 · 상태 타일 · 판정 큐
   ================================================================= */
{
  const t = open();
  const doc = t.win.document;
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  has('AI 경계를 화면에 적는다', text(doc.querySelector('.ai-note')), 'AI 여기까지');
  has('승인은 사람이 한다고 적는다', text(doc.querySelector('.ai-note')), '승인은 사람이 합니다');

  /* 예시 데이터 — 문구 6개.
       ph-1,2,4,6 검수 완료 · ph-5 검수 대기
       ph-3 은 한국어·크메르어는 검수 완료인데 인도네시아어만 중지 (오역 신고 1건)
     타일은 "한 언어라도" 기준으로 센다. ph-3 은 완료에도 중지에도 들어간다 —
     크메르어로는 나가고 인도네시아어로는 안 나가는 것이 사실이다. */
  const tiles = [...t.$('stats').querySelectorAll('.kpi')].map(
    (k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd')));
  has('검수 완료 5개', tiles.join(' '), '검수 완료=5개');
  has('검수 대기 1개', tiles.join(' '), '검수 대기=1개');
  has('사용 중지 1개', tiles.join(' '), '사용 중지=1개');
  has('전체 6개', tiles.join(' '), '전체=6개');

  /* ★ 예시 데이터의 신고는 인도네시아어 한 언어에 대한 것이다 */
  const seedItems = t.$('flag-queue').querySelectorAll('.queue-item');
  eq('예시 신고 1건이 큐에 있다', seedItems.length, 1);
  has('어느 언어의 신고인지 적는다', text(seedItems[0]), '인도네시아어 번역');
  has('그 언어만 중지됐다고 알린다', text(seedItems[0]), '인도네시아어 중지');
  has('문구 전체는 검수 완료로 남아 있다', text(seedItems[0]), '검수 완료');

  /* --- 판정이 필요한 문구 = reviewed 가 아닌 것 (ph-3, ph-5) --- */
  const blocks = t.$('review-list').querySelectorAll('.review-block');
  eq('판정 대상 2건', blocks.length, 2);

  /* --- ★ ph-3 의 역번역 대조 — 부정이 뒤집힌 장면 --- */
  const ph3 = [...blocks].find((b) => text(b).includes('프레스가 멈춰도'));
  ok('ph-3 이 판정 대상에 있다', !!ph3);
  has('원문을 보여 준다', text(ph3), '프레스가 멈춰도 손을 넣지 마십시오');
  has('역번역을 보여 준다', text(ph3), '손을 넣어도 됩니다');
  has('★ 부정이 뒤집혔다고 크게 경고한다', text(ph3), '부정이 뒤집혔을 수 있습니다');
  has('그대로 나가면 어떻게 되는지 말한다', text(ph3), '정반대 지시가 됩니다');
  ok('뒤집힌 경우는 대조 칸도 위험 표시', !!ph3.querySelector('.diff.danger'));

  const flagged = ph3.querySelector('.diff-cell.flag');
  ok('차이가 있는 칸에 표시가 붙는다', !!flagged);
  const marks = [...ph3.querySelectorAll('mark')].map((m) => m.textContent);
  ok('뒤집힌 낱말이 표시된다', marks.some((m) => m.includes('넣어도')) && marks.some((m) => m.includes('됩니다')),
    JSON.stringify(marks));
  ok('원문에 있는 낱말은 표시하지 않는다', !marks.some((m) => m.includes('프레스')), JSON.stringify(marks));

  /* --- 역번역이 맞는 문구는 표시가 없다 (ph-5) --- */
  const ph5 = [...blocks].find((b) => text(b).includes('환기팬이'));
  ok('ph-5 도 판정 대상', !!ph5);
  // ph-5 는 "환기팬이 돌지 않으면" → "팬이 꺼져 있으면" — 말만 바꿔 쓴 것이고 뜻은 같다.
  // 낱말은 다르지만 부정은 양쪽 다 있으므로 크게 경고하지 않아야 한다.
  ok('★ 말만 바꿔 쓴 것은 크게 경고하지 않는다', !text(ph5).includes('부정이 뒤집혔'), text(ph5).slice(0, 120));
  ok('대조 칸도 위험 표시가 아니다', !ph5.querySelector('.diff.danger'));
  has('낱말이 다른 것은 개수만 알린다', text(ph5), '원문에 없는 낱말');
  has('판정은 사람이 한다고 말한다', text(ph5), '사람이 봅니다');
}

/* =================================================================
   2. ★ 오역 신고를 접수하면 그 순간 사용 중지가 된다
      (완료 기준: 접수 → 즉시 stopped → 기능2 선택지에서 사라진다)
   ================================================================= */
{
  const t = open();

  const before = t.win.Store.library.load().find((p) => p.id === 'ph-1');
  eq('접수 전에는 검수 완료', before.status, 'reviewed');

  // ph-1 을 골라 문구 전체 신고 접수
  fileFlag(t, 'ph-1', 'ALL', '크메르어에서 "프레스가 멈춰도" 가 빠졌습니다');

  const after = t.win.Store.library.load().find((p) => p.id === 'ph-1');
  eq('★ 접수하는 순간 사용 중지', after.status, 'stopped');
  eq('신고 내용이 남는다', after.flags.length, 1);
  has('무엇이 잘못됐는지', after.flags[0].note, '빠졌습니다');
  eq('아직 처리되지 않은 상태', after.flags[0].resolvedAt, null);

  // 큐에 뜨는지 (예시 데이터의 ph-3 신고와 함께 2건)
  const items = [...t.$('flag-queue').querySelectorAll('.queue-item')];
  eq('신고 큐에 2건', items.length, 2);
  const ph1Item = items.find((i) => text(i).includes('빠졌습니다'));
  ok('ph-1 신고가 큐에 있다', !!ph1Item);
  eq('오역 신고는 긴급으로 표시', ph1Item.getAttribute('data-urgent'), 'yes');
  has('문구 전체 신고라고 적는다', text(ph1Item), '문구 전체');

  // 상태 타일도 따라간다
  const tiles = [...t.$('stats').querySelectorAll('.kpi')].map(
    (k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd')));
  has('검수 완료가 4개로 줄었다', tiles.join(' '), '검수 완료=4개');
  has('오역 신고 2건', tiles.join(' '), '오역 신고=2건');
  has('사용 중지가 2개로 늘었다', tiles.join(' '), '사용 중지=2개');

  const alertTile = [...t.$('stats').querySelectorAll('.kpi')]
    .find((k) => text(k.querySelector('dt')) === '오역 신고');
  ok('신고가 있으면 타일이 경고 모양이 된다', alertTile.className.includes('alert'));

  /* --- 신고만 닫으면 중지가 유지된다 --- */
  const keepBtn = [...ph1Item.querySelectorAll('.btn-sm')]
    .find((b) => text(b).includes('신고만 닫기'));
  click(t.win, keepBtn);

  const kept = t.win.Store.library.load().find((p) => p.id === 'ph-1');
  eq('신고는 닫혔다', kept.flags[0].resolvedAt !== null, true);
  eq('문구는 계속 중지', kept.status, 'stopped');
  ok('ph-1 이 큐에서 빠진다',
    !text(t.$('flag-queue')).includes('빠졌습니다'), text(t.$('flag-queue')));
  has('다른 언어 신고는 그대로 남는다', text(t.$('flag-queue')), '인도네시아어 번역');
}

/* =================================================================
   3. 신고를 "고쳐졌습니다" 로 닫으면 다시 쓸 수 있다
   ================================================================= */
{
  const t = open();
  fileFlag(t, 'ph-2', 'ALL', '오타');

  t.win.confirm = () => true;   // 신고가 열린 채 되살릴지 묻는 확인창
  const ph2Item = [...t.$('flag-queue').querySelectorAll('.queue-item')]
    .find((i) => text(i).includes('오타'));
  const fixBtn = [...ph2Item.querySelectorAll('.btn-sm')]
    .find((b) => text(b).includes('고쳐졌습니다'));
  has('문구 전체를 되살리는 버튼이다', text(fixBtn), '문구 전체 다시 사용');
  click(t.win, fixBtn);

  const p = t.win.Store.library.load().find((x) => x.id === 'ph-2');
  eq('다시 검수 완료', p.status, 'reviewed');
  eq('신고도 함께 닫힌다', p.flags.every((f) => f.resolvedAt !== null), true);
}

/* =================================================================
   4. 번역이 없는 문구는 검수 완료로 올릴 수 없다
      (올리면 기능2 선택지에 빈 문구가 올라간다)
   ================================================================= */
{
  const t = open({
    before(win) {
      win.Store.library.update((list) => {
        list.push({ id: 'ph-x', category: '공통', status: 'waiting',
          ko: '번역이 아직 없는 문구', translations: {} });
      });
    },
  });

  const block = [...t.$('review-list').querySelectorAll('.review-block')]
    .find((b) => text(b).includes('번역이 아직 없는 문구'));
  ok('판정 대상에 뜬다', !!block);
  has('번역이 없다고 말한다', text(block), '아직 번역이 없습니다');

  click(t.win, [...block.querySelectorAll('.btn-sm')].find((b) => text(b).includes('검수 완료')));
  const p = t.win.Store.library.load().find((x) => x.id === 'ph-x');
  eq('★ 검수 완료로 올라가지 않는다', p.status, 'waiting');
}

/* =================================================================
   5. 문구 목록과 걸러 보기
   ================================================================= */
{
  const t = open();
  eq('전체 6줄', t.$('phrase-rows').querySelectorAll('tr').length, 6);

  click(t.win, t.$('filter-stopped'));
  eq('사용 중지만 1줄', t.$('phrase-rows').querySelectorAll('tr').length, 1);
  has('★ 인도네시아어만 중지된 ph-3 도 잡힌다', text(t.$('phrase-rows')), '프레스가 멈춰도');
  has('어느 언어가 멈췄는지 적는다', text(t.$('phrase-rows')), '인도네시아어 중지');
  eq('지금 보고 있는 것을 표시', t.$('filter-stopped').getAttribute('aria-pressed'), 'true');

  click(t.win, t.$('filter-reviewed'));
  eq('검수 완료 5줄', t.$('phrase-rows').querySelectorAll('tr').length, 5);

  click(t.win, t.$('filter-all'));
  eq('다시 6줄', t.$('phrase-rows').querySelectorAll('tr').length, 6);

  // 목록에서 바로 중지
  const row = [...t.$('phrase-rows').querySelectorAll('tr')]
    .find((r) => text(r).includes('작업 전 전원을 차단'));
  click(t.win, [...row.querySelectorAll('.btn-sm')].find((b) => text(b) === '사용 중지'));
  eq('중지됐다', t.win.Store.library.load().find((p) => p.id === 'ph-2').status, 'stopped');
}

/* =================================================================
   6. ★ 기능9 → 기능3 연결: 중지된 문구는 노동자 수강 화면에서 사라진다
   ================================================================= */
{
  // 먼저 라이브러리에서 ph-1 을 중지시킨다
  const lib = open();
  fileFlag(lib, 'ph-1', 'ALL', '뜻이 반대입니다');
  const saved = lib.win.Store.library.load();
  eq('ph-1 중지 확인', saved.find((p) => p.id === 'ph-1').status, 'stopped');

  // 같은 데이터로 노동자 수강 화면을 연다
  const learn = boot('worker/learn.html', {
    login: 'W-4821-07',
    page: 'worker/learn.js',
    before(win) { win.Store.library.save(saved); },
  });

  /* c-press 는 문구 4개(ph-1,2,3,6). 크메르어 노동자에게는 넷 다 쓸 수 있는데,
     ph-1 을 문구 전체 중지했으므로 3개로 줄어야 한다. */
  const card = learn.win.document.querySelector('#course-list .course-card');
  has('쓸 수 있는 문구가 4개에서 3개로 줄었다', text(card.querySelector('.meta')), '안전 문구 3개');
  has('몇 개가 빠졌는지 밝힌다', text(card.querySelector('.tags')), learn.win.I18N.t('learn.excluded', 'km') + ' 1');

  card.querySelector('.course-open').dispatchEvent(new learn.win.MouseEvent('click', { bubbles: true }));
  has('수강 화면도 3장으로 줄었다', text(learn.$('step-count')), '1 / 3');
  ok('중지된 문구는 나오지 않는다',
    !text(learn.$('phrase-card')).includes('កុំដាក់ដៃចូល'),
    text(learn.$('phrase-card')));
}

/* =================================================================
   7. 규칙 검사
   ================================================================= */
{
  const fs = require('fs');
  const base = 'C:/Users/byeonsoyun/2026-ax-ton/2026-ax-ton/src/admin/';
  const html = fs.readFileSync(base + 'library.html', 'utf8');
  const js = fs.readFileSync(base + 'library.js', 'utf8');

  ok('외부 주소 없음', !/(src|href)\s*=\s*["']https?:/i.test(html));
  ok('절대경로 없음', !/(src|href)\s*=\s*["']\//.test(html));
  ok('innerHTML 안 씀', !/innerHTML/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('localStorage 직접 호출 안 함', !/localStorage/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('"면책" 표현 없음', !/면책/.test(html + js));
  ok('껍데기 안내가 남아 있지 않다', !/아직 만들지 않은 화면/.test(html));
}

/* =================================================================
   N. ★ 언어별 검수 판정 — 한 언어의 오역으로 다른 언어를 잃지 않는다

   ph-3 은 인도네시아어 번역만 뜻이 뒤집혔다 ("넣지 마십시오" → "넣어도 됩니다").
   문구 전체를 내리면 크메르어 노동자도 이 안전 지시를 못 듣는다.
   그것은 오역보다 나은 상태가 아니다.
   ================================================================= */
{
  const t = open();
  const p3 = t.win.Store.library.load().find((p) => p.id === 'ph-3');

  eq('문구 전체는 검수 완료', p3.status, 'reviewed');
  eq('한국어 원문은 쓸 수 있다', t.win.Store.phraseOk(p3, 'ko'), true);
  eq('★ 크메르어는 쓸 수 있다', t.win.Store.phraseOk(p3, 'km'), true);
  eq('★ 인도네시아어는 못 쓴다', t.win.Store.phraseOk(p3, 'id'), false);
  eq('번역이 없는 언어는 문구 전체를 따른다', t.win.Store.phraseOk(p3, 'ne'), true);

  // 판정 화면에 언어마다 판정 버튼이 있다
  const block = [...t.$('review-list').querySelectorAll('.review-block')]
    .find((b) => text(b).includes('프레스가 멈춰도'));
  ok('판정 대상에 있다', !!block);
  const labels = [...block.querySelectorAll('.btn-sm')].map((b) => text(b));
  ok('인도네시아어만 되살리는 버튼이 있다',
    labels.some((l) => l.includes('인도네시아어만 검수 완료')), labels.join(' | '));
  ok('크메르어만 내리는 버튼이 있다',
    labels.some((l) => l.includes('크메르어만 중지')), labels.join(' | '));
  ok('문구 전체 버튼도 따로 있다',
    labels.some((l) => l.includes('문구 전체')), labels.join(' | '));
}

/* --- ★ 같은 교육, 다른 언어 — 한쪽에는 남고 한쪽에서는 빠진다 --- */
{
  /* c-press 는 문구 4개(ph-1,2,3,6)이고 언어는 km·id·vi 다.
     크메르어 노동자에게는 4개가 다 나가고,
     인도네시아어 번역이 중지된 ph-3 은 인도네시아어 노동자에게만 빠진다. */
  const km = boot('worker/learn.html', { login: 'W-4821-07', page: 'worker/learn.js' });
  const kmCard = km.win.document.querySelector('#course-list .course-card');
  has('★ 크메르어 노동자는 문구 4개를 다 받는다', text(kmCard.querySelector('.meta')), '안전 문구 4개');

  kmCard.querySelector('.course-open')
    .dispatchEvent(new km.win.MouseEvent('click', { bubbles: true }));
  const kmTexts = [];
  for (let i = 0; i < 4; i++) {
    kmTexts.push(text(km.$('phrase-card')));
    const next = km.$('btn-next');
    if (next && !next.hidden) next.dispatchEvent(new km.win.MouseEvent('click', { bubbles: true }));
  }
  ok('★ 크메르어 화면에는 그 문구가 그대로 나온다',
    kmTexts.join(' ').includes('프레스가 멈춰도') ||
    kmTexts.join(' ').includes('ទោះម៉ាស៊ីនឈប់'),
    kmTexts.join(' | ').slice(0, 200));

  /* 인도네시아어 노동자 — 도장 교육에도 ph-3 이 들어 있다 (ph-3,4,6).
     인도네시아어 번역이 중지됐으니 2개만 남는다. */
  const id = boot('worker/learn.html', { login: 'W-4821-11', page: 'worker/learn.js' });
  const idCard = id.win.document.querySelector('#course-list .course-card');
  has('★ 인도네시아어 노동자에게는 그 문구가 빠진다',
    text(idCard.querySelector('.meta')), '안전 문구 2개');

  idCard.querySelector('.course-open')
    .dispatchEvent(new id.win.MouseEvent('click', { bubbles: true }));
  const idTexts = [];
  for (let i = 0; i < 2; i++) {
    idTexts.push(text(id.$('phrase-card')));
    const next = id.$('btn-next');
    if (next && !next.hidden) next.dispatchEvent(new id.win.MouseEvent('click', { bubbles: true }));
  }
  ok('★ 뜻이 뒤집힌 번역은 어디에도 나오지 않는다',
    !idTexts.join(' ').includes('boleh masukkan tangan'), idTexts.join(' | ').slice(0, 200));
}

/* --- 신고할 때 언어를 반드시 고르게 한다 --- */
{
  const t = open();

  /* 기본값을 두지 않는 이유 — 특정 언어가 기본이면 손대지 않고 접수한 순간
     엉뚱한 언어가 내려가고 정작 오역인 번역은 계속 나간다.
     "문구 전체" 가 기본이면 언어별 판정을 만든 이유가 사라진다. */
  t.$('flag-phrase').value = 'ph-1';
  t.$('flag-phrase').dispatchEvent(new t.win.Event('change', { bubbles: true }));
  eq('언어 칸의 기본값은 비어 있다', t.$('flag-lang').value, '');

  const options = [...t.$('flag-lang').querySelectorAll('option')].map((o) => text(o));
  has('고르라고 적혀 있다', options.join(' | '), '고르세요');
  ok('그 문구가 가진 언어가 올라온다',
    options.some((o) => o.includes('크메르어')), options.join(' | '));
  ok('문구 전체도 고를 수 있다',
    options.some((o) => o.includes('문구 전체')), options.join(' | '));

  // 고르지 않고 접수하면 막힌다
  t.$('flag-note').value = '뭔가 잘못됐습니다';
  t.$('form-flag').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));
  eq('★ 언어를 고르지 않으면 접수되지 않는다',
    t.win.Store.library.load().find((p) => p.id === 'ph-1').status, 'reviewed');
  has('무엇을 해야 하는지 말해 준다', text(t.$('toast')), '어느 언어의 번역인지');
}

/* --- 한 언어만 신고하면 그 언어만 내려간다 --- */
{
  const t = open();
  fileFlag(t, 'ph-1', 'km', '크메르어에서 부정이 빠졌습니다');

  const p = t.win.Store.library.load().find((x) => x.id === 'ph-1');
  eq('★ 문구 전체는 살아 있다', p.status, 'reviewed');
  eq('★ 크메르어만 중지', p.translations.km.status, 'stopped');
  eq('인도네시아어는 그대로', p.translations.id.status, undefined);
  eq('어느 언어의 신고인지 남는다', p.flags[p.flags.length - 1].lang, 'km');

  eq('크메르어로는 못 쓴다', t.win.Store.phraseOk(p, 'km'), false);
  eq('★ 인도네시아어로는 계속 쓴다', t.win.Store.phraseOk(p, 'id'), true);

  // 그 언어만 되살린다
  t.win.confirm = () => true;
  const item = [...t.$('flag-queue').querySelectorAll('.queue-item')]
    .find((i) => text(i).includes('부정이 빠졌습니다'));
  const fix = [...item.querySelectorAll('.btn-sm')]
    .find((b) => text(b).includes('크메르어 번역이 고쳐졌습니다'));
  ok('그 언어만 되살리는 버튼이다', !!fix,
    [...item.querySelectorAll('.btn-sm')].map((b) => text(b)).join(' | '));
  click(t.win, fix);

  const fixed = t.win.Store.library.load().find((x) => x.id === 'ph-1');
  eq('크메르어가 다시 검수 완료', fixed.translations.km.status, 'reviewed');
  eq('그 언어의 신고만 닫힌다',
    fixed.flags.filter((f) => f.lang === 'km' && !f.resolvedAt).length, 0);
}

/* =================================================================
   7. 문구 추가 폼 (B2)

   ★ 이 폼이 지켜야 하는 것은 "저장이 되는가" 가 아니다.
     새 문구가 검수를 건너뛰고 안전 지시가 되지 않는가이다.
   ================================================================= */

/* 폼을 채우고 접수한다. back 을 주지 않으면 역번역 없이 넣어 보는 것이다. */
function addPhrase(t, { ko, category, lang, textIn, back }) {
  if (ko != null) t.$('add-ko').value = ko;
  if (category != null) t.$('add-category').value = category;
  if (lang) {
    if (textIn != null) {
      t.$('add-' + lang + '-text').value = textIn;
      t.$('add-' + lang + '-text').dispatchEvent(new t.win.Event('input', { bubbles: true }));
    }
    if (back != null) {
      t.$('add-' + lang + '-back').value = back;
      t.$('add-' + lang + '-back').dispatchEvent(new t.win.Event('input', { bubbles: true }));
    }
  }
  t.$('form-add').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));
}

{
  const t = open();
  const doc = t.win.document;

  ok('문구 추가 폼이 있다', !!t.$('form-add'));

  /* 언어 칸은 Store.LANGUAGES 에서 나온다 — 화면에 언어를 박아 두면
     언어가 늘 때 한 곳을 빠뜨린다. 한국어는 원문 칸이 이미 받는다. */
  eq('언어 칸이 5개 (한국어 제외)', doc.querySelectorAll('#add-i18n .i18n-box').length, 5);
  ok('크메르어 칸이 있다', !!t.$('add-km-text') && !!t.$('add-km-back'));
  ok('한국어 번역 칸은 없다', !t.$('add-ko-text'));

  /* 분류 후보는 라이브러리에서 온다. Store.setup 의 공정 이름을 쓰면
     운영자가 여러 사업장을 가로질러 볼 때 다른 사업장의 분류가 사라진다. */
  const cats = [...t.$('add-category-list').querySelectorAll('option')].map((o) => o.value);
  ok('분류 후보가 지금 문구들에서 온다', cats.includes('프레스') && cats.includes('도장'),
    cats.join(' | '));
}

/* 원문 없이는 접수되지 않는다 */
{
  const t = open();
  const before = t.win.Store.library.load().length;
  addPhrase(t, { ko: '' });
  eq('원문이 비면 저장되지 않는다', t.win.Store.library.load().length, before);
  has('무엇이 빠졌는지 말한다', text(t.$('toast')), '원문');
}

/* ★ 역번역 없는 번역은 받지 않는다.
     받아 버리면 판정 화면에 견줄 것이 없는 칸이 생기고, 검수자는 읽지도
     못하는 문장을 눈감고 승인하게 된다. 그 승인이 곧 현장의 안전 지시다. */
{
  const t = open();
  const before = t.win.Store.library.load().length;
  addPhrase(t, { ko: '지게차 뒤에 서지 마십시오', lang: 'km', textIn: 'កុំឈរខាងក្រោយ' });
  eq('★ 역번역이 없으면 저장되지 않는다', t.win.Store.library.load().length, before);
  has('어느 언어인지 말한다', text(t.$('toast')), '크메르어');
  has('왜 막았는지 말한다', text(t.$('toast')), '역번역');
  has('그 언어 칸에도 적어 둔다', text(t.$('add-km-warn')), '역번역을 적어 주세요');
}

/* 적는 동안 대조해 준다 — 기능2 의 문항 번역 칸과 같은 판정 (assets/review.js) */
{
  const t = open();

  /* ★ 경고는 접수하기 전에 본다.
       접수에 성공하면 폼이 비워지고 경고 칸도 함께 지워진다. */
  t.$('add-ko').value = '지게차 뒤에 서지 마십시오';
  t.$('add-km-text').value = 'x';
  t.$('add-km-back').value = '지게차 뒤에 서도 됩니다';
  t.$('add-km-back').dispatchEvent(new t.win.Event('input', { bubbles: true }));

  has('★ 부정이 뒤집히면 접수 전에 경고한다', text(t.$('add-km-warn')), '뒤집혔을 수 있습니다');

  /* 경고는 AI 가 찾아 준 것이고 접수를 막지는 않는다 — 판정은 사람이 한다.
     막아 버리면 말만 바꿔 쓴 번역까지 등록이 안 된다. */
  t.$('form-add').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));

  const made = t.win.Store.library.load().find((p) => p.ko === '지게차 뒤에 서지 마십시오');
  ok('경고가 떠도 접수는 된다', !!made);
  eq('다만 검수 대기로 들어간다', made.status, 'waiting');
}

/* 원문을 나중에 고치면 대조가 따라온다 */
{
  const t = open();
  t.$('add-km-text').value = 'x';
  t.$('add-km-back').value = '손을 넣어도 됩니다';
  t.$('add-km-back').dispatchEvent(new t.win.Event('input', { bubbles: true }));
  t.$('add-ko').value = '손을 넣지 마십시오';
  t.$('add-ko').dispatchEvent(new t.win.Event('input', { bubbles: true }));
  has('★ 원문을 고치면 다시 견준다', text(t.$('add-km-warn')), '뒤집혔을 수 있습니다');
}

/* 접수 — 저장되는 모양과 검수 상태 */
{
  const t = open();
  const before = t.win.Store.library.load().length;
  addPhrase(t, {
    ko: '지게차 뒤에 서지 마십시오', category: '지게차',
    lang: 'km', textIn: 'កុំឈរខាងក្រោយ', back: '지게차 뒤에 서지 마십시오'
  });

  const list = t.win.Store.library.load();
  eq('한 개 늘었다', list.length, before + 1);

  const made = list[list.length - 1];
  eq('원문이 저장된다', made.ko, '지게차 뒤에 서지 마십시오');
  eq('분류가 저장된다', made.category, '지게차');
  ok('id 가 붙는다', !!made.id);

  /* ★ 이 한 줄이 이 폼의 전부다.
       여기서 'reviewed' 가 나오면 검수를 지나지 않은 문구가 안전 지시가 된다. */
  eq('★ 새 문구는 검수 대기로 들어간다', made.status, 'waiting');
  eq('★ 그래서 아직 안전 지시로 쓰이지 않는다', t.win.Store.phraseOk(made, 'km'), false);

  eq('넣은 언어만 저장된다', Object.keys(made.translations).join(','), 'km');
  eq('역번역이 함께 저장된다', made.translations.km.back, '지게차 뒤에 서지 마십시오');

  has('문구 목록에 나타난다', text(t.$('phrase-rows')), '지게차 뒤에 서지 마십시오');
  has('검수 대기 배지가 붙는다', text(t.$('phrase-rows')), '검수 대기');
  has('판정이 필요한 문구에도 올라온다', text(t.$('review-list')), '지게차 뒤에 서지 마십시오');

  const cats = [...t.$('add-category-list').querySelectorAll('option')].map((o) => o.value);
  ok('새 분류가 다음 후보가 된다', cats.includes('지게차'), cats.join(' | '));

  eq('폼이 비워진다', t.$('add-ko').value + t.$('add-km-text').value, '');
  eq('경고 칸도 비워진다', text(t.$('add-km-warn')), '');
}

/* 번역 없이도 쌓을 수 있다 — 다만 검수 완료로는 못 올라간다.
   200개를 모으는 일이 번역을 기다리느라 멈추면 안 된다.
   막는 것은 기존 setStatus 규칙이 이어서 한다. */
{
  const t = open();
  addPhrase(t, { ko: '번역이 아직 없는 문구' });

  const list = t.win.Store.library.load();
  const bare = list[list.length - 1];
  eq('번역 없이도 추가된다', bare.ko, '번역이 아직 없는 문구');
  eq('번역은 비어 있다', Object.keys(bare.translations).length, 0);

  const row = [...t.$('phrase-rows').querySelectorAll('tr')]
    .find((tr) => text(tr).includes('번역이 아직 없는 문구'));
  const up = [...row.querySelectorAll('button')].find((b) => text(b) === '검수 완료');

  /* 버튼이 없으면 그것 자체가 실패다 — 검수 대기가 아니라는 뜻이니까.
     여기서 그냥 누르면 검사가 스택 트레이스로 터지고, 무엇이 깨졌는지 안 보인다. */
  ok('검수 대기라 검수 완료 버튼이 있다', !!up,
    [...row.querySelectorAll('button')].map((b) => text(b)).join(' | '));
  if (up) click(t.win, up);

  const after = t.win.Store.library.load().find((p) => p.id === bare.id);
  eq('★ 번역 없는 문구는 검수 완료로 못 올라간다', after.status, 'waiting');
  has('왜 막혔는지 말한다', text(t.$('toast')), '번역이 하나도 없는');
}

/* 운영자가 넣은 글자가 그대로 태그가 되면 안 된다 (innerHTML 금지) */
{
  const t = open();
  addPhrase(t, {
    ko: '<img src=x onerror=alert(1)>조심', lang: 'km', textIn: 'x', back: '조심'
  });
  eq('태그로 해석되지 않는다', t.$('phrase-rows').querySelectorAll('img').length, 0);
  has('글자 그대로 보인다', text(t.$('phrase-rows')), '<img src=x onerror=alert(1)>조심');
}

/* =================================================================
   목업에서 옮겨 온 것 (B4)

   ★ 이 화면은 노동자에게도 담당자에게도 안 보인다. 그래서 여기서
     무엇을 하는지가 잊히기 쉽고, 잊히면 "일단 승인" 이 시작된다.
   ================================================================= */
{
  const t = open();
  const main = text(t.win.document.querySelector('main'));

  has('★ 검수 완료가 아니면 어디에도 안 나온다고 적는다',
    main, '어떤 화면에서도 안전 지시로 노출되지 않습니다');

  /* 규칙만 적으면 언젠가 "확인부터 하자" 로 바뀐다. 이유가 함께 있어야 한다 */
  has('★ 즉시 중지하는 이유를 적는다', main, '그대로 사고가 되기 때문입니다');

  /* 이 화면의 무게 */
  has('★ 여기 판정이 전 사업장에 간다고 적는다', main, '전 사업장에 그대로 전달됩니다');
  has('보이지 않는 화면이라는 것을 밝힌다', main, '어느 쪽 화면에도 보이지 않지만');
}

report('기능9 안전 문구 라이브러리');
