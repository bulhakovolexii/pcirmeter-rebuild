"""Export expected parser fields for every sample into tests/fixtures/parser/*.json.

Usage: python3 -I tools/export_fixtures.py [SAMPLES_DIR] [OUT_DIR]

Independent (Python) reading of the layout in docs/spec/file-format.md; the TS parser
(src/core/parser.ts) is tested against these files. Only `*.jpg`/`*.JPG` are exported —
`.hir` copies are checked against the fixture of the same-named JPEG.
Fixtures hold metadata and a few AD samples, no images, so they may be committed.
"""
import json
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cstr(b):
    out = ''
    for c in b:
        if c in (0, 0xff):
            break
        out += chr(c)
    return out


def export(path, rel):
    d = open(path, 'rb').read()
    t0 = struct.unpack_from('<I', d, len(d) - 4)[0]
    (flag, _length, producer, cal, serial, fw, saved,
     img_w, img_h, add_w, add_h, ir_w, ir_h, file_type, type_num) = struct.unpack_from(
        '<8si16s16s16s16s16s8h', d, t0)
    blocks = []
    for k in range(16):
        typ, ptr, ln, _ = struct.unpack_from('<4i', d, t0 + 0xa0 + 16 * k)
        if ln:
            blocks.append({'type': typ, 'offset': ptr, 'length': ln})
    ir = next(b for b in blocks if b['type'] == 0)
    h = d[ir['offset']:ir['offset'] + 0x700]
    u16 = lambda o: struct.unpack_from('<H', h, o)[0]
    temp = lambda o: (u16(o) - 1000) / 10
    n = u16(0x600)
    pixels = ir_w * ir_h
    ad = struct.unpack_from('<%dH' % pixels, d, ir['offset'] + 0x700)
    probes = [(0, 0), (ir_w - 1, 0), (0, ir_h - 1), (ir_w - 1, ir_h - 1), (ir_w // 2, ir_h // 2),
              (ir_w // 3, ir_h // 4), (2 * ir_w // 3, 3 * ir_h // 4)]
    return {
        'file': rel,
        'size': len(d),
        'jpegLength': t0,
        'info': {
            'model': cstr(flag), 'producer': cstr(producer), 'calibrationDate': cstr(cal),
            'serial': cstr(serial), 'firmware': cstr(fw), 'savedAt': cstr(saved),
            'imageWidth': img_w, 'imageHeight': img_h, 'additionWidth': add_w, 'additionHeight': add_h,
            'sensorWidth': ir_w, 'sensorHeight': ir_h, 'fileType': file_type, 'typeNum': type_num,
        },
        'blocks': blocks,
        'ir': {
            'width': ir_w,
            'height': ir_h,
            'params': {
                'emissivity': h[0x25] / 100, 'distance': u16(0x26), 'airTemp': temp(0x28),
                'humidity': h[0x2a] / 100, 'reflectedTemp': temp(0x2c), 'offset': temp(0x2e),
                'level': temp(0x30), 'span': temp(0x32), 'maxTemp': temp(0x34), 'minTemp': temp(0x36),
                'lens': u16(0x38), 'tempRange': h[0x3a], 'fpgaLevel': u16(0x50), 'fpgaSpan': u16(0x52),
                'shutterTemp': temp(0x54), 'deltaAd': u16(0x5c) - 10000 if u16(0x5c) else 0,
            },
            'calibration': {
                'ad': list(struct.unpack_from('<%dH' % n, h, 0x604)),
                'temp': list(struct.unpack_from('<%dh' % n, h, 0x680)),
            },
            'adStats': {'min': min(ad), 'max': max(ad), 'sum': sum(ad)},
            'adProbes': [[x, y, ad[y * ir_w + x]] for x, y in probes],
            'extraLength': ir['length'] - 0x700 - 2 * pixels,
        },
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
            data = export(os.path.join(folder, name), f'{sub}/{name}')
            with open(os.path.join(out, os.path.splitext(name)[0] + '.json'), 'w') as f:
                json.dump(data, f, indent=1)
                f.write('\n')
            count += 1
    print(f'{count} fixtures -> {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'samples'),
         sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tests', 'fixtures', 'parser'))
