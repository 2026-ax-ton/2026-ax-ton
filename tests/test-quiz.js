/* 기능4 이해도 검증 — 실제 DOM 검증 */
const { boot, ok, eq, has, report, iconName } = require('./harness');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

function openQuiz(opts) {
  return boot('worker/quiz.html' + (opts.query || ''), Object.assign({ page: 'worker/quiz.js' }, opts));
}

/* =================================================================
   1. 순서를 지킨다 — 듣지 않고 문항만 풀 수는 없다
   ================================================================= */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      // 이 노동자의 c-press 이력을 "아직 안 들음"으로 되돌린다
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.learnedAt = null; r.quiz = null;
      });
    },
  });
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
  eq('문항 화면이 뜨지 않는다', t.$('view-quiz').hidden, true);
  eq('안내 화면이 뜬다', t.$('view-gate').hidden, false);
  has('먼저 들으라고 말한다', text(t.$('gate-title')), '먼저 교육을 들어야 합니다');
  has('교육 목록으로 갈 길을 준다', t.$('gate-actions').innerHTML, 'learn.html');
}

/* =================================================================
   2. hotspot — 프레스 도해에서 위험 지점 짚기
   ================================================================= */
{
  const t = openQuiz({ login: 'W-4821-07', query: '?course=c-press' });

  eq('문항 화면이 뜬다', t.$('view-quiz').hidden, false);
  has('문항 1 / 3', text(t.$('step-count')), '문항 1 / 3');
  has('유형을 적는다', text(t.$('step-count')), '위험 지점 짚기');
  eq('유형 픽토그램', iconName(t.$('quiz-kind')), 'touch');
  has('문항을 읽어 준다', t.$('prompt-audio').innerHTML, 'btn-audio');

  const svg = t.$('quiz-body').querySelector('.quiz-figure svg');
  ok('프레스 도해가 들어온다', !!svg);
  eq('퍼센트 좌표계', svg && svg.getAttribute('viewBox'), '0 0 100 100');

  const zones = t.$('quiz-body').querySelectorAll('.zone');
  eq('이름 붙은 구역 4개', zones.length, 4);
  const labels = [...zones].map((z) => z.getAttribute('aria-label'));
  ok('구역마다 이름이 있다 (읽어 주는 데 쓴다)', labels.every(Boolean), JSON.stringify(labels));
  has('정답 구역이 램과 금형 사이', labels.join(' | '), '램과 금형 사이');

  /* --- 틀린 곳을 눌러 본다 (전원 스위치) --- */
  const wrong = [...zones].find((z) => z.getAttribute('aria-label') === '전원 스위치');
  click(t.win, wrong);

  eq('고른 곳이 오답으로 표시된다', wrong.getAttribute('data-mark'), 'no');
  const right = [...zones].find((z) => z.getAttribute('aria-label').includes('램과 금형'));
  eq('정답 자리도 함께 알려 준다', right.getAttribute('data-mark'), 'ok');
  ok('전부 잠긴다 (한 문항에 한 번만)', [...zones].every((z) => z.disabled));

  eq('결과 학습 문장이 뜬다', t.$('consequence').hidden, false);
  has('무슨 사고가 되는지 말한다', text(t.$('consequence-text')), '손이 끼이는 자리는 아닙니다');

  // 두 번 눌러도 답이 바뀌지 않는다
  click(t.win, right);
  eq('두 번째 누름은 무시된다', right.getAttribute('data-mark'), 'ok');

  eq('다음 버튼이 나온다', t.$('btn-next').hidden, false);
  has('마지막이 아니므로 다음 문항', text(t.$('btn-next')), '다음 문항');

  /* --- 문항 2: choice --- */
  click(t.win, t.$('btn-next'));
  has('문항 2 / 3', text(t.$('step-count')), '문항 2 / 3');
  eq('선택지 유형 픽토그램', iconName(t.$('quiz-kind')), 'checkbox');

  const choices = t.$('quiz-body').querySelectorAll('.choice-btn');
  eq('선택지 3개', choices.length, 3);
  eq('선택지마다 음성 버튼', t.$('quiz-body').querySelectorAll('.btn-audio').length, 3);

  click(t.win, choices[1]);   // 정답: 전원을 차단하고 관리자를 부른다
  eq('정답 표시', choices[1].getAttribute('data-mark'), 'ok');
  // ★ 이 노동자는 크메르어다. 결과 문장도 크메르어로 나온다 (i18n)
  has('결과를 크메르어로 말한다', text(t.$('consequence-text')), 'ដុំដែកនឹងមិនធ្លាក់ទេ');
  eq('맞았을 때 아이콘', iconName(t.$('consequence-ico')), 'check-circle');

  /* --- 문항 3: match --- */
  click(t.win, t.$('btn-next'));
  has('문항 3 / 3', text(t.$('step-count')), '문항 3 / 3');
  eq('연결 유형 픽토그램', iconName(t.$('quiz-kind')), 'link');
  has('마지막 문항은 결과 보기', text(t.$('btn-next')), '결과 보기');

  const rows = t.$('quiz-body').querySelectorAll('.match-row');
  eq('짝 2줄', rows.length, 2);

  const lefts = [...rows].map((r) => r.querySelectorAll('.match-btn')[0]);
  const rights = [...rows].map((r) => r.querySelectorAll('.match-btn')[1]);
  const labelOf = (b) => text(b.querySelector('.text'));

  const confirmBtn = t.$('quiz-body').querySelector('.big-actions .btn');
  eq('연결이 끝나기 전에는 확인 버튼이 없다', confirmBtn.hidden, true);

  // 정답대로 연결한다 (오른쪽은 섞여 있으므로 글자로 찾는다)
  const pairOf = { '프레스 작업': '안전장갑', '배전반 점검': '절연장갑' };
  lefts.forEach((lb) => {
    click(t.win, lb);
    const want = pairOf[labelOf(lb)];
    click(t.win, rights.find((rb) => labelOf(rb) === want));
  });

  eq('다 이으면 확인 버튼이 나온다', confirmBtn.hidden, false);
  ok('짝 번호가 글자로도 남는다 (색만으로 구분하지 않는다)',
    lefts.every((b) => b.getAttribute('data-pair')),
    JSON.stringify(lefts.map((b) => b.getAttribute('data-pair'))));

  click(t.win, confirmBtn);
  ok('전부 정답 표시', [...lefts, ...rights].every((b) => b.getAttribute('data-mark') === 'ok'));

  /* --- 결과 --- */
  click(t.win, t.$('btn-next'));

  eq('결과 화면이 뜬다', t.$('view-result').hidden, false);
  has('세 문항 중 두 문항 정답 → 미통과', text(t.$('result-title')), '아직 통과하지 못했습니다');
  eq('점수', text(t.$('result-score')), '67점');
  has('통과 기준을 밝힌다', text(t.$('result-note')), '통과 기준 100점');

  eq('미통과 화면에 그 문장이 있다', t.$('result-fault').hidden, false);
  has('노동자의 실패가 아니라 교육의 실패',
    text(t.$('result-fault')), '노동자의 실패가 아니라 교육의 실패로 기록됩니다');

  eq('문항별 복기 3줄', t.$('result-review').children.length, 3);
  has('첫 문항은 오답', text(t.$('result-review').children[0]), t.win.I18N.t('state.wrong', 'km'));
  has('둘째 문항은 정답', text(t.$('result-review').children[1]), t.win.I18N.t('state.correct', 'km'));

  has('교육을 다시 들으러 갈 수 있다', t.$('result-actions').innerHTML, 'learn.html');

  /* --- 저장 모양 --- */
  const row = t.win.Store.progress.load()
    .find((r) => r.workerId === 'W-4821-07' && r.courseId === 'c-press');
  eq('점수 저장', row.quiz.score, 67);
  eq('통과하지 못했다', row.quiz.passed, false);
  eq('문항별 정오답', JSON.stringify(row.quiz.answers), JSON.stringify([0, 1, 1]));
  ok('기존 네 필드가 그대로 있다 (P3·P4 가 읽는다)',
    ['score', 'passed', 'answers', 'at'].every((k) => k in row.quiz),
    JSON.stringify(Object.keys(row.quiz)));
  eq('두 번째 시도로 기록', row.quiz.attempt, 2);
  eq('최초 시도는 통과였음이 남는다', row.quiz.firstPassed, true);

  /* ★ 그때 낸 문항의 id 를 함께 남긴다 (C6).
       안 남기면, 나중에 담당자가 문항을 내렸을 때 answers 의 자리가
       한 칸씩 밀린다. 그러면 대시보드의 취약 항목과 증빙이
       조용히 다른 문항을 가리킨다. */
  eq('★ 무엇을 냈는지 함께 남는다',
    JSON.stringify(row.quiz.asked), JSON.stringify(['q1', 'q2', 'q3']));
  eq('★ answers 와 asked 의 자리가 짝지어진다',
    (row.quiz.asked || []).length, row.quiz.answers.length);
}

