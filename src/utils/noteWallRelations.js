const RELATION_COLORS = ['#8da5e8', '#71b8c2', '#8fbd91', '#d596b0', '#d5ad70', '#ac93d8', '#76b5a2', '#d88c82'];

export function getWallRelationColor(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return RELATION_COLORS[Math.abs(hash) % RELATION_COLORS.length];
}

function getPairKey(fromType, fromId, toType, toId) {
  return [`${fromType}:${String(fromId)}`, `${toType}:${String(toId)}`].sort().join('|');
}

export function addRelatedWallConnections(notes, tasks, existingConnections) {
  const connections = [...existingConnections];
  const existingPairs = new Set(existingConnections.map((connection) => getPairKey(
    connection.fromType || 'note',
    connection.from,
    connection.toType || 'note',
    connection.to,
  )));
  const addConnection = (fromType, from, toType, to, style, relation) => {
    const pair = getPairKey(fromType, from.id, toType, to.id);
    if (existingPairs.has(pair)) return;
    const color = getWallRelationColor(relation);
    connections.push({
      id: crypto.randomUUID(),
      from: String(from.id),
      to: String(to.id),
      fromType,
      toType,
      color,
      baseColor: color,
      managedColor: true,
      style,
      curved: true,
      fromAnchor: 'right',
      toAnchor: 'left',
    });
    existingPairs.add(pair);
  };

  for (let first = 0; first < notes.length; first += 1) {
    for (let second = first + 1; second < notes.length; second += 1) {
      const from = notes[first];
      const to = notes[second];
      const fromCategory = from.category || 'Inbox';
      const toCategory = to.category || 'Inbox';
      if (fromCategory === toCategory) {
        addConnection('note', from, 'note', to, 'solid', `folder:${fromCategory}`);
        continue;
      }
      const sharedTag = (from.tags || []).find((tag) => to.tags?.includes(tag));
      if (sharedTag) addConnection('note', from, 'note', to, 'dotted', `tag:${sharedTag}`);
    }
  }

  tasks.forEach((task) => {
    const category = task.category || 'Inbox';
    if (category === 'Inbox') return;
    notes.filter((note) => (note.category || 'Inbox') === category)
      .forEach((note) => addConnection('task', task, 'note', note, 'dashed', `folder:${category}`));
  });

  return connections;
}
