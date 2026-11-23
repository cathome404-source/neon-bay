// Neon Bay — every tuning number and colour in one place.
// The world is a fixed 4800x3600 pixel city; the renderer scales the view to the window.
export const WORLD = { width: 4800, height: 3600 };

// Roads: vertical avenues and horizontal streets, each 90 px wide with a 24 px sidewalk.
export const ROAD_W = 90;
export const SIDEWALK = 24;
export const AVENUES = [600, 1200, 1800, 2400, 3000, 3600, 4200];
export const STREETS = [500, 1000, 1500, 2000, 2500, 3000];

// Beach on the west edge: sand, then water.
export const BEACH = { sandX: 320, waterX: 130 };

// Zones (rectangles in world space) used for flavour, spawns and mission sites.
export const ZONES = {
  downtown: { x: 1500, y: 800, w: 1800, h: 1400 },
  docks: { x: 4200, y: 2600, w: 600, h: 1000 },
  suburbs: { x: 600, y: 2600, w: 1200, h: 1000 },
  beach: { x: 0, y: 0, w: 320, h: 3600 },
};

// Home base (garage) and the hideout where wanted decays fast.
export const GARAGE = { x: 660, y: 2150 };
export const HIDEOUT = { x: 1080, y: 2750, r: 220 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 170,
  runSpeed: 300,
  hp: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
  pistolAmmo: 12,
  pistolDamage: 34,
  fireCooldown: 0.22,
  bulletSpeed: 900,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  turnRate: 2.6,
  grip: 3.2,
  hp: 160, // cars are tough: a cross-city drive with a few scrapes should not kill one
};

export const TRAFFIC = { count: 22, speed: 150, speedJitter: 40, minGap: 70 };
export const PEDS = { count: 34, walkSpeed: 55, fleeSpeed: 230 };

export const POLICE = {
  maxCars: 4,
  chaseSpeed: 300,
  ramDamage: 2, // a ram mostly shoves the car; it must not shred it in seconds
  spawnDistance: 900,
  bustTime: 2.5, // seconds a cop must sit on a slow on-foot player to bust them
  decaySeconds: 15, // seconds out of sight before one star drops
  hideoutFactor: 3, // decay this many times faster inside the hideout
};

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'First Pickup',
    reward: 300,
    intro: 'Vic: "Rex, you\'re back. Good. A package is waiting at the docks. Bring it to the garage — and don\'t let the harbour crew see you."',
    steps: [
      { type: 'goto', x: 4200, y: 2850, r: 70, text: 'Pick up the package at the docks' },
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 130, text: 'Bring the package back to the garage' },
    ],
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    reward: 400,
    intro: 'Vic: "You got spotted, kid. Two stars on you now. Lay low — break line of sight and the heat fades. The hideout helps."',
    steps: [
      { type: 'loseHeat', text: 'Lose the wanted level — stay out of sight, or hide at the hideout' },
    ],
  },
  {
    id: 'drops',
    title: 'Cash Drops',
    reward: 500,
    timeLimit: 150,
    intro: 'Lena: "Some friends stashed cash all over Neon Bay. Five drops, two and a half minutes. Grab them all before someone else does."',
    steps: [
      { type: 'collect', count: 5, text: 'Collect the cash drops (0/5)' },
    ],
  },
  {
    id: 'getaway',
    title: 'Getaway Driver',
    reward: 700,
    intro: 'Vic: "Lena needs a ride out of downtown — and the cops are already on her. Pick her up, then get her to the hideout. Fast."',
    steps: [
      { type: 'goto', x: 2400, y: 1300, r: 80, text: 'Pick up Lena downtown' },
      { type: 'goto', x: HIDEOUT.x, y: HIDEOUT.y, r: 120, text: 'Get Lena to the hideout — cops are coming' },
    ],
  },
  {
    id: 'score',
    title: 'The Big Score',
    reward: 1500,
    intro: 'Vic: "One last job. The Meridian Bank vault, downtown. Hold the vault door, grab the cash, and run. This one brings the whole department."',
    steps: [
      { type: 'goto', x: 2350, y: 1150, r: 80, text: 'Reach the Meridian Bank downtown' },
      { type: 'hold', x: 2350, y: 1150, r: 90, seconds: 8, text: 'Crack the vault — hold your ground' },
      { type: 'goto', x: HIDEOUT.x, y: HIDEOUT.y, r: 120, text: 'Escape to the hideout with the cash' },
    ],
  },
];

export const PICKUPS = { cashValue: 50, ammo: 12, health: 30 };

export const DAY_LENGTH = 300; // seconds for a full day/night tint cycle

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9c4e',
  road: '#3a3f4a',
  roadLine: '#d8c84a',
  sidewalk: '#9aa0ab',
  sand: '#e8d5a0',
  water: '#2f7fb8',
  waterDeep: '#256b9e',
  building: '#b08968',
  buildingDowntown: '#8d99ae',
  buildingDocks: '#7d7468',
  house: '#c98f6b',
  roof: '#5d4a3a',
  park: '#5d8f4a',
  player: '#39d353',
  playerCar: '#e5534b',
  police: '#2f6fed',
  ped: '#e8e3d3',
  gold: '#f2c94c',
  text: '#f4f1e8',
  muted: '#b9b3a4',
  panel: 'rgba(12, 14, 20, 0.72)',
  danger: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'neon-bay.save.v1';
