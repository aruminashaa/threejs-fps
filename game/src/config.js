// Foundry Line: tuning, weapons and economy in one place. Every number the
// simulation uses lives here so a balance change never touches game logic.
export const FIXED_STEP = 1 / 60;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;
export const ROUND_TIME = 100; // seconds before the defenders win on time
export const FREEZE_TIME = 4; // buy window at the start of every round
export const BOMB_TIME = 35; // seconds from plant to detonation
export const PLANT_TIME = 3.5; // seconds of holding E inside a site
export const DEFUSE_TIME = 5; // seconds of holding E beside a planted charge
export const TEAM_SIZE = 4; // player + 3 bots vs 4 bots

export const ECONOMY = {
  startMoney: 800,
  kill: 300,
  plant: 300,
  defuse: 300,
  win: 3250,
  lossBase: 1400,
  lossStreak: 500,
  lossMax: 3400,
};

// Weapons: damage is per pellet at close range, halved past falloff metres.
// spread is radians of cone at rest; move/air/crouch scale it. Recoil kicks
// the view up and recovers partly, so bursts beat holding the trigger.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 1, price: 0, auto: false,
    damage: 26, headshotMult: 3, pellets: 1, mag: 12, reserveMax: 48,
    fireInterval: 0.16, reloadTime: 1.4, spread: 0.006, moveSpread: 0.02,
    recoilPitch: 0.011, recoilYaw: 0.004, falloff: 30, range: 90, kick: 0.5,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', slot: 2, price: 2700, auto: true,
    damage: 30, headshotMult: 3.5, pellets: 1, mag: 30, reserveMax: 90,
    fireInterval: 0.1, reloadTime: 2.2, spread: 0.004, moveSpread: 0.028,
    recoilPitch: 0.014, recoilYaw: 0.006, falloff: 35, range: 120, kick: 0.8,
  },
  scatter: {
    id: 'scatter', name: 'SG-12 Scattergun', slot: 3, price: 1800, auto: false,
    damage: 9, headshotMult: 2, pellets: 8, mag: 6, reserveMax: 24,
    fireInterval: 0.9, reloadTime: 2.6, spread: 0.05, moveSpread: 0.05,
    recoilPitch: 0.05, recoilYaw: 0.01, falloff: 14, range: 45, kick: 1.6,
  },
};

export const GRENADE = {
  price: 300, fuse: 1.6, radius: 7, maxDamage: 120, minDamage: 15,
  throwSpeed: 13, gravity: 18, bounce: 0.42, maxCarry: 2,
};

export const PLAYER = {
  radius: 0.34, standHeight: 1.72, crouchHeight: 1.12,
  standEye: 1.58, crouchEye: 1.0, walkSpeed: 5.4, crouchSpeed: 2.5,
  slowSpeed: 2.7, groundAccel: 46, airAccel: 10, friction: 10,
  gravity: 21, jumpSpeed: 6.4, health: 100,
};

export const BOT = {
  radius: 0.34, height: 1.72, eye: 1.55, speed: 4.6, health: 100,
  sightRange: 34, fov: 2.3, // radians of half-angle the bot can see without alert
  hearRange: 26, hearWalkRange: 11,
  reactionMin: 0.28, reactionMax: 0.62, // seconds from seeing to first shot
  aimError: 0.028, aimSettle: 2.2, // radians; error shrinks while tracking
  burstMin: 3, burstMax: 6, burstPause: 0.45,
};

export const TEAMS = {
  vanguard: { name: 'Vanguards', short: 'VAN', color: 0xe07840, css: '#e07840', attacks: true },
  warden: { name: 'Wardens', short: 'WRD', color: 0x3fa7a0, css: '#3fa7a0', attacks: false },
};

export const BOT_NAMES = {
  vanguard: ['Rook', 'Sable', 'Juno'],
  warden: ['Vex', 'Mira', 'Koda', 'Pike'],
};
