// Знімки інтерфейсу в headless Chromium (Playwright) на кількох ширинах вікна — перевірка компонування без
// браузера на хості. Playwright живе поза проєктом: /home/agent/tools/playwright (ставить tools/setup_sandbox.sh).
//
//   npx vite --host 127.0.0.1 --port 5173 &          # або npm run build && npm run preview
//   NO_PROXY=127.0.0.1 node tools/ui_screens.mjs <outdir> [ширини, напр. 1600,1280,1024] <файли термограм…>
//
// Для кожної ширини: відкрити файли, намалювати 3 точки, прямокутник і лінію, зберегти <outdir>/w<ширина>.png;
// у консоль — чи є горизонтальна прокрутка сторінки.
import { createRequire } from 'node:module'

const PW = process.env.PLAYWRIGHT_DIR ?? '/home/agent/tools/playwright'
const { chromium } = createRequire(`${PW}/`)('playwright')

const URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const [out, widthList, ...files] = process.argv.slice(2)
if (!out || !widthList || files.length === 0) {
  console.error('usage: node tools/ui_screens.mjs <outdir> <w1,w2,…> <files…>')
  process.exit(1)
}

// Playwright за замовчуванням ховає смуги прокрутки — на знімках вони потрібні
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
for (const width of widthList.split(',').map(Number)) {
  const page = await browser.newPage({ viewport: { width, height: Math.max(700, Math.round(width * 0.6)) } })
  page.on('pageerror', (e) => console.log(`[${width}] pageerror:`, e.message))
  await page.goto(URL)
  await page.setInputFiles('input[type=file]', files)
  await page.waitForSelector('canvas', { state: 'attached' })
  await page.waitForTimeout(300)

  const viewport = page.locator('.pane:not([hidden]) .viewport[role=application]').first()
  const box = (await viewport.isVisible()) ? await viewport.boundingBox() : null
  if (box) {
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
    const tool = (name) => page.locator('.pane:not([hidden]) [role=radio]', { hasText: name }).first().click()
    const drag = async (a, b) => {
      await page.mouse.move(...at(...a))
      await page.mouse.down()
      await page.mouse.move(...at(...b), { steps: 5 })
      await page.mouse.up()
    }
    await tool(/Точка|Point/)
    for (const p of [[0.3, 0.3], [0.5, 0.5], [0.6, 0.4]]) await page.mouse.click(...at(...p))
    await tool(/Прямокутник|Rectangle/)
    await drag([0.2, 0.6], [0.45, 0.8])
    await tool(/Лінія|Line/)
    await drag([0.1, 0.2], [0.8, 0.7])
    await page.waitForTimeout(200)
  }
  await page.screenshot({ path: `${out}/w${width}.png` })
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  console.log(`${width}: ${box ? 'інтерфейс' : 'заглушка / немає кадру'}, горизонтальна прокрутка ${scroll} px`)
  await page.close()
}
await browser.close()
