"""Reference (research) implementation of the raw AD -> temperature conversion.

Usage: python3 -I tools/irtemp.py FILE [FILE...]

Mirrors docs/spec/temperature.md. Compares the computed scene min/max with the
Max_Temp/Min_Temp values the camera wrote into the IR header.
"""
import json
import os
import struct
import sys

TABLES = json.load(open(os.path.join(os.path.dirname(__file__), 'atmosphere_tables.json')))
K = 273.15
T_CAL_AMBIENT = 298.15  # K, fixed blend constant in the calibration step


def interp_grid(x, ys):
    grid = TABLES['x_grid']
    if x <= 0:
        return ys[0]
    if x >= grid[-1]:
        return ys[-1]
    for i in range(len(grid) - 1):
        if grid[i] <= x <= grid[i + 1]:
            x0, x1 = grid[i], grid[i + 1]
            return ys[i] + (ys[i + 1] - ys[i]) * (x - x0) / (x1 - x0)


def transmittance(t_atm, humidity, dist_m):
    idx = min(max(int(t_atm + 49.0), 0), 98)
    water_mm = TABLES['vapor_g_m3'][idx] * humidity * dist_m / 1000.0
    return interp_grid(water_mm, TABLES['tau_h2o']) * interp_grid(dist_m / 1000.0, TABLES['tau_dist'])


def read_ir(path):
    d = open(path, 'rb').read()
    t0 = struct.unpack_from('<I', d, len(d) - 4)[0]
    ir_w, ir_h = struct.unpack_from('<2h', d, t0 + 0x5c + 8)
    for k in range(16):
        typ, ptr, ln, _ = struct.unpack_from('<4i', d, t0 + 0xa0 + 16 * k)
        if typ == 0 and ln:
            h = d[ptr:ptr + 0x700]
            raw = struct.unpack_from('<%dH' % (ir_w * ir_h), d, ptr + 0x700)
            return h, raw, ir_w, ir_h
    raise ValueError('no IR block')


def params(h):
    u16 = lambda o: struct.unpack_from('<H', h, o)[0]
    n = struct.unpack_from('<H', h, 0x600)[0]
    return {
        'emiss': h[0x25] / 100.0,
        'dist': u16(0x26),
        't_atm': u16(0x28) / 10.0 - 100.0,
        'humidity': h[0x2a] / 100.0,
        't_refl': u16(0x2c) / 10.0 - 100.0,
        'offset': u16(0x2e) / 10.0 - 100.0,
        'max_temp': u16(0x34) / 10.0 - 100.0,
        'min_temp': u16(0x36) / 10.0 - 100.0,
        'shutter': u16(0x54) / 10.0 - 100.0,
        'delta_ad': u16(0x5c) - 10000 if u16(0x5c) else 0,
        'lut_ad': struct.unpack_from('<%dH' % n, h, 0x604),
        'lut_t': struct.unpack_from('<%dh' % n, h, 0x680),
    }


def ad_to_temp(ad, p, tau):
    a = ad + p['delta_ad']
    ads, ts = p['lut_ad'], p['lut_t']
    if a < ads[0] or a > ads[-1]:
        return None
    for i in range(len(ads) - 1):
        if ads[i] <= a <= ads[i + 1]:
            t_bb = (ts[i + 1] - ts[i]) * (a - ads[i]) / (ads[i + 1] - ads[i]) + ts[i]
            break
    # calibration blend
    t_bb = (0.95 * (t_bb + K) ** 4 + 0.05 * T_CAL_AMBIENT ** 4) ** 0.25 - K
    e = p['emiss']
    w = ((t_bb + K) ** 4 / (e * tau)
         - (1 - e) * (p['t_refl'] + K) ** 4 / e
         - (1 - tau) * (p['t_atm'] + K) ** 4 / (e * tau))
    if w < 0:
        return None
    return w ** 0.25 - K + p['offset']


def main(paths):
    for path in paths:
        h, raw, w, hgt = read_ir(path)
        p = params(h)
        tau = transmittance(p['t_atm'], p['humidity'], p['dist'])
        tmax, tmin = ad_to_temp(max(raw), p, tau), ad_to_temp(min(raw), p, tau)
        print(f'{os.path.basename(path)} {w}x{hgt} eps={p["emiss"]} tau={tau:.4f} dAD={p["delta_ad"]} '
              f'computed max={tmax:.2f} min={tmin:.2f} | header max={p["max_temp"]:.1f} min={p["min_temp"]:.1f}')


if __name__ == '__main__':
    main(sys.argv[1:])
