// Actors: the player and the bots share one body. A bot is a small
// team-coloured figure — legs, torso, head with a visor — built from boxes and
// a sphere, with the head and torso tagged so bullets know what they hit.
// The player has no visible body (first person) but the same health and kit.
import * as THREE from 'three';
import { BOT, PLAYER, TEAMS, WEAPONS } from './config.js';

const torsoGeo = new THREE.BoxGeometry(0.52, 0.62, 0.3);
const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.24);
const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
const visorGeo = new THREE.BoxGeometry(0.3, 0.1, 0.06);
const armGeo = new THREE.BoxGeometry(0.14, 0.55, 0.16);
const gunGeo = new THREE.BoxGeometry(0.09, 0.12, 0.62);

export function createActors(scene, colliders) {
  const teamMats = {};
  for (const [id, team] of Object.entries(TEAMS)) {
    teamMats[id] = {
      body: new THREE.MeshStandardMaterial({ color: new THREE.Color(team.color), roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.9 }),
      visor: new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x101418), roughness: 0.25, metalness: 0.6,
      }),
    };
  }

  function buildBotMesh(team) {
    const mats = teamMats[team];
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, mats.body);
    torso.position.y = 1.08;
    torso.userData.part = 'body';
    const head = new THREE.Mesh(headGeo, mats.dark);
    head.position.y = 1.62;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(visorGeo, mats.visor);
    visor.position.set(0, 1.63, 0.18);
    const legL = new THREE.Mesh(legGeo, mats.dark);
    legL.position.set(-0.14, 0.36, 0);
    legL.userData.part = 'body';
    const legR = new THREE.Mesh(legGeo, mats.dark);
    legR.position.set(0.14, 0.36, 0);
    legR.userData.part = 'body';
    const armL = new THREE.Mesh(armGeo, mats.body);
    armL.position.set(-0.34, 1.1, 0.08);
    armL.rotation.x = -0.9;
    const armR = new THREE.Mesh(armGeo, mats.body);
    armR.position.set(0.34, 1.1, 0.08);
    armR.rotation.x = -0.9;
    const gun = new THREE.Mesh(gunGeo, mats.dark);
    gun.position.set(0.16, 1.22, 0.42);
    group.add(torso, head, visor, legL, legR, armL, armR, gun);
    group.traverse((child) => {
      child.castShadow = true;
    });
    return { group, head, torso, legL, legR, hitMeshes: [torso, head, legL, legR] };
  }

  function makeActor({ name, team, isPlayer, slot }) {
    const mesh = isPlayer ? null : buildBotMesh(team);
    const actor = {
      name, team, isPlayer, slot,
      pos: new THREE.Vector3(), // feet position
      vel: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      health: 100, alive: true,
      radius: PLAYER.radius, height: PLAYER.standHeight,
      eye: PLAYER.standEye, crouching: false, onGround: true,
      mesh,
      // Kit: owned weapons with per-weapon ammo; current is an id in WEAPONS.
      owned: ['pistol'],
      current: 'pistol',
      ammo: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax } },
      grenades: 0,
      reloading: 0, // seconds left, 0 when not reloading
      fireCooldown: 0,
      bloom: 0, // spread growth from firing, decays over time
      recoilPitch: 0, // unrecovered view kick (player only)
      kills: 0, deaths: 0,
      lastHurtBy: null,
      // Bot brain state (unused for the player).
      brain: null,
      stepPhase: 0,
    };
    if (mesh) {
      for (const m of mesh.hitMeshes) m.userData.actor = actor;
      scene.add(mesh.group);
      mesh.group.visible = false; // shown on spawn
    }
    return actor;
  }

  function spawn(actor, x, z, yaw) {
    actor.pos.set(x, 0, z);
    actor.vel.set(0, 0, 0);
    actor.yaw = yaw;
    actor.pitch = 0;
    actor.health = BOT.health;
    actor.alive = true;
    actor.crouching = false;
    actor.height = PLAYER.standHeight;
    actor.eye = PLAYER.standEye;
    actor.reloading = 0;
    actor.fireCooldown = 0;
    actor.bloom = 0;
    actor.recoilPitch = 0;
    actor.onGround = true;
    if (actor.mesh) {
      actor.mesh.group.visible = true;
      actor.mesh.group.position.set(x, 0, z);
      actor.mesh.group.rotation.y = yaw;
      actor.mesh.group.rotation.x = 0;
      actor.mesh.group.rotation.z = 0;
    }
  }

  function kill(actor) {
    actor.alive = false;
    actor.deaths += 1;
    if (actor.mesh) {
      // Fall over: tip the figure onto its back and sink it slightly.
      actor.mesh.group.rotation.x = -Math.PI / 2;
      actor.mesh.group.position.y = 0.15;
    }
  }

  function hide(actor) {
    if (actor.mesh) actor.mesh.group.visible = false;
  }

  // Animate a living bot's figure: face its yaw, bob the legs while walking.
  function syncMesh(actor, dt) {
    if (!actor.mesh || !actor.alive) return;
    const g = actor.mesh.group;
    g.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    g.rotation.y = actor.yaw;
    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    actor.stepPhase += dt * (4 + speed * 1.6);
    const swing = Math.min(0.6, speed * 0.14) * Math.sin(actor.stepPhase);
    actor.mesh.legL.rotation.x = swing;
    actor.mesh.legR.rotation.x = -swing;
    g.position.y = actor.pos.y + Math.abs(Math.sin(actor.stepPhase)) * 0.03 * Math.min(1, speed / 3);
  }

  return { makeActor, spawn, kill, hide, syncMesh };
}
