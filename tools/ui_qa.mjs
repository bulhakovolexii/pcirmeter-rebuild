// Перевірка станів інтерфейсу в headless Chromium (Playwright): сценарії по всіх елементах керування з
// фрагментами-знімками для перегляду очима й текстовими перевірками в консоль. Доповнює tools/ui_screens.mjs
// (там — лише загальний вигляд на кількох ширинах). Playwright — /home/agent/tools/playwright.
//
//   npx vite --host 127.0.0.1 --port 5173 &          # або npm run build && npm run preview
//   NO_PROXY=127.0.0.1 node tools/ui_qa.mjs <outdir> [ширини, напр. 1024,1440] samples/legacy-2013/*
//   COLOR_SCHEME=dark …                               # темна тема
//
// Знімки — <outdir>/<ширина>-<тема>/<NN-крок>.png. У консоль: pageerror / console.error, горизонтальна
// прокрутка сторінки, перекриття смуг над зображеннями з мітками й кадром, видимість фокуса під час Tab-обходу.
// Код завершення 1 — якщо якась перевірка не пройшла.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PW = process.env.PLAYWRIGHT_DIR ?? '/home/agent/tools/playwright'
const { chromium } = createRequire(`${PW}/`)('playwright')

const URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const scheme = process.env.COLOR_SCHEME === 'dark' ? 'dark' : 'light'
const [out, widthList, ...files] = process.argv.slice(2)
if (!out || !widthList || files.length === 0) {
  console.error('usage: node tools/ui_qa.mjs <outdir> <w1,w2,…> <files…>')
  process.exit(1)
}

// Не-термограма — для повідомлення про помилку відкриття
const bogus = join(tmpdir(), 'not-a-thermogram.jpg')
writeFileSync(bogus, 'not a jpeg')

let failed = 0
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })

for (const width of widthList.split(',').map(Number)) {
  const dir = `${out}/${width}-${scheme}`
  mkdirSync(dir, { recursive: true })
  const page = await browser.newPage({
    viewport: { width, height: Math.max(700, Math.round(width * 0.6)) },
    colorScheme: scheme,
  })
  const tag = `[${width} ${scheme}]`
  const fail = (msg) => {
    failed++
    console.log(`${tag} ✗ ${msg}`)
  }
  const ok = (msg) => console.log(`${tag} ✓ ${msg}`)
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && fail(`console.error: ${m.text()}`))

  let n = 0
  /** Знімок сторінки або фрагмента (локатор, з полями `pad` px). */
  const shot = async (name, target, pad = 8) => {
    const path = `${dir}/${String(++n).padStart(2, '0')}-${name}.png`
    if (!target) return page.screenshot({ path })
    const b = await target.boundingBox()
    if (!b) return fail(`${name}: елемент не видно`)
    const vp = page.viewportSize()
    const x = Math.max(0, b.x - pad)
    const y = Math.max(0, b.y - pad)
    await page.screenshot({
      path,
      clip: { x, y, width: Math.min(vp.width - x, b.width + 2 * pad), height: Math.min(vp.height - y, b.height + 2 * pad) },
    })
  }
  const settle = (ms = 150) => page.waitForTimeout(ms)
  const checkScroll = async (when) => {
    const s = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    if (s > 0) fail(`${when}: горизонтальна прокрутка ${s} px`)
  }
  const pane = page.locator('.pane:not([hidden])')
  const sidebar = pane.locator('aside.controls')

  // --- Порожній стан і помилка відкриття
  await page.goto(URL)
  await settle()
  await shot('empty')
  await page.setInputFiles('input[type=file]', bogus)
  await page.getByRole('alert').filter({ hasText: /не-|not|помил|error/i }).first().waitFor()
  await shot('open-error', page.locator('[data-slot=alert]').first())
  await page.getByRole('button', { name: /Сховати|Dismiss|Hide/ }).first().click()
  if ((await page.locator('[data-slot=alert]').count()) === 0) ok('повідомлення про помилку закривається')
  else fail('повідомлення про помилку не закрилось')

  // --- Файли: усі зразки й ще раз перший (переповнення вкладок)
  await page.setInputFiles('input[type=file]', [...files, files[0]])
  await page.waitForSelector('.pane:not([hidden]) canvas')
  await settle(400)
  await shot('opened')
  await checkScroll('після відкриття')

  // Смуги над зображеннями не мають перекривати кадр (зображення вписується нижче смуги)
  // Фото за синхронізації ширше за ІЧ-шар і може заходити під смугу — перевіряється лише без неї
  const overlapCheck = async (when, photoFit = false) => {
    const before = failed
    const r = await page.evaluate(() => {
      const p = document.querySelector('.pane:not([hidden])')
      const rect = (el) => el?.getBoundingClientRect()
      const ir = rect(p.querySelector('.frame canvas'))
      const irBar = rect(p.querySelector('.frame .float-bar.top .float-group'))
      const img = rect(p.querySelector('.photo img'))
      const photoBars = [...p.querySelectorAll('.photo .float-bar.top .float-group')].map(rect)
      const labels = [...p.querySelectorAll('.frame .marker text')].map(rect)
      const vp = rect(p.querySelector('.frame .viewport'))
      return { ir, irBar, img, photoBars, labels, vp }
    })
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    if (hit(r.ir, r.irBar)) fail(`${when}: смуга масштабу перекриває ІЧ-кадр`)
    if (photoFit) r.photoBars.forEach((b) => hit(r.img, b) && fail(`${when}: смуга над фото перекриває фото`))
    r.labels.forEach((l, i) => {
      if (hit(l, r.irBar)) fail(`${when}: мітка екстремуму ${i + 1} під смугою масштабу`)
      if (l.right > r.vp.right + 0.5 || l.left < r.vp.left - 0.5 || l.top < r.vp.top - 0.5)
        fail(`${when}: мітка екстремуму ${i + 1} обрізана краєм вікна`)
    })
    // Без синхронізації над фото ще й власний масштаб — на вузькому вікні смуга може перенестися
    const rows = new Set(r.photoBars.map((b) => Math.round(b.top)))
    if (rows.size > 1 && !photoFit) fail(`${when}: смуга над фото — у ${rows.size} рядки`)
    if (failed === before) ok(`${when}: смуги не перекривають кадр і мітки`)
  }
  await overlapCheck('вписаний кадр')
  await shot('frame-bar', pane.locator('.frame'))
  await shot('photo-bar', pane.locator('.photo'))

  // --- Вкладки
  const tabs = page.locator('[data-slot=tabs-list]')
  await shot('tabs', page.locator('header'))
  await page.getByRole('tab').nth(1).hover()
  await shot('tab-hover', tabs, 4)
  await page.getByRole('tab').first().focus()
  await page.keyboard.press('ArrowRight')
  await shot('tab-focus', tabs, 4)
  await page.keyboard.press('Delete')
  await settle()
  ok(`Delete закриває вкладку: ${(await page.getByRole('tab').count()) === files.length}`)
  if (await page.getByRole('button', { name: /Наступн|Next/ }).isVisible()) {
    await page.getByRole('button', { name: /Наступн|Next/ }).click()
    await settle()
    await shot('tabs-next', page.locator('header'))
  }
  await page.getByRole('tab').first().click()
  await settle(300)

  // --- Тулбар, масштаб, довідка
  await page.getByRole('radio', { name: /Точка|Point/ }).hover()
  await shot('toolbar-hover', pane.locator('.toolbar'))
  const vpBox = await pane.locator('.frame .viewport').boundingBox()
  const at = (fx, fy) => [vpBox.x + vpBox.width * fx, vpBox.y + vpBox.height * fy]
  const tool = (name) => pane.getByRole('radio', { name }).click()
  await tool(/Точка|Point/)
  for (const p of [[0.3, 0.3], [0.5, 0.5], [0.6, 0.4], [0.4, 0.6], [0.7, 0.7], [0.2, 0.8], [0.8, 0.2]])
    await page.mouse.click(...at(...p))
  await tool(/Прямокутник|Rectangle/)
  await page.mouse.move(...at(0.2, 0.55))
  await page.mouse.down()
  await page.mouse.move(...at(0.45, 0.8), { steps: 5 })
  await page.mouse.up()
  await settle()
  await shot('objects')
  await pane.getByRole('button', { name: /^(Збільшити|Zoom in)$/ }).first().click()
  await pane.getByRole('button', { name: /^(Збільшити|Zoom in)$/ }).first().hover()
  await shot('zoom-in', pane.locator('.frame .float-bar.top'))
  await pane.getByRole('button', { name: /Вписати|Fit/ }).first().click()
  await settle()
  await pane.locator('.frame').getByRole('button', { name: /Довідка|Help/ }).click()
  await settle(250)
  await shot('help-ir')
  await page.keyboard.press('Escape')

  // --- Таблиця результатів
  const table = pane.locator('[data-slot=table-container]')
  await table.locator('tbody tr').nth(1).hover()
  await shot('table-hover', pane.locator('.image-area > .bottom'))
  await table.locator('tbody tr').last().click()
  await table.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await settle()
  await shot('table-selected-scrolled', pane.locator('.image-area > .bottom'))
  const note = table.getByRole('textbox').first()
  if (await note.count()) {
    await note.scrollIntoViewIfNeeded()
    await note.focus()
    await note.fill('тріщина')
    await shot('table-note-focus', pane.locator('.image-area > .bottom'))
  }
  await checkScroll('таблиця')

  // --- Бічна панель: Accordion, шкала, ізотерми, параметри
  const triggers = sidebar.locator('[data-slot=accordion-trigger]')
  await shot('sidebar', sidebar, 0)
  await triggers.first().focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await shot('accordion-focus', triggers.first(), 6)
  await triggers.first().click()
  await settle(300)
  await shot('accordion-collapsed', sidebar, 0)
  await triggers.first().click()
  await settle(300)
  await sidebar.getByRole('radio', { name: /Ручна|Manual/ }).click()
  const minIn = sidebar.getByLabel(/^(Min|Мін)/i).first()
  await shot('scale-manual', sidebar.locator('[data-slot=accordion-item]').first())
  if (await minIn.count()) {
    await minIn.fill('100')
    await settle()
    await shot('scale-invalid', sidebar.locator('[data-slot=accordion-item]').first())
    await sidebar.getByRole('radio', { name: /Авто|Auto/ }).click()
  } else fail('поля ручної шкали не знайдено')

  const iso = sidebar.locator('[data-slot=accordion-item]').nth(1)
  await iso.getByRole('checkbox').first().click()
  await iso.getByRole('checkbox').nth(1).click()
  await settle()
  await iso.scrollIntoViewIfNeeded()
  await shot('isotherms-on', iso, 0)
  await iso.getByRole('combobox').first().click()
  await settle(250)
  await shot('isotherm-select-open')
  await page.keyboard.press('Escape')
  await iso.getByRole('spinbutton').first().fill('500')
  await settle()
  await shot('isotherm-invalid', iso, 0)
  await iso.getByRole('checkbox').first().click()
  await iso.getByRole('checkbox').nth(1).click()

  const params = sidebar.locator('[data-slot=accordion-item]').nth(2)
  const eps = params.getByRole('spinbutton').first()
  await eps.scrollIntoViewIfNeeded()
  await eps.fill('0.8')
  await settle()
  await shot('params-changed', params, 0)
  await eps.fill('3')
  await settle()
  await shot('params-invalid', params, 0)
  await params.getByRole('button', { name: /Скинути|Reset/ }).click()
  await params.getByRole('combobox').first().click()
  await settle(250)
  await shot('palette-open')
  await page.keyboard.press('Escape')
  const objectItem = sidebar.locator('[data-slot=accordion-item]').nth(3)
  if (await objectItem.count()) {
    await objectItem.scrollIntoViewIfNeeded()
    await shot('object-params', objectItem, 0)
  }

  // --- Шапка (темний скоуп): одиниці, звіт
  await page.locator('header').getByRole('combobox').first().click()
  await settle(250)
  await shot('units-open')
  await page.keyboard.press('Escape')

  // --- Межі панелей
  const splitter = pane.getByRole('separator').filter({ hasText: '' })
  for (let i = 0; i < (await splitter.count()); i++) {
    const s = splitter.nth(i)
    if (!(await s.isVisible())) continue
    await s.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await shot(`splitter-${i + 1}-focus`, s, 16)
    await s.dblclick() // стандартний розмір — щоб наступні кроки бачили типове компонування
  }
  await checkScroll('після меж панелей')

  // --- Видиме фото: накладення
  const photo = pane.locator('.photo')
  if (await photo.count()) {
    await photo.getByRole('radio', { name: /Накладення|Overlay/ }).click()
    await settle()
    await overlapCheck('накладення')
    await shot('overlay', photo)
    await photo.getByRole('button', { name: /Збільшити ІЧ|larger|enlarge/i }).click()
    await photo.getByRole('slider').focus()
    await page.keyboard.press('ArrowLeft')
    await shot('overlay-adjusted', photo)
    await photo.getByRole('checkbox').click()
    // Вимкнення синхронізації лишає фото на місці; «Вписати» — вписує нижче за смугу
    await photo.getByRole('button', { name: /^(Вписати|Fit)$/ }).click()
    await settle()
    await overlapCheck('фото без синхронізації', true)
    await shot('photo-unsynced', photo)
    await photo.getByRole('button', { name: /Довідка|Help/ }).click()
    await settle(250)
    await shot('help-photo')
    await page.keyboard.press('Escape')
    await photo.getByRole('checkbox').click()
    await photo.getByRole('radio', { name: /^Фото|^Photo/ }).click()
  }

  // --- Діалог звіту
  await page.getByRole('button', { name: /^Звіт|^Report/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await settle(300)
  await shot('report')
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
  if (inside) ok('фокус лишається в діалозі звіту')
  else fail('фокус вийшов з діалогу звіту')
  await shot('report-focus')
  await dialog.getByRole('button', { name: /Створити|Create/ }).click()
  await settle(250)
  await shot('report-menu')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await settle(250)
  if (await dialog.isVisible()) fail('Esc не закрив діалог')
  else ok('Esc закриває діалог')

  // --- Tab-обхід: кожен елемент у фокусі має видимий індикатор (outline або box-shadow-кільце)
  await page.locator('header h1, header').first().click({ position: { x: 2, y: 2 } })
  const invisible = new Set()
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    const f = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      // Кільце фокуса — на самому елементі або (межі панелей) на його ручці
      const ring = [el, ...el.children].some((e) => {
        const cs = getComputedStyle(e)
        return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
      })
      const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName
      return { ring, name: `${el.tagName.toLowerCase()} «${name}»` }
    })
    if (f && !f.ring) invisible.add(f.name)
    if (i === 3 || i === 15 || i === 30) await shot(`tab-walk-${i}`)
  }
  if (invisible.size) fail(`фокус не видно: ${[...invisible].join(', ')}`)
  else ok('фокус видно на всіх елементах Tab-обходу')

  await page.close()
}
await browser.close()
console.log(failed ? `перевірок не пройдено: ${failed}` : 'усі перевірки пройдено')
process.exit(failed ? 1 : 0)
