/* OpenAI(GPT) 로 모델을 부르는 자리 — **개인 사본 전용 선택지** (2026-11-06, yesol).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ 팀 결정은 Gemini 다 (C06 D-018). 이 파일은 `AI_PROVIDER=openai` 일 때만 쓰인다.
     기본값은 언제나 Gemini — 환경변수를 안 넣으면 지금과 똑같이 돈다.

   ★ `_shared.mjs` 의 `callModel` 과 **같은 모양**으로 돌려준다.
       { text } · { text, grounding } · { error: 'model'|'timeout'|'limit', why }
     그래서 `/api/research`·`/api/hazards`·번역은 코드를 바꾸지 않는다.

   바꿔 끼우는 것 (Gemini → OpenAI Responses API)
     parts [{text}]                     → content [{type:'input_text', text}]
     parts [{inline_data:{mime,data}}]  → content [{type:'input_image', image_url:'data:…'}]
     tools [{google_search:{}}]         → tools [{type:'web_search'}]
     출처 url_citation 주석             → grounding.groundingChunks[].web.{uri,title}
       (리서치의 출처 대조 `verifySources` 가 그대로 쓴다. OpenAI 는 원래 사이트 주소를
        주므로 도메인 대조가 Gemini 의 검색 경유 주소보다 오히려 곧다)

   넘지 않는 선 (Gemini 쪽과 같다)
     · 키는 주소가 아니라 헤더(Authorization)로 · 응답 본문을 오류 메시지에 옮기지 않는다
     · 모델 출력은 믿을 수 없는 문자열 — 거르는 것은 부르는 쪽(_hazards·_research)이다

   ⚠️ 모델 이름은 정해 두지 않는다(`OPENAI_MODEL` 필수). 쓸 수 있는 이름은 계정마다·시기마다
      다르다 — platform.openai.com 의 모델 목록에서 확인해 넣는다.
   ⚠️ 박스 좌표는 Gemini 가 학습된 일이다. GPT 좌표 품질은 실측(measure-pipeline)으로 본다. */

export const OPENAI_URL = 'https://api.openai.com/v1/responses';

/** Gemini 모양 parts → OpenAI content */
export function toContent(userText) {
  const parts = Array.isArray(userText) ? userText : [{ text: userText }];
  return parts.map((p) => {
    if (p && p.inline_data) {
      return { type: 'input_image', image_url: 'data:' + p.inline_data.mime_type + ';base64,' + p.inline_data.data };
    }
    return { type: 'input_text', text: String((p && p.text) || '') };
  });
}

export function toTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  const out = [];
  tools.forEach((t) => { if (t && t.google_search) out.push({ type: 'web_search' }); });
  return out.length ? out : undefined;
}

/** 응답에서 글과 출처를 꺼낸다 — output[] 의 message → content[] 의 output_text */
export function readOutput(data) {
  const out = data && Array.isArray(data.output) ? data.output : [];
  let text = '';
  let refused = false;
  const cites = [];
  out.forEach((item) => {
    /* 검색 도구가 실제로 본 주소 — 「검색 근거」로 인정한다 (Gemini 의 groundingChunks 와 같은 자리) */
    if (item && item.type === 'web_search_call' && item.action && Array.isArray(item.action.sources)) {
      item.action.sources.forEach((s) => {
        if (s && typeof s.url === 'string') cites.push({ uri: s.url, title: String(s.title || '') });
      });
      return;
    }
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) return;
    item.content.forEach((c) => {
      if (!c) return;
      if (c.type === 'refusal') refused = true;
      if (c.type === 'output_text' && typeof c.text === 'string') {
        text += c.text;
        (Array.isArray(c.annotations) ? c.annotations : []).forEach((a) => {
          if (a && a.type === 'url_citation' && typeof a.url === 'string') cites.push({ uri: a.url, title: String(a.title || '') });
        });
      }
    });
  });
  /* 같은 주소는 한 번만 */
  const seen = new Set();
  const chunks = cites.filter((c) => (seen.has(c.uri) ? false : seen.add(c.uri))).map((c) => ({ web: c }));
  return { text: text.trim(), refused, chunks };
}

export async function callOpenAI({ key, model, timeoutMs }, systemText, userText, opts) {
  const maxOut = (opts && opts.maxOutputTokens) || 600;
  const maxText = (opts && opts.maxText) || 600;
  const tools = toTools(opts && opts.tools);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const body = {
    model,
    instructions: systemText,
    input: [{ role: 'user', content: toContent(userText) }],
    max_output_tokens: maxOut,
  };
  if (tools) {
    body.tools = tools;
    /* ★ 2026-11-09 실측 — JSON 만 내라고 하면 본문에 인용 주석(url_citation)이 하나도 안 붙는다.
       검색 도구가 실제로 연 주소 목록을 따로 받아야 출처 대조가 된다 */
    body.include = ['web_search_call.action.sources'];
  }
  /* 추론 모델이면 생각에 토큰을 다 쓰지 않게 — 추론 모델이 아니면 이 칸이 400 을 내므로 넣을 때만 */
  if (process.env.OPENAI_REASONING) body.reasoning = { effort: process.env.OPENAI_REASONING };

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    if (ac.signal.aborted) return { error: 'timeout', why: timeoutMs + 'ms 초과' };
    return { error: 'model', why: '모델에 닿지 못함' };
  } finally {
    clearTimeout(timer);
  }

  if (!res) return { error: 'model', why: '응답 없음' };
  if (res.status === 429) {
    const after = res.headers && res.headers.get && res.headers.get('retry-after');
    return { error: 'limit', why: after ? '공급사 한도 · ' + after + '초 뒤 다시' : '공급사 한도' };
  }
  if (!res.ok) return { error: 'model', why: '모델 응답 ' + res.status };

  let data;
  try { data = await res.json(); } catch { return { error: 'model', why: 'JSON 이 아님' }; }

  const r = readOutput(data);
  if (r.refused) return { error: 'model', why: '모델이 막음' };
  if (data && data.status === 'incomplete' && !r.text) return { error: 'model', why: '출력 상한에 걸림' };
  if (r.text.length < 1 || r.text.length > maxText) {
    return { error: 'model', why: r.text.length < 1 ? '빈 출력' : '출력이 너무 김' };
  }
  return opts && opts.tools ? { text: r.text, grounding: { groundingChunks: r.chunks } } : { text: r.text };
}
