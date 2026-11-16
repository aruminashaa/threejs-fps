// Foundry Yard: an original desert-foundry map, 52 x 48 m, single level.
// Three lanes run south (Vanguard spawn) to north (Warden spawn): A Lane east,
// B Lane west, Mid through the foundry gate. Two plant sites: A (Furnace, east)
// and B (Silo, west). A back lane behind the north blocks lets defenders rotate.
//
// Boxes are [x, z, width, depth, height, material]. Walls are 4.2 m; crates are
// 1.1 m cover you can shoot over while standing. Nothing here is stepped on:
// the whole playable floor is y = 0, so bots and players share one plane.
export const MAP = {
  bounds: { minX: -26, maxX: 26, minZ: -24, maxZ: 24 },
  boxes: [
    // Perimeter (h 4.6)
    [0, -24.3, 53.2, 0.6, 4.6, 'charcoal'],
    [0, 24.3, 53.2, 0.6, 4.6, 'charcoal'],
    [-26.3, 0, 0.6, 49.2, 4.6, 'charcoal'],
    [26.3, 0, 0.6, 49.2, 4.6, 'charcoal'],
    // Lane divider blocks: the foundry halls separating Mid from the side lanes
    [-5.5, 0, 5, 14, 4.2, 'charcoalLight'],
    [5.5, 0, 5, 14, 4.2, 'charcoalLight'],
    // North blocks flanking the Mid exit, shaping the sites' backs
    [-11, -17, 8, 5, 4.2, 'charcoalLight'],
    [11, -17, 8, 5, 4.2, 'charcoalLight'],
    // Mid gate pillars (the lintel is visual only, above head height)
    [-2.4, -2, 1.2, 1.2, 4.2, 'rustDark'],
    [2.4, -2, 1.2, 1.2, 4.2, 'rustDark'],
    // Mid north wall with a 3.8 m gap OFFSET WEST of the lane's centre line,
    // so the spawn-to-spawn sightline down Mid is broken: no cross-map duels.
    [-6, -11, 4.4, 0.6, 4.2, 'charcoal'],
    [2.2, -11, 4.4, 0.6, 4.2, 'charcoal'],
    // Site A entry wall, two segments with a gap
    [11.5, -15.5, 0.6, 3, 4.2, 'charcoal'],
    [11.5, -9.3, 0.6, 3, 4.2, 'charcoal'],
    // Site B entry wall, mirrored
    [-11.5, -15.5, 0.6, 3, 4.2, 'charcoal'],
    [-11.5, -9.3, 0.6, 3, 4.2, 'charcoal'],
    // Furnace (Site A) and Silo (Site B) cores, boxed for collision
    [21.5, -14.5, 3.2, 3.2, 3.4, 'rustDark'],
    [-21.5, -14.5, 3.6, 3.6, 5.2, 'tealDark'],
    // Crates: Mid (kept off the x = 0 waypoint line so bots never stall on one)
    [-1.5, 6, 1.6, 1.6, 1.1, 'crate'],
    [1.8, 4.5, 1.6, 1.6, 1.1, 'crateDark'],
    [1.9, -6.5, 1.6, 1.6, 1.1, 'crate'],
    [-2.4, -9.5, 2.4, 1.2, 1.1, 'crateDark'],
    // Crates: A Lane (kept off the x = 11 lane line and the site entry line)
    [12.6, 6, 1.6, 1.6, 1.1, 'crate'],
    [9, -2, 1.6, 1.6, 1.1, 'crateDark'],
    [14.5, -8, 1.6, 1.6, 1.1, 'crate'],
    [16, -6, 2.2, 1.2, 1.1, 'crateDark'],
    // Crates: B Lane (mirrored)
    [-12.6, 6, 1.6, 1.6, 1.1, 'crate'],
    [-9, -2, 1.6, 1.6, 1.1, 'crateDark'],
    [-14.5, -8, 1.6, 1.6, 1.1, 'crate'],
    [-16, -6, 2.2, 1.2, 1.1, 'crateDark'],
    // Crates: Site A
    [15, -8.6, 1.6, 1.6, 1.1, 'crate'],
    [19.5, -13.5, 1.6, 1.6, 1.1, 'crateDark'],
    [20, -9, 1.6, 1.6, 1.1, 'crate'],
    // Crates: Site B (mirrored)
    [-15, -8.6, 1.6, 1.6, 1.1, 'crate'],
    [-19.5, -13.5, 1.6, 1.6, 1.1, 'crateDark'],
    [-20, -9, 1.6, 1.6, 1.1, 'crate'],
    // Crates: spawns (the Warden pair hugs the north wall, clear of the lane)
    [-5, 21, 1.6, 1.6, 1.1, 'crateDark'],
    [5, 21, 1.6, 1.6, 1.1, 'crate'],
    [-9, -23, 1.6, 1.6, 1.1, 'crate'],
    [9, -23, 1.6, 1.6, 1.1, 'crateDark'],
  ],
  // Visual-only dressing: [kind, x, z, ...args]. No collision, no gameplay.
  props: [
    ['lintel', 0, -2, 6, 0.8, 1.4, 3.6], // mid gate beam over the pillars
    ['chimney', 21.5, -14.5, 1.1, 4.5, 1.1],
    ['tank', -21.5, -14.5, 2.0, 5.2], // silo cylinder on its boxed base
    ['furnace', 21.5, -14.5, 1.7, 3.0], // furnace drum on its boxed base
    ['pole', -8, 12, 5.5], ['pole', 8, 12, 5.5],
    ['pole', -8, -12, 5.5], ['pole', 8, -12, 5.5],
    ['pole', 0, 18, 5.5], ['pole', 0, -20, 5.5],
    ['pipe', -8.2, 0, 14], ['pipe', 8.2, 0, 14],
  ],
  sites: {
    A: { letter: 'A', name: 'Furnace', x: 17, z: -12, w: 11, d: 9, color: 'siteA' },
    B: { letter: 'B', name: 'Silo', x: -17, z: -12, w: 11, d: 9, color: 'siteB' },
  },
  spawns: {
    vanguard: [[0, 21], [-3, 22], [3, 22], [0, 19]],
    warden: [[0, -21], [-3, -22], [3, -22], [-6, -20.5]],
  },
  // Defender hold spots: [x, z, faceYaw] — yaw 0 faces north (-z).
  holds: {
    A: [[18.6, -8, 2.4], [15.5, -15.5, 2.8], [21, -12.2, 2.0]],
    B: [[-18.6, -8, -2.4], [-15.5, -15.5, -2.8], [-21, -12.2, -2.0]],
    mid: [[-1.5, -13.5, 3.14], [0, -9, 3.14]],
  },
};

