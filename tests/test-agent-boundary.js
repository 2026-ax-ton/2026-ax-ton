/* 에이전트 루프 — 가짜 응답으로 경계를 고정한다.

   실제 Gemini 는 부르지 않는다. 실물은 미리보기 배포에서 쟀다 (STC-E16-008, T4).
   케이스: D07 §3.2 9) STC-E16-001~007 · STC-E19-001 · STC-E19-002
   근거:   A02 §6 · D06 §3.2 [6] · PRD-AD-03

   ★ 이 묶음이 지키는 것 — AI 는 승인하지 않는다 · 역번역에 원문을 주지 않는다 ·
     실패해도 화면을 숨기지 않는다 · 재시도 상한을 넘지 않는다 */

const { boot, ok, eq, report, SRC, ROOT } = require('./harness');

const PASS = 'agent-pass-2026';

/* ── 에이전트를 올린 창을 하나 만든다 ─────────────────────────────── */

/* 이 묶음은 비동기다. 하나라도 안 끝났는데 결과를 세면 검사가 조용히 비어 버린다.
   그래서 시작한 것을 전부 모아 두고, 다 끝난 뒤에 센다. */
const pending = [];

function open() {
  const t = boot('admin/library.html');
  t.run('assets/agent.js');
  t.win.sessionStorage.setItem('safety.agentPass', PASS);
  t.calls = [];

  ['run', 'runLang'].forEach((name) => {
    const orig = t.win.Agent[name];
    t.win.Agent[name] = function () {
      const p = orig.apply(this, arguments);
      pending.push(p);
      return p;
    };
  });

  return t;
}

/** 번역·역번역이 이 순서대로 답한 것처럼 꾸민다.
 *  reply(n) 는 n 번째 호출(0부터)에 돌려줄 몸통이다. */
function fake(t, reply) {
  t.win.fetch = function (url, init) {
    const n = t.calls.length;
    t.calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    const r = reply(n, String(url), JSON.parse(init.body));
    if (r && r.hang) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    if (r && r.reject) return Promise.reject(new Error('네트워크 끊김'));
    return Promise.resolve({
      ok: r.status === undefined ? true : r.status < 400,
      status: r.status || 200,
      json: () => Promise.resolve(r.body),
    });
  };
}

/** 번역이면 text, 역번역이면 back 을 돌려주는 흔한 경우 */
function pair(text, back, extra) {
  return (n, url) => ({
    body: url.indexOf('backtranslate') !== -1
      ? Object.assign({ back: back }, extra || {})
      : Object.assign({ text: text, model: 'gemini-3.1-flash-lite' }, extra || {}),
  });
}

const KO = '회전 중인 롤러에 손을 넣지 마세요.';
const phrase = { id: 'p-1', ko: KO, translations: {} };

