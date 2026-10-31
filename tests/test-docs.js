/* 문서 검증 — "나 뭐 하면 되는지" 만 물어도 Claude Code 가 답할 수 있는가

   2026-08-21 개인 개발로 전환되면서 문서 구조가 바뀌었다.
   포지션(P2·P3·P4)별로 갈라져 있던 할 일이 A~E 하나의 우선순위 목록이 됐다.
   이 검사도 그것에 맞췄다. */
const fs = require('fs');
const path = require('path');
const { ok, eq, has, report, ROOT } = require('./harness');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* =================================================================
   1. CLAUDE.md — 세션 시작 절차가 새 문서로 이어지는가
   ================================================================= */
{
  const c = read('CLAUDE.md');

  has('3단계가 07-next-tasks.md 를 가리킨다', c, 'docs/07-next-tasks.md');
  has('"나 뭐 하면 되는지" 를 직접 다룬다', c, '나 뭐 하면 되는지 알려줘');
  has('되묻지 말라고 지시한다', c, '되묻지 말고');
  // 이어서 하려면 어디를 봐야 하는지가 적혀 있어야 한다
  has('이어갈 자리를 가리킨다', c, '지난 세션이 끝난 자리');
  has('devlog 를 배경으로 쓴다', c, 'docs/devlog/byeonsoyun.md');
  has('"docs 보고 바로 진행" 도 같은 절차다', c, 'docs 보고 바로 진행해줘');
  has('회귀 검사 돌리는 법이 있다', c, 'tests/run-all.js');
  has('맨 위 하나만 제안한다', c, '맨 위 것 하나');
  has('끝나면 체크박스를 바꾼다', c, '`- [x]` 로 바꾸고');
  has('골격이 무슨 뜻인지 설명한다', c, '골격');
  has('제품 원칙 주석을 함부로 지우지 못하게 한다', c, '지워야 할 것 같으면 먼저 사용자에게');
  has('브랜치 확인 절차가 남아 있다', c, 'git branch --show-current');

  // ★ 개인 개발 전환이 반영돼 있는가 — 포지션을 되물으면 작업이 시작되지 않는다
  has('개인 개발임을 밝힌다', c, '개인 개발');
  has('포지션 확인 절차를 하지 않는다고 못 박는다', c, '포지션(P1~P4) 확인 절차를 하지 않습니다');
  has('브랜치가 하나로 정해져 있다', c, 'feature/byeonsoyun');

  // 옛 표현이 남아 있지 않은지
  ok('"껍데기인지" 라는 옛 안내가 사라졌다', !c.includes('껍데기인지 만들다 만 것인지'));
  ok('"내 포지션을 알려" 라는 옛 절차가 사라졌다', !/포지션을 확인하고 알려/.test(c));
}

