#!/usr/bin/env node
/**
 * Create the GreekLeads Products and Prices in Stripe, and report on tax setup.
 *
 * Written as a script rather than dashboard clicking because this has to be done
 * TWICE: once in the sandbox now, and again on the real Greek account once the
 * IKE exists. Doing it by hand twice is how the two environments drift.
 *
 * Idempotent — it looks products up by a metadata key, so re-running finds what
 * exists instead of creating duplicates.
 *
 * Usage, from web/:
 *   node scripts/setup-stripe.mjs                 # dry run: report only
 *   node scripts/setup-stripe.mjs --apply         # create against a TEST key
 *   node scripts/setup-stripe.mjs --apply --live  # create against a LIVE key
 *
 * Reads STRIPE_SECRET_KEY from the environment or web/.env.local.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Stripe from 'stripe'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = join(HERE, '..')

// Must match lib/stripe.ts — a mismatch means the script and the app see
// different response shapes.
const API_VERSION = '2026-07-29.dahlia'

// Must match lib/pricing.ts. Amounts are in cents and EXCLUDE ΦΠΑ.
const CATALOG = [
  {
    key: 'individual',
    name: 'GreekLeads Individual',
    description: 'Για μεμονωμένους επαγγελματίες. Ετήσια συνδρομή.',
    amount: 7500,
    interval: 'year',
    envVar: 'STRIPE_PRICE_INDIVIDUAL_YEARLY',
  },
  {
    key: 'agency',
    name: 'GreekLeads Agency',
    description: 'Για ομάδες πωλήσεων και πρακτορεία. Μηνιαία συνδρομή.',
    amount: 10000,
    interval: 'month',
    envVar: 'STRIPE_PRICE_AGENCY_MONTHLY',
  },
]

// "Software as a service (SaaS)". Confirm with the accountant before go-live —
// a Nontaxable code makes automatic_tax collect zero with no error, which is
// indistinguishable from a missing registration.
const TAX_CODE = 'txcd_10103001'

// One Product per plan, never several Prices on one Product: Checkout and every
// invoice show the PRODUCT name on the line item, so sharing one would make all
// tiers read identically on the customer's invoice.
const META_KEY = 'greekleads_plan'

function loadKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY
  const envPath = join(WEB_ROOT, '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim()
      if (t.startsWith('STRIPE_SECRET_KEY=')) {
        return t.slice('STRIPE_SECRET_KEY='.length).trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return null
}

async function reportTax(stripe) {
  console.log('\n── Tax setup ' + '─'.repeat(50))
  try {
    const settings = await stripe.tax.settings.retrieve()
    const ok = settings.status === 'active'
    console.log(`  Tax settings status : ${settings.status}${ok ? '' : '   <-- head office address missing'}`)
    if (!ok) {
      console.log('    automatic_tax calculates NOTHING while status is "pending".')
      console.log('    Fix: Dashboard -> Tax -> Settings -> head office address.')
    }
  } catch (err) {
    console.log(`  Tax settings        : could not read (${err.message})`)
  }

  try {
    const regs = await stripe.tax.registrations.list({ status: 'active', limit: 100 })
    if (regs.data.length === 0) {
      console.log('  Active registrations: NONE')
      console.log('')
      console.log('  *** WARNING ******************************************************')
      console.log('  With automatic_tax enabled and no active registration, Stripe')
      console.log('  collects ZERO tax and raises NO error. You would charge EUR 100')
      console.log('  flat and owe 24% out of your own pocket. Stripe CANNOT correct')
      console.log('  those transactions retroactively.')
      console.log('  Do not take a live payment until a Greek registration is active.')
      console.log('  ******************************************************************')
    } else {
      for (const r of regs.data) {
        console.log(`  Active registration : ${r.country}${r.state ? '/' + r.state : ''}  (${r.id})`)
      }
    }
  } catch (err) {
    console.log(`  Registrations       : could not read (${err.message})`)
  }
}

async function ensureProduct(stripe, entry, apply) {
  // Search rather than list-and-filter so this stays correct with many products.
  const found = await stripe.products.search({
    query: `metadata['${META_KEY}']:'${entry.key}'`,
    limit: 1,
  })
  if (found.data.length > 0) {
    console.log(`  product  ${entry.key.padEnd(11)} exists   ${found.data[0].id}`)
    return found.data[0]
  }
  if (!apply) {
    console.log(`  product  ${entry.key.padEnd(11)} WOULD CREATE  "${entry.name}"`)
    return null
  }
  const product = await stripe.products.create({
    name: entry.name,
    description: entry.description,
    tax_code: TAX_CODE,
    metadata: { [META_KEY]: entry.key },
  })
  console.log(`  product  ${entry.key.padEnd(11)} CREATED  ${product.id}`)
  return product
}

async function ensurePrice(stripe, entry, product, apply) {
  if (!product) return null

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
  const match = prices.data.find(
    p =>
      p.currency === 'eur' &&
      p.unit_amount === entry.amount &&
      p.recurring?.interval === entry.interval &&
      p.tax_behavior === 'exclusive'
  )
  if (match) {
    console.log(`  price    ${entry.key.padEnd(11)} exists   ${match.id}`)
    return match
  }
  if (!apply) {
    console.log(`  price    ${entry.key.padEnd(11)} WOULD CREATE  EUR ${entry.amount / 100}/${entry.interval} exclusive`)
    return null
  }
  // tax_behavior is IMMUTABLE once the price is used. 'exclusive' = the amount
  // is before ΦΠΑ, which is Greek B2B convention (πλέον ΦΠΑ).
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: entry.amount,
    recurring: { interval: entry.interval },
    tax_behavior: 'exclusive',
    metadata: { [META_KEY]: entry.key },
  })
  console.log(`  price    ${entry.key.padEnd(11)} CREATED  ${price.id}`)
  return price
}

async function main() {
  const apply = process.argv.includes('--apply')
  const allowLive = process.argv.includes('--live')

  const key = loadKey()
  if (!key || key.includes('placeholder')) {
    console.error('STRIPE_SECRET_KEY not set (or still a placeholder).')
    process.exit(1)
  }

  const isLive = key.startsWith('sk_live_')
  if (isLive && !allowLive) {
    console.error('Refusing to touch a LIVE account without --live.')
    console.error('If you meant to, re-run with:  --apply --live')
    process.exit(1)
  }

  console.log(`Mode : ${apply ? 'APPLY' : 'dry run (nothing will be created)'}`)
  console.log(`Key  : ${isLive ? 'LIVE' : 'test/sandbox'}`)

  const stripe = new Stripe(key, { apiVersion: API_VERSION })

  const account = await stripe.accounts.retrieve()
  console.log(`Account: ${account.id}  country=${account.country}  default_currency=${account.default_currency}`)
  if (account.country !== 'GR') {
    console.log('')
    console.log(`  NOTE: this account's country is ${account.country}, not GR.`)
    console.log('  An account country cannot be changed once a live service is')
    console.log('  activated. Fine for sandbox testing; the real Greek account has')
    console.log('  to be created separately once the IKE exists.')
  }

  console.log('\n── Catalog ' + '─'.repeat(52))
  const results = []
  for (const entry of CATALOG) {
    const product = await ensureProduct(stripe, entry, apply)
    const price = await ensurePrice(stripe, entry, product, apply)
    results.push({ entry, price })
  }

  await reportTax(stripe)

  const created = results.filter(r => r.price)
  if (created.length > 0) {
    console.log('\n── Paste into web/.env.local and Vercel ' + '─'.repeat(23))
    for (const { entry, price } of created) {
      console.log(`${entry.envVar}=${price.id}`)
    }
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to create.')
  }
  console.log('')
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
