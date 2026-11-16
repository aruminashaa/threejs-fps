// The charge: carried by one Vanguard, planted inside a site by holding E,
// then a 35-second timer the Wardens must defuse by holding E beside it.
// Planting and defusing are channels — moving away or dying resets progress.
// The planted charge beeps faster as the timer runs out.
import * as THREE from 'three';
import { BOMB_TIME, DEFUSE_TIME, PLANT_TIME } from './config.js';
import { MAP } from './map.js';
import { pointInRect } from './collide.js';

const chargeGeo = new THREE.BoxGeometry(0.42, 0.24, 0.3);
const chargeMat = new THREE.MeshStandardMaterial({
  color: 0xe07840, roughness: 0.4, metalness: 0.5, emissive: 0x581f08,
});
const blinkMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });
const blinkGeo = new THREE.SphereGeometry(0.05, 8, 8);

export function createObjective({ scene, state, audio, onDetonate }) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(chargeGeo, chargeMat);
  body.position.y = 0.12;
  const blink = new THREE.Mesh(blinkGeo, blinkMat);
  blink.position.set(0.14, 0.28, 0);
  mesh.add(body, blink);
  mesh.visible = false;
  scene.add(mesh);
  let beepAt = 0;
  let blinkPhase = 0;

  function siteAt(x, z) {
    for (const [letter, site] of Object.entries(MAP.sites)) {
      if (pointInRect(x, z, site)) return letter;
    }
    return null;
  }

  function reset(carrier) {
    state.bomb.state = 'carried';
    state.bomb.site = null;
    state.bomb.progress = 0;
    state.bomb.timer = 0;
    state.bomb.planter = null;
    state.bomb.defuser = null;
    state.carrier = carrier;
    mesh.visible = false;
  }

  // The carrier died: the nearest living Vanguard picks the charge up.
  function passCarrier(dead) {
    if (state.carrier !== dead) return;
    let best = null;
    let bestD = Infinity;
    for (const a of state.actors) {
      if (a.team !== 'vanguard' || !a.alive) continue;
      const d = Math.hypot(a.pos.x - dead.pos.x, a.pos.z - dead.pos.z);
      if (d < bestD) { bestD = d; best = a; }
    }
    state.carrier = best;
    if (best) {
      state.events.push({
        text: `Charge passed to ${best.isPlayer ? 'you' : best.name}`,
        team: 'vanguard', t: state.time,
      });
    }
  }

  function step(dt) {
    const bomb = state.bomb;
    // Planting: the carrier channels inside a site.
    if (bomb.state === 'carried' || bomb.state === 'planting') {
      const carrier = state.carrier;
      const site = carrier && carrier.alive ? siteAt(carrier.pos.x, carrier.pos.z) : null;
      const channeling = carrier && carrier.alive && carrier.interacting && site;
      if (channeling) {
        if (bomb.state !== 'planting') {
          bomb.state = 'planting';
          bomb.site = site;
          bomb.planter = carrier;
          bomb.progress = 0;
        }
        bomb.progress += dt / PLANT_TIME;
        if (bomb.progress >= 1) {
          bomb.state = 'planted';
          bomb.timer = BOMB_TIME;
          bomb.x = carrier.pos.x;
          bomb.z = carrier.pos.z;
          bomb.progress = 0;
          mesh.position.set(bomb.x, 0, bomb.z);
          mesh.visible = true;
          beepAt = state.time + 0.8;
          state.phase = 'planted';
          state.events.push({
            text: `Charge planted at Site ${site}!`, team: 'vanguard', t: state.time,
          });
          return 'planted';
        }
      } else if (bomb.state === 'planting') {
        bomb.state = 'carried';
        bomb.progress = 0;
        bomb.planter = null;
      }
      return null;
    }

    if (bomb.state === 'planted' || bomb.state === 'defusing') {
      bomb.timer -= dt;
      // Beeps accelerate as the timer runs down.
      if (state.time >= beepAt) {
        audio.plantBeep(bomb.timer < 10);
        beepAt = state.time + (bomb.timer < 10 ? 0.35 : bomb.timer < 20 ? 0.6 : 0.9);
      }
      blinkPhase += dt * (bomb.timer < 10 ? 14 : 6);
      blink.visible = Math.sin(blinkPhase) > 0;
      // Defusing: a Warden channels beside the charge.
      let defuser = null;
      for (const a of state.actors) {
        if (a.team !== 'warden' || !a.alive || !a.interacting) continue;
        if (Math.hypot(a.pos.x - bomb.x, a.pos.z - bomb.z) < 2.6) { defuser = a; break; }
      }
      if (defuser) {
        if (bomb.state !== 'defusing') {
          bomb.state = 'defusing';
          bomb.defuser = defuser;
          bomb.progress = 0;
        }
        bomb.progress += dt / DEFUSE_TIME;
        if (bomb.progress >= 1) {
          bomb.state = 'gone';
          mesh.visible = false;
          return 'defused';
        }
      } else if (bomb.state === 'defusing') {
        bomb.state = 'planted';
        bomb.progress = 0;
        bomb.defuser = null;
      }
      if (bomb.timer <= 0) {
        bomb.state = 'gone';
        mesh.visible = false;
        onDetonate(bomb.x, bomb.z);
        return 'detonated';
      }
      return null;
    }
    return null;
  }

  return { reset, passCarrier, step, siteAt };
}