/* =================================================================
   2. 07-next-tasks.md — 하나의 우선순위 목록이 실행 가능한가

   포지션이 없어졌으니 절은 "누가 하나" 가 아니라 "무엇이 먼저인가" 로 갈린다.
   A(데이터 모양) → B(값싼 것) → C(화면 완성도) → D(큰 것) → E(서버 뒤).
   ================================================================= */
{
  const t = read('docs/07-next-tasks.md');

  /* ★ 배포할 때마다 해야 하는 일은 문서에 적혀 있어야 한다 (E1).
     Service Worker 의 VERSION 을 안 올리면 옛 화면이 그대로 남아,
     고쳤는데 안 고쳐진 것으로 보인다. 이건 코드로 막을 수 없어서
     "적혀 있는지" 를 검사가 지킨다. */
  has('★ 배포 때 sw.js 의 VERSION 을 올리라고 적혀 있다', t, 'VERSION');
  has('sw.js 가 어디 있는지 적혀 있다', t, 'src/sw.js');
  has('새 파일을 만들면 sw.js 목록에 더하라고 적혀 있다 (CLAUDE.md)',
    read('CLAUDE.md'), 'sw.js');

  has('Claude Code 용 사용법이 맨 위에 있다', t, 'Claude Code 에게');
  has('포지션을 되묻지 않게 한다', t, '포지션을 묻지 마세요');
  has('하나의 목록임을 밝힌다', t, '하나의 우선순위 목록');
  has('여러 개를 동시에 벌이지 않게 한다', t, '여러 개를 동시에 벌이지 않습니다');

  // 우선순위 절이 다 있는가
  /* E 절 이름이 바뀌었다 — E1(오프라인)이 서버 없이 끝나서
     "E. 나중에" 가 더는 맞지 않는다 (2026-08-28). */
  ['A. 데이터 모양을 바꾸는 것', 'B. 값싸고 바로 이어지는 것', 'C. 화면 완성도',
    'D. 큰 것', 'E. 서버가 있어야 하는 것'].forEach((title) => {
    has('절이 있다 — ' + title, t, '# ' + title);
  });

  // 옛 포지션 절이 남아 있지 않은지
  ok('P2·P3·P4 절이 사라졌다', !/\n# P[234] /.test(t));

  /* 할 일마다 "어디" 와 "됐는지" 가 있는가 — 없으면 실행할 수 없다.

     ★ 남은 개수에 바닥을 두지 않는다.
       예전에는 "- [ ] 가 8개 이상" 을 봤는데, 일을 끝낼 때마다 검사가 깨져서
       그때마다 숫자를 내리게 된다. 숫자를 내리는 검사는 아무것도 지키지 않는다.
       (V1·V2 를 끝내며 15 → 8 로 한 번 내렸고, C7 에서 또 걸렸다.)
       그래서 개수가 아니라 남은 항목 "하나하나가" 실행 가능한지를 본다. */
  const openItems = t.split(/\n(?=- \[)/).filter((s) => s.startsWith('- [ ]'));
  const doneCount = (t.match(/- \[x\]/g) || []).length;
  ok('끝낸 일이 체크로 남아 있다 (' + doneCount + '개)', doneCount >= 10, String(doneCount));

  const vague = openItems.filter((s) => !s.includes('**어디**:'));
  ok('★ 남은 일마다 "어디" 가 적혀 있다 (' + openItems.length + '개 남음)',
    vague.length === 0, vague.map((s) => s.split('\n')[0]).join(' | '));

  const wheres = (t.match(/\*\*어디\*\*:/g) || []).length;
  const dones = (t.match(/\*\*됐는지\*\*:/g) || []).length;
  ok('할 일에 "어디" 가 적혀 있다 (' + wheres + '개)', wheres >= 12, String(wheres));
  ok('할 일에 완료 확인법이 있다 (' + dones + '개)', dones >= 12, String(dones));

  // A 가 맨 위인 이유가 적혀 있는가 — 순서를 바꾸면 같은 파일을 두 번 연다
  has('A 를 먼저 하는 이유가 적혀 있다', t, '같은 파일을 두 번 엽니다');

  has('막히면 어디를 보는지', t, '05-troubleshooting.md');
  has('다 끝나면 어디로 가는지', t, '06-feature-priority.md');
  has('절대 지우지 말 것 절이 있다', t, '# ★ 절대 지우지 말 것');

  /* ★ 다음 세션이 이 한 절만 읽고 이어갈 수 있어야 한다 */
  has('지난 세션이 끝난 자리가 있다', t, '★ 지난 세션이 끝난 자리');
  has('다음 한 걸음을 지목한다', t, '### 다음 한 걸음');
  has('브랜치를 적는다', t, 'feature/byeonsoyun');
  has('검사 돌리는 법을 적는다', t, 'tests/run-all.js');
  has('되묻지 말라고 한다', t, '되묻지 말고');
}

/* =================================================================
   3. 담당 파일이 실제로 존재하는가 — 문서가 없는 파일을 가리키면 안 된다
   ================================================================= */
{
  const t = read('docs/07-next-tasks.md');

  /* 문서는 `src/` 를 붙이기도 하고 (`src/worker/home.html`)
     생략하기도 한다 (`admin/content.js`). 둘 다 같은 파일로 본다.
     assets/review.js 처럼 아직 만들지 않은 파일을 가리키는 것은 걸러 낸다 —
     "앞으로 만들 것" 이라고 적힌 자리는 없는 파일을 가리키는 게 맞다. */
  const PLANNED = ['src/assets/review.js'];
  const files = [...new Set(
    (t.match(/(?:src\/)?(?:admin|worker|assets)\/[\w.-]+\.(?:html|js|css)/g) || [])
      .map((f) => (f.startsWith('src/') ? f : 'src/' + f))
  )].filter((f) => PLANNED.indexOf(f) === -1);

  ok('문서가 src 파일을 가리킨다 (' + files.length + '개)', files.length >= 10, String(files.length));

  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  ok('★ 문서가 가리키는 파일이 다 있다', missing.length === 0, missing.join(', '));
}

/* =================================================================
   4. 문서가 가리키는 함수 이름이 코드에 실제로 있는가
      (없는 함수를 가리키면 팀원이 못 찾는다)
   ================================================================= */
{
  const t = read('docs/07-next-tasks.md');
  const refs = [
    ['usablePhrases', 'src/admin/content.js'],
    ['buildLangPicker', 'src/admin/content.js'],
    ['draftSteps', 'src/admin/content.js'],
    ['showLink', 'src/admin/content.js'],
    ['setReportStatus', 'src/admin/dashboard.js'],
    ['grade', 'src/admin/dashboard.js'],
    ['stuckTopics', 'src/admin/dashboard.js'],
    ['fileFlag', 'src/admin/library.js'],
    ['negationFlipped', 'src/assets/review.js'],   // 기능2 와 함께 쓰려고 빼냈다
    ['setStatus', 'src/admin/library.js'],
    ['courseBlock', 'src/admin/proof.js'],       // C1 에서 renderRows 를 덩어리 단위로 바꿨다
    ['phrasePool', 'src/worker/home.js'],        // C5 에서 pickTodayPhrase 를 쪼갠 것
  ];

  refs.forEach(([fn, file]) => {
    if (!t.includes(fn)) { ok('문서가 ' + fn + ' 을 언급한다', false, '문서에 없음'); return; }
    const code = read(file);
    ok(fn + ' 이 ' + path.basename(file) + ' 에 실제로 있다',
      new RegExp('function\\s+' + fn + '\\b').test(code), '코드에 없음');
  });
}

/* =================================================================
   5. 문서가 가리키는 CSS 클래스가 실제로 있는가
   ================================================================= */
{
  const t = read('docs/07-next-tasks.md');
  const adminCss = read('src/admin/admin.css');
  const workerCss = read('src/worker/worker.css');
  const adminHtml = read('src/admin/dashboard.html') + read('src/admin/library.html') +
    read('src/admin/proof.html');

  [['.card.feature', adminCss], ['.kpi-row.small', adminCss], ['.policy-note', adminCss]]
    .forEach(([cls, css]) => {
      ok('문서가 언급한 ' + cls + ' 가 CSS 에 있다', css.includes(cls), cls);
    });

  has('문서가 .ai-note 를 언급', t, '.ai-note');
  ok('.ai-note 가 관리자 화면에 실제로 있다', adminHtml.includes('ai-note'));
  ok('worker.css 에 [P2] 구역이 있다', workerCss.includes('[P2]'));
  ok('admin.css 에 [P3] 구역이 있다', adminCss.includes('[P3]'));
  ok('admin.css 에 [P4] 구역이 있다', adminCss.includes('[P4]'));
}

/* =================================================================
   6. 목업 파일이 실제로 있는가 — 각 포지션 1번 할 일이 이것이다
   ================================================================= */
{
  const t = read('docs/07-next-tasks.md');

  /* 문서는 첫 번째만 `docs/mockups/` 를 붙이고 나머지는 파일 이름만 적는다
     (`12-admin-dashboard.html`). 둘 다 모아 실제로 있는지 본다. */
  const mocks = [...new Set([
    ...(t.match(/docs\/mockups\/[\w.-]+/g) || []),
    ...(t.match(/\b\d\d-[\w-]+\.html\b/g) || []).map((f) => 'docs/mockups/' + f),
  ])];

  ok('목업을 가리킨다 (' + mocks.length + '개)', mocks.length >= 3, String(mocks.length));
  const missing = mocks.filter((m) => !fs.existsSync(path.join(ROOT, m)));
  ok('★ 목업 파일이 다 있다', missing.length === 0, missing.join(', '));
}

/* =================================================================
   7. 문서끼리 걸어 놓은 링크가 다 살아 있는가
   ================================================================= */
{
  const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
  const broken = [];

  docs.forEach((name) => {
    const body = read('docs/' + name);
    (body.match(/\]\(([^)]+\.md)\)/g) || []).forEach((m) => {
      const rel = m.slice(2, -1);
      if (/^https?:/.test(rel)) return;
      const target = path.resolve(path.join(ROOT, 'docs'), rel);
      if (!fs.existsSync(target)) broken.push(name + ' → ' + rel);
    });
  });

  ok('★ docs 안의 문서 링크가 다 살아 있다', broken.length === 0, broken.join(' | '));
}

