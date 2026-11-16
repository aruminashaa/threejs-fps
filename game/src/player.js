// Player movement: acceleration toward a wish direction, friction on the
// ground, gravity and jump, crouch with a headroom check, and collision
// resolved axis by axis against the map's 2D colliders. The camera sits at
// the actor's eye; recoil is a pitch offset that recovers over time.
import { PLAYER } from './config.js';
import { moveCircle } from './collide.js';

export function createPlayerController(colliders, bounds) {
  const wish = { x: 0, z: 0 };

  function look(actor, dx, dy, sensitivity = 0.0022) {
    actor.yaw -= dx * sensitivity;
    actor.pitch = Math.max(-1.45, Math.min(1.45, actor.pitch - dy * sensitivity));
  }

  function recoil(actor, pitchKick, yawKick) {
    actor.pitch = Math.min(1.45, actor.pitch + pitchKick);
    actor.yaw += yawKick;
    actor.recoilPitch += pitchKick;
  }

  function step(actor, keys, dt) {
    // Crouch: shrink at once, stand only when the head is clear.
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !actor.crouching) {
      actor.crouching = true;
      actor.height = PLAYER.crouchHeight;
    } else if (!wantCrouch && actor.crouching) {
      actor.crouching = false;
      actor.height = PLAYER.standHeight;
    }
    const eyeTarget = actor.crouching ? PLAYER.crouchEye : PLAYER.standEye;
    actor.eye += (eyeTarget - actor.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.x = 0;
    wish.z = 0;
    if (forward || strafe) {
      const sin = Math.sin(actor.yaw);
      const cos = Math.cos(actor.yaw);
      wish.x = -sin * forward + cos * strafe;
      wish.z = -cos * forward - sin * strafe;
      const len = Math.hypot(wish.x, wish.z) || 1;
      wish.x /= len;
      wish.z /= len;
    }

    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = actor.crouching ? PLAYER.crouchSpeed
      : slow ? PLAYER.slowSpeed : PLAYER.walkSpeed;
    const blend = Math.min(1, (actor.onGround ? PLAYER.groundAccel : PLAYER.airAccel) * dt / speed);
    actor.vel.x += (wish.x * speed - actor.vel.x) * blend;
    actor.vel.z += (wish.z * speed - actor.vel.z) * blend;
    if (actor.onGround && !forward && !strafe) {
      const damp = Math.max(0, 1 - PLAYER.friction * dt);
      actor.vel.x *= damp;
      actor.vel.z *= damp;
    }

    if (keys.has('Space') && actor.onGround) {
      actor.vel.y = PLAYER.jumpSpeed;
      actor.onGround = false;
    }
    actor.vel.y -= PLAYER.gravity * dt;
    actor.vel.y = Math.max(-30, actor.vel.y);

    moveCircle(actor.pos, actor.vel.x * dt, actor.vel.z * dt, actor.radius, colliders, bounds);

    // Vertical: the floor is y = 0 and crates are too tall to step onto, so
    // the only landing is the ground (low boxes are colliders, not steps).
    actor.pos.y += actor.vel.y * dt;
    if (actor.pos.y <= 0) {
      actor.pos.y = 0;
      actor.vel.y = 0;
      actor.onGround = true;
    } else {
      actor.onGround = false;
    }

    // Recoil recovery: the view settles back toward where it was aimed.
    if (actor.recoilPitch > 0) {
      const recover = Math.min(actor.recoilPitch, dt * 0.09);
      actor.pitch -= recover;
      actor.recoilPitch -= recover;
    }
    // Firing bloom decays so bursts stay accurate.
    actor.bloom = Math.max(0, actor.bloom - dt * 0.06);
  }

  function groundSpeed(actor) {
    return Math.hypot(actor.vel.x, actor.vel.z);
  }

  function isMoving(actor) {
    return groundSpeed(actor) > 0.5;
  }

  return { look, recoil, step, groundSpeed, isMoving };
}
