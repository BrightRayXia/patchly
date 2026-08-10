/** HTML 文档工具：doctype 拆分、序列化清洗、脚本检测、图片内嵌 */

export function splitDoctype(html: string): { doctype: string; body: string } {
  const m = html.match(/^\s*<!doctype[^>]*>/i);
  return { doctype: m ? m[0].trim() : '<!DOCTYPE html>', body: html };
}

/**
 * 把 iframe 文档序列化回 HTML 字符串。
 * 会剥掉编辑过程中注入的 contenteditable / spellcheck 属性。
 */
export function serializeDoc(doc: Document, doctype = '<!DOCTYPE html>'): string {
  const html = doc.documentElement.outerHTML
    .replace(/ contenteditable="(true|plaintext-only)"/g, '')
    .replace(/ spellcheck="false"/g, '');
  return doctype + '\n' + html;
}

export function hasScript(html: string): boolean {
  return /<script[\s>]/i.test(html);
}

/** 导出前把已加载完成的本地图片转为 data URL 内嵌，避免换机器后掉图。返回成功内嵌张数。 */
export async function inlineImagesInDoc(doc: Document): Promise<number> {
  const imgs = Array.from(doc.querySelectorAll('img')).filter(
    (i) => i.src && !i.src.startsWith('data:') && i.complete && i.naturalWidth > 0,
  );
  let done = 0;
  for (const img of imgs) {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      img.src = c.toDataURL('image/png');
      done++;
    } catch {
      // 跨域受限的图保留原路径
    }
  }
  return done;
}
