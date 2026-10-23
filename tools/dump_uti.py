"""Дамп термограм UNI-T (*.bmp, UTi89 PRO та споріднені) — див. docs/spec/uti89pro.md.

Запуск:
    python3 -I tools/dump_uti.py samples/uti89pro/Images/*.bmp
    python3 -I tools/dump_uti.py --png OUT_DIR samples/uti89pro/Images/*.bmp   # BMP | сіре (повернуте) з точками
    python3 -I tools/dump_uti.py --json samples/uti89pro/Images/*.bmp > tests/fixtures/uti/samples.json
        # еталони для Vitest (лише числа): T і точки в системі екрана, обмежені межами кадру

Для кожного файлу: заголовок BMP, поля блоку параметрів P, перевірка точок min/max на сірому зображенні,
температура центру за лінійною інтерполяцією сірого (для порівняння з полем T центру).
"""

import json
import struct
import sys
import zlib
from pathlib import Path

W, H = 240, 320
BMP_END = 54 + W * H * 2  # 0x25836
GRAY = BMP_END + 3  # 0x25839
PALETTE = GRAY + W * H  # 0x38439
PARAMS = PALETTE + 512  # 0x38639
SIZE = PARAMS + 44  # 0x38665 = 231 013


def parse(data: bytes) -> dict:
    if data[:2] != b'BM' or len(data) != SIZE:
        raise ValueError(f'не UNI-T варіант 1: {len(data)} Б')
    _, w, h, _, bpp = struct.unpack_from('<IiiHH', data, 14)
    p = data[PARAMS:]
    tmax, tmin = struct.unpack_from('<hh', p, 1)
    xs = struct.unpack_from('<6H', p, 14)
    return {
        'bmp': (w, h, bpp),
        'mode': p[0],
        'tmax': tmax / 10,
        'tmin': tmin / 10,
        'gmax': p[5],
        'gmin': p[6],
        'tcenter': struct.unpack_from('<h', p, 7)[0] / 10,
        'emissivity': p[9] / 100,
        'type': p[10:14].hex(' '),
        'pmin': xs[0:2],
        'pmax': xs[2:4],
        'pcenter': xs[4:6],
        'tail': p[26:].hex(),
        'gray': data[GRAY:PALETTE],
    }


def to_screen(x: int, y: int) -> tuple[int, int]:
    """Координати з файлу (система сірого зображення) → екран камери (сіре повернуте на 180°)."""
    return W - 1 - x, H - 1 - y


def write_png(path: Path, w: int, h: int, rgb: bytearray) -> None:
    raw = b''.join(b'\0' + bytes(rgb[y * w * 3 : (y + 1) * w * 3]) for y in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def render(data: bytes, info: dict, path: Path) -> None:
    """Ліворуч — BMP (X1R5G5B5, знизу вгору), праворуч — сіре, повернуте до орієнтації екрана, з точками."""
    stride = 2 * W + 8
    img = bytearray(stride * H * 3)
    gray = info['gray']
    for y in range(H):
        for x in range(W):
            (v,) = struct.unpack_from('<H', data, 54 + ((H - 1 - y) * W + x) * 2)
            i = (y * stride + x) * 3
            img[i : i + 3] = bytes(((v >> 10 & 31) * 255 // 31, (v >> 5 & 31) * 255 // 31, (v & 31) * 255 // 31))
            k = gray[W * H - 1 - (y * W + x)]
            i = (y * stride + W + 8 + x) * 3
            img[i : i + 3] = bytes((k, k, k))
    marks = ((info['pmin'], (0, 128, 255)), (info['pmax'], (255, 0, 0)), (info['pcenter'], (0, 255, 0)))
    for (fx, fy), color in marks:
        px, py = to_screen(fx, fy)
        for d in range(-3, 4):
            for e in (-3, 3):
                for x, y in ((px + d, py + e), (px + e, py + d)):
                    if 0 <= x < W and 0 <= y < H:
                        i = (y * stride + W + 8 + x) * 3
                        img[i : i + 3] = bytes(color)
    write_png(path, stride, H, img)


def fixture(info: dict) -> dict:
    def point(p: tuple[int, int], t: float) -> dict:
        x, y = to_screen(*p)
        return {'celsius': t, 'x': min(W - 1, max(0, x)), 'y': min(H - 1, max(0, y))}

    return {
        'max': point(info['pmax'], info['tmax']),
        'min': point(info['pmin'], info['tmin']),
        'center': point(info['pcenter'], info['tcenter']),
    }


def main(argv: list[str]) -> None:
    if argv[:1] == ['--json']:
        out = {Path(n).name: fixture(parse(Path(n).read_bytes())) for n in sorted(argv[1:])}
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return
    png_dir = None
    if argv[:1] == ['--png']:
        png_dir = Path(argv[1])
        png_dir.mkdir(parents=True, exist_ok=True)
        argv = argv[2:]
    for name in argv:
        data = Path(name).read_bytes()
        try:
            info = parse(data)
        except ValueError as e:
            print(f'{name}: {e}')
            continue
        gray = info['gray']
        span = info['gmax'] - info['gmin'] or 1

        def linear(k: int) -> float:
            return info['tmin'] + (k - info['gmin']) / span * (info['tmax'] - info['tmin'])

        def at(p: tuple[int, int]) -> int:
            # трапляються координати 240 / 320 — на одиницю за межею кадру
            return gray[min(p[1], H - 1) * W + min(p[0], W - 1)]

        print(Path(name).name)
        print(f"  BMP {info['bmp']}  mode {info['mode']}  type {info['type']}  ε {info['emissivity']}  tail {info['tail']}")
        print(f"  T max {info['tmax']} @ {info['pmax']} (екран {to_screen(*info['pmax'])}, сіре {at(info['pmax'])}/{info['gmax']})")
        print(f"  T min {info['tmin']} @ {info['pmin']} (екран {to_screen(*info['pmin'])}, сіре {at(info['pmin'])}/{info['gmin']})")
        print(f"  T центру {info['tcenter']} @ {info['pcenter']}; лінійно за сірим: {linear(at(info['pcenter'])):.1f}")
        if png_dir:
            render(data, info, png_dir / (Path(name).stem + '.png'))


if __name__ == '__main__':
    main(sys.argv[1:])
