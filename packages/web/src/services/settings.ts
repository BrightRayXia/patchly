export interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** CORS 代理地址（可选）：目标 API 不允许浏览器跨域时填写，如 https://patchly-proxy.xxx.workers.dev */
  proxyUrl: string;
}

export interface LLMPreset {
  label: string;
  baseUrl: string;
  model: string;
}

export const PRESETS: LLMPreset[] = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
];

const KEY = 'patchly.llm';

export function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as LLMSettings;
      if (s.baseUrl && s.model) return s;
    }
  } catch {
    /* 忽略损坏的配置 */
  }
  return { baseUrl: PRESETS[0].baseUrl, apiKey: '', model: PRESETS[0].model, proxyUrl: '' };
}

export function saveSettings(s: LLMSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
