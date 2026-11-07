/* 제출본 빌드 — scripts/build-submission.mjs (C06 D-034 ② · C08 §7.1 · 07 T16).

   왜 이 묶음이 있나

     2026-11-03 개정 공지는 **팀이 직접 운영하는 백엔드와 통신하는 방식**을 막고
     (우리 Vercel `/api` 호출 → 실격), **AI 모델 API 직접 호출**은 허용했다.
     그래서 제출본만 Gemini 를 브라우저에서 직접 부른다. 그 조각에는 **키**가
     들어간다 — 잘못 두면 `src/` 나 저장소에 키가 새고, 노동자 화면의
     「제3자 요청 0건」도 깨진다.

   이 묶음이 지키는 것

     1. ★★ 키와 공급사 호출 코드가 **`src/` 안에 없다** (틀은 `scripts/` 에 있다)
     2. ★★ 빌드 출력(`submission/`)은 **저장소에 올라가지 않는다** (`.gitignore`)
     3. ★ 키 없이는 빌드가 **돌지 않는다**. 운영 키 이름(`GEMINI_API_KEY`)이 아니라
        **해커톤용 임시 키 이름**(`GEMINI_HACKATHON_KEY`)만 본다
     4. ★★ 조각은 **운영자 화면 한 장**에만 실린다 — 노동자 화면 6개는 제출본에서도
        제3자 요청 0건이다 (C06 D-002·D-025)
     5. ★ AI 지시문이 **서버와 글자까지 같다** — 두 곳에 베끼지 않는다
     6. ★ 조각이 가로채는 길은 번역·역번역 **둘뿐**이고, 역번역에 한국어 원문을
        주지 않는다 (A02 §5.4)
     7. 제출본도 배포본과 같은 경계를 지킨다 — 승인 상태(`status`)를 만들지 않고,
        실패하면 이유를 담아 손 입력으로 보낸다

   근거: C06 D-034 · C08 §7.1 · A02 §5.2~§5.4 · PRD-AD-03 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ok, eq, has, report, ROOT } = require('./harness');

const SRC = path.join(ROOT, 'src');
const SCRIPT = path.join(ROOT, 'scripts/build-submission.mjs');
const TEMPLATE = path.join(ROOT, 'scripts/submission-ai.template.js');

const buildSrc = fs.readFileSync(SCRIPT, 'utf8');
const templateSrc = fs.readFileSync(TEMPLATE, 'utf8');
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

/* 실제 키가 아니다. 모양만 맞춘 가짜다 — 빌드는 모양만 본다 */
const FAKE_KEY = 'AIza' + 'TESTONLYnotarealkey_0123456789';

