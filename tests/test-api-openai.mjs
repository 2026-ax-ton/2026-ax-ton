/* AI_PROVIDER=openai — GPT 로 바꿔 끼우기 (개인 사본 선택지).

   ★ 실제 OpenAI 를 부르지 않는다. 가짜 fetch.

   이 묶음이 지키는 것
     1. ★★ 기본은 Gemini — AI_PROVIDER 를 안 넣으면 지금과 똑같다
     2. ★★ openai 면 api.openai.com 으로, 키는 Authorization 헤더로 (주소에 없음)
     3. ★ 사진·글·검색 도구가 OpenAI 모양으로 바뀐다
     4. ★★ url_citation → 검색 근거 모양 → 리서치 출처 대조가 그대로 돈다 (지어낸 출처는 여전히 버림)
     5. ★ 거절·한도·시간·빈 출력이 Gemini 쪽과 같은 오류로 온다
     6. 모델 이름을 박아 두지 않는다 — OPENAI_MODEL 이 없으면 500 config */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report } = require('./harness');

const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');
const authLib = await import('../api/_auth.mjs');
const O = await import('../api/_openai.mjs');
const research = await import('../api/research.mjs');
const hazards = await import('../api/hazards.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const OKEY = 'sk-test-FAKEopenai';   // 진짜 키 길이가 아니다 (test-no-secrets 에 안 걸린다)
function setEnv(extra) {
  for (const k of ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_REASONING']) delete process.env[k];
  Object.assign(process.env, {
    ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '',
    ALLOW_FILE_ORIGIN: '0', DATABASE_URL: 'postgresql://fake/fake',
    GEMINI_API_KEY: 'AIzaSyFAKE00openaitest', AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite', AI_DAILY_LIMIT: '600',
  }, extra || {});
  shared.resetDailyCall();
}
const GPT = { AI_PROVIDER: 'openai', OPENAI_API_KEY: OKEY, OPENAI_MODEL: 'gpt-test-model' };

const tokens = new Map();
db.setSqlForTest((strings, ...vals) => {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  throw new Error('모르는 질의: ' + q);
});
tokens.set(authLib.tokenHash('tok-admin'), { id: 'a1', user_id: 'kim@daesung.co.kr', role: 'admin', workplace_id: 'wp-a' });

const calls = [];
function fakeOpenAI(text, annotations, extra) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      status: 'completed',
      output: [
        { type: 'web_search_call', status: 'completed' },
        { type: 'message', content: [{ type: 'output_text', text, annotations: annotations || [] }] },
      ],
      ...(extra || {}),
    }), { status: 200 });
  };
}
async function post(handler, path, body) {
  const res = await handler(new Request('https://x' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, authorization: 'Bearer tok-admin' },
    body: JSON.stringify(body),
  }));
  const raw = await res.text();
  let data; try { data = JSON.parse(raw); } catch (e) { data = null; }
  return { status: res.status, data, raw };
}
const realLog = console.log;
console.log = () => {};

/* 1. 기본은 Gemini */
{
  setEnv();
  eq('★★ AI_PROVIDER 가 없으면 provider 없음(Gemini)', shared.readConfig('AI_MODEL_TRANSLATE').provider, undefined);
  setEnv(GPT);
  const c = shared.readConfig('AI_MODEL_TRANSLATE');
  eq('openai 면 provider openai', c.provider, 'openai');
  eq('★ 모델은 OPENAI_MODEL 만 본다 (Gemini 모델 이름을 넘기지 않음)', c.model, 'gpt-test-model');
  setEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: OKEY });
  eq('★ OPENAI_MODEL 이 없으면 설정 없음 (모델 이름을 박지 않는다)', shared.readConfig('AI_MODEL_TRANSLATE'), null);
}

