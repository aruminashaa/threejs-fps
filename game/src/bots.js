// Bot AI. Every bot runs a small state machine over a waypoint graph:
// advance along its lane, hold a spot, engage what it sees, plant or defuse
// the charge, rotate when the bomb goes down. Perception is sight (range,
// field of view, line of sight) plus hearing (gunshots betray a position),
// and every bot has its own reaction time and aim error, so bots feel like
// players of different skill instead of aimbots.
import * as THREE from 'three';
import { BOT, WEAPONS } from './config.js';
import { MAP, WAYPOINTS, EDGES } from './map.js';
import { hasLineOfSight, moveCircle, pointInRect } from './collide.js';

// --- Waypoint graph, built once. Dijkstra over ~40 nodes is trivial.
const NODES = new Map(WAYPOINTS.map(([id, x, z]) => [id, { id, x, z }]));
const ADJ = new Map();
for (const [a, b] of EDGES) {
  const na = NODES.get(a);
  const nb = NODES.get(b);
  const d = Math.hypot(na.x - nb.x, na.z - nb.z);
  if (!ADJ.has(a)) ADJ.set(a, []);
  if (!ADJ.has(b)) ADJ.set(b, []);
  ADJ.get(a).push({ to: b, d });
  ADJ.get(b).push({ to: a, d });
}

