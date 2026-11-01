import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownContent from './MarkdownContent';

describe('MarkdownContent', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Metadata request blocked')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders common Markdown blocks and inline formatting', () => {
    const { container } = render(
      <MarkdownContent source={'## Research\n\nA **bold** idea with *emphasis* and `code`.\n\n- First\n- [Source](https://example.com)'} />,
    );

    expect(container.querySelector('h2')).toHaveTextContent('Research');
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('emphasis');
    expect(container.querySelector('code')).toHaveTextContent('code');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('a[href="https://example.com/"]')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders headings without a space after the hash marks', () => {
    const { container } = render(<MarkdownContent source={'###dfdnfjdng\n#### Another heading'} />);

    expect(container.querySelector('h3')).toHaveTextContent('dfdnfjdng');
    expect(container.querySelector('h4')).toHaveTextContent('Another heading');
  });

  it('renders raw HTML as text and rejects unsafe Markdown link protocols', () => {
    const { container } = render(
      <MarkdownContent source={'<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert(1))'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Unsafe');
  });

  it('renders the requested basic Markdown syntax', () => {
    const { container } = render(
      <MarkdownContent source={[
        '# Main heading',
        '## Second heading',
        '### Third heading',
        '**bold** and *italic*',
        '> A quote',
        '1. First',
        '2. Second',
        '- One',
        '- Two',
        '---',
        '[a link](https://example.com)',
        '![a picture](https://example.com/picture.png)',
        '`inline code`',
        '```json',
        '{"ok": true}',
        '```',
      ].join('\n\n')} />,
    );

    expect(container.querySelectorAll('h1, h2, h3')).toHaveLength(3);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('blockquote')).toHaveTextContent('A quote');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('hr')).toBeInTheDocument();
    expect(container.querySelector('a[href="https://example.com/"]')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'a picture' })).toHaveAttribute('src', 'https://example.com/picture.png');
    expect(container.querySelector('pre code')).toHaveTextContent('{"ok": true}');
  });

  it('renders extended Markdown blocks and inline syntax safely', () => {
    const { container } = render(
      <MarkdownContent source={[
        '| Syntax | Description |',
        '| :--- | ---: |',
        '| Header | Title |',
        '',
        'A sentence with a footnote.[^1]',
        '[^1]: footnote text',
        '',
        '### Custom heading {#custom-id}',
        '',
        'Term: definition',
        '',
        '~~removed~~ ==highlighted== H~2~O X^2^ :joy:',
        '',
        '- [x] Finished',
        '- [ ] Pending',
      ].join('\n')} />,
    );

    expect(container.querySelector('table th')).toHaveTextContent('Syntax');
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(1);
    expect(container.querySelector('a[href^="#md-"]')).toHaveTextContent('1');
    expect(container.querySelector('.note-wall-markdown-footnotes')).toHaveTextContent('footnote text');
    expect(container.querySelector('#custom-id')).toHaveTextContent('Custom heading');
    expect(container.querySelector('dl dt')).toHaveTextContent('Term');
    expect(container.querySelector('dl dd')).toHaveTextContent('definition');
    expect(container.querySelector('del')).toHaveTextContent('removed');
    expect(container.querySelector('mark')).toHaveTextContent('highlighted');
    expect(container.querySelector('sub')).toHaveTextContent('2');
    expect(container.querySelector('p sup')).toHaveTextContent('1');
    expect(container.textContent).toContain('😂');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(1);
  });

  it('rejects unsafe image protocols and keeps raw HTML inert', () => {
    const { container } = render(
      <MarkdownContent source={'![bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('bad');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders Markdown and bare URLs as pinned compact links with best-effort hover metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(
      '<html><head><title>Example story</title><meta property="og:title" content="A saved story"><meta property="og:site_name" content="Example News"><meta property="og:description" content="A useful description"><meta property="og:image" content="https://example.test/cover.jpg"><meta name="author" content="Ada Lovelace"></head></html>',
      { headers: { 'content-type': 'text/html' } },
    ))));
    const { container } = render(
      <MarkdownContent source={'Read [this article](https://example.test/story).\n\nhttps://example.test/story?ref=note'} />,
    );

    const links = container.querySelectorAll('.note-wall-markdown-link-preview');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://example.test/story');
    expect(links[0].querySelector('.note-wall-markdown-link-row svg')).toBeInTheDocument();
    expect(links[1]).toHaveAttribute('href', 'https://example.test/story?ref=note');
    await waitFor(() => expect(screen.getAllByText('By Ada Lovelace')).toHaveLength(2));
    expect(screen.getAllByText('A saved story')).toHaveLength(2);
    expect(container.querySelector('.note-wall-markdown-link-thumbnail')).toHaveAttribute('src', 'https://example.test/cover.jpg');
    fireEvent.mouseEnter(links[0]);
    expect(links[0].querySelector('.note-wall-markdown-link-expanded')).toHaveTextContent('A useful description');
  });

  it('keeps compact card previews clipped while rendering link metadata outside the card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(
      '<html><head><title>Hover details</title><meta property="og:title" content="Hover details"><meta name="author" content="Grace Hopper"></head></html>',
      { headers: { 'content-type': 'text/html' } },
    ))));
    const { container } = render(<MarkdownContent compactLinks source={'A long note. [Open source](https://compact-preview.example/article)'} />);
    const link = container.querySelector('.note-wall-markdown-link-preview');

    await waitFor(() => expect(link).toHaveAttribute('aria-label', 'Hover details · compact-preview.example'));
    fireEvent.mouseEnter(link);
    const popup = await screen.findByRole('link', { name: 'Open Hover details' });

    expect(container.contains(popup)).toBe(false);
    expect(popup).toHaveTextContent('By Grace Hopper');
  });
});
