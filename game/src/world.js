// Builds the visible Foundry Yard from map.js: floor, walls, crates, props,
// site markings and dusk lighting. Geometry is shared where it can be, and
// every solid doubles as a bullet stop (shootables) for the raycaster.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { makeColliders } from './collide.js';

export function createWorld(scene) {
  const colliders = makeColliders(MAP.boxes);
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ink' ? 0.5 : 0.94,
      metalness: 0.02,
    });
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function box(w, h, d, x, y, z, material, shadow = true) {
    const mesh = new THREE.Mesh(boxGeo, materials[material]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  // Floor: one sand slab with a darker apron around the sites.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 50), materials.sand);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  group.add(floor);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 56), materials.sandDark);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.02, 0);
  apron.receiveShadow = true;
  group.add(apron);

  for (const [x, z, w, d, h, material] of MAP.boxes) {
    box(w, h, d, x, h / 2, z, material);
  }

  // Site markings: flat tinted pads with a letter post, so both sites read
  // from across the map.
  for (const site of Object.values(MAP.sites)) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(site.w, site.d),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE[site.color]),
        transparent: true, opacity: 0.28, roughness: 0.9,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    group.add(pad);
    const post = box(0.5, 3.4, 0.5, site.x, 1.7, site.z - site.d / 2 + 0.4, 'charcoal', false);
    post.castShadow = false;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.9),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE[site.color]), side: THREE.DoubleSide,
      }),
    );
    flag.position.set(site.x + 0.9, 3.1, site.z - site.d / 2 + 0.4);
    group.add(flag);
  }

  // Props: gate lintel, chimney, silo drum, furnace drum, light poles, pipes.
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  for (const prop of MAP.props) {
    const [kind, x, z] = prop;
    if (kind === 'lintel') {
      box(prop[3], prop[4], prop[5], x, prop[6], z, 'rustDark');
    } else if (kind === 'chimney') {
      box(prop[3], prop[4], prop[5], x, prop[4] / 2 + 3.2, z, 'charcoal');
    } else if (kind === 'tank' || kind === 'furnace') {
      const drum = new THREE.Mesh(cylGeo, materials[kind === 'tank' ? 'tealDark' : 'rustDark']);
      drum.scale.set(prop[3], prop[4], prop[3]);
      drum.position.set(x, prop[4] / 2, z);
      drum.castShadow = true;
      drum.receiveShadow = true;
      group.add(drum);
    } else if (kind === 'pole') {
      const pole = new THREE.Mesh(cylGeo, materials.charcoal);
      pole.scale.set(0.09, prop[3], 0.09);
      pole.position.set(x, prop[3] / 2, z);
      group.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0) }),
      );
      lamp.position.set(x, prop[3] + 0.1, z);
      group.add(lamp);
    } else if (kind === 'pipe') {
      const pipe = new THREE.Mesh(cylGeo, materials.rustDark);
      pipe.scale.set(0.22, prop[3], 0.22);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 3.6, z);
      group.add(pipe);
    }
  }

  // Dusk light: a warm low key sun, a cool sky fill, and a hemisphere gradient.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 34, 78);
  const sky = new THREE.HemisphereLight(0x9a8a76, 0x5a4a36, 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffd2a0, 2.8);
  key.position.set(18, 26, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -32;
  key.shadow.camera.right = 32;
  key.shadow.camera.top = 32;
  key.shadow.camera.bottom = -32;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0x7a9ab0, 0.75);
  fill.position.set(-16, 12, -10);
  scene.add(fill);

  return { colliders, shootables, group, materials };
}
