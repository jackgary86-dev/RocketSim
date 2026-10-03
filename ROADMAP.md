# RocketSim — roadmap to a sellable game

## Before selling anything

1. **Vehicle names.** The catalogue uses real vehicle names for reference. For a paid
   product either license them or ship an "inspired-by" name set (e.g. *Kestrel 9*,
   *Titan Heavy*) with the real vehicles only mentioned as historical inspiration.
   `src/data/rockets.js` is the single place to change.
2. **Asset licence audit.** Earth textures are from the three.js examples (MIT). Fonts
   are system fonts. Speech is the browser's synthesiser. Anything added later (music,
   voice, SFX, models) must be cleared for commercial use.

## Features that sell in this genre

| Priority | Feature | Notes |
| --- | --- | --- |
| ★★★ | Career mode with money | Contracts pay; hardware and propellant cost (the shipping manifest already itemises every lot). Failures cost real money → stakes. |
| ★★★ | Rocket builder | Stack your own stages/engines/boosters. `RocketModel` already builds from a parts list; a part editor is the natural next step. |
| ★★★ | Replay + share | One-click flight replay to GIF/MP4 and a shareable mission card (score, orbit, rocket). Free marketing. |
| ★★ | Desktop packaging | Electron/Tauri build for Steam with achievements, cloud saves, controller support. |
| ★★ | Leaderboards / daily challenge | Seeded failures and weather; score per mission. |
| ★★ | Audio polish | Voice-acted callouts, licensed music, pad ambience, sonic boom, deluge. |
| ★★ | More content (cheap) | Vandenberg, Kourou, Baikonur sites; historical mission profiles; tutorial mission. |
| ★ | Mobile / touch controls, colour-blind palette, quality presets | |
| ★ | Mod folder | Rockets, missions and paint schemes are already plain data. |

## Release path (Steam Direct)

1. Test interest with a free / pay-what-you-want build on **itch.io**.
2. Build a **Steam Next Fest** demo (5 rockets, 2 missions) for wishlists.
3. Steamworks sign-up, $100 Steam Direct fee (refunded at $1k revenue), 30-day
   new-account wait, store page live as "Coming Soon" ≥ 2 weeks before launch.
4. Upload with SteamPipe; add achievements (first orbit, booster landing, hard-mode
   orbit, all 20 vehicles flown) through the SDK; submit the build for review.
5. Suggested price $9.99–14.99; optional cosmetic DLC (paint schemes, historical packs).

Fees, wait times and revenue splits change — confirm on the Steamworks site.
