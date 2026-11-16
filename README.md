# threejs-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/aruminashaa/threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/aruminashaa/threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Foundry Line is a round-based tactical FPS in the style Counter-Strike made famous, built with three.js 0.187.0 and zero dependencies. You are a Vanguard fighting 4v4 against bot Wardens on Foundry Yard, an original desert-foundry map with three lanes and two plant sites (Furnace and Silo). Rounds are won by elimination, by planting and detonating the charge, or by defusing it; money earned each round buys a carbine, a scattergun and frag grenades from the buy menu. Gunplay rewards stopping to aim: spread grows with movement and sustained fire, recoil kicks the view, and headshots multiply damage. Bots navigate a waypoint graph, hold sites, rotate on the plant, react to sight and to gunfire, and strafe while firing in bursts. Everything runs offline from static files — sounds are synthesised in WebAudio, so the game makes no network requests.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No install step: Node 22+ only.

To build the entry dossier locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
