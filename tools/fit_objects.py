"""Part B of docs/golden-guide.md: recover point / rectangle / line positions from the screenshots
(tests/golden/screens/F{1,5,7}-OBJ.png) by brute-force search near the positions estimated by eye,
and check that the original's readings can be reproduced.

Usage: python3 -I tools/fit_objects.py

Model of the original UI (PCIRMeter IRImageBox, see docs/spec/temperature.md, "Об'єкти аналізу"):
- the IR frame is stretched over the image control; zoom = control size / IR size (non-integer);
- point: one IR pixel;
- rectangle: every *control* pixel inside the rectangle (right/bottom edge exclusive) is mapped to the IR pixel
  (int(x / zoom), int(y / zoom)); max/min/mean of °C over control pixels (mean is weighted by coverage);
- line: control pixels stepped along the major axis (end exclusive), deduplicated by IR pixel; mean of °C.
The control size (Windows px) is unknown; screenshots suggest a non-DPI-aware app scaled 2x, i.e. the control
is about half the screenshot box. The search tries several control sizes.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import irtemp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'tests/golden/pcirmeter_reference.csv')
HALF = 0.05 + 1e-6  # display rounding to 0.1

# Positions estimated from the screenshots, IR pixel coordinates (x, y); rectangle: x0, y0, x1, y1 (corners);
# line: start, end. box = screenshot box width in screenshot px (only for the control-size guess).
CASES = {
    'F1': dict(file='samples/latest-2021/20210212_0131.JPG', box=998,
               P1=(26, 17), P2=(78, 46), P3=(50, 30), R1=(38.2, 0.9, 77.2, 38.7), L1=((2.0, 8.7), (32.7, 5.7))),
    'F5': dict(file='samples/legacy-2013/130604_0002T.jpg', box=1328,
               P1=(48, 98), P2=(94, 115), P3=(97, 39), R1=(2.0, 1.0, 88.3, 63.3), L1=((54.4, 67.4), (125.8, 79.2))),
    'F7': dict(file='samples/legacy-2013/130924_0002T.jpg', box=1330,
               P1=(31, 277), P2=(267, 67), P3=(175, 142), R1=(177.0, 133.6, 369.2, 282.1),
               L1=((18.2, 259.9), (214.6, 16.9))),
}


def load(case):
    h, raw, w, hgt = irtemp.read_ir(os.path.join(ROOT, case['file']))
    p = irtemp.params(h)
    tau = irtemp.transmittance(p['t_atm'], p['humidity'], p['dist'])
    cache = {}

    def temp(ad):
        if ad not in cache:
            cache[ad] = irtemp.ad_to_temp(ad, p, tau)
        return cache[ad]

    return raw, w, hgt, temp


def readings(fid):
    out = {}
    with open(CSV, encoding='utf-8') as fh:
        fh.readline()
        for r in csv.DictReader(fh):
            if r['id'].startswith(fid + '-OBJ'):
                out[r['reading']] = float(r['value'])
    return out


def rect_stats(raw, w, temp, zx, zy, cx0, cy0, cx1, cy1):
    ts = [temp(raw[int(y / zy) * w + int(x / zx)]) for x in range(cx0, cx1) for y in range(cy0, cy1)]
    return max(ts), min(ts), sum(ts) / len(ts)


def line_pixels(zx, zy, x, y, x2, y2):
    """IR pixels visited by the original's line sampling (IRImageBox.GetAllPointsOfSingleLine)."""
    seen = {}
    if int(x / zx) == int(x2 / zx):
        steps = [(x, i) for i in range(min(y, y2), max(y, y2) + 1)]
    elif abs(y2 - y) > abs(x2 - x):
        k = (x2 - x) / (y2 - y)
        d = 1 if y2 > y else -1
        steps = [(int((j - y) * k + x), j) for j in range(y, y2, d)]
    else:
        k = (y2 - y) / (x2 - x)
        d = 1 if x2 > x else -1
        steps = [(i, int((i - x) * k + y)) for i in range(x, x2, d)]
    for sx, sy in steps:
        q = (int(sx / zx), int(sy / zy))
        seen.setdefault(q, None)
    return list(seen)


def ok(got, want):
    return abs(got - want) <= HALF