/* =================================================================
   8. README 와 프롬프트 문서가 새 흐름을 안내하는가
   ================================================================= */
{
  const r = read('docs/README.md');
  has('README 첫 줄이 "나 뭐 하면 되죠" 다', r, '나 뭐 하면 되죠');
  has('README 가 07 을 가리킨다', r, '07-next-tasks.md');
  has('README 가 06 을 가리킨다', r, '06-feature-priority.md');
  has('처음 순서가 두 단계로 줄었다', r, '나 뭐 하면 되는지 알려줘');

  has('README 가 개인 개발 전환을 알린다', r, '개인 개발로 전환됐습니다');

  const p = read('docs/03-prompts.md');
  has('프롬프트 문서도 단축 안내를 준다', p, '사실 이것도 안 해도 됩니다');
  has('프롬프트 문서가 팀 시절 기록임을 밝힌다', p, '진행하던 때의 기록');
  ok('블록들이 07 을 가리킨다',
    (p.match(/07-next-tasks\.md/g) || []).length >= 4);
  has('골격이라고 알려 준다', p, '골격이 들어가 있어서 동작해');
  ok('옛 꼬리 문구가 사라졌다', !p.includes('오늘 무엇부터 만들면 좋을지 3단계로'));
}

/* =================================================================
   9. 상태 표기가 문서끼리 어긋나지 않는가
   ================================================================= */
{
  const pos = read('docs/02-positions.md');
  const pri = read('docs/06-feature-priority.md');
  const next = read('docs/07-next-tasks.md');

  has('02 가 골격 있음을 표시', pos, '골격 있음');
  has('06 이 1층 전부 동작한다고 말한다', pri, '1층 기능 8개가 전부 동작합니다');
  has('07 이 화면 11개가 동작한다고 말한다', next, '화면 11개는 전부 동작합니다');

  // 껍데기라는 옛 상태 표기가 남아 있지 않은지
  ok('02 에 "껍데기" 상태 표기가 없다', !/\|\s*껍데기\s*\|/.test(pos));
  ok('06 에 "껍데기" 상태 표기가 없다', !/\|\s*껍데기\s*\|/.test(pri));

  // 실제 코드도 껍데기가 아닌지 (크기로 확인)
  const shells = ['worker/home', 'worker/report', 'worker/talk', 'worker/my',
    'admin/dashboard', 'admin/content', 'admin/proof', 'admin/library']
    .filter((f) => fs.statSync(path.join(ROOT, 'src', f + '.js')).size < 5000);
  ok('★ 껍데기로 남은 화면이 없다', shells.length === 0, shells.join(', '));

  const todos = ['worker/home', 'worker/report', 'worker/talk', 'worker/my',
    'admin/dashboard', 'admin/content', 'admin/proof', 'admin/library']
    .filter((f) => !read('src/' + f + '.html').includes('여기부터 채우시면 됩니다'));
  ok('★ 여덟 화면에 "여기부터" 칸이 다 있다', todos.length === 0, todos.join(', '));

  /* ★ 칸이 있는지만 보면 B5 가 고친 어긋남을 다시 놓친다.
       칸 안에 "이미 끝난 것" 이 적혀 있어도 위 검사는 통과한다.
       처음 보는 사람은 문서보다 화면을 믿어서 이미 있는 기능을 또 만든다. */
  const SCREENS = ['worker/home', 'worker/report', 'worker/talk', 'worker/my',
    'admin/dashboard', 'admin/content', 'admin/proof', 'admin/library'];

  /* 그 화면의 "여기부터 채우시면 됩니다" 칸만 잘라 낸다 */
  const todoBox = (f) => {
    const html = read('src/' + f + '.html');
    const from = html.indexOf('여기부터 채우시면 됩니다');
    if (from === -1) return '';
    const to = html.indexOf('</section>', from);
    return html.slice(from, to === -1 ? html.length : to);
  };

  /* 끝낸 기능이 아직 할 일로 적혀 있으면 안 된다.
     ★ 새 항목을 끝낼 때마다 여기에 한 줄 더하세요 — 그것이 화면도 함께
       정리하라는 신호가 됩니다 (07-next-tasks.md 의 - [x] 와 짝입니다). */
  const DONE = [
    { label: '문항 다국어', why: 'A1 에서 끝남 — Store.qtext' },
    { label: '언어별 판정', why: 'A2 에서 끝남 — Store.phraseStatus' },
    { label: '교육 기한', why: 'B1 에서 끝남 — UI.dueBadge' },
    { label: '문구 추가', why: 'B2 에서 끝남 — admin/library 의 #form-add' },
    { label: '기간 걸러 보기', why: 'C2 에서 끝남 — admin/dashboard 의 범위 고르기' },
    { label: '관리자 답글 표시', why: 'C7 에서 끝남 — talk.js 의 isOfficial' },
    { label: '글자 크기 조절', why: 'B3 에서 끝남 — worker/my 의 글자 크기 칸' },
    { label: '재교육 지시', why: 'D2 에서 끝남 — Store.orders · dashboard 의 #order-form' },
    { label: '문항 수정·삭제', why: 'C6 에서 끝남 — content 의 #edit-banner · q.retired' },
    { label: 'QR 이미지', why: 'D1 에서 끝남 — assets/qr.js · content 의 #link-note' },
  ];

  DONE.forEach((d) => {
    const stale = SCREENS.filter((f) => todoBox(f).includes('<dt>' + d.label));
    ok('★ 끝난 "' + d.label + '" 이 할 일 칸에 없다 (' + d.why + ')',
      stale.length === 0, stale.join(', '));
  });

  /* 팀 시절 표기. 지금은 혼자라 P1~P4 가 가리키는 사람이 없다. */
  const withP = SCREENS.filter((f) => /—\s*P[1-4]\b|P[1-4]\s*가 채우/.test(read('src/' + f + '.html')));
  ok('★ 화면에 P1~P4 표기가 남아 있지 않다', withP.length === 0, withP.join(', '));
}