/* =================================================================
   1. 키와 공급사 호출이 src/ 밖에 있다
   ================================================================= */
{
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk(SRC).filter((f) => /\.(js|html|css)$/.test(f));

  const withKey = files.filter((f) => /AIza[0-9A-Za-z_-]{10,}/.test(fs.readFileSync(f, 'utf8')));
  eq('★★ src/ 어디에도 키가 없다', withKey.join(', '), '');

  const withVendor = files.filter((f) =>
    /googleapis|generativelanguage/.test(fs.readFileSync(f, 'utf8')));
  eq('★★ src/ 어디에도 공급사 주소가 없다', withVendor.join(', '), '');

  ok('★ 제출본 조각의 틀은 scripts/ 에 있다 (src/ 가 아니다)', fs.existsSync(TEMPLATE));
  ok('★ 틀에는 키가 아니라 빈칸이 들어 있다',
    templateSrc.indexOf('__GEMINI_KEY__') !== -1
    && !/AIza[0-9A-Za-z_-]{10,}/.test(templateSrc));
  ok('왜 src/ 밖인지 틀에 적어 두었다', /src\/` 안에 없다|src\/ 안에 없다/.test(templateSrc));
}

/* =================================================================
   2. 빌드 출력은 저장소에 올라가지 않는다
   ================================================================= */
{
  ok('★★ .gitignore 가 submission/ 을 막는다', /^submission\/$/m.test(gitignore));
  ok('.gitignore 가 .env.* 도 막는다 (키를 적는 곳)', /^\.env\.\*$/m.test(gitignore));
  ok('왜 막는지 적어 두었다', /submission/.test(gitignore) && /키/.test(gitignore));
}

/* =================================================================
   3. 키 없이는 빌드가 돌지 않는다
   ================================================================= */
{
  /* `.env.local` 이 개인 PC 에 있을 수 있어서, 환경변수를 빈 값으로 덮고
     읽을 `.env.local` 이 없는 빈 폴더에서 돌린다 */
  const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'subm-'));
  const noKey = spawnSync(process.execPath, [SCRIPT], {
    cwd: empty,
    env: { ...process.env, GEMINI_HACKATHON_KEY: '' },
    encoding: 'utf8',
  });
  ok('★ 키가 없으면 빌드가 실패한다', noKey.status !== 0);
  has('★ 무엇을 해야 하는지 알려 준다', noKey.stderr, 'GEMINI_HACKATHON_KEY');
  has('★ 운영 키를 쓰지 말라고 적어 준다', noKey.stderr, '임시 키');

  const badKey = spawnSync(process.execPath, [SCRIPT], {
    cwd: empty,
    env: { ...process.env, GEMINI_HACKATHON_KEY: 'not-a-key' },
    encoding: 'utf8',
  });
  ok('★ 키 모양이 아니면 빌드가 실패한다', badKey.status !== 0);
  ok('★ 실패 메시지에 키 값을 그대로 찍지 않는다',
    (badKey.stderr + badKey.stdout).indexOf('not-a-key') === -1);

  ok('★ 빌드가 운영 키 이름을 쓰지 않는다',
    buildSrc.indexOf('GEMINI_HACKATHON_KEY') !== -1
    && !/env\.GEMINI_API_KEY|env\[.GEMINI_API_KEY/.test(buildSrc));

  /* 출력 폴더를 저장소 루트나 src/ 로 주면 지우지 않고 막는다 */
  const danger = spawnSync(process.execPath, [SCRIPT, SRC], {
    cwd: ROOT,
    env: { ...process.env, GEMINI_HACKATHON_KEY: FAKE_KEY },
    encoding: 'utf8',
  });
  ok('★★ 출력 폴더로 src/ 를 주면 거부한다 (지우기 전에 본다)', danger.status !== 0);
  ok('★★ src/ 가 그대로 남아 있다', fs.existsSync(path.join(SRC, 'index.html')));
  fs.rmSync(empty, { recursive: true, force: true });
}

/* =================================================================
   4. 실제로 한 번 찍어 본다 — 가짜 키로, **임시 폴더에**

   ★ `submission/` 에 찍으면 검사가 진짜 제출본을 가짜 키로 덮어쓴다.
     그래서 빌드에 출력 폴더 인자를 두었고, 여기서 그것을 쓴다.
   ================================================================= */
const OUT = fs.mkdtempSync(path.join(require('os').tmpdir(), 'subm-out-'));
const built = spawnSync(process.execPath, [SCRIPT, OUT], {
  cwd: ROOT,
  env: { ...process.env, GEMINI_HACKATHON_KEY: FAKE_KEY },
  encoding: 'utf8',
});
ok('★ 가짜 키로도 빌드가 끝까지 돈다', built.status === 0, built.stderr);
ok('★ 빌드가 키 값을 화면에 찍지 않는다',
  (built.stdout + built.stderr).indexOf(FAKE_KEY) === -1);
has('★ 사람이 손으로 볼 것을 알려 준다', built.stdout, '네트워크');

const shimPath = path.join(OUT, 'assets/submission-ai.js');
const shim = fs.existsSync(shimPath) ? fs.readFileSync(shimPath, 'utf8') : '';

{
  ok('제출본이 만들어졌다', fs.existsSync(path.join(OUT, 'index.html')));
  ok('조각이 만들어졌다', !!shim);
  ok('빈칸이 남아 있지 않다', shim.indexOf('__GEMINI_KEY__') === -1);
  ok('★ 조각 안에 키가 들어 있다 (제출본은 스스로 돌아야 한다)',
    shim.indexOf(FAKE_KEY) !== -1);
  ok('★ 조각이 공급사를 직접 부른다 (공지가 허용한 길)',
    /generativelanguage/.test(shim) && /fetch\(/.test(shim));
  ok('★ 키를 주소가 아니라 헤더로 보낸다', /x-goog-api-key/.test(shim)
    && shim.indexOf('key=' + FAKE_KEY) === -1);
  ok('★ 하루 상한이 있다', /DAILY_LIMIT/.test(shim));
  ok('★ 시간 상한이 있다', /TIMEOUT_MS/.test(shim));
}

/* =================================================================
   5. 조각은 운영자 화면 한 장에만 실린다
   ================================================================= */
{
  const pages = fs.readdirSync(path.join(OUT, 'worker'))
    .filter((f) => f.endsWith('.html'))
    .concat(['../index.html', '../signup.html']);

  pages.forEach((name) => {
    const body = fs.readFileSync(path.join(OUT, 'worker', name), 'utf8');
    ok('★★ ' + name.replace('../', '') + ' 에는 조각이 실리지 않는다',
      body.indexOf('submission-ai.js') === -1);
    ok('★★ ' + name.replace('../', '') + ' 에 공급사 주소가 0건이다',
      !/googleapis|generativelanguage/.test(body));
  });

  const adminDir = path.join(OUT, 'admin');
  const loaded = fs.readdirSync(adminDir).filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(adminDir, f), 'utf8').indexOf('submission-ai.js') !== -1);
  eq('★★ 조각을 싣는 화면은 운영자 문구 화면 하나뿐이다', loaded.join(', '), 'library.html');

  const page = fs.readFileSync(path.join(adminDir, 'library.html'), 'utf8');
  ok('★ 조각은 agent.js 뒤에 실린다 (갈아 끼울 대상이 먼저 올라와야 한다)',
    page.indexOf('agent.js') < page.indexOf('submission-ai.js'));
}

/* =================================================================
   6. 지시문이 서버와 글자까지 같다 (두 곳에 베끼지 않는다)
   ================================================================= */
{
  const { systemText: tSys } = await import('../api/translate.mjs');
  const { systemText: bSys } = await import('../api/backtranslate.mjs');
  const { LANG_NAMES } = await import('../api/_shared.mjs');

  const pick = (name) => {
    const m = new RegExp('var ' + name + ' = (".*?");', 's').exec(shim);
    return m ? JSON.parse(m[1]) : null;
  };

  eq('★★ 번역 지시문이 서버와 같다', pick('SYS_TRANSLATE'), tSys('__LANG__', ''));
  eq('★★ 역번역 지시문이 서버와 같다', pick('SYS_BACK'), bSys('__LANG__'));
  eq('★ 재시도에 덧붙이는 말도 서버와 같다', pick('SYS_TRANSLATE_RETRY'),
    tSys('__LANG__', '__HINT__').slice(tSys('__LANG__', '').length));

  const names = JSON.parse(/var LANG_NAMES = (\{.*?\});/.exec(shim)[1]);
  eq('★ 언어 표도 서버의 고정 표를 그대로 쓴다',
    JSON.stringify(names), JSON.stringify(LANG_NAMES));
  ok('★ 언어명은 요청값이 아니라 이 표에서 꺼낸다',
    /LANG_NAMES\[body && body\.lang\]/.test(shim));
}

/* =================================================================
   7. 가로채는 길과 경계
   ================================================================= */
{
  ok('★★ 가로채는 길은 번역·역번역·사진 셋뿐이다',
    /'\/api\/translate'/.test(shim) && /'\/api\/backtranslate'/.test(shim)
    && /'\/api\/hazards'/.test(shim)
    && !/'\/api\/auth/.test(shim) && !/'\/api\/store'/.test(shim)
    && !/'\/api\/reports'/.test(shim));
  ok('★ 그 밖의 길은 원래 자리로 넘긴다 (로그인·동기화는 로컬 모드로 간다)',
    /realPost\(path, body, opts\)/.test(shim));
  ok('★★ 역번역에 한국어 원문을 주지 않는다 — `text` 만 넘긴다',
    /SYS_BACK\.replace\('__LANG__', name\),\s*\n?\s*\[\{ text: text \}\]/.test(shim));
  ok('★★ 승인 상태(status)를 만들지 않는다 — 승인은 사람만 한다',
    !/['"]approved['"]|['"]reviewed['"]/.test(shim));
  ok('★ 실패하면 이유를 담아 돌려준다 (버튼이 조용히 사라지지 않는다)',
    /failBody/.test(shim) && /직접 입력/.test(shim));
  ok('★ 한도·시간 초과·모델 오류를 구분한다',
    /limit/.test(shim) && /timeout/.test(shim) && /model/.test(shim));
  ok('★ AI 버튼을 살리는 자리는 한 칸이다 (Net.aiReady)',
    /Net\.aiReady = function/.test(shim));

  /* 갈아 끼울 칸이 `src/` 쪽에 실제로 있는지 — 없으면 조각이 헛돈다 */
  const net = fs.readFileSync(path.join(SRC, 'assets/net.js'), 'utf8');
  ok('★ net.js 에 aiReady() 가 있고 기본값은 onHttps() 다',
    /function aiReady\(\)/.test(net) && /return onHttps\(\);/.test(net));
  const agent = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
  ok('★ 에이전트가 그 칸을 본다', /Net\.aiReady\(\)/.test(agent));
}

fs.rmSync(OUT, { recursive: true, force: true });

/* =================================================================
   8. 🆕 사진 위험 지점 — 거르는 규칙을 **베끼지 않고 옮겼다** (T17 · D-027)
   ================================================================= */
{
  const rules = fs.readFileSync(path.join(ROOT, 'api/_hazards.mjs'), 'utf8');

  ok('★★ 거르는 규칙 소스가 조각 안에 들어 있다 (베끼지 않았다)',
    /function filterPoints\(/.test(shim) && /function parseModelJson\(/.test(shim)
    && /function overlapCount\(/.test(shim));

  /* 값이 서버와 같은지 — 숫자 하나가 달라지면 제출본의 경계가 느슨해진다 */
  const pick = (src, name) => (new RegExp('const ' + name + ' = ([^;]+);').exec(src) || [])[1];
  eq('★★ 위험유형 6종이 서버와 같다', pick(shim, 'HAZARDS'), pick(rules, 'HAZARDS'));
  eq('★★ 지점 상한이 서버와 같다 (§11 Q4)', pick(shim, 'MAX_POINTS'), pick(rules, 'MAX_POINTS'));
  eq('★ 이유 길이 상한도 같다', pick(shim, 'MAX_WHY'), pick(rules, 'MAX_WHY'));

  ok('★ 사진 지시문도 서버에서 뽑아 왔다 (6종이 박혀 있다)',
    /pinch, shock, fire, fall, choke, chemical/.test(shim));

  ok('★★ 사람·이름표가 찍히면 지점을 돌려주지 않는다 (FR-20)',
    /answer\.person === true/.test(shim) && /points: \[\]/.test(shim));
  ok('★ 사진은 inline_data 로 보낸다', /inline_data: \{ mime_type: mime, data: image \}/.test(shim));
  ok('★ 받는 형식이 서버와 같다 (jpeg·png·webp)',
    /PHOTO_MIMES = \['image\/jpeg', 'image\/png', 'image\/webp'\]/.test(shim));
  ok('★ base64 몸통만 받는다 (data: 머리를 고쳐 주지 않는다)', /BASE64\.test\(image\)/.test(shim));
  ok('★ 사진 응답도 JSON 이 아니면 손 흐름으로 보낸다',
    /직접 만드실 수 있습니다/.test(shim));

  /* 서버와 제출본이 같은 모양을 돌려주는지 — 부르는 쪽(화면)은 둘을 구분하지 않는다 */
  const api = fs.readFileSync(path.join(ROOT, 'api/hazards.mjs'), 'utf8');
  ['person', 'retake', 'points', 'dropped', 'overlaps', 'model'].forEach((k) => {
    ok('★ 응답 칸 「' + k + '」가 서버·제출본 양쪽에 있다',
      new RegExp(k + ':').test(api) && new RegExp(k + ':').test(shim));
  });
}

report('제출본 빌드 — 키는 저장소 밖, 조각은 운영자 화면 한 장');
