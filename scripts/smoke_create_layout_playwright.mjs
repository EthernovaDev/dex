#!/usr/bin/env node
import { chromium } from 'playwright'

const baseUrl = (process.env.DEX_URL || 'https://dex.ethnova.net').replace(/\/$/, '')

const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

async function runViewport(name, viewport, checks) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport })
  await page.goto(`${baseUrl}/#/create`, { waitUntil: 'networkidle' })
  await checks(page)
  await browser.close()
  process.stdout.write(`[OK] ${name}\n`)
}

async function main() {
  await runViewport('desktop-create', { width: 1280, height: 720 }, async (page) => {
    const root = await page.$('[data-testid="create-page"]')
    if (!root) fail('create-page missing')
    const panel = await page.$('[data-testid="create-info-panel"]')
    if (!panel) fail('desktop info panel missing')
    const name = await page.getAttribute('[data-testid="create-input-name"]', 'placeholder')
    if (name !== 'Name your coin') fail('placeholder for name incorrect')
    const ticker = await page.getAttribute('[data-testid="create-input-symbol"]', 'placeholder')
    if (ticker !== 'Add a coin ticker (e.g. DOGE)') fail('placeholder for ticker incorrect')
  })

  await runViewport('mobile-create', { width: 390, height: 844 }, async (page) => {
    const accordion = await page.$('[data-testid="create-info-accordion"]')
    if (!accordion) fail('mobile info accordion missing')
    const toggle = await page.$('[data-testid="create-info-accordion-toggle"]')
    if (!toggle) fail('accordion toggle missing')
    await toggle.click()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    if (scrollWidth > clientWidth + 1) fail('horizontal overflow detected')
  })
}

main().catch((err) => fail(err.message))
