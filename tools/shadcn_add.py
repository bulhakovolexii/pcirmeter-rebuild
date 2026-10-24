"""Копіює компоненти shadcn-svelte з реєстру в src/ui/lib/components/ui/ (стандартний вигляд, без змін).

CLI `npx shadcn-svelte add` у цьому проєкті не працює (вимагає `paths` у tsconfig.json), тож компоненти беремо
прямо з JSON реєстру. Після копіювання — `npx prettier --write src/ui/lib`; залежності (bits-ui, tailwind-variants,
@lucide/svelte…) скрипт лише друкує.

    python3 -I tools/shadcn_add.py tabs table accordion     # --force — перезаписати наявні (втратяться доповнення!)
"""

import json
import pathlib
import sys
import urllib.request

REGISTRY = 'https://shadcn-svelte.com/registry'
ROOT = pathlib.Path(__file__).resolve().parent.parent
UI = ROOT / 'src' / 'ui' / 'lib' / 'components' / 'ui'


def main(names: list[str], force: bool) -> None:
    for name in names:
        # Без User-Agent реєстр відповідає 403
        req = urllib.request.Request(f'{REGISTRY}/{name}.json', headers={'User-Agent': 'curl/8'})
        with urllib.request.urlopen(req) as r:
            item = json.load(r)
        if (UI / name).exists() and not force:
            print(f'{name}: вже є (--force, щоб перезаписати)')
            continue
        for f in item['files']:
            target = UI / f['target']
            target.parent.mkdir(parents=True, exist_ok=True)
            text = f['content'].replace('$UTILS$', '$lib/utils').replace('$UI$', '$lib/components/ui')
            target.write_text(text, encoding='utf-8')
        deps = item.get('devDependencies') or []
        regs = item.get('registryDependencies') or []
        print(f'{name}: {len(item["files"])} файлів; залежності: {", ".join(deps) or "—"}; компоненти: {", ".join(regs) or "—"}')


if __name__ == '__main__':
    args = sys.argv[1:]
    main([a for a in args if not a.startswith('--')], '--force' in args)
