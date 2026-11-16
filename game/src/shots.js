// Deterministic screenshot setups: ?shot=<name>&seed=N stages a frozen frame
// the same way every run, renders it twice, then sets window.__shotReady.
// The frames are real renders of the live game, never composites:
//   start — the title overlay over Vanguard spawn, looking up Mid
//   play  — mid-round combat: the player sights a Warden in Mid
//   buy   — the buy menu open during the freeze phase
//   site  — planting the charge at Site A with a teammate covering
export function runShot(name, api) {
  const { state, hud, rounds, objective } = api;
  const player = state.player;
  const vanguardBots = state.actors.filter((a) => a.team === 'vanguard' && !a.isPlayer);
  const wardenBots = state.actors.filter((a) => a.team === 'warden');

  function stageBot(bot, x, z, yaw) {
    bot.pos.set(x, 0, z);
    bot.vel.set(0, 0, 0);
    bot.yaw = yaw;
    bot.brain.mode = 'hold';
    bot.brain.path = [];
    bot.brain.target = null;
    bot.brain.holdSpot = { x, z, yaw };
    api.syncActor(bot);
  }

  if (name === 'start') {
    rounds.startMatch();
    api.setPlayer(0, 21.5, 0, 0.02);
    stageBot(vanguardBots[0], -5.5, 18.5, 0.3);
    stageBot(vanguardBots[1], 5.5, 18.5, -0.2);
    stageBot(vanguardBots[2], -8, 17, 0.5);
    api.settle(30);
    hud.showOverlay('start');
    api.ready();
    return;
  }

  if (name === 'buy') {
    rounds.startMatch();
    api.setPlayer(0, 20, 0, 0);
    stageBot(vanguardBots[0], 7.5, 16.5, -0.4);
    stageBot(vanguardBots[1], -7.5, 16.5, 0.4);
    stageBot(vanguardBots[2], -10, 14, 0.6);
    api.settle(10);
    hud.openBuy();
    api.ready();
    return;
  }

  if (name === 'play') {
    rounds.startMatch();
    // Skip the freeze: jump straight into the live round.
    state.phase = 'live';
    state.phaseTime = 0;
    state.roundTime = 87;
    api.setPlayer(0, 7.5, 0, -0.02);
    stageBot(wardenBots[0], 0.8, -0.5, Math.PI);
    stageBot(wardenBots[1], -1.5, -4.5, Math.PI - 0.4);
    stageBot(vanguardBots[0], -4, 1, -0.3);
    api.settle(20);
    // One aimed shot at the Warden: the hitmarker is part of the frame.
    api.aimAt(0.8, 1.35, -0.5);
    api.shootOnce();
    api.settle(2);
    hud.hideOverlay();
    api.ready();
    return;
  }

  if (name === 'site') {
    rounds.startMatch();
    state.phase = 'live';
    state.phaseTime = 0;
    state.roundTime = 74;
    // Face into Site A: the flag post and furnace drum fill the frame.
    api.setPlayer(17.5, -9.5, -0.35, -0.03);
    stageBot(vanguardBots[0], 14, -12.5, 2.2);
    stageBot(wardenBots[0], 20.5, -13, 2.6);
    // Halfway through the plant channel when the frame freezes.
    player.interacting = true;
    for (let i = 0; i < 105; i += 1) {
      objective.step(1 / 60);
      player.interacting = true;
    }
    hud.hideOverlay();
    api.ready();
    return;
  }

  // Unknown shot name: just render the start frame.
  runShot('start', api);
}
