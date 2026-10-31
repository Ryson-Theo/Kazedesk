const THEME_LINE_COLORS = {
  dark: ['#72d5ff', '#ff8c69', '#a8e879', '#e1a0ff', '#ffd166', '#72f0cf', '#ff8ab0', '#b6b8ff'],
  light: ['#075985', '#b42318', '#3f6212', '#7e22ce', '#92400e', '#0f766e', '#be185d', '#3730a3'],
};
const CURVE_SAMPLES = 20;
const ENDPOINT_MARGIN = 0.06;

function getAnchor(position, size, anchor) {
  switch (anchor) {
    case 'top': return { x: position.x + size.width / 2, y: position.y };
    case 'right': return { x: position.x + size.width, y: position.y + size.height / 2 };
    case 'bottom': return { x: position.x + size.width / 2, y: position.y + size.height };
    case 'left': return { x: position.x, y: position.y + size.height / 2 };
    default: return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  }
}

function getPoints(connection, nodes) {
  const from = nodes[`${connection.fromType || 'note'}:${connection.from}`];
  const to = nodes[`${connection.toType || 'note'}:${connection.to}`];
  if (!from || !to) return [];
  const fromAnchor = connection.fromAnchor || 'right';
  const toAnchor = connection.toAnchor || 'left';
  const start = getAnchor(from.position, from.size, fromAnchor);
  const end = getAnchor(to.position, to.size, toAnchor);
  if (connection.curved === false) return [start, end];
  const directions = {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  const startDirection = directions[fromAnchor] || { x: 0, y: 0 };
  const endDirection = directions[toAnchor] || { x: 0, y: 0 };
  const distance = Math.max(50, Math.hypot(end.x - start.x, end.y - start.y) * 0.35);
  const control1 = { x: start.x + startDirection.x * distance, y: start.y + startDirection.y * distance };
  const control2 = { x: end.x + endDirection.x * distance, y: end.y + endDirection.y * distance };
  return Array.from({ length: CURVE_SAMPLES + 1 }, (_, index) => {
    const t = index / CURVE_SAMPLES;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
    };
  });
}

function segmentIntersection(firstStart, firstEnd, secondStart, secondEnd, firstIndex, secondIndex, firstCount, secondCount) {
  const firstX = firstEnd.x - firstStart.x;
  const firstY = firstEnd.y - firstStart.y;
  const secondX = secondEnd.x - secondStart.x;
  const secondY = secondEnd.y - secondStart.y;
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) < 0.001) return false;
  const offsetX = secondStart.x - firstStart.x;
  const offsetY = secondStart.y - firstStart.y;
  const firstT = (offsetX * secondY - offsetY * secondX) / denominator;
  const secondT = (offsetX * firstY - offsetY * firstX) / denominator;
  if (firstT <= 0 || firstT >= 1 || secondT <= 0 || secondT >= 1) return false;
  const firstProgress = (firstIndex + firstT) / firstCount;
  const secondProgress = (secondIndex + secondT) / secondCount;
  return firstProgress > ENDPOINT_MARGIN && firstProgress < 1 - ENDPOINT_MARGIN
    && secondProgress > ENDPOINT_MARGIN && secondProgress < 1 - ENDPOINT_MARGIN;
}

function pathsIntersect(first, second) {
  const getBounds = (points) => points.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    right: Math.max(bounds.right, point.x),
    top: Math.min(bounds.top, point.y),
    bottom: Math.max(bounds.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const firstBounds = getBounds(first);
  const secondBounds = getBounds(second);
  if (firstBounds.right < secondBounds.left || secondBounds.right < firstBounds.left
    || firstBounds.bottom < secondBounds.top || secondBounds.bottom < firstBounds.top) return false;
  const firstCount = first.length - 1;
  const secondCount = second.length - 1;
  for (let firstIndex = 0; firstIndex < firstCount; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < secondCount; secondIndex += 1) {
      if (segmentIntersection(
        first[firstIndex],
        first[firstIndex + 1],
        second[secondIndex],
        second[secondIndex + 1],
        firstIndex,
        secondIndex,
        firstCount,
        secondCount,
      )) return true;
    }
  }
  return false;
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

export function recolorIntersectingConnections(connections, notes, tasks, wall, theme, attachments = [], webClips = []) {
  const nodes = {};
  notes.forEach((note) => {
    nodes[`note:${note.id}`] = {
      position: wall.positions?.[note.id] || { x: 0, y: 0 },
      size: wall.sizes?.[note.id] || { width: 250, height: 190 },
    };
  });
  tasks.forEach((task) => {
    nodes[`task:${task.id}`] = {
      position: wall.taskPositions?.[task.id] || { x: 0, y: 0 },
      size: { width: 180, height: 42 },
    };
  });
  attachments.forEach((attachment) => {
    nodes[`attachment:${attachment.id}`] = {
      position: wall.positions?.[attachment.id] || { x: 0, y: 0 },
      size: wall.sizes?.[attachment.id] || { width: 300, height: 250 },
    };
  });
  webClips.forEach((clip) => {
    nodes[`webclip:${clip.id}`] = {
      position: wall.positions?.[clip.id] || { x: 0, y: 0 },
      size: wall.sizes?.[clip.id] || { width: 320, height: 260 },
    };
  });

  const paths = connections.map((connection) => getPoints(connection, nodes));
  const adjacency = connections.map(() => new Set());
  for (let first = 0; first < connections.length; first += 1) {
    if (!paths[first].length) continue;
    for (let second = first + 1; second < connections.length; second += 1) {
      if (paths[second].length && pathsIntersect(paths[first], paths[second])) {
        adjacency[first].add(second);
        adjacency[second].add(first);
      }
    }
  }

  const colors = THEME_LINE_COLORS[theme] || THEME_LINE_COLORS.dark;
  const order = connections.map((_, index) => index)
    .filter((index) => connections[index].managedColor && connections[index].baseColor)
    .sort((first, second) => adjacency[second].size - adjacency[first].size || String(connections[first].id).localeCompare(String(connections[second].id)));
  const assigned = new Map();
  order.forEach((index) => {
    if (!adjacency[index].size) return;
    const usedColors = new Set([...adjacency[index]]
      .map((neighbor) => assigned.get(neighbor) || connections[neighbor].color)
      .filter(Boolean));
    const preferredIndex = hash(String(connections[index].id)) % colors.length;
    const colorIndex = colors.findIndex((_, offset) => !usedColors.has(colors[(preferredIndex + offset) % colors.length]));
    assigned.set(index, colorIndex < 0 ? colors[preferredIndex] : colors[(preferredIndex + colorIndex) % colors.length]);
  });

  return connections.map((connection, index) => {
    if (!connection.managedColor || !connection.baseColor) return connection;
    const color = assigned.get(index) || connection.baseColor;
    return connection.color === color ? connection : { ...connection, color };
  });
}