/* =================================================================
   1. 정상 흐름 — STC-E16-001
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣지 마십시오.'));

  t.win.Agent.run(phrase, ['km', 'id', 'vi', 'ne', 'th']).then((out) => {
    eq('5개 언어가 전부 돌아온다', out.results.length, 5);
    ok('전부 성공', out.results.every((r) => r.ok));
    ok('한 번에 끝났다 (tries=1)', out.results.every((r) => r.tries === 1));
    ok('뜻이 뒤집히지 않았다', out.results.every((r) => r.flipped === false));
    ok('아무도 사람에게 올라가지 않았다', out.results.every((r) => r.escalated === false));
    eq('언어 5개 × (번역+역번역) = 10번 불렀다', t.calls.length, 10);

    const saved = t.win.Agent.toTranslation(out.results[0]);
    eq('★ 저장 상태는 언제나 waiting', saved.status, 'waiting');
    eq('몇 번 만에 됐는지 남는다', saved.agent.tries, 1);
    eq('모델 이름이 남는다', saved.agent.model, 'gemini-3.1-flash-lite');
    ok('판정한 때가 남는다', typeof saved.agent.at === 'string' && saved.agent.at.length > 10);
    ok('★ 사람 판정(judged)은 에이전트가 만들지 않는다', !('judged' in saved));
  });
}

/* =================================================================
   2. 비정상 — AI 가 "검수 완료" 라고 우겨도 (경계 1) — STC-E16-002
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣지 마십시오.', { status: 'reviewed', judged: { by: 'ai' } }));

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    ok('성공은 했다', r.ok);
    ok('★ 결과에 status 를 담지 않는다', !('status' in r));
    const saved = t.win.Agent.toTranslation(r);
    eq('★★ AI 가 reviewed 를 보내와도 waiting 으로 저장된다', saved.status, 'waiting');
    ok('★ AI 가 보낸 judged 를 그대로 옮기지 않는다',
      !saved.judged || saved.judged.by !== 'ai');
  });
}

/* =================================================================
   3. 비정상 — 악성 출력 (경계 4) — STC-E16-003
   ================================================================= */
{
  const t = open();
  const EVIL = '<img src=x onerror=window.__pwned=1>';
  fake(t, pair(EVIL, '롤러에 손을 넣지 마십시오.'));

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('글자를 지우거나 바꾸지 않는다 (판단은 사람이 한다)', r.text, EVIL);

    /* 화면에 넣을 때 실행되지 않아야 한다 — textContent 로만 넣는다 */
    const box = t.win.document.createElement('div');
    box.textContent = r.text;
    t.win.document.body.appendChild(box);
    eq('★ 글자 그대로 보인다', box.textContent, EVIL);
    eq('★★ 태그로 해석되지 않는다 (자식 요소 0개)', box.children.length, 0);
    ok('★★ 스크립트가 실행되지 않았다', t.win.__pwned === undefined);
  });
}

/* =================================================================
   4. 재시도해서 풀린 경우 — STC-E16-004
   ================================================================= */
{
  const t = open();
  /* 1번째 역번역만 뜻이 뒤집힌 채로 돌아온다 */
  fake(t, (n, url) => {
    if (url.indexOf('backtranslate') !== -1) {
      return { body: { back: n === 1 ? '롤러에 손을 넣어도 됩니다.' : '롤러에 손을 넣지 마십시오.' } };
    }
    return { body: { text: 'កុំដាក់ដៃ', model: 'gemini-3.1-flash-lite' } };
  });

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    ok('끝내 성공했다', r.ok);
    eq('두 번 만에 됐다', r.tries, 2);
    eq('마지막 판정은 뒤집히지 않음', r.flipped, false);
    eq('사람에게 올라가지 않았다', r.escalated, false);
    eq('번역 2번 + 역번역 2번 = 4번', t.calls.length, 4);

    const retry = t.calls[2].body;
    eq('재시도는 attempt 1 로 보낸다', retry.attempt, 1);
    eq('★ 되돌린 문장을 힌트로 준다', retry.hint, '롤러에 손을 넣어도 됩니다.');
    eq('첫 시도에는 힌트가 없었다', t.calls[0].body.hint, '');
  });
}

/* =================================================================
   5. 사람에게 올림 — 상한을 넘지 않는다 (경계 2) — STC-E16-005
   ================================================================= */
{
  const t = open();
  /* 몇 번을 해도 뜻이 뒤집힌 채로 돌아온다 */
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣어도 됩니다.'));

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    ok('실패가 아니라 결과는 있다', r.ok);
    eq('★★ 사람에게 올린다', r.escalated, true);
    eq('마지막까지 뒤집혀 있었다', r.flipped, true);
    eq('세 번 시도했다 (첫 시도 + 재시도 2회)', r.tries, 3);
    eq('★★ 호출 6번에서 멈춘다 — 끝없이 부르지 않는다', t.calls.length, 6);
    eq('재시도 상한은 2', t.win.Agent.MAX_RETRY, 2);

    const saved = t.win.Agent.toTranslation(r);
    eq('올린 것도 waiting 으로 저장된다', saved.status, 'waiting');
    eq('올렸다는 사실이 남는다', saved.agent.escalated, true);
    ok('★ 번역문을 버리지 않는다 — 사람이 고쳐 쓸 재료다', !!saved.text);
  });
}

