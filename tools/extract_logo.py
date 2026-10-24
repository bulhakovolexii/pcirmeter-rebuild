"""Логотип кафедри для шапки: CorelDRAW → компактний SVG.

Джерело — `docs/brand/kafedra-logo.cdr` (CorelDRAW X7+, кілька варіантів логотипу на одній сторінці).
Беремо горизонтальний варіант із трьох кіл (синусоїда 1930 · корпус ХПІ 1885 · вилка), без сірої підкладки.

Запуск (потрібен `cdr2xhtml` з пакета libcdr-tools: `sudo apt-get install libcdr-tools`):
    python3 -I tools/extract_logo.py docs/brand/kafedra-logo.cdr src/ui/images/kafedra-logo.svg
"""

import re
import subprocess
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
# Номери елементів верхнього рівня, що належать варіанту (порядок у файлі cdr2xhtml / libcdr 0.1.7):
# білі кола-проміжки, синє кільце, синусоїда, корпус, зелене коло з вилкою, підписи років.
# Сіра підкладка (0) не входить. Після зміни джерела — перевірити рендером.
KEEP = {1, 2, 23, 24, 25, 26, 27, 28, 29}
VIEWBOX = (187.5, 516.5, 163.5, 72)


def round_numbers(text: str) -> str:
    return re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.2f}'.rstrip('0').rstrip('.'), text)


def style_to_attrs(el: ET.Element) -> None:
    style = el.attrib.pop('style', None)
    if not style:
        return
    for decl in style.split(';'):
        if ':' not in decl:
            continue
        key, value = (p.strip() for p in decl.split(':', 1))
        # Значення за замовчуванням SVG — не потрібні
        if (key, value) in {('stroke-dasharray', 'none'), ('stroke-linecap', 'butt'), ('stroke-linejoin', 'miter')}:
            continue
        el.set(key, round_numbers(value))


def main(src: str, dst: str) -> None:
    xhtml = subprocess.run(['cdr2xhtml', src], check=True, capture_output=True, text=True).stdout
    start = xhtml.index('<svg:svg')
    end = xhtml.rindex('</svg:svg>') + len('</svg:svg>')
    root = ET.fromstring(xhtml[start:end])
    out = ET.Element(f'{{{SVG}}}svg', {'viewBox': ' '.join(f'{v:g}' for v in VIEWBOX)})
    for i, el in enumerate(list(root)):
        if i in KEEP:
            out.append(el)
    for el in out.iter():
        el.attrib.pop('id', None)
        style_to_attrs(el)
        if 'd' in el.attrib:
            el.set('d', ' '.join(round_numbers(el.get('d', '')).split()))
        for key in ('x', 'y', 'font-size'):
            if key in el.attrib:
                el.set(key, round_numbers(el.get(key, '')))
        if el.get('font-family') == 'Arial':
            el.set('font-family', 'Arial, Helvetica, sans-serif')
        if el.text:
            el.text = el.text.strip() or None
        el.tail = None
    ET.register_namespace('', SVG)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(ET.tostring(out, encoding='unicode') + '\n')


if __name__ == '__main__':
    main(*sys.argv[1:3])
