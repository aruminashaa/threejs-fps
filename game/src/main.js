// Foundry Line: boot and the one loop. A fixed 60 Hz simulation feeds a
// render at the display's rate; input is sampled per frame, the world steps
// in fixed slices, and the camera follows the player's eye.
// ?shot=start|play|buy|site with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { FIXED_STEP, BOT_NAMES, WEAPONS } from './config.js';
import { MAP } from './map.js';
import { createState } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createActors } from './actors.js';
import { createPlayerController } from './player.js';
import { createWeaponSystem, spreadFor } from './weapons.js';
import { createBotSystem } from './bots.js';
import { createGrenades } from './grenades.js';
import { createObjective } from './objective.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { runShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);
const state = createState(random);

// --- Renderer and camera.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const actorsApi = createActors(scene, world.colliders);

// --- Actors: the player, 3 Vanguard bots, 4 Warden bots.
const player = actorsApi.makeActor({ name: 'You', team: 'vanguard', isPlayer: true, slot: 0 });
state.player = player;
state.actors.push(player);
BOT_NAMES.vanguard.forEach((name, i) => {
  state.actors.push(actorsApi.makeActor({ name, team: 'vanguard', isPlayer: false, slot: i + 1 }));
});
BOT_NAMES.warden.forEach((name, i) => {
  state.actors.push(actorsApi.makeActor({ name, team: 'warden', isPlayer: false, slot: i }));
});

// --- Systems. Rounds owns damage, so the weapon and grenade callbacks point at it.
let rounds;
const damageCb = (attacker, victim, amount, head, cause) => rounds.damage(attacker, victim, amount, head, cause);
const noop = () => {};
const weapons = createWeaponSystem({
  scene, camera, state, audio, worldShootables: world.shootables,
});
const grenades = createGrenades({
  scene, state, colliders: world.colliders, audio, onDamage: damageCb,
});
const objective = createObjective({
  scene, state, audio,
  onDetonate(x, z) {
    // The blast: light, shake and sound. The round is already decided.
    const flash = new THREE.PointLight(0xff7722, 200, 40, 1.5);
    flash.position.set(x, 3, z);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 600);
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    audio.explosion(d);
    state.shake = 1;
  },
});
const bots = createBotSystem({
  state, colliders: world.colliders, weapons, audio, onHit: damageCb, onKill: noop,
});
for (const actor of state.actors) {
  if (!actor.isPlayer) actor.brain = bots.makeBrain(actor, random);
}
rounds = createRounds({
  state, actorsApi, weapons, bots, objective, grenades, audio,
});
const playerCtl = createPlayerController(world.colliders, MAP.bounds);

let started = false;
const hud = createHud({
  state, rounds,
  onPlay() {
    audio.unlock();
    if (state.phase === 'menu' || state.phase === 'matchEnd') {
      rounds.startMatch();
      started = true;
    }
    hud.hideOverlay();
    input.requestLock();
  },
});
const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (started && !hud.buyOpen && state.phase !== 'matchEnd' && state.phase !== 'menu') {
    hud.showOverlay('paused');
  }
});

// --- Camera.
const camDir = new THREE.Vector3();
function syncCamera() {
  const shake = state.shake;
  const sx = shake ? (Math.random() - 0.5) * shake * 0.03 : 0;
  const sy = shake ? (Math.random() - 0.5) * shake * 0.03 : 0;
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  camera.rotation.set(player.pitch + sx, player.yaw + sy, 0, 'YXZ');
}

