/* 저장소에 올라간 파일 전부에서 **진짜 키 모양**이 없는지 본다.

   왜 — AI 호출은 돈이 나간다. 키가 한 번 커밋되면 지워도 기록에 남는다.
   키는 저장소 밖(`.env.local`, `.gitignore` 가 막는다)과 Vercel 환경변수에만 둔다.

   ★ 검사용 가짜 키(`AIzaSyFAKE…`)는 진짜 길이(AIza + 35자)가 아니라서 걸리지 않는다.
   ★ 로컬 `.git/hooks/pre-push` 가 같은 모양을 push 직전에 한 번 더 본다. */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, report, ROOT } = require('./harness');

const PATTERNS = [
  ['Google API 키', /AIza[0-9A-Za-z_-]{35}/],
  ['Anthropic 키', /sk-ant-[0-9A-Za-z_-]{20,}/],
  ['OpenAI 키', /sk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ['GitHub 토큰', /gh[pousr]_[0-9A-Za-z]{30,}/],
  ['JWT(서비스 키 등)', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['비밀번호 든 DB 주소', /postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@[a-z]/],
];

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

ok('검사할 파일이 있다', files.length > 50, files.length);
ok('★★ .env 파일이 저장소에 없다 (.env.example 만 허용)',
  !files.some((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)));

const hits = [];
for (const f of files) {
  const abs = path.join(ROOT, f);
  let text;
  try {
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) continue;          // 이미지 같은 바이너리
    text = buf.toString('utf8');
  } catch (e) { continue; }
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) hits.push(f + ' — ' + name);
  }
}
ok('★★ 올라간 파일에 진짜 키 모양 문자열이 없다', hits.length === 0, hits.join(', '));

report('저장소 비밀값 검사');