/* 2. 리서치 — 출처 대조가 그대로 */
{
  setEnv(GPT);
  calls.length = 0;
  const body = { overview: '프레스', items: [
    { part: '램', hazard: 'pinch', risk: '끼임', sources: [{ title: 'KOSHA', url: 'https://www.kosha.or.kr/guide/1' }] },
    { part: '제어반', hazard: 'shock', risk: '감전', sources: [{ title: '법령', url: 'https://law.go.kr/x' }] },
    { part: '지어냄', hazard: 'fire', risk: '근거 없음', sources: [{ title: '가짜', url: 'https://made-up.example/a' }] },
  ] };
  fakeOpenAI('```json\n' + JSON.stringify(body) + '\n```', [
    { type: 'url_citation', url: 'https://www.kosha.or.kr/guide/1', title: 'KOSHA GUIDE', start_index: 0, end_index: 5 },
    { type: 'url_citation', url: 'https://law.go.kr/x', title: '산업안전보건기준', start_index: 6, end_index: 9 },
    { type: 'url_citation', url: 'https://www.hwacheon.com/manual', title: '설명서', start_index: 10, end_index: 12 },
    { type: 'url_citation', url: 'https://law.go.kr/x', title: '중복', start_index: 13, end_index: 14 },
  ]);
  const r = await post(research.handle, '/api/research', { equipment: { name: '프레스', maker: 'Hwacheon' } });
  eq('200', r.status, 200);
  eq('★★ api.openai.com 으로 간다', calls[0].url, O.OPENAI_URL);
  const sent = JSON.parse(calls[0].init.body);
  eq('★ 키는 Authorization 헤더로', calls[0].init.headers.authorization, 'Bearer ' + OKEY);
  ok('★ 키가 주소에 없다', calls[0].url.indexOf(OKEY) === -1);
  eq('★ 검색 도구가 web_search 로', JSON.stringify(sent.tools), JSON.stringify([{ type: 'web_search' }]));
  eq('모델', sent.model, 'gpt-test-model');
  has('지시문은 instructions 로', sent.instructions, '주소를 지어내지 않는다');
  eq('글은 input_text', sent.input[0].content[0].type, 'input_text');
  ok('reasoning 칸은 OPENAI_REASONING 이 없으면 안 넣는다', !('reasoning' in sent));
  const by = (p) => r.data.items.find((i) => i.part === p);
  eq('★★ 인용된 출처는 인정 (kosha 공공 2)', by('램').sources[0] && by('램').sources[0].tier, 2);
  eq('★★ 인용에 없는 주소는 여전히 버린다', by('지어냄').sources.length, 0);
  eq('지어낸 것은 check', by('지어냄').status, 'check');
  eq('출처 사이트 수 = 인용된 사이트 중 항목이 가리킨 것', r.data.sourceCount, 2);
  eq('★ 응답 모델 이름', r.data.model, 'gpt-test-model');
  ok('★ 응답에 키가 없다', r.raw.indexOf(OKEY) === -1);

  const g = O.readOutput({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'a', annotations: [
    { type: 'url_citation', url: 'https://a.example/1', title: 'A' }, { type: 'url_citation', url: 'https://a.example/1', title: 'A' }] }] }] });
  eq('같은 주소 인용은 한 번만', g.chunks.length, 1);
}

/* 3. 사진 — input_image 로 */
{
  setEnv(GPT);
  calls.length = 0;
  fakeOpenAI(JSON.stringify({ person: false, boxes: [{ id: 'r1', box_2d: [400, 300, 600, 700] }] }));
  const PHOTO = Buffer.alloc(4000, 5).toString('base64');
  const r = await post(hazards.handle, '/api/hazards', { image: PHOTO, mime: 'image/jpeg', items: [{ id: 'r1', part: '램', hazard: 'pinch' }] });
  eq('200', r.status, 200);
  const sent = JSON.parse(calls[0].init.body);
  const img = sent.input[0].content.find((c) => c.type === 'input_image');
  eq('★ 사진이 input_image data URL 로', img && img.image_url, 'data:image/jpeg;base64,' + PHOTO);
  ok('사진 단계에는 검색 도구가 없다', !('tools' in sent));
  eq('★ 박스가 그대로 바뀐다', r.data.mapped[0] && r.data.mapped[0].answer.x, 50);
}

/* 4. 오류 */
{
  setEnv(GPT);
  globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '20' } });
  let r = await post(research.handle, '/api/research', { equipment: { name: '프레스' } });
  eq('★ 한도 429', r.status, 429);
  has('대기 시간을 전한다', r.data.message, '20초');

  fakeOpenAI('', [], { output: [{ type: 'message', content: [{ type: 'refusal', refusal: '못 합니다' }] }] });
  r = await post(research.handle, '/api/research', { equipment: { name: '프레스' } });
  eq('★ 거절은 502 model', r.status + ' ' + r.data.error, '502 model');

  fakeOpenAI('', [], { status: 'incomplete', output: [] });
  eq('★ 출력 상한에 걸려 빈 출력이면 502', (await post(research.handle, '/api/research', { equipment: { name: '프레스' } })).status, 502);

  globalThis.fetch = async () => new Response('{"error":{"message":"secret detail sk-xxx"}}', { status: 401 });
  r = await post(research.handle, '/api/research', { equipment: { name: '프레스' } });
  eq('키 틀림은 502', r.status, 502);
  ok('★ 공급사 응답 본문을 옮기지 않는다', r.raw.indexOf('secret detail') === -1);

  setEnv({ ...GPT, AI_RESEARCH_TIMEOUT_MS: '30' });
  globalThis.fetch = (url, init) => new Promise((_, rej) => {
    init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); });
  });
  eq('★ 시간 초과 504', (await post(research.handle, '/api/research', { equipment: { name: '프레스' } })).status, 504);

  setEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: OKEY });
  eq('★ OPENAI_MODEL 없으면 500 config', (await post(research.handle, '/api/research', { equipment: { name: '프레스' } })).status, 500);

  setEnv({ ...GPT, OPENAI_REASONING: 'low' });
  calls.length = 0;
  fakeOpenAI(JSON.stringify({ items: [] }));
  await post(research.handle, '/api/research', { equipment: { name: '프레스' } });
  eq('OPENAI_REASONING 을 넣으면 reasoning 칸', JSON.parse(calls[0].init.body).reasoning.effort, 'low');
}

setEnv();
console.log = realLog;
report('GPT 로 바꿔 끼우기 — AI_PROVIDER=openai (개인 사본)');
