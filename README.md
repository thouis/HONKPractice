# TrombonePractice

A browser-based practice tool for trombone and other band instruments. Load a MusicXML score, play it back at any tempo, watch slide-position hints update in real time, and use the microphone to check your intonation or drive an interactive note-by-note practice mode.

## Features

- **Score rendering** — MusicXML (`.xml` / `.mxl`) upload or built-in score library, rendered as SVG by OpenSheetMusicDisplay
- **Multi-part scores** — part picker for ensemble scores; automatically suggests an instrument voice based on part name
- **Playback** — Tone.js sample-based synthesis; tempo slider 30–150%; count-in; click-to-seek
- **Metronome** — locked to score tempo and time signature, with audible click and visual beat indicator
- **Loop** — click-drag range selection on the score or manual bar inputs; optional rest bar between repeats
- **Position advisor** — dynamic-programming slide-position hints above note heads for trombone; shows partial positions optionally
- **Pitch detection** — microphone → [pitchy](https://github.com/ianprime0509/pitchy) (McLeod Pitch Method, ~60 fps) with two modes:
  - **Mic: Show** — scrolling colour-coded intonation meter (green ±10 ¢, yellow 11–25 ¢, red >25 ¢) while playing along to playback
  - **Mic: Listen** — interactive practice mode; cursor waits for you to play each note correctly before advancing; playback is muted to avoid microphone bleed
- **Instruments** — trombone (with slide positions), trumpet, French horn, tuba, flute, clarinet, alto/tenor/baritone saxophone
- **PWA** — installable, works offline after first load
- **No backend** — entirely client-side; settings and last-loaded score persist in `localStorage`

## Getting started

```bash
npm install
bash scripts/download-samples.sh   # downloads ~66 mp3 files into public/samples/
npm run dev                         # http://localhost:5173
```

### Build

```bash
npm run build     # type-check + Vite build → dist/
npm run preview   # serve dist/ locally
```

### Tests

```bash
npm test
```

## Deployment

The app is a fully static PWA. Deploy the contents of `dist/` to any static host.

**Cloudflare Pages** (recommended): connect your GitHub repo, set build command `npm run build`, output directory `dist`. No server required.

**GitHub Pages**: set `base` in `vite.config.ts` to match your repository name (already set to `/TrombonePractice/`), then push `dist/` to the `gh-pages` branch or use a GitHub Actions workflow.

> **Score files**: the `public/scores/` directory contains MusicXML arrangements. Check the copyright status of any arrangements before including them in a public deployment. The app is fully functional without them — users can upload their own MusicXML files via the toolbar.

## Libraries

| Library | Use | License |
|---------|-----|---------|
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | MusicXML parsing and SVG score rendering | MIT |
| [Tone.js](https://tonejs.github.io/) | Web Audio scheduling, sample playback, transport | MIT |
| [pitchy](https://github.com/ianprime0509/pitchy) | McLeod Pitch Method real-time pitch detection | MIT |
| [fflate](https://github.com/101arrowz/fflate) | In-browser `.mxl` (zipped MusicXML) decompression | MIT |
| [Vite](https://vitejs.dev/) | Build tool and dev server | MIT |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | Service worker and PWA manifest generation | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Type-checked JavaScript | Apache 2.0 |
| [FluidR3_GM soundfonts](https://github.com/gleitz/midi-js-soundfonts) | Instrument audio samples (mp3, not included in repo) | MIT / various — see repo |
| [vitest](https://vitest.dev/) | Unit test runner | MIT |

## Project structure

```
src/
  app.ts                  # top-level wiring
  modules/
    playback.ts           # Tone.js transport and sampler
    scoreDisplay.ts       # OSMD wrapper
    pitchDetector.ts      # microphone → pitchy pipeline
    practiceMode.ts       # hold-and-advance state machine
    practiceAdvance.ts    # cursor advancement logic
    positionAdvisor.ts    # slide-position DP solver
    metronome.ts
    storage.ts
    scoreLoader.ts        # file picker + .mxl decompression
    debugPanel.ts
  ui/
    controls.ts           # controls bar
    toolbar.ts
    scorePanel.ts
    libraryPanel.ts
    settingsPanel.ts
    partPicker.ts
    notify.ts             # toast notifications
  data/
    instruments/
      trombone.ts         # slide position tables + DP helpers
      keyed.ts            # trumpet, sax, horn, flute, clarinet, tuba
      index.ts
    partMapping.ts        # part-name → instrument heuristics
    defaultScore.ts
  types.ts
public/
  samples/                # mp3 files (downloaded by scripts/download-samples.sh)
  scores/                 # MusicXML files (not committed if copyrighted)
  library.json            # score library index
scripts/
  download-samples.sh     # fetches FluidR3_GM samples from gleitz CDN
```
