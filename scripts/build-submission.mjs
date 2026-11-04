/* 제출본(현장 시연 HTML)을 찍어 낸다 — C06 D-034 ② · C08 §7.1 · 07 T16

   왜 빌드가 필요한가

     2026-11-03 개정 공지는 **팀이 직접 운영하는 백엔드와 통신하는 방식**을 막고
     (제출본이 우리 Vercel `/api` 를 부르면 실격), 대신 **AI 모델 API 를 HTML 에서
     직접 호출하는 것**은 허용했다. 그래서 제출본에는
       ① 우리 서버를 부르지 않는 `src/` 그대로 + ② Gemini 를 직접 부르는 조각 한 장
     이 들어간다. ②에는 **키가 들어가므로 저장소에 둘 수 없다.**
     그 한 장을 여기서 만들어 `submission/`(`.gitignore` 됨)에 넣는다.

   쓰는 법 (저장소 루트에서)

       node scripts/build-submission.mjs              → submission/
       node scripts/build-submission.mjs <출력폴더>    → 다른 자리에 찍는다

     키는 **대화나 명령줄에 남기지 않는다.** 저장소 루트 `.env.local` 에 적는다
     (`.gitignore` 가 `.env.*` 를 막는다):

       GEMINI_HACKATHON_KEY=<해커톤용 임시 키>

     ★ 이름이 서버의 `GEMINI_API_KEY` 와 **일부러 다르다.** 운영 키가 제출본에
       섞여 들어가는 사고를 이름으로 막는다. 임시 키를 새로 발급하고
       **행사 뒤 폐기**한다 (개정 공지 권고 · A04 6-2).

     모델을 바꾸려면 (기본은 C06 D-028 의 `gemini-3.1-flash-lite`):

       AI_MODEL_TRANSLATE=…
       AI_MODEL_BACK=…

   무엇이 들어가나

     submission/                    `src/` 전체 사본 (빌드 없음·상대 경로 그대로)
       assets/submission-ai.js      ← 여기서 만든다. 키·지시문이 들어 있다
       admin/library.html           ← 그 한 장만 위 조각을 싣는다

     ★ 노동자 화면 6개에는 넣지 않는다 — 제출본에서도 제3자 요청 0건이다.
     ★ AI 지시문은 `api/translate.mjs`·`api/backtranslate.mjs` 의 `systemText` 를
       **그대로 불러 뽑는다.** 두 곳에 베끼지 않는다 (`tests/test-submission.mjs`
       가 서버와 제출본의 지시문이 같은지 본다).
   ============================================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANG_NAMES } from '../api/_shared.mjs';
import { systemText as translateSystem } from '../api/translate.mjs';
import { systemText as backSystem } from '../api/backtranslate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
/* 출력 폴더. 기본은 `submission/` 이고, 인자로 다른 자리를 줄 수 있다 —
   검사(`tests/test-submission.mjs`)는 임시 폴더에 찍는다. 그러지 않으면
   **검사가 진짜 제출본을 가짜 키로 덮어쓴다.** */
const OUT = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(ROOT, 'submission');
const TEMPLATE = path.join(ROOT, 'scripts', 'submission-ai.template.js');

/* 조각을 싣는 화면 — 운영자(문구 검수) 화면 한 장뿐이다.
   관리자·노동자 화면은 AI 를 부르지 않는다 (C06 D-002·D-025). */
const AI_PAGE = 'admin/library.html';
const SHIM_REL = 'assets/submission-ai.js';

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';   // C06 D-028

/* ── .env.local 읽기 (의존성 0 — measure-ai.mjs 와 같은 방법) ──────── */

function readEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  });
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const KEY = (env.GEMINI_HACKATHON_KEY || '').trim();
const MODEL_TRANSLATE = (env.AI_MODEL_TRANSLATE || DEFAULT_MODEL).trim();
const MODEL_BACK = (env.AI_MODEL_BACK || DEFAULT_MODEL).trim();

if (!KEY) {
  console.error('GEMINI_HACKATHON_KEY 가 없다. 위 주석대로 .env.local 에 적는다.');
  console.error('★ 운영 키(GEMINI_API_KEY)를 쓰지 않는다 — 해커톤용 임시 키를 새로 발급한다.');
  process.exit(1);
}
/* 키 값은 화면·로그에 찍지 않는다 (STC-E19-001 과 같은 원칙).
   생긴 모양만 본다 — 통째로 빠뜨린 것과 잘못 붙여넣은 것을 구분해 준다. */
if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(KEY)) {
  console.error('GEMINI_HACKATHON_KEY 가 Gemini 키 모양이 아니다 (AIza… 로 시작하는 한 줄).');
  process.exit(1);
}

/* ── 지시문을 서버에서 그대로 뽑는다 ──────────────────────────────── */

/* 빈칸 이름으로 한 번 불러, 언어명·힌트가 들어갈 자리를 표시해 둔다.
   제출본 조각이 실행 중에 그 자리를 채운다. */
