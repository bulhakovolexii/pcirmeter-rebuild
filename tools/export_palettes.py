"""Export the 9 colour palettes of the original program into tools/palettes.json.

Usage: python3 -I tools/export_palettes.py [Colordata.cs] [OUT]

Source: the decompiled ColorPalette.dll (reference/decompiled/ColorPalette, not in git),
class Colordata — 256 x {R, G, B, 0} per palette; gettColorData(i) maps index -> table.
Output: {"order": [...], "palettes": {name: "rrggbb" * 256}} (hex, low index = cold).
The TS core (src/core/palettes.ts) carries the same data; a test compares them.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'reference', 'decompiled', 'ColorPalette', 'ColorPalette', 'Colordata.cs')
OUT = os.path.join(ROOT, 'tools', 'palettes.json')

# gettColorData order: field name in Colordata -> our id.
ORDER = [
    ('Iron_TAB_rgb', 'iron'),
    ('Rainbow_TAB_rgb', 'rainbow'),
    ('Grey_TAB_rgb', 'grey'),
    ('Grey_Inverted_TAB_rgb', 'greyInverted'),
    ('Spia_TAB_rgb', 'sepia'),
    ('Blue_Red_TAB_rgb', 'blueRed'),
    ('Hot_Cold_TAB_rgb', 'hotCold'),
    ('Humidity_TAB_rgb', 'humidity'),
    ('Contrast_rgb', 'contrast'),
]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    text = open(src, encoding='utf-8').read()
    palettes = {}
    for field, name in ORDER:
        m = re.search(r'int\[,\] ' + field + r' = new int\[256, 4\]\s*\{(.*?)\n\t\};', text, re.S)
        if not m:
            sys.exit(f'{field} not found')
        rows = re.findall(r'\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\}', m.group(1))
        if len(rows) != 256:
            sys.exit(f'{field}: {len(rows)} rows')
        palettes[name] = ''.join('%02x%02x%02x' % tuple(int(v) for v in r[:3]) for r in rows)
        extra = {r[3] for r in rows}
        if extra != {'0'}:
            print(f'{field}: 4th column {extra}', file=sys.stderr)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'order': [n for _, n in ORDER], 'palettes': palettes}, f, indent=1)
        f.write('\n')
    print(f'{out}: {len(palettes)} palettes')


if __name__ == '__main__':
    main()
