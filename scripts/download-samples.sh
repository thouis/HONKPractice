#!/bin/bash
# Downloads sparse FluidR3_GM samples for each instrument.
# Run from the repo root: bash scripts/download-samples.sh
set -e
BASE="https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM"
DEST="public/samples"

dl() {
  local inst=$1 folder=$2; shift 2
  mkdir -p "$DEST/$inst"
  for note in "$@"; do
    local dest="$DEST/$inst/${note}.mp3"
    [ -f "$dest" ] && continue
    echo "  $inst/$note.mp3"
    curl -sf -o "$dest" "$BASE/$folder/${note}.mp3" || echo "  WARN: $inst/$note not found"
  done
}

echo "Trumpet..."
dl trumpet trumpet-mp3 A3 C4 Eb4 Gb4 A4 C5 Eb5 Gb5 A5

echo "French horn..."
dl french_horn french_horn-mp3 A2 C3 Eb3 Gb3 A3 C4 Eb4 Gb4 A4

echo "Tuba..."
dl tuba tuba-mp3 A1 C2 Eb2 Gb2 A2 C3 Eb3

echo "Flute..."
dl flute flute-mp3 C4 Eb4 Gb4 A4 C5 Eb5 Gb5 A5 C6

echo "Clarinet..."
dl clarinet clarinet-mp3 Eb3 Gb3 A3 C4 Eb4 Gb4 A4 C5 Eb5 Gb5

echo "Alto sax..."
dl alto_sax alto_sax-mp3 Eb3 Gb3 A3 C4 Eb4 Gb4 A4 C5

echo "Tenor sax..."
dl tenor_sax tenor_sax-mp3 A2 C3 Eb3 Gb3 A3 C4 Eb4

echo "Baritone sax..."
dl baritone_sax baritone_sax-mp3 Eb2 Gb2 A2 C3 Eb3 Gb3 A3

echo "Done."