/* =================================================================
   3. 전 문항 정답 → 통과. 그리고 최초 통과 여부가 보존된다.
   ================================================================= */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      // 최초 시도를 미통과로 만들어 둔다
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.quiz = { score: 33, passed: false, answers: [1, 0, 0], at: '2026-08-12T00:00:00.000Z',
                   attempt: 1, firstPassed: false };
      });
    },
  });

  // 문항1 hotspot — 정답 구역
  const zones = t.$('quiz-body').querySelectorAll('.zone');
  click(t.win, [...zones].find((z) => z.getAttribute('aria-label').includes('램과 금형')));
  has('정답일 때도 왜 위험한지 말한다', text(t.$('consequence-text')), '남아 있는 압력으로 램이 떨어져');
  click(t.win, t.$('btn-next'));

  // 문항2 choice — 정답
  click(t.win, t.$('quiz-body').querySelectorAll('.choice-btn')[1]);
  click(t.win, t.$('btn-next'));

  // 문항3 match — 정답
  const rows = t.$('quiz-body').querySelectorAll('.match-row');
  const lefts = [...rows].map((r) => r.querySelectorAll('.match-btn')[0]);
  const rights = [...rows].map((r) => r.querySelectorAll('.match-btn')[1]);
  const labelOf = (b) => text(b.querySelector('.text'));
  const pairOf = { '프레스 작업': '안전장갑', '배전반 점검': '절연장갑' };
  lefts.forEach((lb) => {
    click(t.win, lb);
    click(t.win, rights.find((rb) => labelOf(rb) === pairOf[labelOf(lb)]));
  });
  click(t.win, t.$('quiz-body').querySelector('.big-actions .btn'));
  has('연결 결과도 설명한다', text(t.$('consequence-text')), '배전반 점검에 일반 안전장갑');
  click(t.win, t.$('btn-next'));

  has('통과', text(t.$('result-title')), '이해도 검증을 통과했습니다');
  eq('만점', text(t.$('result-score')), '100점');
  eq('통과 화면에는 그 문장을 띄우지 않는다', t.$('result-fault').hidden, true);
  has('홈으로 갈 수 있다', t.$('result-actions').innerHTML, 'home.html');

  const row = t.win.Store.progress.load()
    .find((r) => r.workerId === 'W-4821-07' && r.courseId === 'c-press');
  eq('통과로 저장', row.quiz.passed, true);
  eq('점수 100', row.quiz.score, 100);
  eq('시도 횟수가 늘었다', row.quiz.attempt, 2);
  eq('★ 최초 통과율의 근거는 덮이지 않는다', row.quiz.firstPassed, false);
}

