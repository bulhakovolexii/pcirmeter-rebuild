"""Convert reference readings of the original PCIRMeter (tests/golden/pcirmeter_reference.csv)
into tests/golden/reference.json for the Vitest suite (tests/core/golden.test.ts).

Usage: python3 -I tools/export_golden.py

Part A (scale and frame min/max per parameter step) only; rows without a value are listed in "skipped".
Part B (points, rectangle, line) is in tests/golden/objects.json (positions recovered by tools/fit_objects.py).
Parameter names follow ObjectParams in src/core/temperature.ts (humidity 0…1).
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'tests/golden/pcirmeter_reference.csv')
OUT = os.path.join(ROOT, 'tests/golden/reference.json')
SAMPLE_DIRS = ['latest-2021', 'legacy-2013']
READINGS = {'scale_max': 'scaleMax', 'scale_min': 'scaleMin', 'frame_max': 'frameMax', 'frame_min': 'frameMin'}


def sample_path(name):
    # latest-2021 is not in git; the 2021 names (YYYYMMDD_NNNN.JPG) are recognised without the files
    sub = 'latest-2021' if name[:8].isdigit() else 'legacy-2013'
    assert os.path.exists(os.path.join(ROOT, 'samples', sub, name)) or sub == 'latest-2021', name
    return f'{sub}/{name}'


def main():
    with open(CSV, encoding='utf-8') as fh:
        source = fh.readline().lstrip('# ').strip()
        rows = list(csv.DictReader(fh))
    steps, skipped = {}, []
    for r in rows:
        if r['step'] == 'OBJ':
            continue
        if not r['value'].strip():
            skipped.append({'id': r['id'], 'note': r['note']})
            continue
        key = (r['file'], r['step'])
        if key not in steps:
            steps[key] = {
                'id': r['id'].rsplit('-', 1)[0],
                'file': sample_path(r['file']),
                'params': {
                    'emissivity': float(r['emissivity']),
                    'airTemp': float(r['ambient_c']),
                    'reflectedTemp': float(r['reflected_c']),
                    'humidity': float(r['humidity_pct']) / 100,
                    'distance': float(r['distance_m']),
                },
                'expected': {},
            }
        steps[key]['expected'][READINGS[r['reading']]] = float(r['value'].replace(',', '.'))
    data = {'source': source, 'steps': list(steps.values()), 'skipped': skipped}
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'{OUT}: {len(data["steps"])} steps, {len(skipped)} skipped readings')


if __name__ == '__main__':
    main()
