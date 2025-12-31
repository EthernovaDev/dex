import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'https://dex.ethnova.net'
const IMPORT_URL = `${BASE_URL}/?debug=1#/find`

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []

  page.on('pageerror', err => errors.push(err?.message || String(err)))

  await page.goto(IMPORT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(12000)

  const crash = await page.locator('text=NovaDEX crashed').count()
  const checking = await page.locator('text=Checking position').count()

  await browser.close()

  if (crash) {
    console.error('[ERROR] NovaDEX crashed on Import Pool')
    process.exit(1)
  }
  if (checking) {
    console.error('[ERROR] Import Pool stuck on "Checking position"')
    process.exit(1)
  }
  if (errors.length) {
    console.warn('[WARN] Page errors detected:', errors.join('; '))
  }
  console.log('[OK] ui_import_pool_smoke passed')
}

main().catch(err => {
  console.error('[ERROR] ui_import_pool_smoke failed', err)
  process.exit(1)
})