/* =================================================================
   4. 도장 부스 — 다른 도해가 붙고 다른 구역이 정답이 된다
   ================================================================= */
{
  const t = openQuiz({ login: 'W-4821-11', query: '?course=c-paint' });

  // 문항1 은 choice. 오답을 골라 결과 문장을 확인한다.
  const choices = t.$('quiz-body').querySelectorAll('.choice-btn');
  click(t.win, choices[0]);   // 물을 뿌린다
  has('오답의 결과를 인도네시아어로 말한다', text(t.$('consequence-text')),
    'Menyiram air pada api cat membuat api menyebar');
  eq('틀렸을 때 아이콘', iconName(t.$('consequence-ico')), 'alert');
  eq('정답도 함께 표시', choices[1].getAttribute('data-mark'), 'ok');

  click(t.win, t.$('btn-next'));

  // 문항2 는 hotspot — 도장 부스 도해
  const zones = t.$('quiz-body').querySelectorAll('.zone');
  eq('도장 부스 구역 4개', zones.length, 4);
  const labels = [...zones].map((z) => z.getAttribute('aria-label'));
  has('환기팬이 구역에 있다', labels.join(' | '), '환기팬');
  has('도장 작업 구역이 정답', labels.join(' | '), '도장 작업 구역');

  click(t.win, [...zones].find((z) => z.getAttribute('aria-label') === '도장 작업 구역'));
  has('마스크 없이 들어가면 어떻게 되는지 말한다',
    text(t.$('consequence-text')), '방독마스크 없이 들어가면');

  click(t.win, t.$('btn-next'));
  eq('1문항 오답이라 미통과', text(t.$('result-score')), '50점');

  const row = t.win.Store.progress.load()
    .find((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-paint');
  eq('미통과로 남는다 — 교육 완료가 아니다', row.quiz.passed, false);
}

/* =================================================================
   5. 남의 공정 교육을 URL 로 열 수 없다
   ================================================================= */
{
  const t = openQuiz({ login: 'W-4821-07', query: '?course=c-paint' });
  eq('문항이 뜨지 않는다', t.$('view-quiz').hidden, true);
  has('내 설비가 아니라고 말한다', text(t.$('gate-why')), '내 설비의 교육이 아닙니다');
}

/* =================================================================
   6. 문항이 없는 교육은 완료로 기록하지 않는다
   ================================================================= */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      win.Store.courses.update((list) => {
        list.find((c) => c.id === 'c-press').quiz = [];
      });
    },
  });
  has('문항이 없다고 말한다', text(t.$('gate-title')), '아직 문항이 없습니다');
  has('완료로 기록하지 않는 이유를 밝힌다',
    text(t.$('gate-why')), '교육 완료로 기록하지 않습니다');
}

