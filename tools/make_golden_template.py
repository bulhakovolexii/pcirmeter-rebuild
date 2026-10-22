"""Generate tests/golden/pcirmeter_reference.csv — the form for reference values from the original PCIRMeter.

Usage: python3 -I tools/make_golden_template.py

Each row is one reading; the user fills in the `value` column (see docs/golden-guide.md).
Parameters are listed in full for every step, so each step is independent of the previous one.
"""
import csv
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(__file__))
import irtemp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = {
    'F1': 'samples/latest-2021/20210212_0131.JPG',
    'F2': 'samples/latest-2021/20210212_0135.JPG',
    'F3': 'samples/latest-2021/20210212_0148.JPG',
    'F4': 'samples/latest-2021/20210212_0144.JPG',
    'F5': 'samples/legacy-2013/130924_0002T.jpg',
    'F6': 'samples/legacy-2013/130604_0001T.jpg',
}

FULL_SWEEP = [
    {},
    {'emiss': 0.90},
    {'emiss': 0.70},
    {'emiss': 0.50},
    {'t_refl': -20.0},
    {'t_refl': 60.0},
    {'dist': 100},
    {'dist': 1000},
    {'dist': 1000, 'humidity': 1.0},
    {'dist': 1000, 't_atm': 0.0},
    {'dist': 1000, 't_atm': 40.0},
    {'emiss': 0.85, 't_refl': 30.0, 't_atm': 10.0, 'humidity': 0.8, 'dist': 50},
]
SHORT_SWEEP = [FULL_SWEEP[i] for i in (0, 2, 5, 8, 11)]
PLAN = {'F1': FULL_SWEEP, 'F2': FULL_SWEEP[:1], 'F3': SHORT_SWEEP,
        'F4': FULL_SWEEP[:1], 'F5': SHORT_SWEEP, 'F6': FULL_SWEEP[:1]}
READINGS = ['scale_max', 'scale_min', 'frame_max', 'frame_min']


def main():
    rows = []
    for fid, steps in PLAN.items():
        base = irtemp.params(irtemp.read_ir(os.path.join(ROOT, FILES[fid]))[0])
        for n, change in enumerate(steps, 1):
            p = dict(base)
            p.update(change)
            for r in READINGS:
                rows.append({
                    'id': f'{fid}-S{n:02d}-{r}', 'file': os.path.basename(FILES[fid]), 'step': f'S{n:02d}',
                    'emissivity': f'{p["emiss"]:.2f}', 'ambient_c': f'{p["t_atm"]:.1f}',
                    'reflected_c': f'{p["t_refl"]:.1f}', 'humidity_pct': f'{p["humidity"] * 100:.0f}',
                    'distance_m': f'{p["dist"]:.1f}', 'reading': r, 'value': '', 'note': '',
                })
    for fid in ('F1', 'F5'):
        for obj in ['P1', 'P2', 'P3']:
            rows.append({'id': f'{fid}-OBJ-{obj}', 'file': os.path.basename(FILES[fid]), 'step': 'OBJ',
                         'reading': f'{obj}_temp', 'value': '', 'note': ''})
        for obj, fields in (('R1', ['max', 'min', 'avg']), ('L1', ['max', 'min', 'avg'])):
            for f in fields:
                rows.append({'id': f'{fid}-OBJ-{obj}-{f}', 'file': os.path.basename(FILES[fid]), 'step': 'OBJ',
                             'reading': f'{obj}_{f}', 'value': '', 'note': ''})
    out = os.path.join(ROOT, 'tests/golden/pcirmeter_reference.csv')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cols = ['id', 'file', 'step', 'emissivity', 'ambient_c', 'reflected_c', 'humidity_pct', 'distance_m',
            'reading', 'value', 'note']
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        fh.write('# PCIRMeter version: ; Windows: ; UI language: ; date: \n')
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(out, len(rows), 'rows')


if __name__ == '__main__':
    main()
