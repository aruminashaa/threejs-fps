// Foundry Line — the entry program (Node 22, standard library only).
// It hands the game in: copies game/ and screenshots/ from beside this file
// into the output directory and writes dossier.json with make.fun's own
// library, the same bytes the gate rebuilds when it checks the entry.
// In the grader the output directory is /output; locally, set
// MAKEFUN_OUTPUT_DIR:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shots = join(repoRoot, 'screenshots');
if (existsSync(shots)) cpSync(shots, join(outDir, 'screenshots'), { recursive: true });

// The gate's caps (reference/gate.json): text_max_bytes shapes the dossier
// text; the rest refuse an entry the scorer would refuse — more than 4
// screenshots, a screenshot over 256 KiB, more than 993 files in game/, or
// more than 48 MiB of game files.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