/* =================================================================
   6. 올린 언어는 사람이 직접 넣기 전에는 승인될 수 없다 (경계 6) — STC-E16-006
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣어도 됩니다.'));

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    const saved = t.win.Agent.toTranslation(r);
    ok('★ 에이전트가 만드는 어떤 값도 reviewed 가 아니다',
      JSON.stringify(saved).indexOf('reviewed') === -1);
    ok('올림 표시가 화면에 전달된다 (화면이 승인을 막을 근거)', saved.agent.escalated === true);
  });
  // 화면에서 실제로 [승인] 을 막는 것은 T7 (운영자 화면) 에서 검사한다
}

/* =================================================================
   7. 이미 승인된 언어는 다시 번역하지 않는다 (경계 5) — STC-E16-007
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣지 마십시오.'));

  const mixed = {
    id: 'p-2',
    ko: KO,
    translations: {
      km: { text: '사람이 승인한 번역', status: 'reviewed' },
      id: { text: '아직 대기', status: 'waiting' },
    },
  };

  eq('승인된 언어를 알아본다', t.win.Agent.isReviewed(mixed, 'km'), true);
  eq('대기 중인 언어는 아니다', t.win.Agent.isReviewed(mixed, 'id'), false);

  t.win.Agent.run(mixed, ['km', 'id', 'vi']).then((out) => {
    eq('★ 승인된 크메르어는 건너뛴다', out.skipped.join(','), 'km');
    eq('나머지 두 언어만 돌린다', out.results.length, 2);
    ok('크메르어는 결과에 없다', out.results.every((r) => r.lang !== 'km'));
    eq('언어 2개 × 2단계 = 4번만 불렀다', t.calls.length, 4);
    ok('★ 사람이 승인한 번역을 덮어쓰지 않는다', mixed.translations.km.text === '사람이 승인한 번역');
  });
}

/* =================================================================
   8. 역번역에 한국어 원문을 주지 않는다 (대조가 무의미해진다)
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣지 마십시오.'));

  t.win.Agent.runLang(phrase, 'km').then(() => {
    const back = t.calls.find((c) => c.url.indexOf('backtranslate') !== -1);
    ok('★★ 역번역 요청 어디에도 한국어 원문이 없다',
      JSON.stringify(back.body).indexOf(KO) === -1);
    eq('역번역에는 번역문만 보낸다', back.body.text, 'កុំដាក់ដៃ');
    eq('언어는 알려 준다', back.body.lang, 'km');
    ok('ko 칸 자체가 없다', !('ko' in back.body));
  });
}

/* =================================================================
   9. 통과 문구는 헤더로 가고 저장소에 남지 않는다 (A02 §5.6)
   ================================================================= */
{
  const t = open();
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣지 마십시오.'));

  t.win.Agent.runLang(phrase, 'km').then(() => {
    eq('X-Agent-Pass 헤더로 보낸다', t.calls[0].init.headers['X-Agent-Pass'], PASS);
    ok('★ 통과 문구를 localStorage 에 쓰지 않는다 (탭을 닫으면 사라져야 한다)',
      JSON.stringify(t.win.localStorage).indexOf(PASS) === -1);
  });

  const t2 = open();
  t2.win.sessionStorage.removeItem('safety.agentPass');
  ok('문구가 없으면 이유를 알려 준다', /통과 문구/.test(t2.win.Agent.blockedReason()));
  t2.win.Agent.run(phrase, ['km']).then((out) => {
    eq('문구 없이 부르지 않는다', t2.calls.length, 0);
    eq('이유를 담아 돌려준다', out.results[0].code, 'pass_required');
    ok('★ 버튼을 조용히 숨기는 대신 이유를 준다', !!out.results[0].message);
  });
}

