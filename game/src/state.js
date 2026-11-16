// The single game state. Every system reads and writes this one object; no
// module keeps its own copy of match truth. main.js owns the loop, rounds.js
// owns the phase machine, and the rest react to what this holds.
import { ECONOMY, ROUNDS_TO_WIN } from './config.js';

export function createState(random) {
  return {
    random, // seeded rng: shots and bot quirks stay deterministic per seed
    phase: 'menu', // menu | freeze | live | planted | roundEnd | matchEnd
    phaseTime: 0, // seconds in the current phase
    round: 1,
    score: { vanguard: 0, warden: 0 },
    lossStreak: { vanguard: 0, warden: 0 },
    roundTime: 0, // countdown while live
    money: { vanguard: [], warden: [] }, // per-actor money, indexed by actor slot
    actors: [], // player is actors[0]; the rest are bots
    player: null,
    carrier: null, // the actor holding the charge
    bomb: {
      state: 'carried', // carried | dropped | planting | planted | defusing | gone
      site: null, x: 0, z: 0, progress: 0, timer: 0, planter: null, defuser: null,
    },
    grenades: [],
    events: [], // kill feed entries {text, team, t}
    shake: 0, // camera shake magnitude, decays in main.js
    hitFlash: 0, // red damage vignette, decays in main.js
    time: 0, // total simulated seconds
    winner: null, // match winner team id, once decided
    roundWinner: null,
    roundReason: '',
    muted: false,
  };
}

export function aliveOnTeam(state, team) {
  let count = 0;
  for (const a of state.actors) if (a.team === team && a.alive) count += 1;
  return count;
}

export function resetMoneyForRound(state) {
  for (const team of ['vanguard', 'warden']) {
    if (state.money[team].length === 0) {
      state.money[team] = state.actors
        .filter((a) => a.team === team)
        .map(() => ECONOMY.startMoney);
    }
  }
}

export function matchOver(state) {
  return state.score.vanguard >= ROUNDS_TO_WIN || state.score.warden >= ROUNDS_TO_WIN;
}
