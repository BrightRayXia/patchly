import { type Patch, isValidPatch } from '@patchly/core';
import type { LLMSettings } from './settings';

/**
 * AI 修改引擎：把「自然语言指令 + 选中元素上下文」交给 LLM，
 * 让它返回结构化 Patch，随后走与人工编辑完全相同的通道应用。
 *
 * 与 OpenAI 兼容的 API 直接对话（OpenAI / DeepSeek / Moonshot 等）。
 * 注意：目标 API 需允许浏览器跨域；否则后续可用 MCP/本地代理中转（见 README 路线图）。
 */
export interface PatchContext {
  instruction: string;
  targetCssPath: string;
  targetHtml: string;
  targetStyles: string;
}

export interface PatchResult {
  patches: Patch[];
  raw: string;
}

const SYSTEM_PROMPT = `你是 Patchly 可视化编辑器的“修改引擎”。用户用自然语言描述一个修改意图，你需要输出一组结构化 Patch，让编辑器直接应用到目标 HTML 上。

规则：
1. 只输出 JSON：{"patches":[...]}，不要输出任何其它文字、解释或代码块标记。
2. patch 支持的类型：set-text / set-style / set-attr / set-html / set-image / duplicate / remove / move。
3. target 必须是 CSS 选择器字符串。只能使用用户提供的目标选择器本身，或「该选择器 + 空格 + 后代元素」（如 "#hero h1"）。不要编造任何其它选择器，否则修改无法定位、完全不生效。
4. set-style 的 style 用 camelCase 属性名（如 fontSize、textAlign）；**所有属性值必须是字符串**，数字要写成字符串（如 "margin" 写 "0" 而不是 0）。
5. 调整对齐/位置/布局时，优先使用 textAlign、margin、transform、position 等属性；注意目标元素可能继承父级的 text-align 等样式，必要时显式覆盖。
6. 修改必须肉眼可见：如果用户要求移动、对齐、改大小，不要输出视觉上无差异的修改。
7. 尽量最小化改动：文本优先用 set-text 而不是 set-html（set-html 会丢失原样式）。
8. 不要修改 <html>/<body> 本身。

示例输入：把标题改成橙色加粗。
示例输出：{"patches":[{"type":"set-style","target":"#hero h1","style":{"color":"#EA580C","fontWeight":"bold"}}]}`;

export async function requestPatches(settings: LLMSettings, ctx: PatchContext): Promise<PatchResult> {
  const base = settings.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  };
  // 配置了 CORS 代理时走 Worker 转发（见 proxy/），否则直连
  const proxy = (settings.proxyUrl || '').trim().replace(/\/+$/, '');
  let url: string;
  if (proxy) {
    url = proxy + '/chat/completions';
    headers['x-upstream'] = base;
  } else {
    url = base + '/chat/completions';
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(ctx) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API 请求失败：HTTP ${res.status}${detail ? ' — ' + detail.slice(0, 160) : ''}`);
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('模型没有返回内容');

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('模型返回的不是合法 JSON：' + raw.slice(0, 200));
  }

  const list = (obj as { patches?: unknown[] })?.patches;
  if (!Array.isArray(list)) throw new Error('响应缺少 patches 数组');
  const valid = list.filter(isValidPatch) as Patch[];
  if (valid.length === 0) throw new Error('模型没有返回可用的 Patch');
  return { patches: valid, raw };
}