/* =================================================================
   화면이 가로로 밀리지 않는가 — 2026-08-30 에 세 군데서 다쳤다

   실제 밀림은 브라우저에서만 잴 수 있다 (jsdom 은 배치를 계산하지 않는다).
   그래서 여기서는 **다시 그렇게 될 수 있는 모양**을 잡는다.
   세 가지 다 "좁은 화면에서 화면이 통째로 옆으로 밀린" 원인이었다.
   ================================================================= */
{
  const worker = read('src/worker/worker.css');
  const admin  = read('src/admin/admin.css');
  const shared = read('src/assets/style-admin.css');
  const base   = read('src/assets/style.css');
  const talk   = read('src/worker/talk.js');

  /* --- 1. 같은 이름을 두 화면이 나눠 쓰지 않는가 --------------------
     .anon-note 를 신고 화면(큰 익명 고지)과 소통 화면(한 줄 안내)이
     같이 쓰고 있었다. 뒤에 있는 규칙이 앞의 것을 덮어,
     이 제품에서 가장 중요한 문장이 네 칸짜리 가로줄로 찌그러져 있었다. */
  const anonNoteBlocks = (worker.match(/^\.anon-note\s*\{/gm) || []).length;
  ok('★ .anon-note 를 정의한 곳이 하나뿐이다 (신고 화면의 익명 고지)',
    anonNoteBlocks === 1, '찾은 개수: ' + anonNoteBlocks);
  ok('★ 소통 화면의 한 줄 안내는 .anon-line 을 쓴다',
    talk.includes("'anon-line'") && !talk.includes("'anon-note'"));
  ok('.anon-line 규칙이 있다', /^\.anon-line\s*\{/m.test(worker));

  /* --- 2. 칸의 .ico 규칙이 배지 안까지 흘러들지 않는가 --------------
     .course-open .ico 는 52px 짜리 색 상자다. 그 안에 배지가 들어가면
     배지의 체크 표시까지 52px 이 되어 글자보다 큰 그림이 됐다. */
  ok('★ .course-open 의 아이콘 규칙은 바로 아래 자식만 잡는다',
    /\.course-open\s*>\s*\.ico\s*\{/.test(worker) && !/\.course-open\s+\.ico\s*\{/.test(worker));
  ok('★ .bigmenu-link 의 아이콘 규칙도 바로 아래 자식만 잡는다',
    /\.bigmenu-link\s*>\s*\.ico\s*\{/.test(worker) && !/\.bigmenu-link\s+\.ico\s*\{/.test(worker));
  ok('★ 배지 안의 그림은 배지 글자 크기를 따른다 (새 칸이 생겨도 안 흔들리게)',
    /\.badge\s*>\s*\.ico\s*\{[^}]*font-size:\s*1em/.test(base));

  /* --- 3. 긴 이름표가 한 줄로 버티지 않는가 -------------------------
     .btn-sm 은 표 안에서는 짧지만("보기"), 표 밖에서는 문장만큼 길다
     ("문구 전체 검수 완료 — 안전 지시로 쓴다"). 한 줄로 버티면
     버튼이 카드를 넓히고 카드가 화면을 밀어낸다. */
  ok('★ .btn-sm 이 기본으로 한 줄을 고집하지 않는다',
    !/^\.btn-sm\s*\{[^}]*white-space:\s*nowrap/m.test(shared));
  ok('표 안의 .btn-sm 만 한 줄로 남는다',
    /table\.data\s+\.btn-sm\s*\{[^}]*white-space:\s*nowrap/.test(shared));

  /* --- 4. 격자 칸이 줄어들 수 있는가 --------------------------------
     격자 칸은 기본이 min-width: auto 라, 안에 든 것이 줄바꿈을 거부하면
     칸이 제 몫보다 넓어지고 그대로 화면이 밀린다. */
  ok('★ .bigmenu-cell 이 줄어들 수 있다 (min-width: 0)',
    /\.bigmenu-cell\s*\{[^}]*min-width:\s*0/.test(worker));
  ok('★ .queue-item 안의 것들이 줄어들 수 있다 (min-width: 0)',
    /\.queue-item\s*>\s*\*\s*\{[^}]*min-width:\s*0/.test(shared));

  /* --- 5. PC 에서 표가 화면을 밀어내지 않는가 ------------------------
     넓은 화면에서 .tablewrap 의 가로 스크롤을 꺼 뒀더니, 문구 라이브러리의
     표가 1024~1400px 에서 화면 전체를 옆으로 밀었다. 노트북이 그 구간이다. */
  const wide = admin.slice(admin.indexOf('@media (min-width: 1024px)'));
  ok('★ 넓은 화면에서 .tablewrap 의 가로 스크롤을 끄지 않는다',
    !/\.tablewrap\s*\{[^}]*overflow-x:\s*visible/.test(wide));
  ok('인쇄에서는 표를 통째로 펼친다 (종이에는 스크롤이 없다)',
    /\.tablewrap\s*\{[^}]*overflow:\s*visible/.test(admin));

  /* --- 6. 폰에서 큰 메뉴가 한 칸으로 서는가 --------------------------
     한 칸에 음성 버튼 60px + 그림 + 이름 + 배지가 들어간다.
     흔한 폰(320~430px)에서 두 칸으로 나누면 배지가 세 줄로 접힌다. */
  const bp = worker.match(/@media \(max-width: (\d+)px\) \{\s*\.bigmenu \{ grid-template-columns: 1fr;/);
  ok('★ 큰 메뉴가 한 칸으로 서는 기준이 430px(가장 큰 폰)보다 넓다',
    !!bp && Number(bp[1]) >= 430, bp ? bp[1] + 'px' : '규칙을 못 찾음');
}

report('문서 — 물어보기만 해도 다음 할 일을 찾을 수 있는가');
