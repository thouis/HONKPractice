# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

First testable version scaffolded (April 2026). Core modules implemented; **trombone mp3 samples not yet downloaded** — app will load and render scores but audio won't play until samples are in `public/samples/trombone/`. Canonical specification: `TrombonePractice_Design.txt`.

## Planned Stack

- **Framework**: TypeScript web app, no backend
- **Score rendering**: OpenSheetMusicDisplay (SVG)
- **Audio/synthesis**: Tone.js + trombone soundfont (MIDI)
- **Pitch detection**: pitchy library (McLeod Pitch Method, ~60 fps)
- **Storage**: browser localStorage only (no accounts, no server)
- **Deployment**: PWA via GitHub Pages

## Architecture

Six modules as specified in the design doc:

1. **Score Loading** — MusicXML (.xml/.mxl) upload + library browser; parsed score cached in localStorage
2. **Score Display** — OpenSheetMusicDisplay SVG viewport; transparent canvas overlay for pitch graph; position labels in SVG layer
3. **Playback** — Tone.js MIDI synthesis, tempo slider 30–150%, count-in, loop by bar range
4. **Metronome** — synced to score tempo/time signature; audible + visual; subdivision options
5. **Pitch Detection** — microphone → pitchy → scrolling colour-coded intonation graph on canvas overlay (green ±10¢, yellow 11–25¢, red >25¢)
6. **Position Advisor** — dynamic programming (O(k×7²)) to minimise slide travel; labels shown above note heads

The score library is static MusicXML files on GitHub Pages indexed by `library.json`.

## Tooling Preferences

Per parent `AGENTS.md`: prefer MCP hashline tools for file operations when available (`mcp__hashline-edit-server__read_file`, `grep`, `edit_file`, `write_file`).

## Build / Test / Lint

```bash
npm run dev      # start dev server (localhost:5173)
npm run build    # tsc + vite build → dist/
npm run preview  # preview built dist/
npx tsc --noEmit # type-check only
```

No test framework yet. Verify manually via `npm run dev`.
