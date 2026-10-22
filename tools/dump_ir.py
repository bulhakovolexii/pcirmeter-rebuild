"""Dump the radiometric trailer of PCIRMeter / CEM thermograms (*.jpg, *.hir).

Usage: python3 -I tools/dump_ir.py FILE [FILE...]

Layout: docs/spec/file-format.md.
"""
import struct
import sys

TYPE_NAMES = {0: 'IR', 1: 'audio', 3: 'user-text', 4: 'visible-jpeg', 6: 'custom'}


def cstr(b):
    return b.split(b'\0', 1)[0].decode('latin-1')


def dump(path):
    d = open(path, 'rb').read()
    t0 = struct.unpack_from('<I', d, len(d) - 4)[0]
    if not 0 < t0 < len(d) - 0x1a0:
        print(f'== {path}: no trailer')
        return
    print(f'== {path}  size={len(d)}  File_Para_t@{t0:#x}')
    (flag, length, producer, prod_date, serial, version, saved,
     img_w, img_h, add_w, add_h, ir_w, ir_h, file_type, type_num) = struct.unpack_from(
        '<8si16s16s16s16s16s8h', d, t0)
    print(f'  flag={cstr(flag)!r} producer={cstr(producer)!r} calib={cstr(prod_date)!r} '
          f'serial={cstr(serial)!r} fw={cstr(version)!r} saved={cstr(saved)!r}')
    print(f'  image={img_w}x{img_h} addition={add_w}x{add_h} sensor={ir_w}x{ir_h} '
          f'file_type={file_type} type_num={type_num} length={length}')
    for k in range(16):
        typ, ptr, ln, _ = struct.unpack_from('<4i', d, t0 + 0xa0 + 16 * k)
        if ln == 0:
            continue
        print(f'  [{k}] type={typ} ({TYPE_NAMES.get(typ, "?")}) ptr={ptr:#x} len={ln}')
        if typ == 0:
            h = d[ptr:ptr + 0x700]
            u16 = lambda o: struct.unpack_from('<H', h, o)[0]
            n = u16(0x600)
            print(f'      eps={h[0x25] / 100} dist={u16(0x26)}m t_atm={u16(0x28) / 10 - 100:.1f} '
                  f'hum={h[0x2a] / 100} t_refl={u16(0x2c) / 10 - 100:.1f} offset={u16(0x2e) / 10 - 100:.1f} '
                  f'range={h[0x3a]} shutter={u16(0x54) / 10 - 100:.1f} '
                  f'dAD={u16(0x5c) - 10000 if u16(0x5c) else 0}')
            print(f'      header max/min={u16(0x34) / 10 - 100:.1f}/{u16(0x36) / 10 - 100:.1f} '
                  f'FPGA level/span={u16(0x50)}/{u16(0x52)} LUT points={n} '
                  f'raw={ln - 0x700} bytes (expected {ir_w * ir_h * 2})')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        dump(p)