// Waypoint graph. Nodes are [id, x, z]; edges are [a, b] pairs. Every edge was
// checked against the boxes above: no edge crosses a wall or a crate.
export const WAYPOINTS = [
  ['v0', 0, 21], ['v1', -5, 19], ['v2', 5, 19],
  ['c0', -11, 12], ['c1', 0, 12], ['c2', 11, 12],
  ['m0', 0, 16], ['m1', 0, 9], ['m2', 0, 3], ['m3', 0, -4], ['m4', 0, -8],
  ['m5', -1.5, -13.5], ['m6', 0, -18],
  ['a0', 11, 16], ['a1', 11, 9], ['a2', 11, 2], ['a3', 11, -5],
  ['a4', 13.5, -9.5], ['a5', 17, -12], ['a6', 20, -11], ['a7', 16.5, -14],
  ['b0', -11, 16], ['b1', -11, 9], ['b2', -11, 2], ['b3', -11, -5],
  ['b4', -13.5, -9.5], ['b5', -17, -12], ['b6', -20, -11], ['b7', -16.5, -14],
  ['n0', -18, -21.5], ['n1', -8, -21.5], ['n2', 0, -21.5],
  ['n3', 8, -21.5], ['n4', 18, -21.5],
  ['w0', -3, -21], ['w1', 3, -21],
];

export const EDGES = [
  ['v0', 'm0'], ['v0', 'v1'], ['v0', 'v2'], ['v1', 'c0'], ['v2', 'c2'],
  ['v1', 'm0'], ['v2', 'm0'], ['m0', 'm1'], ['m1', 'c1'],
  ['c0', 'b0'], ['c2', 'a0'], ['c0', 'c1'], ['c1', 'c2'],
  ['c0', 'm1'], ['c2', 'm1'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'm5'], ['m5', 'm6'],
  ['m6', 'n2'], ['m6', 'w0'], ['m6', 'w1'],
  ['a0', 'a1'], ['a1', 'c2'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'],
  ['a4', 'a5'], ['a5', 'a6'], ['a5', 'a7'], ['a7', 'n4'],
  ['b0', 'b1'], ['b1', 'c0'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'],
  ['b4', 'b5'], ['b5', 'b6'], ['b5', 'b7'], ['b7', 'n0'],
  ['n0', 'n1'], ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'],
  ['w0', 'n2'], ['w1', 'n2'], ['w0', 'n1'], ['w1', 'n3'],
];
