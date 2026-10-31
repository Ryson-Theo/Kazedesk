const MAX_CLIP_PAYLOAD_LENGTH = 16000;

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function safeHttpUrl(value, fieldName) {
  if (!value) return '';
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    if (url.href.length > 2048) throw new Error();
    return url.href;
  } catch {
    if (fieldName === 'url') throw new Error('This clip does not contain a valid http or https page URL.');
    return '';
  }
}

export function normalizeWebClip(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The web clip data is invalid.');
  }
  const url = safeHttpUrl(input.url, 'url');
  if (!url) throw new Error('The web clip is missing its page URL.');
  const page = new URL(url);
  return {
    url,
    title: cleanText(input.title, 240) || page.hostname,
    description: cleanText(input.description, 1200),
    siteName: cleanText(input.siteName, 160) || page.hostname,
    image: safeHttpUrl(cleanText(input.image, 2048), 'image'),
    author: cleanText(input.author, 160),
    publishedAt: cleanText(input.publishedAt, 80),
  };
}

export function decodeWebClipPayload(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > MAX_CLIP_PAYLOAD_LENGTH) {
    throw new Error('The web clip payload is missing or too large.');
  }
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return normalizeWebClip(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The web clip data could not be decoded.');
    throw error;
  }
}

export function createWebClipperBookmarklet(appUrl) {
  const target = new URL(appUrl);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('The clipper needs a valid http or https app URL.');
  }
  target.search = '';
  target.hash = '';
  const targetUrl = JSON.stringify(target.href);
  const source = `(()=>{const d=document,m=(s)=>d.querySelector(s)?.content||'',u=d.querySelector('link[rel="canonical"]')?.href||location.href,p={url:u,title:m('meta[property="og:title"]')||d.title,description:m('meta[property="og:description"]')||m('meta[name="description"]'),siteName:m('meta[property="og:site_name"]')||location.hostname,image:m('meta[property="og:image"]'),author:m('meta[name="author"]'),publishedAt:m('meta[property="article:published_time"]')};const b=btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');const a=new URL(${targetUrl});a.searchParams.set('kazedesk_clip',b);window.open(a.href,'_blank','noopener');})()`;
  return `javascript:${source}`;
}

export function encodeWebClipPayload(input) {
  const normalized = normalizeWebClip(input);
  const bytes = new TextEncoder().encode(JSON.stringify(normalized));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
