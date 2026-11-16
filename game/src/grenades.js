// Grenades: thrown on an arc, bouncing off walls and the floor, exploding on
// a fuse. The blast is radial with line-of-sight falloff — cover saves you —
// and shakes the camera of anyone nearby.
import * as THREE from 'three';
import { GRENADE } from './config.js';
import { circleHitsAny, hasLineOfSight } from './collide.js';

const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a2e, roughness: 0.6, metalness: 0.3 });
const flashGeo = new THREE.SphereGeometry(1, 12, 10);

export function createGrenades({ scene, state, colliders, audio, onDamage }) {
  const blasts = []; // expanding flash spheres, pooled by reuse

  function throwGrenade(actor, dir) {
    if (actor.grenades <= 0) return false;
    actor.grenades -= 1;
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.castShadow = true;
    const pos = new THREE.Vector3(actor.pos.x, actor.pos.y + actor.eye - 0.1, actor.pos.z);
    mesh.position.copy(pos);
    scene.add(mesh);
    state.grenades.push({
      mesh,
      pos,
      vel: new THREE.Vector3(
        dir.x * GRENADE.throwSpeed + actor.vel.x * 0.5,
        dir.y * GRENADE.throwSpeed + 3.5,
        dir.z * GRENADE.throwSpeed + actor.vel.z * 0.5,
      ),
      fuse: GRENADE.fuse,
      owner: actor,
    });
    audio.pin();
    return true;
  }

  function explode(g) {
    scene.remove(g.mesh);
    // Flash sphere that expands and fades over 0.35 s.
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
      color: 0xffb14d, transparent: true, opacity: 0.9,
    }));
    flash.position.copy(g.pos);
    scene.add(flash);
    blasts.push({ mesh: flash, life: 0.35 });
    const distToPlayer = Math.hypot(
      g.pos.x - state.player.pos.x, g.pos.z - state.player.pos.z);
    audio.explosion(distToPlayer);
    if (distToPlayer < 14) state.shake = Math.max(state.shake, 0.7 * (1 - distToPlayer / 14));

    for (const actor of state.actors) {
      if (!actor.alive) continue;
      const dx = actor.pos.x - g.pos.x;
      const dz = actor.pos.z - g.pos.z;
      const dy = (actor.pos.y + 1) - g.pos.y;
      const d = Math.hypot(dx, dz, dy);
      if (d > GRENADE.radius) continue;
      // Cover blocks the blast: no line of sight, no damage.
      if (!hasLineOfSight(g.pos.x, g.pos.z, actor.pos.x, actor.pos.z, colliders)) continue;
      const damage = Math.round(
        GRENADE.maxDamage - (GRENADE.maxDamage - GRENADE.minDamage) * (d / GRENADE.radius));
      onDamage(g.owner, actor, damage, false, 'grenade');
    }
  }

  function step(dt) {
    for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
      const g = state.grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRENADE.gravity * dt;
      const nx = g.pos.x + g.vel.x * dt;
      const nz = g.pos.z + g.vel.z * dt;
      const ny = g.pos.y + g.vel.y * dt;
      // Bounce off walls (2D test at the grenade's height band) and the floor.
      if (circleHitsAny(nx, g.pos.z, 0.1, colliders)) g.vel.x *= -GRENADE.bounce;
      else g.pos.x = nx;
      if (circleHitsAny(g.pos.x, nz, 0.1, colliders)) g.vel.z *= -GRENADE.bounce;
      else g.pos.z = nz;
      if (ny <= 0.09) {
        g.pos.y = 0.09;
        if (Math.abs(g.vel.y) > 1.2) g.vel.y *= -GRENADE.bounce;
        else {
          g.vel.y = 0;
          g.vel.x *= 0.9;
          g.vel.z *= 0.9;
        }
      } else {
        g.pos.y = ny;
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        explode(g);
        state.grenades.splice(i, 1);
      }
    }
    for (let i = blasts.length - 1; i >= 0; i -= 1) {
      const b = blasts[i];
      b.life -= dt;
      const s = 1 + (0.35 - b.life) * 22;
      b.mesh.scale.set(s, s, s);
      b.mesh.material.opacity = Math.max(0, b.life / 0.35) * 0.9;
      if (b.life <= 0) {
        scene.remove(b.mesh);
        b.mesh.material.dispose();
        blasts.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of state.grenades) scene.remove(g.mesh);
    state.grenades.length = 0;
    for (const b of blasts) {
      scene.remove(b.mesh);
      b.mesh.material.dispose();
    }
    blasts.length = 0;
  }

  return { throwGrenade, step, clear };
}