/* =================================================================
   10. 비정상 — AI 실패 (경계 3) — STC-E19-002
   ================================================================= */
{
  /* 10-1. 서버가 끊겼다 */
  const t = open();
  fake(t, () => ({ reject: true }));
  t.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('실패로 돌아온다', r.ok, false);
    eq('끊김으로 적힌다', r.code, 'network');
    ok('★ 사람이 읽을 이유가 있다 (손 입력 칸을 연다)', /닿지 못했습니다/.test(r.message));
  });

  /* 10-2. 서버가 오류 코드를 줬다 — 그 이유를 그대로 전한다 */
  const t2 = open();
  fake(t2, () => ({ status: 429, body: { error: 'limit', message: '오늘 AI 사용 한도를 넘었습니다.' } }));
  t2.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('실패로 돌아온다', r.ok, false);
    eq('서버가 준 코드를 쓴다', r.code, 'limit');
    eq('★ 서버가 준 한국어 이유를 그대로 보여 준다', r.message, '오늘 AI 사용 한도를 넘었습니다.');
  });

  /* 10-3. 응답 모양이 이상하다 — AI 출력을 믿지 않는다 */
  const t3 = open();
  fake(t3, () => ({ body: { text: 12345 } }));
  t3.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('모양이 틀리면 실패', r.ok, false);
    eq('모양 오류로 적힌다', r.code, 'shape');
  });

  const t4 = open();
  fake(t4, (n, url) => (url.indexOf('backtranslate') !== -1
    ? { body: { back: '   ' } }
    : { body: { text: 'កុំដាក់ដៃ' } }));
  t4.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('역번역이 비어도 실패로 본다', r.ok, false);
    eq('모양 오류', r.code, 'shape');
  });

  /* 10-4. 인터넷이 끊겨 있다 */
  const t5 = open();
  Object.defineProperty(t5.win.navigator, 'onLine', { value: false, configurable: true });
  fake(t5, pair('x', 'y'));
  ok('끊김을 사람 말로 알려 준다', /인터넷이 끊겨/.test(t5.win.Agent.blockedReason()));
  t5.win.Agent.run(phrase, ['km', 'id']).then((out) => {
    eq('끊겨 있으면 부르지 않는다', t5.calls.length, 0);
    ok('언어마다 이유를 돌려준다', out.results.every((r) => r.code === 'offline'));
    ok('★ 손 입력으로 계속할 수 있게 이유를 준다', out.results.every((r) => !!r.message));
  });
}

/* =================================================================
   11. 25초를 넘기면 끊는다 (경계 3) — STC-E19-002
   ================================================================= */
{
  const t = open();
  eq('시간 상한은 25초', t.win.Agent.CALL_TIMEOUT_MS, 25000);

  /* 25초를 실제로 기다리지 않고, 그 타이머만 즉시 울리게 바꾼다.
     AbortController 가 실제로 요청을 끊는지를 보는 것이 목적이다. */
  const realSetTimeout = t.win.setTimeout;
  t.win.setTimeout = function (fn, ms) {
    return realSetTimeout(fn, ms === 25000 ? 0 : ms);
  };
  fake(t, () => ({ hang: true }));

  t.win.Agent.runLang(phrase, 'km').then((r) => {
    eq('시간 초과는 실패로 돌아온다', r.ok, false);
    eq('★ 시간 초과로 적힌다', r.code, 'timeout');
    ok('사람이 읽을 이유가 있다', /제시간에/.test(r.message));
    eq('★ 영원히 기다리지 않는다 — 한 번 부르고 끊었다', t.calls.length, 1);
  });
}

