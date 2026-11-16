// The HUD: health, ammo, money, timer, score, kill feed, a live minimap, the
// buy menu and the round banners. update() runs once a frame and only touches
// the DOM when a value actually changed.
import { GRENADE, WEAPONS } from './config.js';
import { MAP } from './map.js';
import { aliveOnTeam } from './state.js';

const $ = (id) => document.getElementById(id);

export function createHud({ state, rounds, onPlay, onRestart }) {
  const els = {
    hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    healthFill: $('health-fill'), healthNum: $('health-num'), money: $('money'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), grenades: $('grenade-count'),
    timer: $('timer'), scoreVan: $('score-van'), scoreWar: $('score-war'),
    roundNum: $('round-num'), aliveVan: $('alive-van'), aliveWar: $('alive-war'),
    feed: $('feed'), prompt: $('prompt'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    bomb: $('bomb-status'), bombText: $('bomb-text'),
    vignette: $('vignette'), buyMenu: $('buy-menu'), buyMoney: $('buy-money'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'), playBtn: $('play'),
    objective: $('objective'), minimap: $('minimap'),
  };
  const cache = {};
  function set(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      if (el) el.textContent = value;
    }
  }
  function setHtml(el, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      if (el) el.innerHTML = value;
    }
  }

  // --- Minimap: the map is drawn once to an offscreen canvas, then blitted
  // with the live dots (teammates, the player arrow, the planted charge).
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = 160;
  mapCanvas.height = 150;
  const mctx = mapCanvas.getContext('2d');
  const mm = els.minimap.getContext('2d');
  const SX = 160 / 54;
  const SZ = 150 / 50;
  function mx(x) { return (x + 27) * SX; }
  function mz(z) { return (z + 25) * SZ; }
  (function paintMap() {
    mctx.fillStyle = 'rgba(20, 18, 16, 0.72)';
    mctx.fillRect(0, 0, 160, 150);
    for (const site of Object.values(MAP.sites)) {
      mctx.fillStyle = site.letter === 'A' ? 'rgba(224,120,64,0.35)' : 'rgba(63,167,160,0.35)';
      mctx.fillRect(mx(site.x - site.w / 2), mz(site.z - site.d / 2), site.w * SX, site.d * SZ);
    }
    mctx.fillStyle = '#6e6252';
    for (const [x, z, w, d, h] of MAP.boxes) {
      if (h < 1.2) continue; // crates stay off the minimap
      mctx.fillRect(mx(x - w / 2), mz(z - d / 2), w * SX, d * SZ);
    }
  })();

  function drawMinimap() {
    mm.clearRect(0, 0, 160, 150);
    mm.drawImage(mapCanvas, 0, 0);
    const bomb = state.bomb;
    if (bomb.state === 'planted' || bomb.state === 'defusing') {
      const blink = Math.sin(state.time * 6) > 0;
      mm.fillStyle = blink ? '#ff2211' : '#ff8866';
      mm.beginPath();
      mm.arc(mx(bomb.x), mz(bomb.z), 4.5, 0, Math.PI * 2);
      mm.fill();
    }
    for (const a of state.actors) {
      if (!a.alive || a.team !== 'vanguard') continue;
      if (a.isPlayer) {
        mm.save();
        mm.translate(mx(a.pos.x), mz(a.pos.z));
        mm.rotate(Math.atan2(Math.sin(a.yaw), Math.cos(a.yaw)) + Math.PI);
        mm.fillStyle = '#ffffff';
        mm.beginPath();
        mm.moveTo(0, -6);
        mm.lineTo(4, 5);
        mm.lineTo(-4, 5);
        mm.closePath();
        mm.fill();
        mm.restore();
      } else {
        mm.fillStyle = '#e07840';
        mm.beginPath();
        mm.arc(mx(a.pos.x), mz(a.pos.z), 3, 0, Math.PI * 2);
        mm.fill();
      }
    }
  }

  // --- Buy menu.
  let buyOpen = false;
  function refreshBuy() {
    const money = rounds.moneyOf(state.player);
    set(els.buyMoney, 'buyMoney', `$${money}`);
    for (const btn of els.buyMenu.querySelectorAll('[data-item]')) {
      const item = btn.dataset.item;
      const price = item === 'grenade' ? GRENADE.price : WEAPONS[item].price;
      const owned = item !== 'grenade' && state.player.owned.includes(item);
      const afford = money >= price;
      btn.classList.toggle('disabled', owned || !afford);
      btn.querySelector('.buy-price').textContent = owned ? 'OWNED' : `$${price}`;
    }
  }
  els.buyMenu.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-item]');
    if (!btn || btn.classList.contains('disabled')) return;
    if (rounds.buy(state.player, btn.dataset.item)) refreshBuy();
  });
  function openBuy() {
    if (!rounds.canBuy()) return;
    buyOpen = true;
    els.buyMenu.hidden = false;
    refreshBuy();
  }
  function closeBuy() {
    buyOpen = false;
    els.buyMenu.hidden = true;
  }
  function toggleBuy() {
    if (buyOpen) closeBuy();
    else openBuy();
  }

  // --- Overlays.
  els.playBtn.addEventListener('click', () => onPlay());
  function showOverlay(kind) {
    els.overlay.hidden = false;
    if (kind === 'start') {
      els.overlayTitle.textContent = 'FOUNDRY LINE';
      els.overlayCopy.textContent = 'Round-based tactical FPS. You are a Vanguard: push with your squad, plant the charge at Site A or Site B, and hold it till it blows — or wipe the Wardens out.';
      els.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'Paused';
      els.overlayCopy.textContent = 'Click to resume the fight.';
      els.playBtn.textContent = 'Resume';
    } else if (kind === 'end') {
      const won = state.winner === 'vanguard';
      els.overlayTitle.textContent = won ? 'VICTORY' : state.winner === 'draw' ? 'DRAW' : 'DEFEAT';
      els.overlayCopy.textContent = `Final score ${state.score.vanguard} – ${state.score.warden}. ${won ? 'The foundry is yours.' : 'The Wardens hold the yard.'}`;
      els.playBtn.textContent = 'Play again';
    }
  }
  function hideOverlay() {
    els.overlay.hidden = true;
  }

  // --- Per-frame update.
  let hitUntil = 0;
  let hitKill = false;
  let bannerUntil = 0;
  function update(dt, spread) {
    const player = state.player;
    const weapon = WEAPONS[player.current];
    const ammo = player.ammo[player.current];
    set(els.healthNum, 'hp', `${Math.max(0, Math.ceil(player.health))}`);
    if (els.healthFill) {
      const pct = Math.max(0, player.health);
      if (cache.hpPct !== pct) {
        cache.hpPct = pct;
        els.healthFill.style.width = `${pct}%`;
        els.healthFill.classList.toggle('low', pct <= 30);
      }
    }
    set(els.money, 'money', `$${rounds.moneyOf(player)}`);
    set(els.ammoMag, 'mag', `${ammo.mag}`);
    set(els.ammoReserve, 'res', `/ ${ammo.reserve}`);
    set(els.weaponName, 'wname', weapon.name);
    set(els.grenades, 'nade', `◉ ${player.grenades}`);
    els.hud.classList.toggle('reloading', player.reloading > 0);
    els.hud.classList.toggle('empty', ammo.mag === 0);

    const t = Math.max(0, Math.ceil(state.roundTime));
    const mm2 = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    set(els.timer, 'timer', state.phase === 'planted' ? '💣' : `${mm2}:${ss}`);
    set(els.scoreVan, 'sv', `${state.score.vanguard}`);
    set(els.scoreWar, 'sw', `${state.score.warden}`);
    set(els.roundNum, 'rn', `ROUND ${state.round}`);
    set(els.aliveVan, 'av', `${aliveOnTeam(state, 'vanguard')}`);
    set(els.aliveWar, 'aw', `${aliveOnTeam(state, 'warden')}`);

    // Crosshair gap follows the live spread.
    const gap = Math.round(6 + spread * 900);
    if (cache.gap !== gap) {
      cache.gap = gap;
      els.crosshair.style.setProperty('--gap', `${gap}px`);
    }
    if (state.lastHit && state.lastHit.t > hitUntil - 0.15) {
      hitUntil = state.lastHit.t + 0.15;
      hitKill = state.lastHit.kill;
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', hitKill);
    } else if (state.time > hitUntil) {
      els.hitmarker.classList.remove('on', 'kill');
    }

    // Kill feed: the last few events, fading with age.
    const feedHtml = state.events.slice(-4).map((e) => {
      const age = state.time - e.t;
      const cls = e.team === 'vanguard' ? 'feed-van' : e.team === 'warden' ? 'feed-war' : '';
      return `<div class="feed-item ${cls}" style="opacity:${Math.max(0.25, 1 - age / 8)}">${e.text}</div>`;
    }).join('');
    setHtml(els.feed, 'feed', feedHtml);

    // Bomb status line.
    const bomb = state.bomb;
    let bombText = '';
    if (bomb.state === 'planted' || bomb.state === 'defusing') {
      bombText = `💣 Site ${bomb.site} — ${bomb.timer.toFixed(1)}s${bomb.state === 'defusing' ? ' · DEFUSING' : ''}`;
    } else if (bomb.state === 'planting') {
      bombText = `Planting… ${Math.round(bomb.progress * 100)}%`;
    } else if (bomb.state === 'defusing') {
      bombText = `Defusing… ${Math.round(bomb.progress * 100)}%`;
    } else if (state.carrier === player) {
      bombText = 'You carry the charge — plant at Site A or B [E]';
    } else if (state.carrier) {
      bombText = `${state.carrier.name} carries the charge`;
    }
    set(els.bombText, 'bomb', bombText);
    els.bomb.hidden = bombText === '';

    // Context prompt.
    let prompt = '';
    if (state.phase === 'freeze') prompt = 'Buy phase — press [B] for the buy menu';
    else if (bomb.state === 'carried' && state.carrier === player) prompt = '';
    else if (bomb.state === 'planted' && player.team === 'vanguard') prompt = 'Defend the charge!';
    set(els.prompt, 'prompt', prompt);

    // Objective line.
    set(els.objective, 'obj', state.carrier === player
      ? 'OBJECTIVE: plant the charge at A or B'
      : 'OBJECTIVE: eliminate the Wardens or plant the charge');

    // Round banner.
    if (state.phase === 'roundEnd' && bannerUntil === 0) {
      bannerUntil = state.time + 3.5;
      els.bannerTitle.textContent = state.roundWinner === 'vanguard' ? 'VANGUARDS WIN THE ROUND' : 'WARDENS WIN THE ROUND';
      els.bannerSub.textContent = state.roundReason;
      els.banner.hidden = false;
    } else if (state.phase !== 'roundEnd') {
      bannerUntil = 0;
      els.banner.hidden = true;
    } else if (state.time > bannerUntil) {
      els.banner.hidden = true;
    }

    // Damage vignette.
    els.vignette.style.opacity = `${Math.min(0.85, state.hitFlash * 0.85)}`;

    drawMinimap();
    if (buyOpen) refreshBuy();
  }

  return {
    update, showOverlay, hideOverlay, openBuy, closeBuy, toggleBuy,
    get buyOpen() { return buyOpen; },
    refreshBuy,
  };
}
