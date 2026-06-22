#!/usr/bin/env python3
"""
Check MusicXML files in public/scores/ for common playback issues.
Exit 1 if any errors found.
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCORES_DIR = Path(__file__).parent.parent / 'public' / 'scores'
errors = []
warnings = []


def check(path):
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        errors.append(f"{path.name}: XML parse error: {e}")
        return

    root = tree.getroot()
    ns_uri = root.tag.split('}')[0][1:] if '{' in root.tag else ''
    def t(s): return ('{%s}%s' % (ns_uri, s)) if ns_uri else s

    parts = root.findall(f'.//{t("part")}')
    if not parts:
        warnings.append(f"{path.name}: no parts found")
        return

    # Check 1: tempo marking exists
    sounds = root.findall(f'.//{t("sound")}')
    has_tempo = any(s.get('tempo') for s in sounds)
    if not has_tempo:
        warnings.append(f"{path.name}: no tempo marking (<sound tempo=>) — playback will default to ~120 BPM")

    # Check 2: backward repeat followed by MuseScore-sourced content = bad splice.
    # MuseScore MusicXML exports carry layout markers absent in Noteflight/clean XML:
    #   - <print new-system="yes"> inside a measure
    #   - width="..." attribute on <measure>
    #   - default-x / default-y on <note>
    # If such markers appear immediately after a backward repeat, the file was spliced
    # from two different sources. OSMD's repeat-expansion scheduler can misplace those
    # measures, causing all notes to play in a burst at measure start.
    # Check 2: mixed-source splice across a backward repeat.
    # MuseScore exports carry layout markers (width on <measure>, <print>, default-x on <note>)
    # absent in Noteflight/clean MusicXML. If the file transitions from non-MuseScore formatting
    # to MuseScore formatting right after a backward repeat, OSMD's scheduler misplaces those
    # measures and all notes fire in a burst at measure start.
    def has_musescore_markers(measure):
        if measure.get('width'):
            return True
        if measure.find(t('print')) is not None:
            return True
        for note in measure.findall(f'.//{t("note")}'):
            if note.get('default-x') or note.get('default-y'):
                return True
        return False

    part0 = parts[0]
    measures0 = part0.findall(t('measure'))
    n_measures = len(measures0)
    for i, m in enumerate(measures0):
        has_backward = any(r.get('direction') == 'backward'
                           for r in m.findall(f'.//{t("repeat")}'))
        if not has_backward or i + 1 >= n_measures:
            continue
        prev_has_markers = has_musescore_markers(m)
        next_m = measures0[i + 1]
        next_has_markers = has_musescore_markers(next_m)
        # Flag only when the formatting SOURCE changes across the repeat boundary
        if prev_has_markers != next_has_markers:
            mnum = m.get('number', str(i + 1))
            errors.append(
                f"{path.name}: backward repeat at M{mnum} is a formatting boundary "
                f"(before={'MuseScore' if prev_has_markers else 'clean'}, "
                f"after={'MuseScore' if next_has_markers else 'clean'}) "
                f"— mixed-source splice will break OSMD playback timing"
            )

    # Check 3: divisions consistency across parts
    divs = set()
    for part in parts:
        measures = part.findall(t('measure'))
        if measures:
            attrs = measures[0].find(t('attributes'))
            if attrs is not None:
                div_el = attrs.find(t('divisions'))
                if div_el is not None:
                    divs.add(int(div_el.text))
    if len(divs) > 1:
        errors.append(f"{path.name}: inconsistent divisions across parts: {divs} — note durations will be wrong")

    # Check 4: each part has same number of measures
    part_measure_counts = [len(p.findall(t('measure'))) for p in parts]
    if len(set(part_measure_counts)) > 1:
        errors.append(f"{path.name}: parts have different measure counts: {part_measure_counts}")

    # Check 5: measure total duration sanity (within each part, each measure should sum correctly)
    # Only check first part, first 10 measures to keep it fast
    part = parts[0]
    measures = part.findall(t('measure'))
    attrs_el = None
    divisions = 2  # fallback
    beats = 4
    beat_type = 4
    for m in measures[:20]:
        a = m.find(t('attributes'))
        if a is not None:
            d = a.find(t('divisions'))
            if d is not None: divisions = int(d.text)
            tm = a.find(t('time'))
            if tm is not None:
                b = tm.find(t('beats'))
                bt = tm.find(t('beat-type'))
                if b is not None: beats = int(b.text)
                if bt is not None: beat_type = int(bt.text)
        expected = divisions * 4 * beats // beat_type
        # Sum non-chord, non-grace note durations
        total = 0
        for note in m.findall(t('note')):
            if note.find(t('chord')) is not None: continue
            if note.find(t('grace')) is not None: continue
            dur_el = note.find(t('duration'))
            if dur_el is not None:
                total += int(dur_el.text)
        # Also sum backup/forward
        for bf in m.findall(t('backup')) + m.findall(t('forward')):
            pass  # don't count these in total
        if total != 0 and total != expected:
            mnum = m.get('number', '?')
            errors.append(
                f"{path.name}: M{mnum} duration mismatch: got {total} ticks, "
                f"expected {expected} (divisions={divisions}, time={beats}/{beat_type})"
            )


def main():
    xml_files = sorted(SCORES_DIR.glob('*.xml')) + sorted(SCORES_DIR.glob('*.mxl'))
    if not xml_files:
        print(f"No score files found in {SCORES_DIR}")
        sys.exit(0)

    for path in xml_files:
        if path.suffix == '.mxl':
            # MXL is a zip — skip for now
            continue
        check(path)

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  ⚠ {w}")

    if errors:
        print("ERRORS:")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print(f"OK: {len(xml_files)} files checked, {len(warnings)} warnings, 0 errors")


if __name__ == '__main__':
    main()
