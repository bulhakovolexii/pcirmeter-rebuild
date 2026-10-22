"""Export expected temperatures for every sample into tests/fixtures/temperature/*.json.

Usage: python3 -I tools/export_temperature_fixtures.py [SAMPLES_DIR] [OUT_DIR]

Values come from the research implementation tools/irtemp.py; the TS core
(src/core/temperature.ts) is tested against them. Per file:
- header parameters: τ, ~50 random pixels (frame extremes included), frame min/max
  and auto-scale limits (the camera's own limits are checked from the parsed header);
- a few user parameter sets (overrides) with τ and ~10 pixels each.
Pixels are chosen with a fixed seed, so re-running gives identical files.
"""
import json
import os
import random
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import irtemp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIXELS = 50
OVERRIDE_PIXELS = 10

# Names follow ObjectParams in src/core/temperature.ts.
OVERRIDES = [
    {'emissivity': 0.7, 'reflectedTemp': 40.0},
    {'emissivity': 0.98, 'airTemp': 30.0, 'humidity': 0.9, 'distance': 100},
    {'emissivity': 0.5, 'airTemp': -10.0, 'reflectedTemp': -20.0, 'humidity': 0.5, 'distance': 1000},
    {'offset': 2.5, 'distance': 5},
]
TO_IRTEMP = {'emissivity': 'emiss', 'distance': 'dist', 'airTemp': 't_atm', 'humidity': 'humidity',
             'reflectedTemp': 't_refl', 'offset': 'offset'}


def r(v):
    return None if v is None else round(v, 6)


def sample(p, raw, w, idx):
    tau = irtemp.transmittance(p['t_atm'], p['humidity'], p['dist'])
    return tau, [[i % w, i // w, raw[i], r(irtemp.ad_to_temp(raw[i], p, tau))] for i in idx]


def export(path, rel, rng):
    h, raw, w, hgt = irtemp.read_ir(path)
    p = irtemp.params(h)
    level, span = struct.unpack_from('<2H', h, 0x50)
    n = w * hgt
    # Always include the frame extremes, then random pixels.
    idx = [raw.index(min(raw)), raw.index(max(raw))] + rng.sample(range(n), PIXELS - 2)
    tau, pixels = sample(p, raw, w, idx)
    overrides = []
    for ov in OVERRIDES:
        q = dict(p)
        q.update({TO_IRTEMP[k]: v for k, v in ov.items()})
        ov_tau, ov_pixels = sample(q, raw, w, idx[:2] + rng.sample(range(n), OVERRIDE_PIXELS - 2))
        overrides.append({'params': ov, 'tau': r(ov_tau), 'pixels': ov_pixels})
    return {
        'file': rel,
        'tau': r(tau),
        'pixels': pixels,
        'frame': {'minAd': min(raw), 'maxAd': max(raw),
                  'min': r(irtemp.ad_to_temp(min(raw), p, tau)), 'max': r(irtemp.ad_to_temp(max(raw), p, tau))},
        'autoScale': {'min': r(irtemp.ad_to_temp(level, p, tau)), 'max': r(irtemp.ad_to_temp(level + span, p, tau))},
        'overrides': overrides,
    }


def main(samples, out):
    os.makedirs(out, exist_ok=True)
    count = 0
    for sub in sorted(os.listdir(samples)):
        folder = os.path.join(samples, sub)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.lower().endswith('.jpg'):
                continue
            rng = random.Random(name)
            data = export(os.path.join(folder, name), f'{sub}/{name}', rng)
            with open(os.path.join(out, os.path.splitext(name)[0] + '.json'), 'w') as f:
                json.dump(data, f, indent=1)
                f.write('\n')
            count += 1
    print(f'{count} fixtures -> {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'samples'),
         sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tests', 'fixtures', 'temperature'))
