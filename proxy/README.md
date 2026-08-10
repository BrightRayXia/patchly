# Patchly CORS 代理（Cloudflare Worker）

解决浏览器直接调用 LLM API 的跨域问题。部署后得到一个地址，例如：
`https://patchly-proxy.<你的子域>.workers.dev`，在 Patchly「设置」页的
「CORS 代理地址」填上即可（AI 请求会先经过它再转发到上游）。

## 部署

```bash
cd proxy
npx wrangler login      # 首次需要登录 Cloudflare（OAuth 浏览器授权）
npx wrangler deploy     # 部署，输出 https://patchly-proxy.xxx.workers.dev
```

## 说明

- 白名单上游（OpenAI / DeepSeek / Moonshot）在 `wrangler.toml` 的
  `ALLOWED_UPSTREAMS` 中配置，可自行增删；
- API Key 由浏览器原样透传，Worker 不存储任何密钥；
- 只转发 `POST /chat/completions`（OpenAI 兼容格式）。
