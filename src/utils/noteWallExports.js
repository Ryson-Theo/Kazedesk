const NOTE_COLORS = {
  yellow: '#fef08a',
  pink: '#fbcfe8',
  blue: '#bae6fd',
  green: '#bbf7d0',
  purple: '#e9d5ff',
  orange: '#fed7aa',
};

export function getWallNoteTitle(note) {
  return note.title?.trim() || note.text?.split(/\r?\n/).find((line) => line.trim())?.trim() || 'Untitled note';
}

export function getNotePlainText(note) {
  if (!note.body) return note.text || '';
  const parsed = new DOMParser().parseFromString(note.body, 'text/html');
  parsed.body.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'));
  parsed.body.querySelectorAll('p, div').forEach((block) => block.append('\n'));
  return (parsed.body.textContent || '').trim();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportWallJSON(notes, categories, wall) {
  const data = {
    app: 'Kazedesk',
    type: 'sticky-note-wall',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    notes,
    wall,
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'kazedesk-note-wall.json');
  return data;
}

export function exportWallMarkdown(notes) {
  const grouped = new Map();
  notes.forEach((note) => {
    const category = note.category || 'Inbox';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(note);
  });

  const lines = ['# Sticky note wall', ''];
  grouped.forEach((groupNotes, category) => {
    lines.push(`## ${category}`, '');
    groupNotes.forEach((note) => {
      lines.push(`### ${getWallNoteTitle(note)}`, '');
      if (note.tags?.length) lines.push(`Tags: ${note.tags.join(', ')}`, '');
      lines.push(getNotePlainText(note) || '_No note text._', '');
    });
  });
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), 'kazedesk-note-wall.md');
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function wrapText(value, maxLength) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function getConnectionAnchor(position, size, anchor) {
  switch (anchor) {
    case 'top': return { x: position.x + size.width / 2, y: position.y };
    case 'right': return { x: position.x + size.width, y: position.y + size.height / 2 };
    case 'bottom': return { x: position.x + size.width / 2, y: position.y + size.height };
    case 'left': return { x: position.x, y: position.y + size.height / 2 };
    default: return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  }
}

function getConnectionSvgPath(start, end, fromAnchor, toAnchor, curved) {
  if (!curved) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const directions = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  const from = directions[fromAnchor] || { x: 0, y: 0 };
  const to = directions[toAnchor] || { x: 0, y: 0 };
  const distance = Math.max(50, Math.hypot(end.x - start.x, end.y - start.y) * 0.35);
  return `M ${start.x} ${start.y} C ${start.x + from.x * distance} ${start.y + from.y * distance}, ${end.x + to.x * distance} ${end.y + to.y * distance}, ${end.x} ${end.y}`;
}

export async function exportWallPNG(notes, wall, tasks = []) {
  const positions = wall.positions || {};
  const taskPositions = wall.taskPositions || {};
  const sizes = wall.sizes || {};
  const endpointExists = (connection, side) => {
    const type = connection[`${side}Type`] || 'note';
    return type === 'task'
      ? tasks.some((task) => String(task.id) === String(connection[side]))
      : notes.some((note) => String(note.id) === String(connection[side]));
  };
  const connections = (wall.connections || []).filter((connection) => endpointExists(connection, 'from') && endpointExists(connection, 'to'));
  const width = Math.max(1100,
    ...notes.map((note) => (positions[note.id]?.x || 0) + (sizes[note.id]?.width || 250) + 40),
    ...tasks.map((task) => (taskPositions[task.id]?.x || 0) + 190));
  const height = Math.max(720,
    ...notes.map((note) => (positions[note.id]?.y || 0) + (sizes[note.id]?.height || 190) + 40),
    ...tasks.map((task) => (taskPositions[task.id]?.y || 0) + 60));
  const links = connections.map((connection) => {
    const fromIsTask = connection.fromType === 'task';
    const toIsTask = connection.toType === 'task';
    const from = (fromIsTask ? taskPositions : positions)[connection.from] || { x: 40, y: 40 };
    const to = (toIsTask ? taskPositions : positions)[connection.to] || { x: 40, y: 40 };
    const fromSize = fromIsTask ? { width: 180, height: 42 } : sizes[connection.from] || { width: 250, height: 190 };
    const toSize = toIsTask ? { width: 180, height: 42 } : sizes[connection.to] || { width: 250, height: 190 };
    const dash = connection.style === 'dotted' ? ' stroke-dasharray="3 9"' : connection.style === 'dashed' ? ' stroke-dasharray="12 8"' : '';
    const start = getConnectionAnchor(from, fromSize, connection.fromAnchor);
    const end = getConnectionAnchor(to, toSize, connection.toAnchor);
    const path = getConnectionSvgPath(start, end, connection.fromAnchor, connection.toAnchor, connection.curved !== false);
    return `<path d="${path}" fill="none" stroke="${escapeXml(connection.color || '#a5b4fc')}" stroke-width="4"${dash} />`;
  }).join('');
  const cards = notes.map((note) => {
    const position = positions[note.id] || { x: 40, y: 40 };
    const dimensions = sizes[note.id] || { width: 250, height: 190 };
    const color = NOTE_COLORS[note.color] || NOTE_COLORS.yellow;
    const textWidth = Math.max(18, Math.floor((dimensions.width - 36) / 8));
    const title = wrapText(getWallNoteTitle(note), textWidth).slice(0, 2);
    const body = wrapText(getNotePlainText(note), textWidth + 4).slice(0, 3);
    const titleLines = title.map((line, index) => `<tspan x="18" dy="${index ? 20 : 0}">${escapeXml(line)}</tspan>`).join('');
    const bodyLines = body.map((line, index) => `<tspan x="18" dy="${index ? 19 : 0}">${escapeXml(line)}</tspan>`).join('');
    const tags = (note.tags || []).slice(0, 3).map((tag, index) =>
      `<text x="18" y="${dimensions.height - 18}" dx="${index * 82}" font-family="Arial,sans-serif" font-size="12" fill="#334155">#${escapeXml(tag)}</text>`
    ).join('');
    return `<g transform="translate(${position.x} ${position.y})"><rect width="${dimensions.width}" height="${dimensions.height}" rx="14" fill="${color}" /><text x="18" y="30" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">${titleLines}</text><text x="18" y="${40 + title.length * 20}" font-family="Arial,sans-serif" font-size="13" fill="#334155">${bodyLines}</text>${tags}</g>`;
  }).join('');
  const taskCards = tasks.map((task) => {
    const position = taskPositions[task.id] || { x: 40, y: 40 };
    const title = escapeXml(task.title || 'Untitled task');
    const category = escapeXml(task.category || 'Inbox');
    const status = task.completed ? 'Complete' : 'Open';
    return `<g transform="translate(${position.x} ${position.y})"><rect width="180" height="42" rx="8" fill="#f8fafc" stroke="#475569" stroke-width="2"/><text x="10" y="17" font-family="Arial,sans-serif" font-size="10" fill="#475569">${category}</text><text x="10" y="33" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#0f172a">${title} · ${status}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#111827"/>${links}${cards}${taskCards}</svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    const imageLoaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not render the wall image.'));
    });
    image.src = svgUrl;
    await imageLoaded;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the PNG file.'))), 'image/png');
    });
    downloadBlob(png, 'kazedesk-note-wall.png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
