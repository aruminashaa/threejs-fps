// Match flow: rounds, economy and the buy menu. One match is first to 5
// rounds (at most 9). A round is won by eliminating the other team, by
// detonating the charge, by defusing it, or — for the defenders — by running
// the clock out. Money is earned per kill, per plant/defuse and per round,
// and spent on rifles, the scattergun and grenades.
import {
  ECONOMY, FREEZE_TIME, GRENADE, MAX_ROUNDS, ROUND_TIME, WEAPONS,
} from './config.js';
import { MAP } from './map.js';
import { aliveOnTeam, matchOver } from './state.js';

export function createRounds({
  state, actorsApi, weapons, bots, objective, grenades, audio,
}) {
  const { spawn, kill, hide } = actorsApi;

  function moneyOf(actor) {
    const list = state.money[actor.team];
    return list[actor.slot] ?? 0;
  }
  function setMoney(actor, value) {
    state.money[actor.team][actor.slot] = Math.max(0, Math.min(16000, value));
  }
  function addMoney(actor, value) {
    setMoney(actor, moneyOf(actor) + value);
  }

  function feed(text, team) {
    state.events.push({ text, team, t: state.time });
    if (state.events.length > 6) state.events.shift();
  }

  // Shared damage entry point for bullets and grenades. Applies the hit,
  // flashes the player's screen, and runs the kill when health runs out.
  function damage(attacker, victim, amount, head, cause) {
    if (!victim.alive) return;
    victim.health -= amount;
    victim.lastHurtBy = attacker;
    if (victim.isPlayer) {
      state.hitFlash = 1;
      audio.hurt();
    }
    if (attacker && attacker.isPlayer) {
      state.lastHit = { head, t: state.time, kill: false };
      audio.hit(head);
    }
    if (victim.health > 0) return;
    victim.health = 0;
    kill(victim);
    if (attacker && attacker !== victim) {
      attacker.kills += 1;
      addMoney(attacker, ECONOMY.kill);
      if (attacker.isPlayer) {
        state.lastHit = { head, t: state.time, kill: true };
        audio.kill();
      }
    }
    const weapon = cause === 'grenade' ? '💥' : head ? '◎' : '×';
    feed(`${attacker ? attacker.name : '—'} ${weapon} ${victim.name}`, attacker ? attacker.team : null);
    objective.passCarrier(victim);
    checkElimination();
  }

  function checkElimination() {
    if (state.phase !== 'live' && state.phase !== 'planted') return;
    // A planted charge keeps the round alive: the defenders must defuse it.
    if (state.bomb.state === 'planted' || state.bomb.state === 'defusing') {
      if (aliveOnTeam(state, 'warden') === 0) return; // bomb still ticks
      return;
    }
    if (aliveOnTeam(state, 'vanguard') === 0) endRound('warden', 'Vanguards eliminated');
    else if (aliveOnTeam(state, 'warden') === 0) endRound('vanguard', 'Wardens eliminated');
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    const loser = winner === 'vanguard' ? 'warden' : 'vanguard';
    state.lossStreak[loser] += 1;
    state.lossStreak[winner] = 0;
    for (const actor of state.actors) {
      if (actor.team === winner) addMoney(actor, ECONOMY.win);
      else {
        const bonus = Math.min(
          ECONOMY.lossMax,
          ECONOMY.lossBase + ECONOMY.lossStreak * (state.lossStreak[loser] - 1),
        );
        addMoney(actor, bonus);
      }
    }
    audio.roundEnd(winner === 'vanguard');
    feed(`${winner === 'vanguard' ? 'Vanguards' : 'Wardens'} take round ${state.round}`, winner);
  }

  function handleBombEvent(event) {
    if (event === 'planted') {
      const planter = state.bomb.planter;
      if (planter) addMoney(planter, ECONOMY.plant);
      state.phase = 'planted';
    } else if (event === 'defused') {
      const defuser = state.bomb.defuser;
      if (defuser) addMoney(defuser, ECONOMY.defuse);
      endRound('warden', 'Charge defused');
    } else if (event === 'detonated') {
      endRound('vanguard', 'Charge detonated');
    }
  }

  function buy(actor, item) {
    if (!canBuy()) return false;
    if (item === 'grenade') {
      if (actor.grenades >= GRENADE.maxCarry || moneyOf(actor) < GRENADE.price) return false;
      setMoney(actor, moneyOf(actor) - GRENADE.price);
      actor.grenades += 1;
    } else {
      const weapon = WEAPONS[item];
      if (!weapon || actor.owned.includes(item) || moneyOf(actor) < weapon.price) return false;
      setMoney(actor, moneyOf(actor) - weapon.price);
      weapons.giveWeapon(actor, item);
      weapons.switchTo(actor, item);
    }
    if (actor.isPlayer) audio.buy();
    return true;
  }

  function canBuy() {
    if (state.phase === 'freeze') return true;
    if (state.phase === 'live' && state.roundElapsed < 15) return true;
    return false;
  }

  function botBuy(bot) {
    if (moneyOf(bot) >= WEAPONS.rifle.price && !bot.owned.includes('rifle')) {
      setMoney(bot, moneyOf(bot) - WEAPONS.rifle.price);
      weapons.giveWeapon(bot, 'rifle');
      weapons.switchTo(bot, 'rifle');
    } else if (moneyOf(bot) >= WEAPONS.scatter.price && !bot.owned.includes('scatter')
      && !bot.owned.includes('rifle') && Math.random() < 0.4) {
      setMoney(bot, moneyOf(bot) - WEAPONS.scatter.price);
      weapons.giveWeapon(bot, 'scatter');
      weapons.switchTo(bot, 'scatter');
    }
    if (moneyOf(bot) >= GRENADE.price && bot.grenades < 1 && Math.random() < 0.5) {
      setMoney(bot, moneyOf(bot) - GRENADE.price);
      bot.grenades += 1;
    }
    if (bot.owned.includes('rifle')) weapons.switchTo(bot, 'rifle');
  }

  function startRound() {
    grenades.clear();
    // Spawns: Vanguards face north (yaw PI... they face -z, yaw 0 faces -z).
    state.actors.forEach((actor) => {
      const spots = MAP.spawns[actor.team];
      const [x, z] = spots[actor.slot % spots.length];
      spawn(actor, x, z, actor.team === 'vanguard' ? 0 : Math.PI);
      // Keep owned weapons; refill every magazine and reserve each round.
      for (const id of actor.owned) {
        actor.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserveMax };
      }
      if (actor.owned.includes('rifle')) weapons.switchTo(actor, 'rifle');
      else weapons.switchTo(actor, 'pistol');
    });
    objective.reset(state.player);
    state.phase = 'freeze';
    state.phaseTime = 0;
    state.roundTime = ROUND_TIME;
    state.roundElapsed = 0;
    state.roundWinner = null;
    state.roundReason = '';
    bots.assignRoundRoles(state.random);
    for (const actor of state.actors) {
      if (!actor.isPlayer) botBuy(actor);
    }
  }

  function startMatch() {
    state.score.vanguard = 0;
    state.score.warden = 0;
    state.lossStreak.vanguard = 0;
    state.lossStreak.warden = 0;
    state.round = 1;
    state.winner = null;
    state.events.length = 0;
    for (const actor of state.actors) {
      actor.kills = 0;
      actor.deaths = 0;
      actor.owned = ['pistol'];
      actor.current = 'pistol';
      actor.ammo = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax } };
      actor.grenades = 0;
    }
    state.money.vanguard = state.actors.filter((a) => a.team === 'vanguard').map(() => ECONOMY.startMoney);
    state.money.warden = state.actors.filter((a) => a.team === 'warden').map(() => ECONOMY.startMoney);
    startRound();
  }

  function step(dt) {
    state.phaseTime += dt;
    if (state.phase === 'freeze') {
      if (state.phaseTime >= FREEZE_TIME) {
        state.phase = 'live';
        state.phaseTime = 0;
      }
      return;
    }
    if (state.phase === 'live') {
      state.roundElapsed += dt;
      state.roundTime -= dt;
      if (state.roundTime <= 0) {
        state.roundTime = 0;
        endRound('warden', 'Time expired — charge not planted');
      }
      return;
    }
    if (state.phase === 'planted') {
      state.roundElapsed += dt;
      return;
    }
    if (state.phase === 'roundEnd') {
      if (state.phaseTime >= 4) {
        if (matchOver(state) || state.round >= MAX_ROUNDS) {
          state.phase = 'matchEnd';
          state.phaseTime = 0;
          state.winner = state.score.vanguard > state.score.warden ? 'vanguard'
            : state.score.warden > state.score.vanguard ? 'warden' : 'draw';
        } else {
          state.round += 1;
          startRound();
        }
      }
    }
  }

  return {
    startMatch, startRound, endRound, handleBombEvent, damage,
    buy, canBuy, moneyOf, step, feed,
  };
}
