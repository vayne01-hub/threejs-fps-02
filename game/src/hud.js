// SABLE YARD — the HUD: every DOM readout, the killfeed, the buy menu and
// the overlays. The sim never touches the DOM; it calls the small methods
// here (hudMessage, hudKillfeed, ...), and update() refreshes the readouts
// once a frame, writing text only when the value changed.
import { WEAPONS, GRENADE, MATCH } from './config.js';

function el(id) { return document.getElementById(id); }

export class HUD {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
    this.buyOpen = false;
    this.msgUntil = 0;
    this.bannerUntil = 0;
    this.hitUntil = 0;
    this.dmgUntil = 0;
    this.buildBuyMenu();
  }

  setText(id, value) {
    if (this.cache.get(id) === value) return;
    this.cache.set(id, value);
    const n = el(id);
    if (n) n.textContent = value;
  }

  setShown(id, shown) {
    const key = `show:${id}`;
    if (this.cache.get(key) === shown) return;
    this.cache.set(key, shown);
    const n = el(id);
    if (n) n.hidden = !shown;
  }

  setWidth(id, pct) {
    const key = `w:${id}`;
    const v = Math.round(pct);
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    const n = el(id);
    if (n) n.style.width = `${v}%`;
  }

  // -- messages ------------------------------------------------------------
  hudMessage(text) {
    this.setText('message', text);
    this.setShown('message', true);
    this.msgUntil = this.world.time + 3.5;
  }

  hudBanner(text) {
    this.setText('banner', text);
    this.setShown('banner', true);
    this.bannerUntil = this.world.time + MATCH.roundEndSeconds;
  }

  hudKillfeed(killer, victim, isHead) {
    const feed = el('killfeed');
    if (!feed) return;
    const row = document.createElement('div');
    row.className = 'feed-row';
    const kn = killer ? (killer.isPlayer ? 'YOU' : `${killer.team === 'sable' ? 'SABLE' : 'VULTURE'} ${killer.index + 1}`) : '—';
    const vn = victim.isPlayer ? 'YOU' : `${victim.team === 'sable' ? 'SABLE' : 'VULTURE'} ${victim.index + 1}`;
    row.innerHTML = `<span class="${killer && killer.team === 'sable' ? 'tk-sable' : 'tk-vulture'}">${kn}</span>` +
      ` <span class="tk-mid">${isHead ? '◉' : '▸'}</span> ` +
      `<span class="${victim.team === 'sable' ? 'tk-sable' : 'tk-vulture'}">${vn}</span>`;
    feed.prepend(row);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => row.remove(), 6000);
  }

  hudHitmarker(isHead) {
    const h = el('hitmarker');
    if (!h) return;
    h.classList.toggle('head', isHead);
    h.classList.add('on');
    this.hitUntil = this.world.time + 0.12;
  }

  hudDamageFlash() {
    const d = el('dmg');
    if (!d) return;
    d.classList.add('on');
    this.dmgUntil = this.world.time + 0.25;
  }

  hudMatchEnd(winner) {
    this.setText('end-title', winner === 'sable' ? 'VICTORY' : 'DEFEAT');
    el('end-title').className = winner === 'sable' ? 'win' : 'lose';
    const p = this.world.player;
    this.setText('end-stats', `Rounds ${this.world.round.wins.sable} — ${this.world.round.wins.vulture}  ·  Kills ${p.kills}  ·  Deaths ${p.deaths}`);
    this.setShown('overlay-end', true);
  }

  // -- buy menu ------------------------------------------------------------
  buildBuyMenu() {
    const list = el('buy-list');
    if (!list) return;
    const items = [
      ...Object.values(WEAPONS).filter((w) => w.price > 0).map((w) => ({
        key: w.slot, id: w.id, name: w.name, desc: `${w.damage} dmg · ${w.mag} rounds`, price: w.price,
      })),
      { key: 5, id: 'grenade', name: 'FRAG GRENADE', desc: 'Explosive, 6.5 m radius', price: GRENADE.price },
      { key: 6, id: 'armor', name: 'KEVLAR VEST', desc: '50 armor, absorbs half of each hit', price: 650 },
    ];
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.id = item.id;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span>` +
        `<span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => this.world.buyItem(item.id));
      list.appendChild(row);
    }
  }

  toggleBuy(open) {
    this.buyOpen = open ?? !this.buyOpen;
    this.setShown('buy', this.buyOpen);
    if (this.buyOpen) this.refreshBuy();
  }

  refreshBuy() {
    const p = this.world.player;
    document.querySelectorAll('.buy-row').forEach((row) => {
      const id = row.dataset.id;
      const w = WEAPONS[id];
      const owned = w ? p.owned.has(id) : (id === 'armor' ? p.armor >= 50 : p.grenades >= GRENADE.maxCarry);
      const price = id === 'grenade' ? GRENADE.price : id === 'armor' ? 650 : w.price;
      row.classList.toggle('owned', owned);
      row.classList.toggle('poor', !owned && p.money < price);
    });
    this.setText('buy-money', `$${p.money}`);
  }

  // -- per-frame refresh -----------------------------------------------------
  update() {
    const world = this.world;
    const p = world.player;
    const round = world.round;
    const now = world.time;

    if (now > this.msgUntil) this.setShown('message', false);
    if (now > this.bannerUntil) this.setShown('banner', false);
    if (now > this.hitUntil) el('hitmarker')?.classList.remove('on');
    if (now > this.dmgUntil) el('dmg')?.classList.remove('on');

    const w = WEAPONS[p.loadout.id];
    this.setText('health-num', `${Math.ceil(p.hp)}`);
    this.setWidth('health-fill', p.hp);
    this.setText('armor-num', `${Math.ceil(p.armor)}`);
    this.setText('ammo-mag', `${p.loadout.mag}`);
    this.setText('ammo-reserve', `/ ${p.loadout.reserve}`);
    this.setText('weapon-name', w.name);
    this.setText('money', `$${p.money}`);
    this.setText('grenades', `◉ ${p.grenades}`);
    this.setText('score-sable', `${round.wins.sable}`);
    this.setText('score-vulture', `${round.wins.vulture}`);
    this.setText('round-num', `ROUND ${Math.max(1, round.round)} / ${MATCH.maxRounds}`);

    // Timer: freeze counts down, live counts down, bomb shows the fuse.
    let timerText = '';
    let timerClass = '';
    if (round.phase === 'freeze') {
      timerText = `BUY ${Math.ceil(round.timer)}`;
      timerClass = 'buy-phase';
    } else if (round.bomb.planted) {
      timerText = `💣 ${round.bomb.fuse.toFixed(1)}`;
      timerClass = 'bomb-live';
    } else if (round.phase === 'live') {
      timerText = `${Math.floor(round.timer / 60)}:${String(Math.floor(round.timer % 60)).padStart(2, '0')}`;
    } else if (round.phase === 'roundEnd') {
      timerText = round.banner;
      timerClass = 'round-over';
    } else {
      timerText = '—';
    }
    this.setText('timer', timerText);
    const timerEl = el('timer');
    if (timerEl && timerEl.className !== timerClass) timerEl.className = timerClass;

    // Crosshair gap follows the current spread.
    const spread = p.loadout.reloading ? 0.03 : 0.004 + p.loadout.bloom * 0.9 + (p.moving ? 0.008 : 0);
    const gap = Math.round(4 + spread * 900);
    const ch = el('crosshair');
    if (ch) ch.style.setProperty('--gap', `${gap}px`);

    // Plant / defuse progress bar.
    const b = round.bomb;
    const planting = p.isCarrier && !b.planted && b.plantProgress > 0;
    const defusing = b.planted && b.defuseProgress > 0;
    if (planting || defusing) {
      const pct = planting
        ? (b.plantProgress / MATCH.plantSeconds) * 100
        : (b.defuseProgress / MATCH.defuseSeconds) * 100;
      this.setShown('progress', true);
      this.setWidth('progress-fill', pct);
      this.setText('progress-label', planting ? 'PLANTING SPIKE…' : 'DEFUSING SPIKE…');
    } else {
      this.setShown('progress', false);
    }

    // Spike carrier indicator.
    this.setText('spike', p.isCarrier ? '⬢ SPIKE CARRIER' : (b.planted ? `⬢ SPIKE AT ${b.site}` : (b.dropped ? '⬢ SPIKE DROPPED' : '')));
    this.setShown('spike', p.isCarrier || b.planted || b.dropped);

    // Reloading indicator.
    this.setShown('reloading', p.loadout.reloading);
    if (this.buyOpen) this.refreshBuy();
  }
}