function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const n of NODES.values()) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestNode(fromX, fromZ);
  const goal = nearestNode(toX, toZ);
  const dist = new Map([[start.id, 0]]);
  const prev = new Map();
  const visited = new Set();
  const queue = [{ id: start.id, d: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift();
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.id === goal.id) break;
    for (const e of ADJ.get(cur.id) || []) {
      const nd = cur.d + e.d;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur.id);
        queue.push({ id: e.to, d: nd });
      }
    }
  }
  const path = [];
  let id = goal.id;
  while (id) {
    const n = NODES.get(id);
    path.unshift({ x: n.x, z: n.z });
    id = prev.get(id);
  }
  path.push({ x: toX, z: toZ });
  return path;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createBotSystem({ state, colliders, weapons, audio, onHit, onKill }) {
  const bounds = MAP.bounds;
  const aimDir = new THREE.Vector3();

  function makeBrain(actor, random) {
    const skill = 0.45 + random() * 0.5;
    return {
      skill,
      site: null, lane: null,
      mode: 'advance', // advance | hold | engage | plant | defuse | rotate | hunt
      path: [], pathIndex: 0,
      goal: null, // {x, z} the current path leads to
      target: null,
      lastKnown: null, // {x, z, t}
      reactAt: 0,
      aimTime: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      holdSpot: null,
      strafeDir: 1,
      strafeUntil: 0,
      stuckSince: 0,
      sidestep: null, // {x, z, until} — a lateral dodge when a path stalls
      sidestepSide: 1,
      lastX: actor.pos.x,
      lastZ: actor.pos.z,
      repathAt: 0,
      heardShot: null,
    };
  }

  function setPath(brain, actor, x, z) {
    brain.path = findPath(actor.pos.x, actor.pos.z, x, z);
    brain.pathIndex = 0;
    brain.goal = { x, z };
  }

  function assignRoundRoles(random) {
    const attackers = state.actors.filter((a) => a.team === 'vanguard' && !a.isPlayer);
    const defenders = state.actors.filter((a) => a.team === 'warden');
    const lanes = ['a', 'b', 'mid'];
    attackers.forEach((bot, i) => {
      bot.brain.lane = lanes[i % lanes.length];
      bot.brain.site = bot.brain.lane === 'b' ? 'B' : 'A';
      bot.brain.mode = 'advance';
      bot.brain.target = null;
      bot.brain.lastKnown = null;
      const site = MAP.sites[bot.brain.site];
      setPath(bot.brain, bot, site.x, site.z);
    });
    // Defenders: one mid watcher, the rest split across the sites' holds.
    const holdsA = [...MAP.holds.A];
    const holdsB = [...MAP.holds.B];
    defenders.forEach((bot, i) => {
      bot.brain.target = null;
      bot.brain.lastKnown = null;
      if (i === 0) {
        bot.brain.site = 'mid';
        bot.brain.holdSpot = { x: MAP.holds.mid[0][0], z: MAP.holds.mid[0][1], yaw: MAP.holds.mid[0][2] };
      } else if (i % 2 === 1) {
        bot.brain.site = 'A';
        const h = holdsA.shift() || MAP.holds.A[0];
        bot.brain.holdSpot = { x: h[0], z: h[1], yaw: h[2] };
      } else {
        bot.brain.site = 'B';
        const h = holdsB.shift() || MAP.holds.B[0];
        bot.brain.holdSpot = { x: h[0], z: h[1], yaw: h[2] };
      }
      bot.brain.mode = 'advance';
      setPath(bot.brain, bot, bot.brain.holdSpot.x, bot.brain.holdSpot.z);
    });
  }

  // Perception: the nearest enemy this bot can currently see.
  function seeEnemy(bot) {
    const brain = bot.brain;
    let best = null;
    let bestD = BOT.sightRange;
    for (const other of state.actors) {
      if (other.team === bot.team || !other.alive) continue;
      const dx = other.pos.x - bot.pos.x;
      const dz = other.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      // Field of view, unless the bot is already alerted to this enemy.
      const angleTo = Math.atan2(-dx, -dz);
      let diff = angleTo - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const alerted = brain.target === other || (brain.lastKnown && state.time - brain.lastKnown.t < 6);
      if (!alerted && Math.abs(diff) > BOT.fov) continue;
      if (!hasLineOfSight(bot.pos.x, bot.pos.z, other.pos.x, other.pos.z, colliders)) continue;
      best = other;
      bestD = d;
    }
    return best;
  }

  function steer(bot, tx, tz, dt, speedScale = 1) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const speed = BOT.speed * speedScale;
    const vx = (dx / d) * speed;
    const vz = (dz / d) * speed;
    const blend = Math.min(1, dt * 8);
    bot.vel.x += (vx - bot.vel.x) * blend;
    bot.vel.z += (vz - bot.vel.z) * blend;
    moveCircle(bot.pos, bot.vel.x * dt, bot.vel.z * dt, bot.radius, colliders, bounds);
    bot.yaw = angleLerp(bot.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 6));
    return d < 0.7;
  }

  function followPath(bot, dt) {
    const brain = bot.brain;
    // Sidestepping around a block: steer sideways first, then replan.
    if (brain.sidestep) {
      if (state.time > brain.sidestep.until
        || steer(bot, brain.sidestep.x, brain.sidestep.z, dt)) {
        brain.sidestep = null;
        brain.stuckSince = 0;
        if (brain.goal) setPath(brain, bot, brain.goal.x, brain.goal.z);
      }
      return false;
    }
    if (brain.pathIndex >= brain.path.length) return true;
    const node = brain.path[brain.pathIndex];
    if (steer(bot, node.x, node.z, dt)) brain.pathIndex += 1;
    // Stuck: no progress for a while means the path is blocked. Sidestep
    // sideways around the obstacle (a crate corner, another bot) instead of
    // re-planning the same blocked line; replan only if that fails too.
    const moved = Math.hypot(bot.pos.x - brain.lastX, bot.pos.z - brain.lastZ);
    if (moved < 0.05) {
      brain.stuckSince += dt;
      if (brain.stuckSince > 0.6) {
        const dx = node.x - bot.pos.x;
        const dz = node.z - bot.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const side = brain.sidestepSide;
        brain.sidestepSide = -side;
        brain.sidestep = {
          x: bot.pos.x + (-dz / len) * side * 1.8,
          z: bot.pos.z + (dx / len) * side * 1.8,
          until: state.time + 1.2,
        };
        brain.stuckSince = 0;
      }
    } else {
      brain.stuckSince = 0;
    }
    brain.lastX = bot.pos.x;
    brain.lastZ = bot.pos.z;
    return brain.pathIndex >= brain.path.length;
  }

  function stop(bot, dt) {
    const damp = Math.max(0, 1 - 10 * dt);
    bot.vel.x *= damp;
    bot.vel.z *= damp;
    moveCircle(bot.pos, bot.vel.x * dt, bot.vel.z * dt, bot.radius, colliders, bounds);
  }

  function shootAt(bot, target, dt) {
    const brain = bot.brain;
    const weapon = WEAPONS[bot.current];
    // Aim: track the target's chest, with an error that shrinks the longer
    // the bot holds the sight picture, and grows against moving targets.
    const targetSpeed = Math.hypot(target.vel.x, target.vel.z);
    const err = BOT.aimError * (1.6 - brain.skill) * (1 + targetSpeed * 0.12)
      / (1 + brain.aimTime * BOT.aimSettle);
    aimDir.set(
      target.pos.x - bot.pos.x + (Math.random() * 2 - 1) * err * 12,
      (target.pos.y + 1.25) - (bot.pos.y + bot.eye),
      target.pos.z - bot.pos.z + (Math.random() * 2 - 1) * err * 12,
    ).normalize();
    bot.yaw = angleLerp(bot.yaw, Math.atan2(-aimDir.x, -aimDir.z), Math.min(1, dt * 10));
    if (state.time < brain.burstPauseUntil) return;
    if (brain.burstLeft <= 0) {
      brain.burstLeft = BOT.burstMin + Math.floor(Math.random() * (BOT.burstMax - BOT.burstMin + 1));
    }
    if (weapons.fire(bot, aimDir, Math.hypot(bot.vel.x, bot.vel.z), onHit, onKill)) {
      brain.burstLeft -= 1;
      if (brain.burstLeft <= 0) brain.burstPauseUntil = state.time + BOT.burstPause * (0.7 + Math.random() * 0.6);
    } else if (bot.ammo[bot.current].mag === 0) {
      weapons.startReload(bot);
    }
  }

  function stepBot(bot, dt) {
    const brain = bot.brain;
    if (!bot.alive) return;
    bot.interacting = false;
    weapons.updateReload(bot, dt);
    if (bot.fireCooldown > 0) bot.fireCooldown -= dt;

    // Hearing: an enemy gunshot marks a position worth investigating.
    const shot = state.lastShot;
    if (shot && shot.team !== bot.team && shot.t !== brain.heardShot) {
      brain.heardShot = shot.t;
      const d = Math.hypot(shot.x - bot.pos.x, shot.z - bot.pos.z);
      if (d < BOT.hearRange) {
        brain.lastKnown = { x: shot.x, z: shot.z, t: state.time };
        if (brain.mode === 'hold' || brain.mode === 'advance') brain.mode = 'hunt';
      }
    }

    const seen = seeEnemy(bot);
    if (seen) {
      if (brain.target !== seen) {
        brain.target = seen;
        brain.reactAt = state.time + BOT.reactionMin
          + Math.random() * (BOT.reactionMax - BOT.reactionMin) * (1.6 - brain.skill);
        brain.aimTime = 0;
      }
      brain.lastKnown = { x: seen.pos.x, z: seen.pos.z, t: state.time };
      brain.aimTime += dt;
    } else if (brain.target) {
      // Lost sight: keep hunting the last known spot for a few seconds.
      brain.target = null;
      brain.aimTime = 0;
      if (brain.lastKnown && state.time - brain.lastKnown.t < 5) brain.mode = 'hunt';
      else if (brain.mode === 'engage') brain.mode = brain.site === 'mid' ? 'hold' : 'advance';
    }

    // Engage when the bot has a target and its reaction time has passed.
    if (brain.target && state.time >= brain.reactAt) {
      brain.mode = 'engage';
      // Strafe sideways while firing so the bot is not a still target.
      if (state.time > brain.strafeUntil) {
        brain.strafeDir = Math.random() < 0.5 ? -1 : 1;
        brain.strafeUntil = state.time + 0.5 + Math.random() * 0.8;
      }
      const side = brain.strafeDir;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const tx = bot.pos.x + (-fz * side) * 1.5 + fx * 0.2;
      const tz = bot.pos.z + (fx * side) * 1.5 + fz * 0.2;
      moveCircle(bot.pos, (tx - bot.pos.x) * dt * 1.5, (tz - bot.pos.z) * dt * 1.5,
        bot.radius, colliders, bounds);
      shootAt(bot, brain.target, dt);
      return;
    }
    if (brain.target) {
      // Seen but still reacting: stop and face the threat.
      stop(bot, dt);
      const dx = brain.target.pos.x - bot.pos.x;
      const dz = brain.target.pos.z - bot.pos.z;
      bot.yaw = angleLerp(bot.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 8));
      return;
    }

    // No target: role behaviour.
    const bomb = state.bomb;
    if (bot.team === 'vanguard') {
      if (bomb.state === 'planted') {
        // Defend the planted charge from a ring around its site.
        if (brain.mode !== 'hold') {
          brain.mode = 'hold';
          const site = MAP.sites[bomb.site];
          const a = Math.random() * Math.PI * 2;
          setPath(brain, bot, site.x + Math.cos(a) * 5, site.z + Math.sin(a) * 4);
        }
        if (followPath(bot, dt)) {
          stop(bot, dt);
          bot.yaw = angleLerp(bot.yaw, Math.atan2(-(bomb.x - bot.pos.x), -(bomb.z - bot.pos.z)), Math.min(1, dt * 3));
        }
        return;
      }
      if (state.carrier === bot) {
        // The carrier pushes to its site and plants.
        const site = MAP.sites[brain.site];
        if (pointInRect(bot.pos.x, bot.pos.z, site)) {
          stop(bot, dt);
          bot.interacting = true; // objective.js runs the plant channel
          return;
        }
        if (brain.mode !== 'plant') {
          brain.mode = 'plant';
          setPath(brain, bot, site.x, site.z);
        }
        followPath(bot, dt);
        return;
      }
      if (brain.mode === 'hunt' && brain.lastKnown && state.time - brain.lastKnown.t < 8) {
        if (brain.goal !== brain.lastKnown) {
          setPath(brain, bot, brain.lastKnown.x, brain.lastKnown.z);
          brain.goal = brain.lastKnown;
        }
        if (followPath(bot, dt)) brain.mode = 'advance';
        return;
      }
      // Advance to the site, then hold nearby and watch for defenders.
      if (followPath(bot, dt)) {
        brain.mode = 'hold';
        stop(bot, dt);
      }
      return;
    }

    // Wardens.
    if (bomb.state === 'planted') {
      // Rotate to the planted site and defuse.
      const d = Math.hypot(bomb.x - bot.pos.x, bomb.z - bot.pos.z);
      if (d < 2.6) {
        stop(bot, dt);
        bot.interacting = true; // objective.js runs the defuse channel
        return;
      }
      if (brain.mode !== 'defuse') {
        brain.mode = 'defuse';
        setPath(brain, bot, bomb.x, bomb.z);
      }
      followPath(bot, dt);
      return;
    }
    if (brain.mode === 'hunt' && brain.lastKnown && state.time - brain.lastKnown.t < 8) {
      if (brain.goal !== brain.lastKnown) {
        setPath(brain, bot, brain.lastKnown.x, brain.lastKnown.z);
        brain.goal = brain.lastKnown;
      }
      if (followPath(bot, dt)) {
        brain.mode = 'advance';
        if (brain.holdSpot) setPath(brain, bot, brain.holdSpot.x, brain.holdSpot.z);
      }
      return;
    }
    if (brain.mode === 'advance') {
      if (followPath(bot, dt)) brain.mode = 'hold';
      return;
    }
    // Holding: stand at the spot, scan slowly across the approach.
    stop(bot, dt);
    if (brain.holdSpot) {
      const scan = Math.sin(state.time * 0.4 + bot.slot * 1.7) * 0.6;
      bot.yaw = angleLerp(bot.yaw, brain.holdSpot.yaw + scan, Math.min(1, dt * 2));
    }
  }

  function step(dt) {
    for (const actor of state.actors) {
      if (!actor.isPlayer && actor.brain) stepBot(actor, dt);
    }
  }

  return { makeBrain, assignRoundRoles, step, findPath, nearestNode };
}
