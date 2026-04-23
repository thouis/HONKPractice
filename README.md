# HONKPractice

A browser-based practice tool for band instruments. Load a MusicXML score, play it back at any tempo, and use the microphone to check your intonation or work through a piece note by note. Built for School of HONK musicians.

## Features

- MusicXML score loading (file upload or built-in library)
- Sample-based playback with tempo control and click-to-seek
- Metronome locked to score tempo
- Loop over any bar range
- Real-time intonation meter (mic input)
- Interactive practice mode — cursor waits for you to play each note in tune
- Slide-position hints for trombone; fingering hints for other instruments planned
- Password-protected PWA — installable, works offline

## Quick start

```bash
npm install
bash scripts/download-samples.sh   # one-time: ~66 mp3 samples into public/samples/
npm run dev                         # http://localhost:5173
```

## Build & deploy

```bash
npm run build     # downloads samples, type-checks, builds → dist/
npm run preview   # serve dist/ locally
npm test
```

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for deployment details and architecture notes.

## Libraries

| Library | Use |
|---------|-----|
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | MusicXML parsing and SVG rendering |
| [Tone.js](https://tonejs.github.io/) | Web Audio scheduling and sample playback |
| [pitchy](https://github.com/ianprime0509/pitchy) | Real-time pitch detection (McLeod method) |
| [fflate](https://github.com/101arrowz/fflate) | In-browser `.mxl` decompression |
| [Vite](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | Build tooling and PWA service worker |
| [FluidR3_GM soundfonts](https://github.com/gleitz/midi-js-soundfonts) | Instrument audio samples (not in repo) |

## TODO

- [ ] Fingering hints for trumpet and other keyed instruments (DP framework exists, needs fingering tables)
- [ ] Cloudflare deploy script for uploading score files separately from source
