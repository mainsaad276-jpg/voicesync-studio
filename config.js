// ─────────────────────────────────────────────────────────────
//  BRAND + BUSINESS SETTINGS — edit this file to rebrand / reprice.
//  Everything on the website (name, prices, contacts) reads from here.
// ─────────────────────────────────────────────────────────────
module.exports = {
  brand: {
    name: 'VoiceSync Studio',
    short: 'VoiceSync',
    tagline: 'Studio voices for every creator',
    company: 'Carbon Nexus Green (Pvt) Ltd',
    founder: 'Muhammad Saad Ashraf',
    founderTitle: 'Founder & CEO',
    email: 'support@voicesync.studio',
    whatsapp: '923107100275',            // international format, no +
    whatsappDisplay: '0310 7100275',
    address: 'Pakistan',
    hours: 'Mon–Sat, 10:00 AM – 7:00 PM PKT',
    paymentMethods: ['EasyPaisa', 'JazzCash', 'Bank transfer'],
  },

  // Where customers send money (shown on the Billing page). Fill these in.
  payment: {
    easypaisa: { title: 'EasyPaisa', account: '0310 7100275', holder: 'Muhammad Saad Ashraf' },
    jazzcash: { title: 'JazzCash', account: '0310 7100275', holder: 'Muhammad Saad Ashraf' },
    bank: { title: 'Bank transfer', account: 'IBAN: PK00 XXXX 0000 0000 0000 0000', holder: 'Carbon Nexus Green (Pvt) Ltd', bank: 'Your bank name' },
  },

  freeMonthlyChars: 10000,      // free characters every month for new / free accounts
  playgroundLimit: 500,         // max characters per free playground generation (no login)
  playgroundDailyPerIp: 3,      // playground generations per IP per day
  usdRate: 280,                 // PKR per USD for the currency toggle

  // Flash sale: set to null to switch off. Countdown resets every `hours`.
  flashSale: { label: 'Launch offer', hours: 48 },

  plans: [
    { id: 'starter', name: 'Starter', chars: 1_000_000, price: 1500, firstMonth: 1200, blurb: 'For new creators testing the waters.',
      features: ['1M characters / month', '3 custom voice clones', 'All languages', 'HD WAV export', 'Commercial use'] },
    { id: 'creator', name: 'Creator', chars: 3_000_000, price: 4000, firstMonth: 3500, blurb: 'Weekly uploads and long-form videos.',
      features: ['3M characters / month', 'Everything in Starter', 'Long-form up to 50k chars per job', 'Full generation history'] },
    { id: 'pro', name: 'Pro', chars: 5_000_000, price: 6000, firstMonth: 5500, popular: true, blurb: 'Agencies and daily publishers.',
      features: ['5M characters / month', 'Everything in Creator', 'API access', 'Priority WhatsApp support'] },
    { id: 'scale', name: 'Scale', chars: 11_000_000, price: 11000, firstMonth: 10000, blurb: 'Teams and apps at volume.',
      features: ['11M characters / month', 'Everything in Pro', 'Full API access', 'Dedicated account manager', 'Volume discounts'] },
  ],

  // One-time top-up packs (never expire)
  packs: [
    { id: 'pack250k', name: '250K characters', chars: 250_000, price: 500 },
    { id: 'pack1m', name: '1M characters', chars: 1_000_000, price: 1800 },
  ],

  // Max cloned voices per customer. The upstream engine account has a limited number of
  // voice slots (50 at the time of setup) shared by ALL customers — keep these small.
  cloneLimits: { free: 1, paid: 3 },

  referralBonus: 20000,   // characters given to BOTH users when a referral signs up
};
