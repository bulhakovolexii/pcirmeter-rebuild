# PCIRMeter Rebuild — вебаналог програми аналізу термограм

## Мета

Кросплатформний, повністю клієнтський (без бекенду) вебзастосунок для відкриття та аналізу
радіометричних термограм, які створює оригінальна Windows-програма **PCIRMeter**
(та тепловізори, з якими вона працює; у ресурсах трапляється бренд **RGK Vision**).

Цільова аудиторія: студенти старших курсів (енергоменеджмент, основи термографії, ХПІ)
та їхній викладач. Пріоритети: коректність температур > зручність для навчання > повнота функцій оригіналу.

Детальний план: `docs/PLAN.md`. Журнал сесій: `docs/PROGRESS.md`. Специфікації форматів та алгоритмів: `docs/spec/`.

## Протокол сесії (один інкремент = одна сесія)

**На початку:**
1. Прочитати `docs/PLAN.md` (таблиця інкрементів) і верхній запис `docs/PROGRESS.md`.
2. Взяти інкремент зі статусом ▶ (або той, який назвав користувач). Якщо його опис схематичний —
   спершу уточнити опис і «Готово, коли» в `PLAN.md`.
3. Прочитати лише потрібні для інкремента специфікації; не перечитувати декомпільований код без потреби —
   висновки вже в `docs/spec/`.

**Наприкінці** (навіть якщо інкремент не завершено):
1. `docs/PROGRESS.md` — новий запис зверху: зроблено, знахідки/рішення, що лишилось, що потрібно від викладача.
2. `docs/PLAN.md` — оновити статуси (✅ / ▶ наступному), уточнити описи наступних інкрементів, якщо щось з'ясувалось.
3. Нові факти про формат/алгоритм — у `docs/spec/*`, не лише в журнал. Цей файл — оновити, якщо змінились
   команди, інструменти чи правила.
4. Коміт у git з повідомленням `I-NN: <що зроблено>`.
5. Наприкінці відповіді назвати наступний інкремент.

Не брати другий інкремент у тій самій сесії — краще завершити, зафіксувати й почати нову.

## Що відомо про оригінал (перевірено)

- `Setup.exe` — інсталятор NSIS; розпаковується `7z x` без Windows/VM.
  Розпакований вміст лежить у `reference/original/` (поза git — пропрієтарний код).
- `PCIRMeter.exe` 1.0.8.0 — **.NET 2.0 WinForms (x86)**, ознак обфускації не виявлено → декомпілюється (ILSpy / REA).
- `IrMeter.dll` 1.2.7 (.NET) — ядро: розбір заголовка (`AnalyzeHead_ListVer`, `IR_Header_t`, `File_Para_t`,
  `IR_Para`, `Spot_Para`, `Area_Para`, `Line_Para`), температура точки/лінії/прямокутника, статистика, гістограма.
- `FPGA_CalcTemp_List.dll` — **єдина нативна** (C++, Debug-збірка, x86): `FPGA_open`, `FPGA_close`, `getSpotTemp`;
  параметри env/humid/reflec/shutterTemp/deltaAD. Імовірно перетворює сирі АЦП-відліки → °C. Аналіз — Ghidra через REA.
- Решта DLL — UI/допоміжні: ZedGraph (графіки), itextsharp (PDF-звіти), ColorPalette, LibControls, PCISkin, NewLangLib (локалізація).
- Довідка: `reference/original/Resources/help/IRMeter_*.chm` (en/de/fr/es/it/pt/cn) — опис функцій оригіналу.

### Формат і температура — специфікації готові

- `docs/spec/file-format.md`: JPEG + хвіст (`File_Para_t` → 16×`Type_Data_t` → блоки), зсув хвоста — останні 4 байти.
  ІЧ-блок = заголовок 0x700 + `uint16 AD[W×H]`. `.hir` = побайтова копія `.JPG`.
- `docs/spec/temperature.md`: AD+ΔAD → калібрувальна LUT (зберігається в кожному файлі) → поправка 0,95/0,05 →
  τ (таблиці пари/відстані) → радіометричне рівняння ε/T_відб/T_пов. Усі параметри — у файлі.
- Дослідницькі скрипти: `tools/dump_ir.py` (дамп структури), `tools/irtemp.py` (еталонний розрахунок),
  `tools/compare_golden.py` (звірка з еталонами оригіналу `tests/golden/pcirmeter_reference.csv`).
  Еталони для Vitest: `python3 -I tools/export_golden.py` → `tests/golden/reference.json` (частина А);
  положення об'єктів частини Б знайдено `tools/fit_objects.py` (перебір, хвилини) і записано вручну в `tests/golden/objects.json`.
- Парсер (TS): `src/core/parser.ts` (`parseThermogram`). Фікстури: `python3 -I tools/export_fixtures.py`
  → `tests/fixtures/parser/*.json` (перегенерувати після змін у форматі).
