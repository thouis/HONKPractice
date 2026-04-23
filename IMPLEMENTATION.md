# Implementation notes

## Architecture

Single-page TypeScript app, no backend. All state in `localStorage`. Deployed as a PWA via Cloudflare Pages.

```
src/
  app.ts                 # top-level wiring — DOM init, event handlers, module coordination
  main.ts                # entry point — auth gate, then initApp()
  auth.ts                # password gate (build-time env vars, SHA-256 check)
  modules/
    playback.ts          # Tone.js transport + sampler; timeline built by cursor walk
    scoreDisplay.ts      # OSMD wrapper; cursor pixel positions; scroll suppression
    pitchDetector.ts     # mic → pitchy → intonation meter canvas overlay
    practiceMode.ts      # hold-and-advance state machine (idle → ready → holding → advance)
    practiceAdvance.ts   # cursor step logic extracted for testability
    positionAdvisor.ts   # DP slide-position solver; renders SVG labels above note heads
    metronome.ts         # Tone.js click scheduling, synced to transport
    storage.ts           # localStorage wrappers with quota-exceeded toasts
    scoreLoader.ts       # file picker + fflate .mxl decompression
    debugPanel.ts        # floating debug log (toggle with D key)
  ui/
    controls.ts          # controls bar — all transport/mode buttons
    toolbar.ts           # top bar — title, Library, Load File, Settings, Help
    scorePanel.ts        # OSMD container + canvas overlay + beat indicator
    libraryPanel.ts      # slide-out score browser
    settingsPanel.ts     # modal — volume sliders, pitch sensitivity
    partPicker.ts        # modal — part selector for multi-instrument scores
    helpPanel.ts         # modal — button reference
    notify.ts            # toast notifications (info/warning/error)
  data/
    instruments/
      trombone.ts        # slide position tables + penalty function
      keyed.ts           # sample-only stubs for trumpet, sax, horn, flute, clarinet, tuba
      index.ts           # INSTRUMENTS registry + DEFAULT_INSTRUMENT
    partMapping.ts       # regex rules: part name → instrument ID
    defaultScore.ts      # inline C major scale (shown before any score is loaded)
  types.ts               # InstrumentDef, NoteEvent, FingeringEntry
public/
  samples/               # mp3 files — gitignored, downloaded by prebuild script
  scores/                # MusicXML files — gitignored, deployed separately to Cloudflare
  library.json           # score index loaded at runtime
  icons/                 # PWA icons
scripts/
  download-samples.sh    # fetches sparse FluidR3_GM samples from gleitz CDN
```

## Key design decisions

**Playback timeline**: OSMD is walked once by cursor on score load to build a flat `NoteEvent[]` (beat fraction, cursor index, MIDI notes, durations). Tone.js schedules from this array; the cursor advances via callbacks. This avoids re-walking the OSMD tree during playback.

**Pitch detection**: pitchy runs at ~60 fps in a `ScriptProcessorNode`. Concert-pitch Hz is compared to `expectedHz` (read from OSMD cursor `halfTone + 12`, which OSMD reports as concert pitch regardless of instrument transposition).

**Slide position advisor**: dynamic programming over the note sequence, minimising total slide travel. `penalty()` adds cost for awkward positions (e.g. 6th/7th) and partial-valve combinations. Labels are injected as SVG `<text>` elements above each note head.

**Practice mode state machine**: `idle → ready (pitch detected near expected) → holding (in-tune for N ms) → advance`. Hold time is ~50% of written note duration, clamped 150–400 ms. A failed pitch attempt resets to `ready`.

**Part mapping**: `partMapping.ts` applies ordered regex rules to part names from the score to suggest an instrument. Combo patterns (e.g. `clarinet.*tenor`) appear before their single-instrument variants so they match first.

**Auth**: password is never stored. The build bakes in `SHA-256(SALT + password)` via `VITE_AUTH_SALT` / `VITE_AUTH_HASH` env vars. A 16-char prefix of the hash is stored in `localStorage` on success.

## Deployment

### Cloudflare Pages

Build command: `npm run build`
Output directory: `dist`
Environment variables (set in Cloudflare dashboard):
- `VITE_AUTH_SALT` — salt string (≥8 chars)
- `VITE_AUTH_HASH` — `SHA-256(salt + password)` as hex

Generate hash:
```bash
node -e "
  const c = require('crypto'), salt = 'YOUR_SALT', pw = 'YOUR_PASSWORD';
  console.log(c.createHash('sha256').update(salt + pw).digest('hex'));
"
```

### Uploading score files

Score files are not in the GitHub repo. Use the deploy script to build and push everything together:

```bash
bash scripts/deploy.sh
# or with a custom scores directory:
bash scripts/deploy.sh --scores-dir /path/to/scores
```

Requires `wrangler` authenticated via `wrangler login`. Set `CLOUDFLARE_PROJECT` env var to override the default project name (`HONKPractice`).

Code-only changes can be deployed automatically from GitHub via the Cloudflare Pages Git integration. Re-run the deploy script only when score files change.

### `vite.config.ts` base path

Currently set to `/TrombonePractice/` — update to `/` (or the Cloudflare Pages project path) before first deploy.

## Known issues / TODO

**Features**
- Fingering hints for trumpet/keyed instruments — DP framework exists, needs tables
- Practice "Done!" overlay fires at score end, not loop end
- No retry if `library.json` fetch fails
- Settings silently not saved on localStorage quota exceeded (other storage errors do toast)

**Bugs**
- `playback.ts` `play()`: `seekOffsetSec ?? undefined` drops `0` (falsy), so seek-to-start is broken — should be `seekOffsetSec !== null ? seekOffsetSec : undefined`
- `playback.ts` `reschedule()`: calls `transport.pause()` without waiting for state to settle after `transport.start()`, can leave transport inconsistent when paused
- `practiceAdvance.ts`: rest-skip while loop has no termination guard if cursor gets stuck

**Code quality**
- Voice selection (pick lowest/middle/highest MIDI from chord) is duplicated between `app.ts:currentNoteHz()` and `playback.ts:selectVoiceNotes()` — extract to a shared util
- `updateExpectedPitch()` and `updateMeterAnchor()` are always called together — merge them
- `pitchDetector.ts` canvas meter: magic numbers for colors and thresholds should be named constants
- `scheduleEvents()` in `playback.ts` mixes timeline scheduling, metronome, loop, and voice selection — worth splitting

**Tests missing**
- DP position advisor (`runDP`) — core algorithm has no test coverage
- Loop-wrap cursor reset (`loopOn && idx < cursorIdx` in `app.ts`)
- Auth gate — dev skip and prod throw paths
- Rest-skip termination in `practiceAdvance.ts`
- Invalid/malformed `.mxl` archive handling in `scoreLoader.ts`
