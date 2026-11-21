/* AI 조사·위치 찾기의 기다리는 시간 — 순서가 맞는가 (2026-11-21)

   밀링 조사가 45초 상한에 걸려 실패했다 → 늘렸다. 늘리다 순서가 뒤집히면 다시 조용히 끊긴다.
   지키는 것: AI 호출 상한 < 서버 함수 상한 ≤ 300초(Vercel) < 화면이 기다리는 시간 */
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, report } = require('./harness');

const research = await import('../api/research.mjs');
const hazards = await import('../api/hazards.mjs');
const src = (p) => fs.readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const num = (text, name) => Number((new RegExp('var ' + name + ' = ([0-9]+)').exec(text) || [])[1]);

const rFn = research.config.maxDuration * 1000, hFn = hazards.config.maxDuration * 1000;
ok('★ 조사 AI 상한(+참고 사진 12초)이 함수 상한 안', research.DEFAULT_RESEARCH_TIMEOUT_MS + 12000 < rFn, research.DEFAULT_RESEARCH_TIMEOUT_MS + ' / ' + rFn);
ok('★ 위치 찾기 AI 상한이 함수 상한 안', hazards.DEFAULT_HAZARD_TIMEOUT_MS < hFn, hazards.DEFAULT_HAZARD_TIMEOUT_MS + ' / ' + hFn);
ok('함수 상한은 Vercel 300초 안', rFn <= 300000 && hFn <= 300000);
ok('★★ 조사가 45초보다 길게 기다린다 (밀링에서 실패한 값)', research.DEFAULT_RESEARCH_TIMEOUT_MS > 45000);
const autogen = num(src('admin/autogen.js'), 'TIMEOUT_MS');
const setupR = num(src('admin/setup.js'), 'RESEARCH_TIMEOUT_MS');
const setupV = num(src('admin/setup.js'), 'REVIEW_TIMEOUT_MS');
ok('★ 교육 만들기 화면이 서버 함수보다 오래 기다린다', autogen >= rFn, autogen + ' / ' + rFn);
ok('★ 설비 탭 조사·검수가 서버 함수보다 오래 기다린다', setupR >= rFn && setupV >= rFn, setupR + ' · ' + setupV + ' / ' + rFn);

report('AI 조사 기다리는 시간 순서');
