import { describe, expect, it, vi } from 'vitest';
import {
  createWebClipperBookmarklet,
  decodeWebClipPayload,
  encodeWebClipPayload,
  normalizeWebClip,
} from './noteWallWebClipper';

describe('Note Wall web clipper', () => {
  it('normalizes safe article metadata and supplies useful defaults', () => {
    expect(normalizeWebClip({
      url: 'https://example.com/article',
      title: '  A useful article  ',
      description: '  An   article summary ',
      image: 'javascript:alert(1)',
    })).toMatchObject({
      url: 'https://example.com/article',
      title: 'A useful article',
      description: 'An article summary',
      siteName: 'example.com',
      image: '',
    });
  });

  it('rejects invalid page URLs and safely drops unsupported image URLs', () => {
    expect(() => normalizeWebClip({ url: 'javascript:alert(1)' })).toThrow(/valid http or https/);
    expect(() => normalizeWebClip({ url: 'file:///etc/passwd' })).toThrow(/valid http or https/);
    expect(normalizeWebClip({ url: 'https://example.com', image: 'data:image/svg+xml,<svg/>' }).image).toBe('');
  });

  it('encodes and decodes a bookmarklet payload using URL-safe base64', () => {
    const metadata = {
      url: 'https://example.com/a?b=1',
      title: 'A story with café & tea',
      description: 'A short summary',
      siteName: 'Example',
      image: 'https://example.com/cover.jpg',
      author: 'Writer',
      publishedAt: '2026-10-31',
    };
    expect(decodeWebClipPayload(encodeWebClipPayload(metadata))).toEqual(metadata);
  });

  it('builds a bookmarklet that extracts page metadata and targets the current app origin', () => {
    const bookmarklet = createWebClipperBookmarklet('https://kazedesk.example/wall?group=all#board');
    expect(bookmarklet).toMatch(/^javascript:/);
    expect(bookmarklet).toContain('og:title');
    expect(bookmarklet).toContain('og:description');
    expect(bookmarklet).toContain('article:published_time');
    expect(bookmarklet).toContain('https://kazedesk.example/wall');
    expect(bookmarklet).toContain('kazedesk_clip');
    expect(() => new Function(bookmarklet.slice('javascript:'.length))).not.toThrow();
    expect(() => createWebClipperBookmarklet('javascript:alert(1)')).toThrow(/valid http or https/);
  });

  it('extracts article metadata and sends it to the configured wall when run', () => {
    const previousHead = document.head.innerHTML;
    const previousTitle = document.title;
    const previousPath = window.location.href;
    document.title = 'Document title';
    document.head.innerHTML = `
      <link rel="canonical" href="https://publisher.example/story">
      <meta property="og:title" content="A better headline">
      <meta property="og:description" content="Story summary">
      <meta property="og:site_name" content="Publisher">
      <meta property="og:image" content="https://publisher.example/story.jpg">
      <meta name="author" content="Reporter">
      <meta property="article:published_time" content="2026-10-30">
    `;
    window.history.replaceState({}, '', '/source-story');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      const bookmarklet = createWebClipperBookmarklet('http://localhost:5173/wall');
      new Function(bookmarklet.slice('javascript:'.length))();
      const destination = new URL(open.mock.calls[0][0]);
      expect(destination.origin).toBe('http://localhost:5173');
      expect(decodeWebClipPayload(destination.searchParams.get('kazedesk_clip'))).toEqual({
        url: 'https://publisher.example/story',
        title: 'A better headline',
        description: 'Story summary',
        siteName: 'Publisher',
        image: 'https://publisher.example/story.jpg',
        author: 'Reporter',
        publishedAt: '2026-10-30',
      });
    } finally {
      open.mockRestore();
      document.head.innerHTML = previousHead;
      document.title = previousTitle;
      window.history.replaceState({}, '', previousPath);
    }
  });
});
