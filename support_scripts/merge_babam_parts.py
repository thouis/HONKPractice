"""
Merge BABAM melody + bass MuseScore parts into combined 7-part MusicXML scores.

Source folders:
  melody/Bb/       Bb treble melody    → part "Bb melody"
  melody/C/        C treble melody     → part "C melody"
  melody/Eb/       Eb treble melody    → part "Eb melody"
  melody/Cbass/    C bass-clef melody  → part "Trombone melody"
  bass/Bbtreble/   Bb treble bass line → part "Bb bass"
  bass/C/          C bass-clef bass    → part "C bass"
  bass/Ebtreble/   Eb treble bass line → part "Eb bass"

Part names are chosen to hit partMapping.ts rules:
  Bb */Eb * (treble) → trumpet/clarinet/sax candidates
  C melody (treble)  → flute/oboe candidates
  Trombone melody    → trombone
  C bass (bass)      → trombone/tuba candidates
"""

import copy
import os
import subprocess
import xml.etree.ElementTree as ET

MSCORE  = '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
MELODY  = '/Users/thouis/Downloads/musescore/melody'
BASS    = '/Users/thouis/Downloads/musescore/bass'
OUT_DIR = '/Users/thouis/CODING_AGENTS/TrombonePractice/public/scores'
TMP     = '/tmp/babam_mxl'

# (folder_root, subfolder, rename_to)
# rename_to=None → keep MuseScore's part name
PARTS = [
    (MELODY, 'Bb',       'Bb melody'),
    (MELODY, 'C',        'C melody'),
    (MELODY, 'Eb',       'Eb melody'),
    (MELODY, 'Cbass',    'Trombone melody'),
    (BASS,   'Bbtreble', 'Bb bass'),
    (BASS,   'C',        'C bass'),
    (BASS,   'Ebtreble', 'Eb bass'),
]

os.makedirs(TMP, exist_ok=True)
songs = sorted(f[:-5] for f in os.listdir(f'{MELODY}/Bb') if f.endswith('.mscz'))
print('Songs:', songs)

# ── 1. Export all .mscz → MusicXML ─────────────────────────────────────────
for root_dir, sub, _ in PARTS:
    for song in songs:
        key = f'{root_dir.split("/")[-1]}_{sub}'
        dst = f'{TMP}/{song}_{key}.xml'
        if os.path.exists(dst):
            continue
        src = f'{root_dir}/{sub}/{song}.mscz'
        r = subprocess.run([MSCORE, '-o', dst, src], capture_output=True)
        status = 'ok' if os.path.exists(dst) else 'FAILED'
        print(f'  export {song} {sub}: {status}')

print('Export done.\n')

# ── 2. Merge 7 parts into one MusicXML per song ─────────────────────────────
def ns_prefix(root):
    return root.tag.split('}')[0].lstrip('{') if '}' in root.tag else ''

def p(ns, t):
    return f'{{{ns}}}{t}' if ns else t

def merge_song(song):
    trees = {}
    for root_dir, sub, label in PARTS:
        key = f'{root_dir.split("/")[-1]}_{sub}'
        path = f'{TMP}/{song}_{key}.xml'
        if not os.path.exists(path):
            print(f'  SKIP {song}: missing {sub}')
            return
        trees[key] = ET.parse(path)

    # Deep-copy C melody as structural base (concert pitch, treble clef)
    base_key = f'melody_C'
    base_root = copy.deepcopy(trees[base_key].getroot())
    ns = ns_prefix(base_root)

    # Clear part-list and remove existing part element
    part_list = base_root.find(p(ns, 'part-list'))
    for child in list(part_list):
        part_list.remove(child)
    for el in base_root.findall(p(ns, 'part')):
        base_root.remove(el)

    for i, (root_dir, sub, label) in enumerate(PARTS):
        part_id = f'P{i+1}'
        key = f'{root_dir.split("/")[-1]}_{sub}'
        src_root = trees[key].getroot()

        score_part = copy.deepcopy(src_root.find('.//' + p(ns, 'score-part')))
        part_data  = copy.deepcopy(src_root.find(p(ns, 'part')))

        score_part.set('id', part_id)
        part_data.set('id', part_id)

        for tag in ['part-name', 'part-abbreviation']:
            el = score_part.find(p(ns, tag))
            if el is not None:
                el.text = label
        for el in score_part.findall('.//' + p(ns, 'instrument-name')):
            el.text = label

        part_list.append(score_part)
        base_root.append(part_data)

    wt = base_root.find('.//' + p(ns, 'work-title'))
    if wt is not None:
        wt.text = song.replace('_', ' ').replace('-', ' ').title()

    out_path = f'{OUT_DIR}/babam-{song}.xml'
    ET.indent(base_root, space='  ')
    ET.ElementTree(base_root).write(out_path, xml_declaration=True, encoding='UTF-8')
    print(f'  written: babam-{song}.xml')

for song in songs:
    merge_song(song)
print('\nAll done.')
