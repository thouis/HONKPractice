"""
Export MuseScore melody parts to MusicXML and merge each song's
Bb/C/Eb/Cbass variants into a single multi-part MusicXML file.

Source layout:
  melody/Bb/       Bb treble instruments (renamed → "Bb")
  melody/C/        C treble instruments  (renamed → "C")
  melody/Eb/       Eb treble instruments (renamed → "Eb")
  melody/Cbass/    C bass-clef           (keeps MuseScore name "Trombone")

A companion bass folder exists at /Users/thouis/Downloads/musescore/bass/:
  bass/Bbtreble/   Bb treble bass line   (rename → "Bb bass")
  bass/C/          C bass-clef bass line (rename → "C bass")
  bass/Ebtreble/   Eb treble bass line   (note: MuseScore names it "Bb Trumpet";
                                          rename → "Eb bass")

When ready to merge melody + bass into combined scores, update KEYS/KEY_PART_NAMES
to pull from both folders and label parts "Bb melody"/"Bb bass" etc., then drop
the "(melody)" suffix from the library.json entries.
"""

import copy
import os
import subprocess
import xml.etree.ElementTree as ET

MSCORE  = '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
SRC     = '/Users/thouis/Downloads/musescore/melody'
OUT_DIR = '/Users/thouis/CODING_AGENTS/TrombonePractice/public/scores'
TMP     = '/tmp/melody_mxl'

KEYS = ['Bb', 'C', 'Eb', 'Cbass']
# Rename the generic "Piano" label; keep Cbass's "Trombone" as-is
KEY_PART_NAMES = {'Bb': 'Bb', 'C': 'C', 'Eb': 'Eb', 'Cbass': None}

os.makedirs(TMP, exist_ok=True)
songs = sorted(f[:-5] for f in os.listdir(f'{SRC}/Bb') if f.endswith('.mscz'))
print('Songs found:', songs)

# ── 1. Export .mscz → MusicXML ─────────────────────────────────────────────
for song in songs:
    for key in KEYS:
        dst = f'{TMP}/{song}_{key}.xml'
        if os.path.exists(dst):
            continue
        src = f'{SRC}/{key}/{song}.mscz'
        r = subprocess.run([MSCORE, '-o', dst, src], capture_output=True)
        status = 'ok' if os.path.exists(dst) else 'FAILED'
        print(f'  export {song}/{key}: {status}')

print('Export done.\n')

# ── 2. Merge 4 parts into one MusicXML per song ────────────────────────────
def ns_prefix(root):
    return root.tag.split('}')[0].lstrip('{') if '}' in root.tag else ''

def p(ns, t):
    return f'{{{ns}}}{t}' if ns else t

def merge_song(song):
    trees = {}
    for key in KEYS:
        path = f'{TMP}/{song}_{key}.xml'
        if not os.path.exists(path):
            print(f'  SKIP {song}: missing {key}')
            return
        trees[key] = ET.parse(path)

    # Deep-copy C version as structural base (concert pitch, treble clef)
    base_root = copy.deepcopy(trees['C'].getroot())
    ns = ns_prefix(base_root)

    # Clear part-list
    part_list = base_root.find(p(ns, 'part-list'))
    for child in list(part_list):
        part_list.remove(child)

    # Remove C's single part element from root
    for el in base_root.findall(p(ns, 'part')):
        base_root.remove(el)

    for i, key in enumerate(KEYS):
        part_id = f'P{i+1}'
        src_root = trees[key].getroot()

        score_part = copy.deepcopy(src_root.find('.//' + p(ns, 'score-part')))
        part_data  = copy.deepcopy(src_root.find(p(ns, 'part')))

        score_part.set('id', part_id)
        part_data.set('id', part_id)

        label = KEY_PART_NAMES[key]
        if label is not None:
            for tag in ['part-name', 'part-abbreviation']:
                el = score_part.find(p(ns, tag))
                if el is not None:
                    el.text = label
            # Also update the instrument long/short name inside score-part
            for tag in ['instrument-name']:
                el = score_part.find('.//' + p(ns, tag))
                if el is not None:
                    el.text = label

        part_list.append(score_part)
        base_root.append(part_data)

    # Set work-title
    wt = base_root.find('.//' + p(ns, 'work-title'))
    if wt is not None:
        wt.text = song.replace('_', ' ').replace('-', ' ').title()

    out_path = f'{OUT_DIR}/melody-{song}.xml'
    ET.indent(base_root, space='  ')
    ET.ElementTree(base_root).write(out_path, xml_declaration=True, encoding='UTF-8')
    print(f'  written: melody-{song}.xml')

for song in songs:
    merge_song(song)
print('\nAll done.')