/* =================================================================
   7. ?course= 없이 들어오면 검증이 남은 교육을 스스로 찾는다
   ================================================================= */
{
  const t = openQuiz({ login: 'W-4821-11' });
  eq('문항 화면이 바로 뜬다', t.$('view-quiz').hidden, false);
  has('도장 부스 교육을 골랐다', text(t.$('quiz-course')), '도장 부스 1 안전교육');
}

/* =================================================================
   8. 채점할 수 없는 문항 유형은 정답으로 세지 않는다
   ================================================================= */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      win.Store.courses.update((list) => {
        const c = list.find((x) => x.id === 'c-press');
        c.quiz.push({ id: 'q9', type: 'essay', prompt: '설명해 보세요' });
        c.quiz.push({ id: 'q8', type: 'choice', prompt: '망가진 문항', options: ['하나'] });
      });
    },
  });
  has('모르는 유형은 문항 수에 들어가지 않는다', text(t.$('step-count')), '문항 1 / 3');
}

/* =================================================================
   9. 규칙 검사
   ================================================================= */
{
  const fs = require('fs');
  const base = 'C:/Users/byeonsoyun/2026-ax-ton/2026-ax-ton/src/worker/';
  const html = fs.readFileSync(base + 'quiz.html', 'utf8');
  const js = fs.readFileSync(base + 'quiz.js', 'utf8');

  ok('외부 주소 없음', !/(src|href)\s*=\s*["']https?:/i.test(html));
  ok('절대경로 없음', !/(src|href)\s*=\s*["']\//.test(html));
  ok('innerHTML 안 씀', !/innerHTML/.test(js));
  ok('localStorage 직접 호출 안 함', !/localStorage/.test(js));
  ok('import/export 안 씀', !/^\s*(import|export)\s/m.test(js));
  ok('<img> 없음 — 도해는 인라인 SVG 다', !/<img/i.test(html));
  ok('"면책" 표현 없음', !/면책/.test(html + js));
  has('통과 기준이 코드에 한 곳', js, 'var PASS_SCORE = 100');
}

/* =================================================================
   10. 문항 다국어화 — 문해력 독립 이해도 검증의 전제

   문항이 한국어로만 나오면 이 기능은 기존 필기시험이 된다.
   ================================================================= */
{
  const t = openQuiz({ login: 'W-4821-07', query: '?course=c-press' });   // 크메르어

  has('문항이 크메르어로 나온다', text(t.$('quiz-prompt')), 'សូមចុចកន្លែងដែលដៃអាចជាប់');
  eq('★ 번역이 온전하면 준비중 배지가 없다', t.$('prompt-note').hidden, true);

  // 문항 2 (choice) — 선택지도 크메르어로 나온다
  click(t.win, t.$('btn-next'));
  const choices = [...t.$('quiz-body').querySelectorAll('.choice-btn')];
  eq('선택지 3개 그대로', choices.length, 3);
  has('선택지가 크메르어로 나온다', text(choices[0]), 'ដាក់ដៃចូល');

  /* ★ 정답 인덱스가 번역 뒤에도 같은 자리를 가리키는가.
       answer 는 1 = "전원을 차단하고 관리자를 부른다" 다. */
  has('정답 자리의 선택지가 그 뜻의 크메르어다', text(choices[1]), 'កាត់ចរន្តអគ្គិសនី');
  click(t.win, choices[1]);
  eq('★ 번역된 선택지로도 정답 판정이 맞다', choices[1].getAttribute('data-mark'), 'ok');

  // 문항 3 (match) — 번역을 일부러 넣지 않은 문항
  click(t.win, t.$('btn-next'));
  eq('★ 번역 없는 문항은 배지를 띄운다', t.$('prompt-note').hidden, false);
  has('배지에 이유가 글자로 적힌다', text(t.$('prompt-note')), t.win.I18N.t('learn.transPending', 'km'));
  has('★ 번역이 없으면 한국어를 띄운다 — 조용히 숨기지 않는다',
    text(t.$('quiz-prompt')), '작업에 맞는 보호구를 연결하세요');
}

/* --- 인도네시아어 노동자는 인도네시아어를 본다 --- */
{
  const t = openQuiz({ login: 'W-4821-11', query: '?course=c-paint' });
  has('문항이 인도네시아어로 나온다', text(t.$('quiz-prompt')), 'Terjadi kebakaran saat pengecatan');
  has('선택지도 인도네시아어로 나온다',
    text(t.$('quiz-body').querySelectorAll('.choice-btn')[1]), 'Matikan kipas ventilasi');
}

/* --- ★ 번역 배열의 길이가 다르면 한국어로 되돌아간다 ---

   여기가 이 기능에서 가장 위험한 자리다. answer 는 options 의 인덱스라서,
   번역 배열이 한 칸 짧거나 순서가 다르면 정답이 엉뚱한 선택지를 가리킨다.
   안전교육에서 그것은 틀린 작업을 맞다고 가르치는 것이다. */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      win.Store.courses.update((list) => {
        const q = list.find((c) => c.id === 'c-press').quiz[1];
        q.i18n.km.options = ['ក', 'ខ'];        // 3개여야 하는데 2개
      });
    },
  });

  click(t.win, t.$('btn-next'));
  const choices = [...t.$('quiz-body').querySelectorAll('.choice-btn')];
  eq('선택지 개수가 한국어 기준으로 유지된다', choices.length, 3);
  has('★ 길이가 어긋난 번역은 쓰지 않고 한국어로 되돌린다',
    text(choices[1]), '전원을 차단하고 관리자를 부른다');
  eq('★ 되돌린 뒤에도 배지로 그 사실을 남긴다', t.$('prompt-note').hidden, false);

  click(t.win, choices[1]);
  eq('★ 정답 인덱스가 어긋나지 않았다', choices[1].getAttribute('data-mark'), 'ok');
}

