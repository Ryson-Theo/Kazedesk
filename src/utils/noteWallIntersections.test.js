import { describe, expect, it } from 'vitest';
import { recolorIntersectingConnections } from './noteWallIntersections';

const notes = [
  { id: 'left' },
  { id: 'right' },
  { id: 'top' },
  { id: 'bottom' },
];
const positions = {
  left: { x: 0, y: 145 },
  right: { x: 400, y: 145 },
  top: { x: 200, y: 0 },
  bottom: { x: 200, y: 300 },
};
const wall = { positions, sizes: {}, taskPositions: {} };
const crossingLines = [
  { id: 'horizontal', from: 'left', to: 'right', color: '#aaaaaa', baseColor: '#aaaaaa', managedColor: true },
  { id: 'vertical', from: 'top', to: 'bottom', color: '#aaaaaa', baseColor: '#aaaaaa', managedColor: true, fromAnchor: 'bottom', toAnchor: 'top' },
];

describe('recolorIntersectingConnections', () => {
  it('gives crossing managed lines different colors from the active theme palette', () => {
    const dark = recolorIntersectingConnections(crossingLines, notes, [], wall, 'dark');
    const light = recolorIntersectingConnections(crossingLines, notes, [], wall, 'light');

    expect(dark[0].color).not.toBe(dark[1].color);
    expect(light[0].color).not.toBe(light[1].color);
    expect(dark.map((line) => line.color)).not.toEqual(light.map((line) => line.color));
  });

  it('preserves manually customized colors even at intersections', () => {
    const manuallyColored = [
      { ...crossingLines[0], color: '#ff00ff', managedColor: false, customColor: true },
      crossingLines[1],
    ];
    const recolored = recolorIntersectingConnections(manuallyColored, notes, [], wall, 'light');

    expect(recolored[0].color).toBe('#ff00ff');
    expect(recolored[1].color).not.toBe('#ff00ff');
  });

  it('restores base color when links no longer intersect', () => {
    const separatedWall = {
      ...wall,
      positions: { ...positions, top: { x: 700, y: 0 }, bottom: { x: 700, y: 300 } },
    };
    const previouslyRecolored = crossingLines.map((line) => ({ ...line, color: '#72d5ff' }));

    expect(recolorIntersectingConnections(previouslyRecolored, notes, [], separatedWall, 'dark')
      .map((line) => line.color)).toEqual(['#aaaaaa', '#aaaaaa']);
  });
});
