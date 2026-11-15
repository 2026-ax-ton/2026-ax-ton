/* 공개 저장소에 **올리면 안 되는 것**이 올라가 있지 않은지 본다 — 두 가지다.

   1. 진짜 키 모양
      AI 호출은 돈이 나간다. 키가 한 번 커밋되면 지워도 기록에 남는다.
      키는 저장소 밖(`.env.local`, `.gitignore` 가 막는다)과 Vercel 환경변수에만 둔다.
      ★ 검사용 가짜 키(`AIzaSyFAKE…`)는 진짜 길이(AIza + 35자)가 아니라서 걸리지 않는다.
      ★ 로컬 `.git/hooks/pre-push` 가 같은 모양을 push 직전에 한 번 더 본다.

   2. 🆕 **남의 사이트 사진** (2026-11-15 추가)
      AI 조사(`/api/research`)가 찾아 오는 참고 사진은 **남의 저작물**이다.
      제품 쪽은 이미 막혀 있다 — 설비에 저장하지도 교육에 발급하지도 않는다.
      그런데 **실측 기록 파일**(`research/runs/*.json`)에 그림이 통째로 박힌 채
      공개 저장소에 올라간 적이 있다 (2026-11-15 발견, 4장 제거).
      출처(`page`·`host`·`alt`)는 남기고 **그림 자체(`data`)만** 두지 않는다.

      ★ 우리가 만든 그림은 걸리지 않는다 — `page`·`host` 가 붙은 것만 본다
        (남의 쪽에서 가져온 표시다). 설비 사진·보기 그림·박스 그린 사진은 그대로 둔다.
      ★ `research/photos/` 의 Wikimedia 사진은 자유 이용이고 `CREDITS.md` 에
        작가·라이선스가 적혀 있다 — 여기서 막는 대상이 아니다. */

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

/* ── 🆕 남의 사이트 사진이 박혀 있지 않은가 ───────────────────────────── */
const borrowed = [];
for (const f of files) {
  if (!/\.json$/.test(f)) continue;
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  } catch (e) { continue; }

  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    /* `page`·`host` 가 붙어 있으면 남의 쪽에서 가져온 그림이다 */
    if (typeof node.data === 'string' && node.data.startsWith('data:image')
        && (node.page || node.host)) {
      borrowed.push(f + ' — ' + (node.host || node.page));
      return;
    }
    Object.keys(node).forEach((k) => walk(node[k]));
  };
  walk(doc);
}
ok('★★ 남의 사이트 사진이 저장소에 박혀 있지 않다 (출처만 남긴다)',
  borrowed.length === 0, borrowed.join(', '));

report('저장소에 올리면 안 되는 것 — 키 · 남의 사진');