const SYS_TRANSLATE = translateSystem('__LANG__', '');
const SYS_TRANSLATE_FULL = translateSystem('__LANG__', '__HINT__');
const SYS_TRANSLATE_RETRY = SYS_TRANSLATE_FULL.slice(SYS_TRANSLATE.length);
const SYS_BACK = backSystem('__LANG__');

if (!SYS_TRANSLATE_FULL.startsWith(SYS_TRANSLATE) || !SYS_TRANSLATE_RETRY) {
  console.error('지시문 모양이 바뀌었다 — api/translate.mjs 의 systemText 를 확인한다.');
  process.exit(1);
}

/* ── src/ 를 그대로 복사한다 ──────────────────────────────────────── */

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((e) => {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  });
}

/* 지우기 전에 어디를 지우는지 본다 — 실수로 `src/` 나 저장소 루트를 주면 막는다 */
if (OUT === ROOT || OUT === SRC || !path.resolve(OUT).startsWith(path.parse(OUT).root)) {
  console.error('출력 폴더가 위험하다: ' + OUT);
  process.exit(1);
}
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
copyDir(SRC, OUT);

/* ── 조각을 찍어 낸다 ────────────────────────────────────────────── */

const template = fs.readFileSync(TEMPLATE, 'utf8');
const filled = template
  .replace("'__GEMINI_KEY__'", JSON.stringify(KEY))
  .replace("'__MODEL_TRANSLATE__'", JSON.stringify(MODEL_TRANSLATE))
  .replace("'__MODEL_BACK__'", JSON.stringify(MODEL_BACK))
  .replace('__LANG_NAMES__', JSON.stringify(LANG_NAMES))
  .replace('__SYS_TRANSLATE_RETRY__', JSON.stringify(SYS_TRANSLATE_RETRY))
  .replace('__SYS_TRANSLATE__', JSON.stringify(SYS_TRANSLATE))
  .replace('__SYS_BACK__', JSON.stringify(SYS_BACK));

/* 빌드가 채우는 빈칸만 본다. `__LANG__`·`__HINT__` 는 **실행 중에** 채우는
   자리라 그대로 남아 있어야 한다 (지시문 안의 언어명·앞 역번역). */
const BUILD_BLANKS = ['__GEMINI_KEY__', '__MODEL_TRANSLATE__', '__MODEL_BACK__',
  '__LANG_NAMES__', '__SYS_TRANSLATE__', '__SYS_TRANSLATE_RETRY__', '__SYS_BACK__'];
const left = BUILD_BLANKS.filter((name) => filled.indexOf(name) !== -1);
if (left.length) {
  console.error('빈칸이 남았다: ' + left.join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(OUT, SHIM_REL), filled, 'utf8');

/* ── 운영자 화면 한 장에만 싣는다 ────────────────────────────────── */

const pagePath = path.join(OUT, AI_PAGE);
let page = fs.readFileSync(pagePath, 'utf8');
const anchor = '<script src="../assets/agent.js"></script>';
if (page.indexOf(anchor) === -1) {
  console.error(AI_PAGE + ' 에서 agent.js 를 싣는 줄을 찾지 못했다.');
  process.exit(1);
}
/* agent.js **뒤**에 둔다 — Net 과 Agent 가 이미 올라와 있어야 갈아 끼울 수 있다 */
page = page.replace(anchor, anchor + '\n<script src="../' + SHIM_REL + '"></script>');
fs.writeFileSync(pagePath, page, 'utf8');

/* ── 사람이 할 일을 적어 준다 ────────────────────────────────────── */

/* 윈도의 `\` 를 `/` 로 바꿔 적는다 — 문서·메시지에서는 한 가지 모양만 쓴다 */
const outRel = path.relative(ROOT, OUT).split(path.sep).join('/');

console.log('제출본을 만들었다 → ' + outRel + '/');
console.log('  조각 1장: ' + SHIM_REL + ' (운영자 화면 ' + AI_PAGE + ' 에만 실린다)');
console.log('  모델: 번역 ' + MODEL_TRANSLATE + ' · 역번역 ' + MODEL_BACK);
console.log('');
console.log('손으로 확인할 것 (C08 §7.1 · D07 STC-E15-003)');
console.log('  1. ' + outRel + '/index.html 을 빈 크롬에서 더블클릭한다');
console.log('  2. 개발자도구 네트워크 탭 — 우리 서버(2026-ax-ton.vercel.app) 요청이 0건이어야 한다');
console.log('  3. 운영자(oper@safety.kr / 1234) → 문구 → [AI 번역 받기] 가 실제로 돈다');
console.log('     (여기서는 generativelanguage.googleapis.com 만 보인다 — 공지가 허용한 길)');
console.log('  4. 노동자(W-4821-07 / 1234) → 수강·이해도 검증·증빙까지 요청 0건으로 끝까지 된다');
console.log('');
console.log('★ 키가 출력 폴더 안에 들어 있다. `submission/` 은 저장소에 커밋되지 않지만(.gitignore),');
console.log('  메일로 내보내는 파일이다 — 해커톤용 임시 키만 쓰고 행사 뒤 폐기한다 (A04 6-2).');
