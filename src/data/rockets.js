// 20 orbital launch vehicles. Figures are approximate public values, tuned so the
// simplified physics model reproduces each vehicle's flown performance class.
// Units: masses in tonnes, thrust in kN (vacuum), Isp in seconds, lengths in metres.
//
// stage:   { name, fuel, dry, prop, thrust, ispSL, ispVac, engines, d?, color?, pods? }
// boosters:{ name, count, fuel, dry, prop, thrust, ispSL, ispVac, d, len, shape?, color? }
// nose:    'fairing' | 'capsule' | 'ship' | 'shuttle'

export const ROCKETS = [
  {
    id: 'electron', name: 'Electron', maker: 'Rocket Lab', country: 'NZ / USA', era: '2017–',
    class: 'Small', height: 18, diameter: 1.2, payload: 0.15, nose: 'fairing',
    colors: { body: '#1b1d22', accent: '#e6e6e6' },
    desc: 'Carbon-composite smallsat launcher with electric-pump-fed Rutherford engines.',
    stages: [
      { name: 'Stage 1', fuel: 'kerolox', dry: 0.95, prop: 9.25, thrust: 224, ispSL: 285, ispVac: 311, engines: 9 },
      { name: 'Stage 2', fuel: 'kerolox', dry: 0.25, prop: 2.15, thrust: 25.8, ispSL: 280, ispVac: 343, engines: 1 },
    ],
  },
  {
    id: 'vega', name: 'Vega', maker: 'Avio / ESA', country: 'Europe', era: '2012–2024',
    class: 'Small', height: 30, diameter: 3, payload: 1.5, nose: 'fairing',
    colors: { body: '#f2f2f0', accent: '#2a3f8f' },
    desc: 'Three solid stages plus the restartable AVUM liquid upper stage.',
    stages: [
      { name: 'P80', fuel: 'solid', dry: 7.3, prop: 88, thrust: 3015, ispSL: 255, ispVac: 280, engines: 1 },
      { name: 'Zefiro 23', fuel: 'solid', dry: 1.9, prop: 24, thrust: 1200, ispSL: 260, ispVac: 289, engines: 1, d: 1.9 },
      { name: 'Zefiro 9', fuel: 'solid', dry: 0.9, prop: 10.5, thrust: 317, ispSL: 260, ispVac: 296, engines: 1, d: 1.9 },
      { name: 'AVUM', fuel: 'hypergolic', dry: 0.7, prop: 0.55, thrust: 2.45, ispSL: 200, ispVac: 315, engines: 1, d: 1.9 },
    ],
  },
  {
    id: 'pslv', name: 'PSLV-XL', maker: 'ISRO', country: 'India', era: '2008–',
    class: 'Medium', height: 44, diameter: 2.8, payload: 1.75, nose: 'fairing',
    colors: { body: '#f4f1ea', accent: '#a33d2a' },
    desc: 'Alternating solid and liquid stages with six strap-on solid motors.',
    boosters: { name: 'PSOM-XL', count: 6, fuel: 'solid', dry: 2.7, prop: 12.2, thrust: 720, ispSL: 240, ispVac: 262, d: 1.0, len: 13.5, color: '#efe9de' },
    stages: [
      { name: 'PS1', fuel: 'solid', dry: 30, prop: 138, thrust: 4800, ispSL: 237, ispVac: 269, engines: 1 },
      { name: 'PS2', fuel: 'hypergolic', dry: 5.3, prop: 42, thrust: 800, ispSL: 280, ispVac: 293, engines: 1 },
      { name: 'PS3', fuel: 'solid', dry: 1.1, prop: 7.6, thrust: 240, ispSL: 280, ispVac: 295, engines: 1, d: 2 },
      { name: 'PS4', fuel: 'hypergolic', dry: 0.9, prop: 2.5, thrust: 15, ispSL: 250, ispVac: 308, engines: 2, d: 2 },
    ],
  },
  {
    id: 'soyuz', name: 'Soyuz-2.1b', maker: 'Progress RSC', country: 'Russia', era: '2006–',
    class: 'Medium', height: 46.3, diameter: 2.95, payload: 8.2, nose: 'fairing',
    colors: { body: '#c9cfc6', accent: '#e06a24' },
    desc: 'The classic R-7 family "packet": four tapered boosters around a central core.',
    boosters: { name: 'Blok B/V/G/D', count: 4, fuel: 'kerolox', dry: 3.8, prop: 39.2, thrust: 1020, ispSL: 263, ispVac: 319, d: 2.68, len: 19.6, shape: 'cone', engines: 4 },
    stages: [
      { name: 'Blok A core', fuel: 'kerolox', dry: 6.5, prop: 90, thrust: 990, ispSL: 255, ispVac: 319, engines: 4 },
      { name: 'Blok I', fuel: 'kerolox', dry: 2.4, prop: 22.9, thrust: 298, ispSL: 330, ispVac: 359, engines: 1, d: 2.66 },
    ],
  },
  {
    id: 'falcon9', name: 'Falcon 9 Block 5', maker: 'SpaceX', country: 'USA', era: '2018–',
    class: 'Medium', height: 70, diameter: 3.7, payload: 12, nose: 'fairing', gridFins: true,
    colors: { body: '#f5f5f5', accent: '#1e1e1e' },
    desc: 'Nine Merlin 1D engines, reusable first stage, single-engine vacuum upper stage.',
    stages: [
      { name: 'Booster', fuel: 'kerolox', dry: 25.6, prop: 395.7, thrust: 8227, ispSL: 283, ispVac: 312, engines: 9, reusable: true },
      { name: 'Second stage', fuel: 'kerolox', dry: 4, prop: 92.7, thrust: 981, ispSL: 280, ispVac: 348, engines: 1 },
    ],
  },
  {
    id: 'atlas5', name: 'Atlas V 401', maker: 'ULA', country: 'USA', era: '2002–',
    class: 'Medium', height: 58.3, diameter: 3.81, payload: 8, nose: 'fairing',
    colors: { body: '#c7843f', accent: '#f2f2f2' },
    desc: 'RD-180-powered Common Core Booster topped by the high-energy Centaur stage.',
    stages: [
      { name: 'Common Core Booster', fuel: 'kerolox', dry: 21.05, prop: 284, thrust: 4152, ispSL: 311, ispVac: 338, engines: 2 },
      { name: 'Centaur', fuel: 'hydrolox', dry: 2.3, prop: 20.8, thrust: 99.2, ispSL: 300, ispVac: 451, engines: 1, d: 3.05, color: '#e9e9e9' },
    ],
  },
  {
    id: 'h2a', name: 'H-IIA 202', maker: 'MHI / JAXA', country: 'Japan', era: '2001–2025',
    class: 'Medium', height: 53, diameter: 4, payload: 8, nose: 'fairing',
    colors: { body: '#efe7d6', accent: '#2d4e9a' },
    desc: 'Hydrogen-fuelled core with two SRB-A solid boosters.',
    boosters: { name: 'SRB-A', count: 2, fuel: 'solid', dry: 10, prop: 66, thrust: 2100, ispSL: 260, ispVac: 283, d: 2.5, len: 15.1, color: '#f4f4f4' },
    stages: [
      { name: 'LE-7A core', fuel: 'hydrolox', dry: 13.6, prop: 101, thrust: 1098, ispSL: 337, ispVac: 440, engines: 1 },
      { name: 'Second stage', fuel: 'hydrolox', dry: 3, prop: 16.6, thrust: 137, ispSL: 300, ispVac: 448, engines: 1 },
    ],
  },
  {
    id: 'lvm3', name: 'LVM3', maker: 'ISRO', country: 'India', era: '2017–',
    class: 'Medium', height: 43.4, diameter: 4, payload: 6, nose: 'fairing',
    colors: { body: '#f1efe9', accent: '#b73a24' },
    desc: 'Two huge S200 solid boosters, an L110 hypergolic core and a C25 cryogenic stage.',
    boosters: { name: 'S200', count: 2, fuel: 'solid', dry: 31, prop: 205, thrust: 5150, ispSL: 250, ispVac: 274, d: 3.2, len: 25, color: '#e8e2d6' },
    stages: [
      { name: 'L110', fuel: 'hypergolic', dry: 9, prop: 116, thrust: 1598, ispSL: 270, ispVac: 293, engines: 2 },
      { name: 'C25', fuel: 'hydrolox', dry: 5, prop: 28, thrust: 200, ispSL: 300, ispVac: 442, engines: 1 },
    ],
  },
  {
    id: 'ariane5', name: 'Ariane 5 ECA', maker: 'Arianespace', country: 'Europe', era: '2002–2023',
    class: 'Heavy', height: 52, diameter: 5.4, payload: 10, nose: 'fairing',
    colors: { body: '#f7f7f5', accent: '#1f3a8a' },
    desc: 'Vulcain 2 cryogenic core flanked by two EAP solid boosters.',
    boosters: { name: 'EAP', count: 2, fuel: 'solid', dry: 33, prop: 240, thrust: 4975, ispSL: 250, ispVac: 275, d: 3.05, len: 31.6 },
    stages: [
      { name: 'EPC core', fuel: 'hydrolox', dry: 14.7, prop: 170, thrust: 1390, ispSL: 310, ispVac: 432, engines: 1 },
      { name: 'ESC-A', fuel: 'hydrolox', dry: 4.5, prop: 14.9, thrust: 67, ispSL: 300, ispVac: 446, engines: 1 },
    ],
  },
  {
    id: 'ariane6', name: 'Ariane 6 (A64)', maker: 'ArianeGroup', country: 'Europe', era: '2024–',
    class: 'Heavy', height: 63, diameter: 5.4, payload: 15, nose: 'fairing',
    colors: { body: '#f6f6f4', accent: '#3a3a3a' },
    desc: 'Four P120C solid boosters and a restartable Vinci upper stage.',
    boosters: { name: 'P120C', count: 4, fuel: 'solid', dry: 11, prop: 142, thrust: 3000, ispSL: 260, ispVac: 279, d: 3.4, len: 21.5 },
    stages: [
      { name: 'Lower Liquid Propulsion Module', fuel: 'hydrolox', dry: 16, prop: 154, thrust: 1370, ispSL: 310, ispVac: 432, engines: 1 },
      { name: 'Upper Liquid Propulsion Module', fuel: 'hydrolox', dry: 4.5, prop: 31, thrust: 180, ispSL: 320, ispVac: 457, engines: 1 },
    ],
  },
  {
    id: 'vulcan', name: 'Vulcan Centaur VC4', maker: 'ULA', country: 'USA', era: '2024–',
    class: 'Heavy', height: 61.6, diameter: 5.4, payload: 15, nose: 'fairing',
    colors: { body: '#d58a3c', accent: '#f4f4f4' },
    desc: 'Methane-fuelled BE-4 core, four GEM 63XL solids and the Centaur V stage.',
    boosters: { name: 'GEM 63XL', count: 4, fuel: 'solid', dry: 6, prop: 47, thrust: 1500, ispSL: 255, ispVac: 280, d: 1.6, len: 22, color: '#f0f0f0' },
    stages: [
      { name: 'Vulcan booster', fuel: 'methalox', dry: 35, prop: 465, thrust: 5400, ispSL: 310, ispVac: 340, engines: 2 },
      { name: 'Centaur V', fuel: 'hydrolox', dry: 6, prop: 54, thrust: 212, ispSL: 300, ispVac: 453, engines: 2, color: '#ececec' },
    ],
  },
  {
    id: 'cz5', name: 'Long March 5', maker: 'CALT', country: 'China', era: '2016–',
    class: 'Heavy', height: 57, diameter: 5, payload: 20, nose: 'fairing',
    colors: { body: '#f2f0ea', accent: '#c4302b' },
    desc: 'Hydrogen core with four kerosene boosters — China\'s heavy-lift workhorse.',
    boosters: { name: 'K3-1', count: 4, fuel: 'kerolox', dry: 12, prop: 143, thrust: 2680, ispSL: 300, ispVac: 335, d: 3.35, len: 27.6, engines: 2 },
    stages: [
      { name: 'Core stage', fuel: 'hydrolox', dry: 21, prop: 165, thrust: 1400, ispSL: 310, ispVac: 430, engines: 2 },
      { name: 'Second stage', fuel: 'hydrolox', dry: 4.5, prop: 26, thrust: 176, ispSL: 300, ispVac: 442, engines: 2 },
    ],
  },
  {
    id: 'proton', name: 'Proton-M', maker: 'Khrunichev', country: 'Russia', era: '2001–',
    class: 'Heavy', height: 58.2, diameter: 4.1, payload: 20, nose: 'fairing',
    colors: { body: '#d9dbd5', accent: '#5a5f63' },
    desc: 'Hypergolic heavy lifter: central oxidiser tank ringed by six fuel tanks.',
    stages: [
      { name: 'Stage 1', fuel: 'hypergolic', dry: 31, prop: 419, thrust: 11000, ispSL: 285, ispVac: 316, engines: 6, pods: { count: 6, d: 1.6, frac: 1 } },
      { name: 'Stage 2', fuel: 'hypergolic', dry: 11, prop: 157, thrust: 2400, ispSL: 300, ispVac: 327, engines: 4 },
      { name: 'Stage 3', fuel: 'hypergolic', dry: 3.5, prop: 46.5, thrust: 613, ispSL: 300, ispVac: 325, engines: 1 },
    ],
  },
  {
    id: 'deltaivh', name: 'Delta IV Heavy', maker: 'ULA', country: 'USA', era: '2004–2024',
    class: 'Heavy', height: 72, diameter: 5.1, payload: 20, nose: 'fairing',
    colors: { body: '#d97a2b', accent: '#f2f2f2' },
    desc: 'Three Common Booster Cores burning liquid hydrogen; the core throttles down early.',
    boosters: { name: 'Side CBC', count: 2, fuel: 'hydrolox', dry: 26.8, prop: 202, thrust: 3560, ispSL: 362, ispVac: 412, d: 5.1, len: 40.8 },
    coreThrottle: { after: 50, value: 0.58 },
    stages: [
      { name: 'Core CBC', fuel: 'hydrolox', dry: 26.8, prop: 202, thrust: 3560, ispSL: 362, ispVac: 412, engines: 1 },
      { name: 'DCSS', fuel: 'hydrolox', dry: 3.5, prop: 27.2, thrust: 110, ispSL: 300, ispVac: 462, engines: 1, color: '#efefef' },
    ],
  },
  {
    id: 'falconheavy', name: 'Falcon Heavy', maker: 'SpaceX', country: 'USA', era: '2018–',
    class: 'Heavy', height: 70, diameter: 3.7, payload: 25, nose: 'fairing', gridFins: true,
    colors: { body: '#f5f5f5', accent: '#1e1e1e' },
    desc: 'Three Falcon 9 cores — 27 Merlin engines at liftoff.',
    boosters: { name: 'Side booster', count: 2, fuel: 'kerolox', dry: 25.6, prop: 395.7, thrust: 8227, ispSL: 283, ispVac: 312, d: 3.7, len: 46, reusable: true, engines: 9 },
    coreThrottle: { after: 45, value: 0.6 },
    stages: [
      { name: 'Center core', fuel: 'kerolox', dry: 25.6, prop: 395.7, thrust: 8227, ispSL: 283, ispVac: 312, engines: 9, reusable: true },
      { name: 'Second stage', fuel: 'kerolox', dry: 4, prop: 92.7, thrust: 981, ispSL: 280, ispVac: 348, engines: 1 },
    ],
  },
  {
    id: 'newglenn', name: 'New Glenn', maker: 'Blue Origin', country: 'USA', era: '2025–',
    class: 'Heavy', height: 98, diameter: 7, payload: 30, nose: 'fairing',
    colors: { body: '#f4f4f4', accent: '#1d3c78' },
    desc: 'Seven BE-4 methane engines on a 7 m reusable booster; BE-3U hydrogen upper stage.',
    stages: [
      { name: 'GS1', fuel: 'methalox', dry: 190, prop: 1130, thrust: 19500, ispSL: 311, ispVac: 339, engines: 7, reusable: true },
      { name: 'GS2', fuel: 'hydrolox', dry: 22, prop: 180, thrust: 1420, ispSL: 300, ispVac: 445, engines: 2 },
    ],
  },
  {
    id: 'shuttle', name: 'Space Shuttle', maker: 'NASA', country: 'USA', era: '1981–2011',
    class: 'Heavy', height: 56.1, diameter: 8.4, payload: 12, nose: 'shuttle', gLimit: 3,
    colors: { body: '#c76a2a', accent: '#f6f6f6' },
    desc: 'Orbiter with three RS-25s on an External Tank, plus two Solid Rocket Boosters.',
    boosters: { name: 'SRB', count: 2, fuel: 'solid', dry: 87, prop: 500, thrust: 11000, ispSL: 242, ispVac: 268, d: 3.71, len: 45.5, color: '#f4f4f4' },
    stages: [
      { name: 'Orbiter + External Tank', fuel: 'hydrolox', dry: 125, prop: 730, thrust: 6600, ispSL: 366, ispVac: 452, engines: 3 },
    ],
  },
  {
    id: 'saturnv', name: 'Saturn V', maker: 'NASA', country: 'USA', era: '1967–1973',
    class: 'Super Heavy', height: 110.6, diameter: 10.1, payload: 45, nose: 'capsule', fins: true,
    colors: { body: '#f4f4f2', accent: '#151515' },
    desc: 'The Moon rocket. Five F-1 engines produced 34 MN at liftoff.',
    stages: [
      { name: 'S-IC', fuel: 'kerolox', dry: 131, prop: 2160, thrust: 38700, ispSL: 263, ispVac: 304, engines: 5 },
      { name: 'S-II', fuel: 'hydrolox', dry: 36, prop: 444, thrust: 5100, ispSL: 300, ispVac: 421, engines: 5 },
      { name: 'S-IVB', fuel: 'hydrolox', dry: 11, prop: 109, thrust: 1000, ispSL: 300, ispVac: 421, engines: 1, d: 6.6 },
    ],
  },
  {
    id: 'sls', name: 'SLS Block 1', maker: 'NASA', country: 'USA', era: '2022–',
    class: 'Super Heavy', height: 98, diameter: 8.4, payload: 27, nose: 'capsule',
    colors: { body: '#d0762f', accent: '#f4f4f4' },
    desc: 'Four RS-25 core engines and two five-segment solid boosters carrying Orion.',
    boosters: { name: '5-segment SRB', count: 2, fuel: 'solid', dry: 100, prop: 630, thrust: 14000, ispSL: 250, ispVac: 269, d: 3.71, len: 54, color: '#f4f4f4' },
    stages: [
      { name: 'Core Stage', fuel: 'hydrolox', dry: 85, prop: 980, thrust: 9100, ispSL: 366, ispVac: 452, engines: 4 },
      { name: 'ICPS', fuel: 'hydrolox', dry: 3.5, prop: 27, thrust: 110, ispSL: 300, ispVac: 462, engines: 1, d: 5, color: '#e9e9e9' },
    ],
  },
  {
    id: 'starship', name: 'Starship', maker: 'SpaceX', country: 'USA', era: '2023–',
    class: 'Super Heavy', height: 121, diameter: 9, payload: 100, nose: 'ship', gridFins: true,
    colors: { body: '#b9bec4', accent: '#2b2e33' },
    desc: 'Fully reusable stainless-steel super heavy lift: 33 Raptors on Super Heavy.',
    stages: [
      { name: 'Super Heavy', fuel: 'methalox', dry: 200, prop: 3400, thrust: 74000, ispSL: 327, ispVac: 347, engines: 33, reusable: true },
      { name: 'Ship', fuel: 'methalox', dry: 120, prop: 1500, thrust: 14700, ispSL: 330, ispVac: 370, engines: 6 },
    ],
  },
];

export const CLASSES = ['Small', 'Medium', 'Heavy', 'Super Heavy'];
