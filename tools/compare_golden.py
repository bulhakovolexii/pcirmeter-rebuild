"""Compare reference values from the original PCIRMeter (tests/golden/pcirmeter_reference.csv)
with the research implementation in tools/irtemp.py.

Usage: python3 -I tools/compare_golden.py [--all]

Covers part A of docs/golden-guide.md (scale and frame min/max for each parameter step).
Part B (points/rectangle/line) depends on object positions and is checked separately from screenshots.
Prints only mismatches > 0.1 °C unless --all is given.
"""
import csv
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(__file__))
import irtemp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'tests/golden/pcirmeter_reference.csv')
SAMPLE_DIRS = ['samples/latest-2021', 'samples/legacy-2013']
TOL = 0.1


def find_sample(name):
    for d in SAMPLE_DIRS:
        path = os.path.join(ROOT, d, name)
        if os.path.exists(path):
            return path
    raise FileNotFoundError(name)


def expected(p, raw, level, span, reading):
    tau = irtemp.transmittance(p['t_atm'], p['humidity'], p['dist'])
    ad = {'scale_max': level + span, 'scale_min': level,
          'frame_max': max(raw), 'frame_min': min(raw)}[reading]
    t = irtemp.ad_to_temp(ad, p, tau)
    # The original searches the frame max starting from 0 °C and the min from 1000 °C
    # (IRImageBox.SetParameters_IrImage), so a fully negative frame shows Max = 0.0.
    if reading == 'frame_max':
        return max(t, 0.0)
    if reading == 'frame_min':
        return min(t, 1000.0)
    return t


def main(show_all):
    files = {}
    with open(CSV, encoding='utf-8') as fh:
        print(fh.readline().strip())
        rows = list(csv.DictReader(fh))
    worst, n_ok, n_bad, n_skip = 0.0, 0, 0, 0
    for r in rows:
        if r['step'] == 'OBJ':
            continue
        if not r['value'].strip():
            n_skip += 1
            print(f'{r["id"]:<22} SKIP  (no value: {r["note"][:70]})')
            continue
        if r['file'] not in files:
            h, raw, _, _ = irtemp.read_ir(find_sample(r['file']))
            files[r['file']] = (h, raw)
        h, raw = files[r['file']]
        p = irtemp.params(h)
        p.update(emiss=float(r['emissivity']), t_atm=float(r['ambient_c']), t_refl=float(r['reflected_c']),
                 humidity=float(r['humidity_pct']) / 100.0, dist=float(r['distance_m']))
        level, span = struct.unpack_from('<2H', h, 0x50)
        exp = expected(p, raw, level, span, r['reading'])
        got = float(r['value'].replace(',', '.'))
        diff = exp - got
        worst = max(worst, abs(diff))
        bad = abs(diff) > TOL + 1e-9
        n_bad += bad
        n_ok += not bad
        if bad or show_all:
            print(f'{r["id"]:<22} orig={got:7.1f} ours={exp:8.3f} diff={diff:+.3f}{"  <-- MISMATCH" if bad else ""}')
    print(f'\nchecked {n_ok + n_bad}: ok {n_ok}, mismatch {n_bad}, skipped {n_skip}; max |diff| = {worst:.3f} °C')
    return 1 if n_bad else 0


if __name__ == '__main__':
    sys.exit(main('--all' in sys.argv[1:]))