/* =================================================================
   15. 문구 하나가 쓸 수 있는 호출에 천장이 있다 (T8 · FR-AD-03-09 · A02 §6.4)
   ================================================================= */
{
  const t = open();
  eq('천장은 30번 (언어 5 × 2단계 × 3시도)', t.win.Agent.MAX_CALLS_PER_PHRASE, 30);

  /* 5개 언어가 전부 사람에게 올라가는 최악의 경우 = 딱 30번 */
  fake(t, pair('កុំដាក់ដៃ', '롤러에 손을 넣어도 됩니다.'));
  t.win.Agent.run(phrase, ['km', 'id', 'vi', 'ne', 'th']).then((out) => {
    eq('★★ 최악의 경우에도 30번을 넘지 않는다', t.calls.length, 30);
    ok('다섯 언어 모두 사람에게 올라갔다', out.results.every((r) => r.ok && r.escalated));
    eq('지갑을 다 썼다', out.callsLeft, 0);
  });

  /* ★ 언어가 늘어도 천장은 그대로다 — 설정 사고로 요금이 터지지 않게 */
  const t2 = open();
  fake(t2, pair('x', '손을 넣어도 됩니다.'));
  t2.win.Agent.run(phrase, ['km', 'id', 'vi', 'ne', 'th', 'km', 'id', 'vi']).then((out) => {
    ok('★★ 언어를 8개로 늘려도 30번에서 멈춘다', t2.calls.length <= 30, t2.calls.length + '번');
    ok('천장에 걸린 언어는 이유를 받는다',
      out.results.some((r) => !r.ok && r.code === 'budget'));
    ok('★ 천장에 걸려도 손 입력으로 이어 갈 수 있게 이유를 준다',
      out.results.filter((r) => r.code === 'budget').every((r) => /직접 입력/.test(r.message)));
  });

  /* 지갑을 작게 주면 그만큼만 쓴다 */
  const t3 = open();
  fake(t3, pair('x', '롤러에 손을 넣지 마십시오.'));
  const small = t3.win.Agent.newBudget(1);
  t3.win.Agent.runLang(phrase, 'km', null, small).then((r) => {
    eq('지갑이 1이면 역번역 전에 멈춘다', t3.calls.length, 1);
    eq('실패로 돌아온다', r.ok, false);
    eq('천장 때문이라고 적는다', r.code, 'budget');
  });

  const t4 = open();
  fake(t4, pair('x', '롤러에 손을 넣지 마십시오.'));
  const none = t4.win.Agent.newBudget(0);
  t4.win.Agent.runLang(phrase, 'km', null, none).then((r) => {
    eq('★ 지갑이 비었으면 한 번도 부르지 않는다', t4.calls.length, 0);
    eq('천장 때문이라고 적는다', r.code, 'budget');
  });
}

/* =================================================================
   17. 언어를 한꺼번에 몰아치지 않는다 (T9 실측에서 공급사 429 를 맞았다)
   ================================================================= */
{
  const t = open();
  ok('출발 간격이 상수로 한 곳에 있다', typeof t.win.Agent.STAGGER_MS === 'number');
  ok('간격이 0 보다 크다', t.win.Agent.STAGGER_MS > 0, t.win.Agent.STAGGER_MS + 'ms');

  const started = [];
  const t2 = open();
  t2.win.fetch = function (url, init) {
    const body = JSON.parse(init.body);
    if (body.ko) started.push({ lang: body.lang, at: Date.now() });
    t2.calls.push({ url: String(url), init, body });
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(String(url).indexOf('backtranslate') !== -1
        ? { back: '롤러에 손을 넣지 마십시오.' }
        : { text: 'កុំដាក់ដៃ', model: 'm' }),
    });
  };

  t2.win.Agent.run(phrase, ['km', 'id', 'vi', 'ne', 'th']).then(() => {
    eq('언어 5개가 전부 출발했다', started.length, 5);
    const span = started[started.length - 1].at - started[0].at;
    ok('★ 마지막 언어가 늦게 출발한다 (한꺼번에 쏘지 않는다)',
      span >= t2.win.Agent.STAGGER_MS * 3, span + 'ms');
    ok('그래도 전체는 몇 초 안에 끝난다 (줄 세우는 것이 아니다)',
      span < t2.win.Agent.STAGGER_MS * 6, span + 'ms');
  });

  /* 한 언어만 돌릴 때는 기다리지 않는다 */
  const t3 = open();
  fake(t3, pair('x', '롤러에 손을 넣지 마십시오.'));
  const before = Date.now();
  t3.win.Agent.runLang(phrase, 'km').then(() => {
    ok('한 언어는 곧바로 출발한다', Date.now() - before < t3.win.Agent.STAGGER_MS);
  });
}

