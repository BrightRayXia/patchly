/**
 * Patchly CORS 代理（Cloudflare Worker）
 *
 * 背景：AI 修改功能从浏览器直接调用 OpenAI 兼容 API，但部分服务商
 * （如 OpenAI api.openai.com）不允许浏览器跨域请求。这个 Worker 负责：
 *   浏览器 → Worker（带 CORS 响应头）→ 上游 LLM API
 *
 * 安全设计：
 * 1. 只允许转发到 ALLOWED_UPSTREAMS 白名单内的上游地址（x-upstream 头指定）；
 * 2. 不落盘任何 API Key，Authorization 头原样透传；
 * 3. 仅接受 POST，OPTIONS 用于浏览器预检。
 */
const DEFAULT_ALLOWED = 'https://api.openai.com/v1,https://api.deepseek.com/v1,https://api.moonshot.cn/v1';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-upstream',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export default {
  async fetch(request, env) {
    // 浏览器预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    const allowed = (env.ALLOWED_UPSTREAMS || DEFAULT_ALLOWED)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const upstream = request.headers.get('x-upstream') || '';
    if (!allowed.includes(upstream)) {
      return json({ error: `upstream not allowed: ${upstream}` }, 403);
    }

    const url = new URL(request.url);
    const target = upstream + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('x-upstream');
    headers.delete('origin');

    try {
      const res = await fetch(target, { method: 'POST', headers, body: request.body });
      const out = corsHeaders();
      const ct = res.headers.get('content-type');
      if (ct) out['Content-Type'] = ct;
      return new Response(res.body, { status: res.status, headers: out });
    } catch (err) {
      return json({ error: `upstream fetch failed: ${String(err)}` }, 502);
    }
  },
};
