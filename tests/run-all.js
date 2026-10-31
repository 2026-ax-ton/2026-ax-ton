/* 검사 묶음을 전부 돌린다. 파일마다 별도 프로세스로 돌리는 이유는
   harness.js 의 통과 개수 카운터가 모듈 하나에 있어서,
   한 프로세스에서 여러 개를 require 하면 개수가 겹쳐 세어지기 때문이다. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;

// 회귀 검사를 맨 앞에 둔다. 여기서 깨지면 나머지를 볼 필요가 없다.
const FIRST = 'test-smoke.js';
const files = fs.readdirSync(here)
  .filter((f) => /^test-.+\.m?js$/.test(f))   // .mjs — /api 함수 검사 (T3)
  .sort((a, b) => (a === FIRST ? -1 : b === FIRST ? 1 : a.localeCompare(b)));

let failed = [];

files.forEach((f) => {
  const r = spawnSync(process.execPath, [path.join(here, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
});

console.log('\n=====================================');
console.log(`묶음 ${files.length}개 중 통과 ${files.length - failed.length}개`);
if (failed.length) {
  console.log('실패:', failed.join(', '));
  process.exitCode = 1;
} else {
  console.log('전부 통과.');
}
