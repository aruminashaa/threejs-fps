// Keyboard, mouse and pointer lock. The simulation reads `keys` (a Set of
// codes) and takes accumulated look deltas; nothing here moves the player.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.code === 'Space') event.preventDefault();
    keys.add(event.code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (!locked) return;
    if (event.button === 0) firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    keys,
    get firing() { return firing; },
    get locked() { return locked; },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Edge-triggered keys: true once per press, consumed by the caller.
    pressed(code) {
      if (!keys.has(code)) return false;
      keys.delete(code);
      return true;
    },
  };
}
