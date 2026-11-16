// Weapons: firing, reloading, spread and recoil. A shot is one raycast per
// pellet from the shooter's eye; the first thing it meets — wall, crate or a
// tagged body part — decides the hit. Damage falls with range and multiplies
// on the head. Spread grows with movement and with every shot fired, and
// crouching or standing still shrinks it, so stopping to aim pays.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

// Spread in radians for a shot: base cone, plus movement, plus bloom from
// firing. Crouching halves the movement term; airborne doubles everything.
export function spreadFor(actor, weapon, groundSpeed) {
  const moving = Math.min(1, groundSpeed / 5.4);
  let spread = weapon.spread + weapon.moveSpread * moving + actor.bloom;
  if (actor.crouching) spread *= 0.55;
  if (!actor.onGround) spread *= 2;
  return spread;
}

export function createWeaponSystem({ scene, camera, state, audio, worldShootables }) {
  const shootables = worldShootables; // world meshes; actor hit meshes join per shot
  const actorMeshes = [];
  for (const actor of state.actors) {
    if (actor.mesh) actorMeshes.push(...actor.mesh.hitMeshes);
  }

  // --- Viewmodel: the gun the player sees, with kick and reload motion.
  const gunGroup = new THREE.Group();
  gunGroup.scale.setScalar(0.6);
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x35322e, roughness: 0.5, metalness: 0.4, emissive: 0x0c0b0a,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xe07840, roughness: 0.5, metalness: 0.3 });
  // A soft light on the camera lifts the viewmodel out of the scene's shadows.
  const gunLight = new THREE.PointLight(0xffe0b0, 1.0, 2, 1.5);
  gunLight.position.set(0.05, 0.1, -0.3);
  camera.add(gunLight);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), gunMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.38);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gunMat);
  grip.position.set(0, -0.14, 0.14);
  grip.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), accentMat);
  sight.position.set(0, 0.09, -0.05);
  gunGroup.add(body, barrel, grip, sight);
  gunGroup.position.set(0.3, -0.27, -0.52);
  camera.add(gunGroup);
  const flashLight = new THREE.PointLight(0xffc266, 0, 9, 2);
  flashLight.position.set(0.24, -0.18, -0.9);
  camera.add(flashLight);
  let kick = 0; // viewmodel kick, decays
  let reloadDip = 0;

  // --- Pooled tracers and impact sparks: no allocation in the hot loop.
  const TRACERS = 24;
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const SPARKS = 12;
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc266, size: 0.09, transparent: true, opacity: 0,
    }));
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, vel: [] });
  }
  let sparkCursor = 0;

  function fireTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACERS;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.06;
  }

  function fireSparks(at, normal) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARKS;
    const pos = s.points.geometry.attributes.position.array;
    s.vel = [];
    for (let i = 0; i < 6; i += 1) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      s.vel.push({
        x: (Math.random() - 0.5) * 3 + normal.x * 2,
        y: Math.random() * 2.5 + 1,
        z: (Math.random() - 0.5) * 3 + normal.z * 2,
      });
    }
    s.points.geometry.attributes.position.needsUpdate = true;
    s.points.material.opacity = 1;
    s.life = 0.35;
  }

  function stepEffects(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        const pos = s.points.geometry.attributes.position.array;
        for (let i = 0; i < 6; i += 1) {
          pos[i * 3] += s.vel[i].x * dt;
          pos[i * 3 + 1] += s.vel[i].y * dt;
          pos[i * 3 + 2] += s.vel[i].z * dt;
          s.vel[i].y -= 12 * dt;
        }
        s.points.geometry.attributes.position.needsUpdate = true;
        s.points.material.opacity = Math.max(0, s.life / 0.35);
      }
    }
    kick = Math.max(0, kick - dt * 6);
    reloadDip = Math.max(0, reloadDip - dt * 2);
    gunGroup.position.z = -0.52 + kick * 0.09;
    gunGroup.position.y = -0.27 - reloadDip * 0.18;
    gunGroup.rotation.x = kick * 0.12 + reloadDip * 0.5;
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 90);
  }

  function muzzleWorld(actor, out) {
    if (actor.isPlayer) {
      camera.getWorldDirection(tmpDir);
      out.copy(camera.position)
        .addScaledVector(tmpDir, 0.6);
      out.y -= 0.12;
      return out;
    }
    out.set(actor.pos.x, actor.pos.y + 1.35, actor.pos.z);
    const sin = Math.sin(actor.yaw);
    const cos = Math.cos(actor.yaw);
    out.x += -sin * 0.5;
    out.z += -cos * 0.5;
    return out;
  }

  // One trigger pull. `aimDir` is the shooter's forward; spread is applied per
  // pellet. onHit/onKill are the match callbacks (feed, money, carrier).
  function fire(actor, aimDir, groundSpeed, onHit, onKill) {
    const weapon = WEAPONS[actor.current];
    if (actor.reloading > 0 || actor.fireCooldown > 0 || !actor.alive) return false;
    const ammo = actor.ammo[actor.current];
    if (!ammo || ammo.mag <= 0) {
      if (actor.isPlayer) audio.dryFire();
      actor.fireCooldown = 0.25;
      return false;
    }
    ammo.mag -= 1;
    actor.fireCooldown = weapon.fireInterval;
    // Bloom is the player's feel mechanic; bots carry their own aim error
    // instead, so they are not punished twice for the same shot.
    if (actor.isPlayer) {
      actor.bloom = Math.min(0.09, actor.bloom + (actor.current === 'scatter' ? 0.05 : 0.008));
    }
    const spread = spreadFor(actor, weapon, groundSpeed);

    tmpOrigin.set(
      actor.pos.x,
      actor.pos.y + actor.eye,
      actor.pos.z,
    );
    // Exclude the shooter's own meshes from the raycast.
    const targets = actor.isPlayer ? shootables.concat(actorMeshes)
      : shootables.concat(actorMeshes.filter((m) => m.userData.actor !== actor));
    if (actor.isPlayer) {
      // The player has no body meshes, so nothing to exclude.
    }

    const muzzle = muzzleWorld(actor, new THREE.Vector3());
    for (let p = 0; p < weapon.pellets; p += 1) {
      tmpDir.copy(aimDir);
      tmpDir.x += (Math.random() * 2 - 1) * spread;
      tmpDir.y += (Math.random() * 2 - 1) * spread;
      tmpDir.z += (Math.random() * 2 - 1) * spread;
      tmpDir.normalize();
      raycaster.set(tmpOrigin, tmpDir);
      raycaster.far = weapon.range;
      const hit = raycaster.intersectObjects(targets, false)[0];
      const end = hit ? hit.point : tmpTarget.copy(tmpOrigin).addScaledVector(tmpDir, weapon.range);
      fireTracer(muzzle, end);
      if (!hit) continue;
      const victim = hit.object.userData.actor;
      if (victim && victim.alive && victim.team !== actor.team) {
        const head = hit.object.userData.part === 'head';
        const dist = hit.distance;
        const falloff = dist <= weapon.falloff ? 1
          : Math.max(0.5, 1 - (dist - weapon.falloff) / (weapon.range - weapon.falloff) * 0.5);
        const damage = Math.round(weapon.damage * falloff * (head ? weapon.headshotMult : 1));
        onHit(actor, victim, damage, head);
        if (!victim.alive) onKill(actor, victim, head);
      } else if (hit.face) {
        fireSparks(hit.point, hit.face.normal);
      }
    }

    const distToPlayer = actor.isPlayer ? 0
      : Math.hypot(actor.pos.x - state.player.pos.x, actor.pos.z - state.player.pos.z);
    audio.shot(actor.current, distToPlayer);
    if (actor.isPlayer) {
      kick = Math.min(1, kick + weapon.kick * 0.5);
      flashLight.intensity = 14;
    }
    // Gunfire is heard across the map: bots react to it.
    state.lastShot = { x: actor.pos.x, z: actor.pos.z, team: actor.team, t: state.time };
    return true; // a round was spent (hits are reported via onHit)
  }

  function startReload(actor) {
    const weapon = WEAPONS[actor.current];
    const ammo = actor.ammo[actor.current];
    if (!ammo || actor.reloading > 0 || ammo.mag >= weapon.mag || ammo.reserve <= 0) return false;
    actor.reloading = weapon.reloadTime;
    if (actor.isPlayer) {
      audio.reload();
      reloadDip = 1;
    }
    return true;
  }

  function updateReload(actor, dt) {
    if (actor.reloading <= 0) return;
    actor.reloading -= dt;
    if (actor.reloading > 0) return;
    const weapon = WEAPONS[actor.current];
    const ammo = actor.ammo[actor.current];
    const need = weapon.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }

  function switchTo(actor, id) {
    if (!actor.owned.includes(id) || actor.current === id) return false;
    actor.current = id;
    actor.reloading = 0;
    actor.fireCooldown = Math.max(actor.fireCooldown, 0.25);
    return true;
  }

  function giveWeapon(actor, id) {
    if (actor.owned.includes(id)) return;
    actor.owned.push(id);
    actor.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserveMax };
  }

  function refillReserve(actor) {
    for (const id of actor.owned) {
      actor.ammo[id].reserve = WEAPONS[id].reserveMax;
    }
  }

  function setViewmodelVisible(visible) {
    gunGroup.visible = visible;
  }

  return {
    fire, startReload, updateReload, switchTo, giveWeapon, refillReserve,
    stepEffects, setViewmodelVisible,
  };
}
