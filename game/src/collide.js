// 2D collision and sight on the XZ plane. The map is single-level, so every
// solid is an axis-aligned box and every actor is a circle; sight is a segment
// test, never a raycast, which keeps bot perception cheap at 60 Hz.
export function makeColliders(boxes) {
  // Each collider: min/max in x/z plus its top height. Crates (h <= 1.2) block
  // movement but not sight; walls block both.
  return boxes.map(([x, z, w, d, h]) => ({
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    top: h, blocksSight: h > 1.2,
  }));
}

// Circle vs AABB: true when the circle overlaps the box.
export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function circleHitsAny(x, z, r, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    if (circleHitsBox(x, z, r, colliders[i])) return true;
  }
  return false;
}

// Move a circle axis by axis so a wall never swallows the actor: sliding along
// a wall works because each axis is tested on its own.
export function moveCircle(pos, dx, dz, r, colliders, bounds) {
  const nx = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, pos.x + dx));
  if (!circleHitsAny(nx, pos.z, r, colliders)) pos.x = nx;
  const nz = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, pos.z + dz));
  if (!circleHitsAny(pos.x, nz, r, colliders)) pos.z = nz;
}

// Segment vs AABB in 2D (slab test). Returns true when the segment crosses the box.
export function segmentHitsBox(x0, z0, x1, z1, b) {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < b.minX || x0 > b.maxX) return false;
  } else {
    let t1 = (b.minX - x0) / dx;
    let t2 = (b.maxX - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < b.minZ || z0 > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - z0) / dz;
    let t2 = (b.maxZ - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Line of sight between two points: blocked only by sight-blocking boxes.
export function hasLineOfSight(x0, z0, x1, z1, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    if (!b.blocksSight) continue;
    if (segmentHitsBox(x0, z0, x1, z1, b)) return false;
  }
  return true;
}

export function pointInRect(x, z, rect) {
  return Math.abs(x - rect.x) <= rect.w / 2 && Math.abs(z - rect.z) <= rect.d / 2;
}