/* --- 빈 칸이 섞인 번역도 쓰지 않는다 --- */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      win.Store.courses.update((list) => {
        const q = list.find((c) => c.id === 'c-press').quiz[1];
        q.i18n.km.options = ['ក', '', 'គ'];    // 가운데가 비었다 — 정답 자리다
      });
    },
  });

  click(t.win, t.$('btn-next'));
  const choices = [...t.$('quiz-body').querySelectorAll('.choice-btn')];
  has('빈 선택지를 화면에 내보내지 않는다', text(choices[1]), '전원을 차단하고 관리자를 부른다');
}

/* --- 결과 복기도 같은 언어로 --- */
{
  const t = openQuiz({ login: 'W-4821-11', query: '?course=c-paint' });

  click(t.win, t.$('quiz-body').querySelectorAll('.choice-btn')[1]);   // 정답
  click(t.win, t.$('btn-next'));
  // 문항 2 는 hotspot — 정답 구역을 눌러 끝낸다
  const zones = [...t.$('quiz-body').querySelectorAll('.zone')];
  if (zones.length) {
    click(t.win, zones[0]);
    click(t.win, t.$('btn-next'));
    has('결과 복기도 인도네시아어로 보인다',
      text(t.$('result-review')), 'Terjadi kebakaran');
  } else {
    ok('도해에 구역이 있다 (복기 확인을 위해)', false, '구역이 0개');
  }
}

