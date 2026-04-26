"""
Export BABAM bass parts to MusicXML and merge each song's
Bbtreble/C/Ebtreble variants into a single 3-part MusicXML file.

NOTE: Melody and bass measure counts differ across most songs — they are
incompatible arrangements from different sources and cannot be combined
in a single score. Keep as separate library entries.

Source:
  bass/Bbtreble/  Bb treble bass line   → part "Bb bass"
  bass/C/         C bass-clef bass line → part "C bass"
  bass/Ebtreble/  Eb treble bass line   → part "Eb bass"
                  (MuseScore labels it "Bb Trumpet"; renamed here)
"""

import copy
import os
import subprocess
import xml.etree.ElementTree as ET

MSCORE  = '/Applications/MuseScore 4.app/Contents/MacOS/mscore'
SRC     = '/Users/thouis/Downloads/musescore/bass'
OUT_DIR = '/Users/thouis/CODING_AGENTS/TrombonePractice/public/scores'
TMP     = '/tmp/babam_mxl'

KEYS = ['Bbtreble', 'C', 'Ebtreble']
KEY_PART_NAMES = {'Bbtreble': 'Bb', 'C': None, 'Ebtreble': 'Eb'}

os.makedirs(TMP, exist_ok=True)
songs = sorted(f[:-5] for f in os.listdir(f'{SRC}/Bbtreble') if f.endswith('.mscz'))
print('Songs:', songs)

for song in songs:
    for key in KEYS:
        dst = f'{TMP}/{song}_bass_{key}.xml'
        if os.path.exists(dst):
            continue
        src = f'{SRC}/{key}/{song}.mscz'
        r = subprocess.run([MSCORE, '-o', dst, src], capture_output=True)
        status = 'ok' if os.path.exists(dst) else 'FAILED'
        print(f'  export {song}/{key}: {status}')

print('Export done.\n')

def ns_prefix(root):
    return root.tag.split('}')[0].lstrip('{') if '}' in root.tag else ''

def p(ns, t):
    return f'{{{ns}}}{t}' if ns else t

def merge_song(song):
    trees = {}
    for key in KEYS:
        path = f'{TMP}/{song}_bass_{key}.xml'
        if not os.path.exists(path):
            print(f'  SKIP {song}: missing {key}')
            return
        trees[key] = ET.parse(path)

    base_root = copy.deepcopy(trees['C'].getroot())
    ns = ns_prefix(base_root)

    part_list = base_root.find(p(ns, 'part-list'))
    for child in list(part_list):
        part_list.remove(child)
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
            for el in score_part.findall('.//' + p(ns, 'instrument-name')):
                el.text = label

        part_list.append(score_part)
        base_root.append(part_data)

    wt = base_root.find('.//' + p(ns, 'work-title'))
    if wt is not None:
        wt.text = song.replace('_', ' ').replace('-', ' ').title()

    out_path = f'{OUT_DIR}/bass-{song}.xml'
    ET.indent(base_root, space='  ')
    ET.ElementTree(base_root).write(out_path, xml_declaration=True, encoding='UTF-8')
    print(f'  written: bass-{song}.xml')

for song in songs:
    merge_song(song)
print('\nAll done.')