/* =================================================================
   16. file:// 로 열면 배포 주소로 부른다 (T8 · C06 D-019 · C08 §7)
   ================================================================= */
{
  const t = open();
  /* agent.js 는 location.protocol 을 보고 고른다. 하네스는 https 로 띄운다. */
  eq('https 로 열면 상대 경로', t.win.Agent.apiUrl('/api/translate'), '/api/translate');

  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
  ok('★ file: 일 때만 배포 주소를 붙인다', /location\.protocol === 'file:'/.test(code));
  ok('그 밖에는 같은 출처를 부른다 (제3자 요청 0건)',
    /\(file \? API_BASE : ''\)/.test(code));

  /* 서버 쪽 짝 — file:// 의 Origin: null 은 허용을 켰을 때만 통과한다 */
  const shared = fs.readFileSync(path.join(ROOT, 'api/_shared.mjs'), 'utf8');
  ok('★ 서버는 ALLOW_FILE_ORIGIN=1 일 때만 null 출처를 받는다',
    /ALLOW_FILE_ORIGIN.*===.*'1'/.test(shared));
  ok('★ 시연 기간에만 켠다고 적어 두었다', /시연 기간에만/.test(shared));
}

/* =================================================================
   12. 키가 브라우저 코드에 없다 (경계 7) — STC-E19-001
   ================================================================= */
{
  const fs = require('fs');
  const path = require('path');

  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

  const files = walk(SRC).filter((f) => /\.(js|html)$/.test(f));
  const offenders = files.filter((f) => /AIza[0-9A-Za-z_-]{10,}/.test(fs.readFileSync(f, 'utf8')));
  eq('★★ src/ 어디에도 Gemini 키가 없다 (키는 서버 환경변수에만)', offenders.join(', '), '');

  const agent = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
  ok('에이전트가 키를 다루지 않는다', !/GEMINI|api[_-]?key/i.test(agent));
  ok('에이전트가 공급사 주소를 직접 부르지 않는다', !/googleapis|generativelanguage/.test(agent));
  ok('★ 에이전트가 reviewed 를 만들지 않는다', !/['"]reviewed['"]\s*[,;)]/.test(agent.replace(/'reviewed'/g, (m, i) =>
    /isReviewed|status === /.test(agent.slice(Math.max(0, i - 40), i)) ? 'X' : m)));
  ok('localStorage 를 직접 부르지 않는다 (Store 를 거친다)',
    !/localStorage/.test(agent.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('ES 모듈을 쓰지 않는다 (file:// 에서 막힌다)', !/^\s*(import|export)\s/m.test(agent));
  ok('innerHTML 을 쓰지 않는다', !/innerHTML/.test(agent));
}

/* =================================================================
   13. file:// 로 열면 배포 주소로 부른다 (C06 D-019 · C08 §7)
   ================================================================= */
{
  const t = open();
  ok('같은 출처면 상대 경로로 부른다', t.win.Agent.apiUrl('/api/translate') === '/api/translate');
  ok('배포 주소가 맨 위 상수로 한 곳에 있다', /^https:\/\//.test(t.win.Agent.API_BASE));

  const fs = require('fs');
  const path = require('path');
  const agent = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
  eq('API_BASE 는 한 번만 적혀 있다 (여기저기 박아 두지 않는다)',
    (agent.match(/https:\/\/2026-ax-ton\.vercel\.app/g) || []).length, 1);
}

/* =================================================================
   14. 화면에 실려 있는가 — 오프라인에서도 열려야 한다
   ================================================================= */
{
  const fs = require('fs');
  const path = require('path');

  const html = fs.readFileSync(path.join(SRC, 'admin/library.html'), 'utf8');
  ok('운영자 화면에 agent.js 가 실려 있다', html.indexOf('assets/agent.js') !== -1);
  ok('★ review.js 뒤에 실린다 (판정을 가져다 쓴다)',
    html.indexOf('assets/agent.js') > html.indexOf('assets/review.js'));

  const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  ok('★ 오프라인 목록에 담겨 있다', sw.indexOf("'assets/agent.js'") !== -1);
}

/* 시작한 것이 전부 끝난 뒤에 센다 (위 open() 참고).
   에이전트는 거절하지 않고 실패도 결과로 돌려주므로 Promise.all 이면 충분하다. */
Promise.all(pending).then(() => {
  ok('비동기 검사를 전부 기다렸다', pending.length > 0, pending.length + '건');
  setTimeout(() => report('AI 에이전트 — 경계 (가짜 응답)'), 0);
}, (e) => {
  ok('에이전트가 거절을 던지지 않는다 (실패도 결과로 돌려준다): ' + e.message, false);
  report('AI 에이전트 — 경계 (가짜 응답)');
});
