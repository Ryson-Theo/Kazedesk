import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Pin } from 'lucide-react';
import { fetchWebClipMetadata } from '../utils/noteWallWebClipper';

const EMOJI = {
  joy: '😂',
  smile: '😄',
  heart: '❤️',
  thumbs_up: '👍',
  tada: '🎉',
  rocket: '🚀',
  smiley: '😃',
  wink: '😉',
};
const linkMetadataCache = new Map();

function safeMarkdownUrl(value) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function getFootnoteId(prefix, key) {
  return `${prefix}-footnote-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getLinkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getLinkMetadata(url) {
  if (!linkMetadataCache.has(url)) {
    linkMetadataCache.set(url, fetchWebClipMetadata(url).catch(() => null));
  }
  return linkMetadataCache.get(url);
}

function NoteLinkPreview({ href, label, compact = false, onPinLink, isPinned = false }) {
  const [metadata, setMetadata] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0 });
  const linkRef = useRef(null);
  const popupRef = useRef(null);
  const closeTimerRef = useRef(null);
  const host = getLinkHost(href);

  useEffect(() => {
    let active = true;
    getLinkMetadata(href).then((result) => {
      if (active && result?.metadataAvailable) setMetadata(result);
    });
    return () => { active = false; };
  }, [href]);

  const title = metadata?.title || label || host;
  const hasDetails = Boolean(metadata && (metadata.image || metadata.author || metadata.description || metadata.title !== host));
  const updatePopupPosition = () => {
    const linkRect = linkRef.current?.getBoundingClientRect();
    const popupRect = popupRef.current?.getBoundingClientRect();
    if (!linkRect || !popupRect) return;
    const left = Math.max(12, Math.min(linkRect.left, window.innerWidth - popupRect.width - 12));
    const top = linkRect.bottom + popupRect.height + 12 <= window.innerHeight
      ? linkRect.bottom + 6
      : Math.max(12, linkRect.top - popupRect.height - 6);
    setPopupPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (!compact || !isExpanded || !hasDetails) return undefined;
    updatePopupPosition();
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [compact, hasDetails, isExpanded]);

  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setIsExpanded(false), 120);
  };
  const keepOpen = () => {
    window.clearTimeout(closeTimerRef.current);
    setIsExpanded(true);
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  return (
    <>
      <span className={`note-wall-markdown-link-control${isPinned ? ' is-pinned' : ''}`}>
        <a
          ref={linkRef}
          className={`note-wall-markdown-link-preview${compact ? ' is-compact' : ''}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${title} · ${host}`}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
          onFocus={keepOpen}
          onBlur={scheduleClose}
        >
          <span className="note-wall-markdown-link-row">
            <Paperclip size={13} aria-hidden="true" />
            <span className="note-wall-markdown-link-label">{label || title}</span>
            <span className="note-wall-markdown-link-host">{host}</span>
          </span>
          {hasDetails && !compact && (
            <span className="note-wall-markdown-link-expanded">
              {metadata.image && <img className="note-wall-markdown-link-thumbnail" src={metadata.image} alt="" loading="lazy" />}
              <span className="note-wall-markdown-link-expanded-body">
                <span className="note-wall-markdown-link-site">{metadata.siteName || host}</span>
                <strong>{metadata.title || label || host}</strong>
                {metadata.author && <span className="note-wall-markdown-link-author">By {metadata.author}</span>}
                {metadata.description && <span className="note-wall-markdown-link-description">{metadata.description}</span>}
              </span>
            </span>
          )}
        </a>
        {onPinLink && (
          <button
            type="button"
            className="note-wall-markdown-link-pin"
            aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${label || title} ${isPinned ? 'from' : 'to'} note`}
            title={isPinned ? 'Unpin link from note' : 'Pin link to note'}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPinLink({ url: href, label: label || title });
            }}
          ><Pin size={12} fill={isPinned ? 'currentColor' : 'none'} /></button>
        )}
      </span>
      {compact && hasDetails && isExpanded && createPortal(
        <a
          ref={popupRef}
          className="note-wall-markdown-link-expanded is-portaled"
          style={{ left: popupPosition.left, top: popupPosition.top }}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${title}`}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
          onFocus={keepOpen}
          onBlur={scheduleClose}
        >
          {metadata.image && <img className="note-wall-markdown-link-thumbnail" src={metadata.image} alt="" loading="lazy" />}
          <span className="note-wall-markdown-link-expanded-body">
            <span className="note-wall-markdown-link-site">{metadata.siteName || host}</span>
            <strong>{metadata.title || label || host}</strong>
            {metadata.author && <span className="note-wall-markdown-link-author">By {metadata.author}</span>}
            {metadata.description && <span className="note-wall-markdown-link-description">{metadata.description}</span>}
          </span>
        </a>,
        document.body,
      )}
    </>
  );
}

function renderInline(source, prefix, compactLinks, onPinLink, pinnedLinks) {
  const tokenPattern = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\[\^[^\]]+\]|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|==[\s\S]+?==|\^[^^]+\^|~[^~\s]+~|\*[^*\n]+\*|_[^_\n]+_|:[a-z_]+:|https?:\/\/[^\s<>]+)/g;
  const result = [];
  let start = 0;
  let match;

  while ((match = tokenPattern.exec(source))) {
    if (match.index > start) result.push(source.slice(start, match.index));
    const token = match[0];
    if (token.startsWith('![')) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const src = image ? safeMarkdownUrl(image[2]) : '';
      result.push(src
        ? <img key={`${prefix}-${match.index}`} src={src} alt={image[1]} loading="lazy" />
        : image?.[1] || token);
    } else if (token.startsWith('[')) {
      const footnote = token.match(/^\[\^([^\]]+)\]$/);
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (footnote) {
        const id = footnote[1];
        result.push(<sup key={`${prefix}-${match.index}`}><a href={`#${getFootnoteId(prefix, id)}`} aria-label={`Footnote ${id}`}>{id}</a></sup>);
      } else {
        const href = link ? safeMarkdownUrl(link[2]) : '';
        result.push(href
          ? <NoteLinkPreview
              href={href}
              key={`${prefix}-${match.index}`}
              label={link[1]}
              compact={compactLinks}
              onPinLink={onPinLink}
              isPinned={pinnedLinks.some((item) => item.url === href)}
            />
          : link?.[1] || token);
      }
    } else if (/^https?:\/\//i.test(token)) {
      const urlMatch = token.match(/^(https?:\/\/[^\s<>]*[^\s<>.,!?;:)\]])([.,!?;:)\]]*)$/i);
      const rawUrl = urlMatch?.[1] || token;
      const href = safeMarkdownUrl(rawUrl);
      result.push(href
        ? <span className="note-wall-raw-link-preview" key={`${prefix}-${match.index}`}><NoteLinkPreview
            href={href}
            label={getLinkHost(href)}
            compact={compactLinks}
            onPinLink={onPinLink}
            isPinned={pinnedLinks.some((item) => item.url === href)}
          />{urlMatch?.[2]}</span>
        : token);
    } else if (token.startsWith('`')) {
      result.push(<code key={`${prefix}-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      result.push(<strong key={`${prefix}-${match.index}`}>{renderInline(token.slice(2, -2), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</strong>);
    } else if (token.startsWith('~~')) {
      result.push(<del key={`${prefix}-${match.index}`}>{renderInline(token.slice(2, -2), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</del>);
    } else if (token.startsWith('==')) {
      result.push(<mark key={`${prefix}-${match.index}`}>{renderInline(token.slice(2, -2), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</mark>);
    } else if (token.startsWith('^')) {
      result.push(<sup key={`${prefix}-${match.index}`}>{renderInline(token.slice(1, -1), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</sup>);
    } else if (token.startsWith('~')) {
      result.push(<sub key={`${prefix}-${match.index}`}>{renderInline(token.slice(1, -1), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</sub>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      result.push(<em key={`${prefix}-${match.index}`}>{renderInline(token.slice(1, -1), `${prefix}-${match.index}`, compactLinks, onPinLink, pinnedLinks)}</em>);
    } else {
      const shortcode = token.slice(1, -1);
      result.push(EMOJI[shortcode] || token);
    }
    start = tokenPattern.lastIndex;
  }
  if (start < source.length) result.push(source.slice(start));
  return result;
}

function getListMatch(line) {
  const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
  if (unordered) return { type: 'ul', text: unordered[1] };
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  return ordered ? { type: 'ol', text: ordered[1] } : null;
}

function isHorizontalRule(line) {
  return /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
}

function getTableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && getTableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function getHeading(line) {
  const heading = line.match(/^(#{1,6})\s*(\S.*)$/);
  if (!heading) return null;
  const idMatch = heading[2].match(/^(.*?)\s+\{#([a-zA-Z0-9_-]+)\}\s*$/);
  return {
    level: heading[1].length,
    text: idMatch ? idMatch[1] : heading[2],
    id: idMatch?.[2],
  };
}

function getDefinition(line) {
  return line.match(/^([^:\n]+):\s+(.+)$/);
}

export default function MarkdownContent({ source = '', compactLinks = false, onPinLink, pinnedLinks = [] }) {
  const rawId = useId();
  const idPrefix = `md-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const footnotes = new Map();
  let insideCodeBlock = false;
  const contentLines = lines.filter((line) => {
    if (/^\s*```/.test(line)) {
      insideCodeBlock = !insideCodeBlock;
      return true;
    }
    const definition = !insideCodeBlock && line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!definition) return true;
    footnotes.set(definition[1], definition[2]);
    return false;
  });
  const blocks = [];
  let index = 0;
  const inline = (text, key) => renderInline(text, `${idPrefix}-${key}`, compactLinks, onPinLink, pinnedLinks);

  while (index < contentLines.length) {
    const line = contentLines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const codeLines = [];
      index += 1;
      while (index < contentLines.length && !/^\s*```/.test(contentLines[index])) {
        codeLines.push(contentLines[index]);
        index += 1;
      }
      if (index < contentLines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{codeLines.join('\n')}</code></pre>);
      continue;
    }
    if (isHorizontalRule(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }
    const heading = getHeading(line);
    if (heading) {
      const Heading = `h${heading.level}`;
      blocks.push(<Heading id={heading.id} key={`heading-${index}`}>{inline(heading.text, `heading-${index}`)}</Heading>);
      index += 1;
      continue;
    }
    if (index + 1 < contentLines.length && line.includes('|') && isTableDivider(contentLines[index + 1])) {
      const headers = getTableCells(line);
      const alignments = getTableCells(contentLines[index + 1]).map((cell) => (
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : undefined
      ));
      const rows = [];
      index += 2;
      while (index < contentLines.length && contentLines[index].includes('|') && contentLines[index].trim()) {
        rows.push(getTableCells(contentLines[index]));
        index += 1;
      }
      blocks.push(
        <div className="note-wall-markdown-table-scroll" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex} style={{ textAlign: alignments[cellIndex] }}>{inline(cell, `table-head-${index}-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} style={{ textAlign: alignments[cellIndex] }}>{inline(row[cellIndex] || '', `table-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < contentLines.length && /^\s*>\s?/.test(contentLines[index])) {
        quoteLines.push(contentLines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{quoteLines.map((quoteLine, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(quoteLine, `quote-${index}-${lineIndex}`)}</span>)}</blockquote>);
      continue;
    }
    const firstItem = getListMatch(line);
    if (firstItem) {
      const items = [];
      const type = firstItem.type;
      while (index < contentLines.length) {
        const item = getListMatch(contentLines[index]);
        if (!item || item.type !== type) break;
        const task = type === 'ul' && item.text.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(
          <li className={task ? 'note-wall-markdown-task' : undefined} key={index}>
            {task && <input type="checkbox" checked={task[1].toLowerCase() === 'x'} readOnly aria-label={task[1].toLowerCase() === 'x' ? 'Completed task' : 'Incomplete task'} />}
            {inline(task ? task[2] : item.text, `list-${index}`)}
          </li>,
        );
        index += 1;
      }
      const List = type;
      blocks.push(<List key={`list-${index}`}>{items}</List>);
      continue;
    }
    const definition = getDefinition(line);
    if (definition) {
      const definitions = [];
      while (index < contentLines.length) {
        const item = getDefinition(contentLines[index]);
        if (!item) break;
        definitions.push({ term: item[1].trim(), definition: item[2] });
        index += 1;
      }
      blocks.push(<dl key={`definition-${index}`}>{definitions.map((item, itemIndex) => <div key={itemIndex}><dt>{inline(item.term, `term-${index}-${itemIndex}`)}</dt><dd>{inline(item.definition, `definition-${index}-${itemIndex}`)}</dd></div>)}</dl>);
      continue;
    }
    const paragraph = [];
    while (index < contentLines.length && contentLines[index].trim()
      && !/^\s*```/.test(contentLines[index])
      && !isHorizontalRule(contentLines[index])
      && !getHeading(contentLines[index])
      && !/^\s*>\s?/.test(contentLines[index])
      && !getListMatch(contentLines[index])
      && !(index + 1 < contentLines.length && contentLines[index].includes('|') && isTableDivider(contentLines[index + 1]))
      && !getDefinition(contentLines[index])) {
      paragraph.push(contentLines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((paragraphLine, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(paragraphLine, `paragraph-${index}-${lineIndex}`)}</span>)}</p>);
  }

  const usedFootnotes = [...footnotes.entries()].filter(([id]) => source.includes(`[^${id}]`));
  if (usedFootnotes.length) {
    blocks.push(
      <section className="note-wall-markdown-footnotes" key="footnotes">
        <hr />
        <ol>{usedFootnotes.map(([id, definition]) => (
          <li id={getFootnoteId(idPrefix, id)} key={id}>{inline(definition, `footnote-${id}`)}</li>
        ))}</ol>
      </section>,
    );
  }

  return <div className="note-wall-markdown-content">{blocks}</div>;
}