def fit(fid, case):
    raw, w, hgt, temp = load(case)
    want = readings(fid)
    print(f'== {fid} {os.path.basename(case["file"])} {w}x{hgt}')

    for name in ('P1', 'P2', 'P3'):
        x0, y0 = case[name]
        v = want[f'{name}_temp']
        hits = sorted((abs(x - x0) + abs(y - y0), x, y, temp(raw[y * w + x]))
                      for x in range(max(0, x0 - 3), min(w, x0 + 4)) for y in range(max(0, y0 - 3), min(hgt, y0 + 4))
                      if ok(temp(raw[y * w + x]), v))
        best = hits[0] if hits else None
        print(f'  {name}: orig {v:.1f}; nearest match {best and best[1:3]} (dist {best and best[0]}), '
              f'{len(hits)} matches in ±3 px; at estimate {temp(raw[y0 * w + x0]):.2f}')

    # control size: about half the screenshot box (2x scaling), try ±1 px around it
    base = case['box'] / 2
    for cw in [round(base) + d for d in range(-1, 2)]:
        zx = cw / w
        zy = zx  # aspect ratio preserved in all three screenshots
        ch = round(hgt * zy)
        zy = ch / hgt
        x0, y0, x1, y1 = (c * z for c, z in zip(case['R1'], (zx, zy, zx, zy)))
        rv = (want['R1_max'], want['R1_min'], want['R1_avg'])
        rhits = []
        cum = [[0.0] * (cw + 1) for _ in range(ch + 1)]
        for y in range(ch):
            row, prev, acc = cum[y + 1], cum[y], 0.0
            iy = min(int(y / zy), hgt - 1) * w
            for x in range(cw):
                acc += temp(raw[iy + min(int(x / zx), w - 1)])
                row[x + 1] = prev[x + 1] + acc
        R = 4
        for a in range(round(x0) - R, round(x0) + R + 1):
            for b in range(round(y0) - R, round(y0) + R + 1):
                for c in range(round(x1) - R, round(x1) + R + 1):
                    for d in range(round(y1) - R, round(y1) + R + 1):
                        if a < 0 or b < 0 or c > cw or d > ch:
                            continue
                        mean = (cum[d][c] - cum[b][c] - cum[d][a] + cum[b][a]) / ((c - a) * (d - b))
                        if not ok(mean, rv[2]):
                            continue
                        s = rect_stats(raw, w, temp, zx, zy, a, b, c, d)
                        if all(ok(g, e) for g, e in zip(s, rv)):
                            rhits.append((abs(a - x0) + abs(b - y0) + abs(c - x1) + abs(d - y1), (a, b, c, d), s))
        (sx, sy), (ex, ey) = case['L1']
        lv = (want['L1_max'], want['L1_min'], want['L1_avg'])
        lhits = []
        for a in range(round(sx * zx) - R, round(sx * zx) + R + 1):
            for b in range(round(sy * zy) - R, round(sy * zy) + R + 1):
                for c in range(round(ex * zx) - R, round(ex * zx) + R + 1):
                    for d in range(round(ey * zy) - R, round(ey * zy) + R + 1):
                        pix = line_pixels(zx, zy, a, b, c, d)
                        if not pix or any(not (0 <= px < w and 0 <= py < hgt) for px, py in pix):
                            continue
                        ts = [temp(raw[py * w + px]) for px, py in pix]
                        s = (max(ts), min(ts), sum(ts) / len(ts))
                        if all(ok(g, e) for g, e in zip(s, lv)):
                            dist = abs(a - sx * zx) + abs(b - sy * zy) + abs(c - ex * zx) + abs(d - ey * zy)
                            lhits.append((dist, (a, b, c, d), len(pix), s))
        rb = min(rhits) if rhits else None
        lb = min(lhits) if lhits else None
        print(f'  control {cw}x{ch} (zoom {zx:.3f}): R1 {len(rhits)} matches, nearest {rb and rb[1]} '
              f'{rb and tuple(round(t, 2) for t in rb[2])}; L1 {len(lhits)} matches, nearest {lb and lb[1]} '
              f'n={lb and lb[2]} {lb and tuple(round(t, 2) for t in lb[3])}')
    print(f'  orig R1 {rv}, L1 {lv}')


def main():
    for fid in sys.argv[1:] or CASES:
        fit(fid, CASES[fid])


if __name__ == '__main__':
    main()