- Температура (TS): `src/core/temperature.ts` (`temperatureModel(ir, overrides)` → `toCelsius(ad)`, `NaN` = поза
  калібруванням; `frameTemperatures`, `autoScale`, `measurementRange`), таблиці атмосфери — `src/core/atmosphere.ts`.
  Фікстури з `irtemp.py`: `python3 -I tools/export_temperature_fixtures.py` → `tests/fixtures/temperature/*.json`.
- Палітри: `python3 -I tools/export_palettes.py` → `tools/palettes.json` → `src/core/palettes.ts`; рендер кадру —
  `src/core/render.ts`. Візуальна звірка без браузера: `tools/render_png.ts` (запуск — у шапці файлу, через rolldown).
- UI переглядача: `src/ui/App.svelte` (файли, вкладки, одиниці), `Viewer.svelte` (зображення, інструменти, накладення),
  `ParamsPanel.svelte` (параметри кадру / об'єкта), `ResultsTable.svelte`, `ColorBar.svelte`;
  логіка без DOM — `src/ui/files.ts`, `format.ts`, `params.ts` (поля параметрів, одиниці, межі), `tools.ts` (редагування
  об'єктів), `results.ts` (вимірювання, CSV, профіль лінії), `isotherms.ts` (стан ізотерм), `chart.ts` (поділки осей),
  store одиниць і розмірів панелей — `settings.ts` (тестуються в Node); межа-роздільник панелей — `Splitter.svelte`; довідка «?» — `HelpTip.svelte`.
  Оформлення — токени в `src/ui/app.css` (стиль ir-lab-1 / ХПІ), шрифт Fira Sans — локально в `src/ui/fonts/` (офлайн). Аналіз: `ProfileChart.svelte`, `DistributionChart.svelte` (розподіл температур прямокутника), `IsothermPanel.svelte`, `Histogram.svelte`.
  Видиме фото й накладення — `PhotoPanel.svelte` + `photo.ts` (розміщення, розмір JPEG); масштаб/зсув — `view.ts`;
  текст і аудіо з камери — `attachments.ts`. Синтетичні термограми з додатковими блоками (тексту/аудіо у зразках
  немає) — `tests/support/blocks.ts`.
- Об'єкти аналізу (ядро): `src/core/objects.ts` — пікселі фігур, статистика по пікселях кадру (`temperature.md`) і розподіл на діапазони (`temperatureBins`);
  ізотерми — `src/core/isotherms.ts`, гістограма — `paletteHistogram` у `render.ts` (семантика — `features.md` §2.5).
- PWA: service worker `src/sw/sw.ts` (окремий `tsconfig.sw.json`, lib `WebWorker`) збирає плагін `vite.pwa.ts`
  у `dist/sw.js` зі списком передкешування й версією-хешем; реєстрація й банер оновлення — `src/ui/pwa.ts` (лише
  production; нова версія чекає на кнопку «Оновити»). Маніфест — `public/manifest.webmanifest`, іконки
  `public/icons/` генерує `tools/make_icons.ts` (запуск — у шапці файлу). Деплой — job `deploy` у `ci.yml`
  на push у `main` → https://bulhakov.dev/pcirmeter-rebuild/.
- У `.svelte` з `<tr>` не імпортувати store перекладу як `tr` (Svelte сприймає `<tr>` як компонент) — `tr as t`. Межі параметрів — `PARAM_LIMITS` у `src/core/temperature.ts`. Браузера в sandbox немає — UI перевіряє викладач.
- Функції оригіналу та рішення MVP (погоджено): `docs/spec/features.md`. Палітри — таблиці `ColorPalette.dll`
  (декомпільовано в `reference/decompiled/ColorPalette`), звіт оригіналу — `reference/decompiled/LibControls`.
- Зразки: `samples/legacy-2013/` (160×120, 384×288; у git), `samples/latest-2021/` (CEM DT-980, 80×80, камера кафедри;
  **поза git** — фото кафедри не публікуються). Скриншоти оригіналу `tests/golden/screens/` — теж поза git.
  Репозиторій публічний (лише заради GitHub Pages): нічого з цих тек, `reference/` чи ресурсів оригіналу не комітити.
  Тести, яким потрібні локальні дані, мають пропускатися (`it.skipIf`), якщо файлів немає — у CI їх немає.
- Декомпільований C#: `reference/decompiled/{IrMeter,PCIRMeter}/`; знімок Ghidra-аналізу DLL:
  `reference/FPGA_CalcTemp_List.rea-snapshot` (передавати в `open_binary` як `snapshot_path`).
- `IrMeter.dll` також імпортує `FPGA_CalcTemp.dll`, якої немає в інсталяторі (стара/інша серія камер?).

## Технічні рішення

- TypeScript (strict) + Vite; UI — Svelte; рендеринг — Canvas 2D (WebGL лише за потреби).
- Ядро (`src/core/`) — чистий TS без залежностей від DOM: парсер, обчислення температур, статистика. Важкі обчислення — у Web Worker.
- Тести: Vitest; «золоті» значення температур отримуються з оригінальної програми (див. PLAN, фаза 2).
- PDF-звіти: pdf-lib; графіки — власний SVG у Svelte (`ProfileChart`, `Histogram`; поділки осі — `src/ui/chart.ts`). Офлайн — PWA. Деплой — статичний (GitHub Pages).
- Інтерфейс: українська (основна), англійська. Тексти — в `src/i18n/`.

## Правила роботи

- **Clean-room**: декомпільований код — лише джерело знань. Спершу опис у `docs/spec/*.md`
  (структури, формули, константи з посиланням на клас/метод оригіналу), потім власна реалізація. Не копіювати декомпільований код дослівно у `src/`.
- Пропрієтарні бінарники та декомпільовані вихідники тримати в `reference/` (в `.gitignore`), не комітити.
- Кожне твердження про формат/алгоритм у специфікації позначати: `перевірено` (тест/порівняння з оригіналом) або `гіпотеза`.
- Будь-яка зміна формули температури — лише разом із тестом проти золотих значень.
- Скрипти для дослідження бінарних даних — у `tools/` (Python `-I` або Node), не в корені.
- Середовище: Docker sandbox (Linux) на macOS. Для запуску оригіналу потрібна Windows-VM на хості
  (UTM/Parallels; Windows 11 ARM з емуляцією x86 + .NET 3.5) або спроба Wine/Mono в sandbox.

### Встановлені інструменти (sandbox, linux/arm64)

Усе нижче живе поза проєктом. Якщо sandbox перестворено (немає `$GHIDRA_INSTALL_DIR` або REA-інструментів) —
`bash tools/setup_sandbox.sh`, потім перезапуск Claude Code. Інструменти реверсу потрібні лише для R-01 / уточнень специфікацій.

- REA 6.7.0 — MCP-сервер `rea` у `~/.claude.json` + skill `reverse-engineer-anything`.
- Ghidra 12.1.4: `/home/agent/tools/ghidra_12.1.4_PUBLIC` (`GHIDRA_INSTALL_DIR` у `/etc/sandbox-persistent.sh`), JDK 25.
  Офіційний реліз не має декомпілятора під linux/arm64 — його зібрано вручну:
  `cd $GHIDRA_INSTALL_DIR/Ghidra/Features/Decompiler/src/decompile/cpp && mkdir -p ghi_opt sla_opt && make ARCH=aarch64 ARCH_TYPE= ghidra_opt sleigh_opt`,
  потім скопійовано в `os/linux_arm_64/{decompile,sleigh}`. Після оновлення Ghidra — повторити.
- .NET SDK 8 у `/home/agent/.dotnet` + `ilspycmd` 8.2 (`DOTNET_ROLL_FORWARD=Major` у persistent env):
  `ilspycmd -p -o reference/decompiled/<Name> reference/original/<file>`.

## Корисні команди

```bash
npm run dev            # dev-сервер Vite (http://localhost:5173)
npm test               # Vitest (tests/**/*.test.ts, середовище node)
npm run lint           # ESLint + Prettier --check
npm run format         # Prettier --write
npm run build          # check (svelte-check + tsc для core/app/node) + vite build → dist/
7z x -oreference/original Setup.exe          # повторне розпакування
npx -y rea-agents@latest --help              # REA CLI (Node >= 22.19)
```

Node — через `bash -l -c "..."` (див. вище). `node_modules` ставиться на хості (macOS): якщо Vitest/Vite у sandbox
падають з `Cannot find native binding` — `npm install --no-save @rolldown/binding-linux-arm64-gnu@<версія rolldown>`. CI: `.github/workflows/ci.yml` (lint + test + build на кожен push; push у `main` ще й публікує `dist/` на GitHub Pages).
Перевірити офлайн-збірку локально: `npm run build && npm run preview` (SW у `npm run dev` не реєструється).

### Структура коду

- `src/core/` — ядро без DOM. Захищено двічі: `tsconfig.core.json` (lib без `DOM`) і правило ESLint
  `no-restricted-globals`. Сюди ж підуть Web Worker-обгортки лише як тонкий шар у `src/ui/`.
- `src/ui/` — Svelte 5; `src/i18n/` — словники `uk.ts` (джерело ключів) і `en.ts` (типізовано тими ж ключами), store `tr`.
- `tests/` — Vitest; UI-смоук-тести рендерять компоненти через `svelte/server` (браузера в sandbox немає).
- Стиль: Prettier (без `;`, одинарні лапки, ширина 110).