/* --- Store.qtext 규칙 자체 --- */
{
  const t = openQuiz({ login: 'W-4821-07', query: '?course=c-press' });
  const S = t.win.Store;
  const q = { prompt: '한국어', options: ['A', 'B'], answer: 0,
    i18n: { km: { prompt: 'KM', options: ['ក', 'ខ'] }, id: { prompt: 'ID' } } };

  eq('lang 이 ko 면 한국어', S.qtext(q, 'ko', 'prompt'), '한국어');
  eq('lang 이 없으면 한국어', S.qtext(q, '', 'prompt'), '한국어');
  eq('번역이 있으면 번역', S.qtext(q, 'km', 'prompt'), 'KM');
  eq('번역이 없는 언어는 한국어', S.qtext(q, 'vi', 'prompt'), '한국어');
  eq('★ 선택지 번역이 빠지면 한국어 배열', S.qtext(q, 'id', 'options')[0], 'A');
  eq('온전한 번역은 qhas true', S.qhas(q, 'km'), true);
  eq('★ 문구만 번역된 것은 qhas false — 언어가 섞인 화면을 숨기지 않는다',
    S.qhas(q, 'id'), false);
  eq('번역이 아예 없으면 qhas false', S.qhas(q, 'vi'), false);
}

/* =================================================================
   내린 문항은 앞으로 안 나온다 · 무엇을 냈는지 기록에 남는다 (C6)

   ★ 담당자가 문항을 내려도(retired) 배열에서는 빼지 않는다.
     이미 그 문항을 푼 기록이 가리킬 곳이 남아야 하기 때문이다.
     그래서 "내지 않는" 일은 여기서 해야 한다.
   ================================================================= */
{
  const t = openQuiz({
    login: 'W-4821-07',
    query: '?course=c-press',
    before(win) {
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.quiz = null;                      // 다시 풀 수 있게
      });
      win.Store.courses.update((list) => {
        const c = list.find((x) => x.id === 'c-press');
        c.quiz[0].retired = true;           // 첫 문항을 내린다
      });
    },
  });

  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
  has('★ 내린 문항을 빼고 낸다 — 3문항이 아니라 2문항',
    text(t.$('step-count')), '문항 1 / 2');
  ok('★ 내린 문항이 첫 문항으로 나오지 않는다',
    iconName(t.$('quiz-kind')) !== 'touch', iconName(t.$('quiz-kind')));

  /* 그래도 courses 에서는 안 지웠다 — 옛 기록이 가리킬 곳이 남아야 한다 */
  eq('★ 배열에서는 빠지지 않았다',
    t.win.Store.courses.load().find((c) => c.id === 'c-press').quiz.length, 3);
}

report('기능4 이해도 검증');
