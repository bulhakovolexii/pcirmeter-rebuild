// Наскрізна перевірка PDF-звіту в headless Chromium (Playwright — див. tools/ui_screens.mjs):
// відкрити файли, намалювати об'єкти, заповнити діалог, створити звіт **без мережі** (після встановлення SW).
//
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   NO_PROXY=127.0.0.1 APP_URL=http://127.0.0.1:4173/ node tools/report_e2e.mjs <outdir> <файли термограм…>
//
// Результат: <outdir>/dialog.png (знімок діалогу) і <outdir>/<ім'я звіту>.pdf; рендер сторінок — pdftoppm.
import { createRequire } from 'node:module'

const PW = process.env.PLAYWRIGHT_DIR ?? '/home/agent/tools/playwright'
const { chromium } = createRequire(`${PW}/`)('playwright')

const URL = process.env.APP_URL ?? 'http://127.0.0.1:4173/'
const [out, ...files] = process.argv.slice(2)
if (!out || files.length === 0) {
  console.error('usage: node tools/report_e2e.mjs <outdir> <files…>')
  process.exit(1)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))

// Перший візит встановлює SW; далі — без мережі
await page.goto(URL)
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false
  await navigator.serviceWorker.ready
  return true
})
console.log('service worker:', sw ? 'готовий' : 'немає (dev-сервер?)')
if (sw) {
  await page.reload()
  await context.setOffline(true)
}

await page.setInputFiles('input[type=file]', files)
await page.waitForSelector('canvas', { state: 'attached' })
await page.waitForTimeout(300)

const viewport = page.locator('.pane:not([hidden]) .viewport[role=application]').first()
const box = await viewport.boundingBox()
const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
const tool = (name) => page.locator('.pane:not([hidden]) [role=radio]', { hasText: name }).first().click()
const drag = async (a, b) => {
  await page.mouse.move(...at(...a))
  await page.mouse.down()
  await page.mouse.move(...at(...b), { steps: 5 })
  await page.mouse.up()
}
await tool(/Точка|Point/)
await page.mouse.click(...at(0.5, 0.5))
await tool(/Прямокутник|Rectangle/)
await drag([0.2, 0.6], [0.45, 0.8])
await tool(/Лінія|Line/)
await drag([0.1, 0.2], [0.8, 0.7])

await page.getByRole('button', { name: /Звіт PDF|PDF report/ }).click()
const dialog = page.locator('dialog[open]')
await dialog.getByLabel(/Об'єкт обстеження|Inspected object/).fill('Корпус У2, ауд. 301')
await dialog.getByLabel(/Виконавець|Performed by/).fill('Іваненко Іван')
await dialog.getByLabel(/Група|Group/).fill('ЕМ-121')
await dialog.getByLabel(/Викладач|Supervisor/).fill('Булгаков О.')
await dialog.locator('textarea').nth(1).fill('Місток холоду біля укосу.')
await dialog.getByLabel(/Висновок|Conclusion/).fill('Потрібне утеплення укосів.')
await page.screenshot({ path: `${out}/dialog.png` })

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30_000 }),
  dialog.getByRole('button', { name: /Створити PDF|Create PDF/ }).click(),
])
const path = `${out}/${download.suggestedFilename()}`
await download.saveAs(path)
console.log('звіт:', path)
await browser.close()