function aimAt(x, y, z) {
  const dx = x - player.pos.x;
  const dy = y - (player.pos.y + player.eye);
  const dz = z - player.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// --- One fixed simulation step.
function step(dt, withBots = true) {
  state.time += dt;
  const playing = state.phase === 'freeze' || state.phase === 'live' || state.phase === 'planted';
  if (playing && player.alive) {
    playerCtl.step(player, input.keys, dt);
    // Footsteps: a soft tick every couple of metres while running.
    stepDistance += playerCtl.groundSpeed(player) * dt;
    if (stepDistance > 2.4 && player.onGround) {
      stepDistance = 0;
      if (!player.crouching && !input.keys.has('ShiftLeft')) audio.step(0);
    }
  }
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  weapons.updateReload(player, dt);
  weapons.stepEffects(dt);
  grenades.step(dt);
  if (withBots && (state.phase === 'live' || state.phase === 'planted')) {
    bots.step(dt);
  }
  if (state.phase === 'live' || state.phase === 'planted' || state.phase === 'freeze') {
    const event = objective.step(dt);
    if (event) rounds.handleBombEvent(event);
  }
  rounds.step(dt);
  for (const actor of state.actors) {
    if (!actor.isPlayer) actorsApi.syncMesh(actor, dt);
  }
}
let stepDistance = 0;

// --- Per-frame input actions (fire, reload, grenade, buy, switch).
let prevFiring = false;
function frameActions() {
  const playing = state.phase === 'live' || state.phase === 'planted' || state.phase === 'freeze';
  const look = input.takeLook();
  if (look.x || look.y) playerCtl.look(player, look.x, look.y);

  if (input.pressed('KeyB') && playing && player.alive) {
    if (hud.buyOpen) {
      hud.closeBuy();
      input.requestLock();
    } else {
      hud.openBuy();
      if (hud.buyOpen) input.releaseLock();
    }
  }
  if (hud.buyOpen) {
    if (input.pressed('Digit1')) rounds.buy(player, 'rifle');
    else if (input.pressed('Digit2')) rounds.buy(player, 'scatter');
    else if (input.pressed('Digit3')) rounds.buy(player, 'grenade');
    if (input.pressed('Escape')) {
      hud.closeBuy();
      input.requestLock();
    }
    prevFiring = input.firing;
    return; // no shooting while the buy menu is open
  }
  if (!playing || !player.alive) {
    prevFiring = input.firing;
    return;
  }
  if (input.pressed('Digit1')) weapons.switchTo(player, 'pistol');
  if (input.pressed('Digit2')) weapons.switchTo(player, 'rifle');
  if (input.pressed('Digit3')) weapons.switchTo(player, 'scatter');
  if (input.pressed('KeyR')) weapons.startReload(player);
  if (input.pressed('KeyG') && player.grenades > 0) {
    camera.getWorldDirection(camDir);
    grenades.throwGrenade(player, camDir);
  }
  // E is held to plant/defuse; bots set the same flag on themselves.
  player.interacting = input.keys.has('KeyE');

  const weapon = WEAPONS[player.current];
  const freshPress = input.firing && !prevFiring;
  if (input.locked && (weapon.auto ? input.firing : freshPress)) {
    camera.getWorldDirection(camDir);
    const fired = weapons.fire(player, camDir, playerCtl.groundSpeed(player), damageCb, noop);
    if (fired) {
      playerCtl.recoil(player,
        weapon.recoilPitch * (0.8 + Math.random() * 0.4),
        (Math.random() * 2 - 1) * weapon.recoilYaw);
    }
  }
  prevFiring = input.firing;
}

// --- Main loop.
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  frameActions();
  if (state.phase !== 'menu' && state.phase !== 'matchEnd') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  state.shake = Math.max(0, state.shake - dt * 1.8);
  state.hitFlash = Math.max(0, state.hitFlash - dt * 1.6);
  syncCamera();
  const spread = spreadFor(player, WEAPONS[player.current], playerCtl.groundSpeed(player));
  hud.update(dt, spread);
  renderer.render(scene, camera);
}

// --- Screenshot mode: stage, render twice, freeze, signal ready.
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    const spread = spreadFor(player, WEAPONS[player.current], 0);
    hud.update(0, spread);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP, false);
  syncCamera();
}

// --- Boot.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Stage the menu backdrop: everyone at their spawn, before any match starts.
state.actors.forEach((actor) => {
  const spots = MAP.spawns[actor.team];
  const [x, z] = spots[actor.slot % spots.length];
  actorsApi.spawn(actor, x, z, actor.team === 'vanguard' ? 0 : Math.PI);
  actorsApi.syncMesh(actor, 0);
});
player.pos.set(0, 0, 21);
player.yaw = 0;
player.pitch = 0;
syncCamera();
hud.showOverlay('start');

if (shot) {
  hud.hideOverlay();
  runShot(shot, {
    state, hud, rounds, objective,
    setPlayer(x, z, yaw, pitch) {
      player.pos.set(x, 0, z);
      player.vel.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = pitch;
      syncCamera();
    },
    aimAt,
    shootOnce() {
      camera.getWorldDirection(camDir);
      weapons.fire(player, camDir, 0, damageCb, noop);
    },
    settle,
    syncActor(actor) {
      actorsApi.syncMesh(actor, 0);
    },
    ready() {
      paintTwiceThenReady();
    },
  });
} else {
  requestAnimationFrame(frame);
}
