const DEFAULT_CARD_SIZE = { width: 250, height: 190 };
const CARD_GAP = 72;

function getNodeKey(node) {
  return node.wallKey ?? node.id;
}

function getSize(node, sizes) {
  return sizes[getNodeKey(node)]
    || (node.type === 'attachment' ? { width: 300, height: 250 } : null)
    || (node.type === 'webclip' ? { width: 320, height: 260 } : null)
    || DEFAULT_CARD_SIZE;
}

function getCenter(node, positions, sizes) {
  const position = positions[getNodeKey(node)] || { x: 30, y: 30 };
  const size = getSize(node, sizes);
  return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
}

function getFacingAnchors(from, to, positions, sizes) {
  const fromCenter = getCenter(from, positions, sizes);
  const toCenter = getCenter(to, positions, sizes);
  const deltaX = toCenter.x - fromCenter.x;
  const deltaY = toCenter.y - fromCenter.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? { fromAnchor: 'right', toAnchor: 'left' } : { fromAnchor: 'left', toAnchor: 'right' };
  }
  return deltaY >= 0 ? { fromAnchor: 'bottom', toAnchor: 'top' } : { fromAnchor: 'top', toAnchor: 'bottom' };
}

export function tidyWallLayout(notes, wall, extraNodes = []) {
  const allNodes = [...notes, ...extraNodes];
  const originalPositions = {
    ...wall.positions,
    ...Object.fromEntries(Object.entries(wall.taskPositions || {}).map(([id, position]) => [`task:${id}`, position])),
  };
  const positions = Object.fromEntries(allNodes.map((node) => {
    const key = getNodeKey(node);
    const position = originalPositions[node.type === 'task' ? `task:${node.id}` : node.id] || { x: 30, y: 30 };
    return [key, { x: Math.max(0, position.x), y: Math.max(0, position.y) }];
  }));
  const sizes = {
    ...(wall.sizes || {}),
    ...Object.fromEntries(extraNodes.map((node) => [getNodeKey(node), { width: 180, height: 42 }])),
  };

  for (let pass = 0; pass < 48; pass += 1) {
    let moved = false;
    for (let first = 0; first < allNodes.length; first += 1) {
      const firstNote = allNodes[first];
      const firstKey = getNodeKey(firstNote);
      const firstPosition = positions[firstKey];
      const firstSize = getSize(firstNote, sizes);
      for (let second = first + 1; second < allNodes.length; second += 1) {
        const secondNote = allNodes[second];
        const secondKey = getNodeKey(secondNote);
        const secondPosition = positions[secondKey];
        const secondSize = getSize(secondNote, sizes);
        const overlapX = Math.min(
          firstPosition.x + firstSize.width + CARD_GAP - secondPosition.x,
          secondPosition.x + secondSize.width + CARD_GAP - firstPosition.x,
        );
        const overlapY = Math.min(
          firstPosition.y + firstSize.height + CARD_GAP - secondPosition.y,
          secondPosition.y + secondSize.height + CARD_GAP - firstPosition.y,
        );
        if (overlapX <= 0 || overlapY <= 0) continue;

        const firstCenter = getCenter(firstNote, positions, sizes);
        const secondCenter = getCenter(secondNote, positions, sizes);
        if (overlapX < overlapY) {
          const direction = firstCenter.x <= secondCenter.x ? -1 : 1;
          const shift = overlapX / 2;
          firstPosition.x = Math.max(0, firstPosition.x + direction * shift);
          secondPosition.x = Math.max(0, secondPosition.x - direction * shift);
        } else {
          const direction = firstCenter.y <= secondCenter.y ? -1 : 1;
          const shift = overlapY / 2;
          firstPosition.y = Math.max(0, firstPosition.y + direction * shift);
          secondPosition.y = Math.max(0, secondPosition.y - direction * shift);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  const connections = wall.connections.map((connection) => {
    const from = allNodes.find((node) => (node.type || 'note') === (connection.fromType || 'note') && String(node.id) === String(connection.from));
    const to = allNodes.find((node) => (node.type || 'note') === (connection.toType || 'note') && String(node.id) === String(connection.to));
    if (!from || !to) return connection;
    return { ...connection, ...getFacingAnchors(from, to, positions, sizes), curved: true };
  });

  return {
    positions: Object.fromEntries(allNodes.filter((node) => node.type !== 'task').map((node) => [node.id, positions[getNodeKey(node)]])),
    taskPositions: Object.fromEntries(extraNodes.filter((node) => node.type === 'task').map((node) => [node.id, positions[getNodeKey(node)]])),
    connections,
  };
}
