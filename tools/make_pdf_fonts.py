"""Підмножини Fira Sans (TTF) для PDF-звіту: латиниця, кирилиця, потрібні символи.

pdf-lib вбудовує шрифт через fontkit, який потребує TTF/OTF (woff2 інтерфейсу не годиться і розділений
на латиницю/кирилицю). Вихідні TTF — Google Fonts (ofl/firasans, SIL OFL 1.1):

    curl -LO https://github.com/google/fonts/raw/main/ofl/firasans/FiraSans-Regular.ttf
    curl -LO https://github.com/google/fonts/raw/main/ofl/firasans/FiraSans-SemiBold.ttf

Запуск (потрібен fonttools: `pip3 install --target <dir> fonttools`):

    PYTHONPATH=<dir> python3 tools/make_pdf_fonts.py <тека з TTF>

Результат — `src/report/fonts/FiraSans-{Regular,SemiBold}.ttf`.
"""

import sys
from pathlib import Path

from fontTools import subset

OUT = Path(__file__).resolve().parent.parent / 'src' / 'report' / 'fonts'

# ASCII, Latin-1, кирилиця (укр./рос.), грецькі ε τ, типографські знаки, №, стрілки, мінус, ≤ ≥
UNICODES = [
    *range(0x20, 0x7F),
    *range(0xA0, 0x100),
    *range(0x400, 0x460),
    0x490,
    0x491,
    0x3B5,
    0x3C4,
    *range(0x2010, 0x2027),
    0x2116,
    0x2190,
    0x2192,
    0x2194,
    0x2212,
    0x2264,
    0x2265,
]


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    options = subset.Options()
    options.layout_features = ['kern', 'liga']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.drop_tables += ['DSIG']
    for weight in ('Regular', 'SemiBold'):
        font = subset.load_font(str(src / f'FiraSans-{weight}.ttf'), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        out = OUT / f'FiraSans-{weight}.ttf'
        subset.save_font(font, str(out), options)
        print(out, out.stat().st_size)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
