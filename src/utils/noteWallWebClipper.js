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

export async function fetchWebClipMetadata(value) {
  const url = safeHttpUrl(value, 'url');
  if (!url) throw new Error('The web clip is missing its page URL.');
  const response = await fetch(url, {
    headers: { Accept: 'text/html' },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error('The page did not return HTML metadata.');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
    throw new Error('The page is too large to inspect for metadata.');
  }
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('The page is too large to inspect for metadata.');

  const page = new DOMParser().parseFromString(html, 'text/html');
  const pageUrl = response.url || url;
  const getMeta = (...selectors) => {
    for (const selector of selectors) {
      const content = page.querySelector(selector)?.getAttribute('content')?.trim();
      if (content) return content;
    }
    return '';
  };
  const resolvePageUrl = (valueToResolve) => {
    if (!valueToResolve) return '';
    try {
      return new URL(valueToResolve, pageUrl).href;
    } catch {
      return '';
    }
  };
  const canonicalUrl = page.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const image = getMeta('meta[property="og:image"]', 'meta[name="twitter:image"]')
    || page.querySelector('link[rel="image_src"]')?.getAttribute('href')
    || '';
  const title = getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') || page.title;
  const description = getMeta('meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]');
  const siteName = getMeta('meta[property="og:site_name"]');
  const author = getMeta('meta[name="author"]', 'meta[property="article:author"]', 'meta[name="article:author"]', 'meta[name="dc.creator"]');
  const publishedAt = getMeta('meta[property="article:published_time"]');
  return {
    ...normalizeWebClip({
      url: resolvePageUrl(canonicalUrl) || pageUrl,
      title,
      description,
      siteName: siteName || new URL(pageUrl).hostname,
      image: resolvePageUrl(image),
      author,
      publishedAt,
    }),
    metadataAvailable: Boolean(title || description || siteName || image || author || publishedAt),
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
