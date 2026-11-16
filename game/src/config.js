// SABLE YARD — tuning, weapons, economy. One place for every number the
// simulation reads, so balance changes never touch the game logic.
export const TICK = 1 / 60;

export const MATCH = {
  freezeSeconds: 6, // buy phase at the start of every round
  roundSeconds: 100, // live round timer
  bombSeconds: 35, // fuse after the spike is planted
  plantSeconds: 3.2, // hold-to-plant time
  defuseSeconds: 5.0, // hold-to-defuse time
  roundEndSeconds: 4, // banner pause between rounds
  winsNeeded: 5, // first team to this many round wins takes the match
  maxRounds: 9, // round 9 is sudden death: a timeout is a defender win
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500, // per consecutive loss after the first
  lossRewardCap: 3400,
  plantReward: 300,
  defuseReward: 300,
};

// Weapons: damage is per body hit at close range; headshots multiply it.
// spread is in radians of half-angle; bloom grows it while firing/moving.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', slot: 1, price: 0, auto: false,
    damage: 34, headMult: 3.5, rpm: 320, mag: 12, reserve: 48,
    reloadSeconds: 1.4, spreadBase: 0.011, spreadMove: 0.016,
    spreadBloom: 0.004, bloomMax: 0.03, recoil: 0.011, rangeNear: 18,
    rangeFar: 40, falloff: 0.6, speed: 5.0, tracer: 0xffd27a, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'VK-9 RIPPER', slot: 2, price: 1500, auto: true,
    damage: 26, headMult: 3.5, rpm: 750, mag: 28, reserve: 112,
    reloadSeconds: 2.0, spreadBase: 0.017, spreadMove: 0.02,
    spreadBloom: 0.003, bloomMax: 0.045, recoil: 0.009, rangeNear: 14,
    rangeFar: 32, falloff: 0.55, speed: 4.6, tracer: 0xff9d5c, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 LONGSHOT', slot: 3, price: 2700, auto: true,
    damage: 33, headMult: 3.5, rpm: 600, mag: 30, reserve: 90,
    reloadSeconds: 2.4, spreadBase: 0.01, spreadMove: 0.018,
    spreadBloom: 0.0035, bloomMax: 0.04, recoil: 0.013, rangeNear: 20,
    rangeFar: 45, falloff: 0.65, speed: 4.4, tracer: 0xffe9a8, zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 DEADEYE', slot: 4, price: 4750, auto: false,
    damage: 95, headMult: 3.5, rpm: 55, mag: 5, reserve: 20,
    reloadSeconds: 3.2, spreadBase: 0.002, spreadMove: 0.05,
    spreadBloom: 0.02, bloomMax: 0.09, recoil: 0.05, rangeNear: 30,
    rangeFar: 80, falloff: 0.85, speed: 4.0, tracer: 0x9fd8ff, zoom: 1,
  },
};

export const GRENADE = {
  price: 300, maxCarry: 2, fuseSeconds: 1.6, radius: 6.5,
  damageMax: 110, damageMin: 25, throwSpeed: 17, gravity: 14,
};

export const PLAYER = {
  radius: 0.36, // horizontal half-extent of the body box
  height: 1.78, crouchHeight: 1.2, eyeHeight: 1.62, crouchEyeHeight: 1.08,
  accel: 42, friction: 10, crouchSpeed: 2.3, health: 100,
};

export const BOT = {
  countPerTeam: 3, // teammates; enemies are countPerTeam + 1 (4v4 total)
  speed: 3.7, reactionMin: 0.28, reactionMax: 0.55,
  aimErrorBase: 0.022, aimErrorMove: 0.02, burstMin: 3, burstMax: 5,
  burstPauseMin: 0.5, burstPauseMax: 1.1, sightRange: 42, fovCos: 0.35,
  hearRange: 26, thinkEvery: 0.15,
};

export const TEAMS = {
  sable: { name: 'SABLE', color: 0xf0a830, dark: 0x8a5f10, role: 'attack' },
  vulture: { name: 'VULTURE', color: 0x35d0c0, dark: 0x0f6b60, role: 'defend' },
};
