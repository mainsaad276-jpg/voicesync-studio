/*
 * VoxNova: runtime settings (public, no secrets here).
 * ttsProxy: address of the Cloudflare Worker (worker/) that calls Azure AI
 * Speech and JSF Labs and checks plan codes. The GitHub "Deploy voice Worker"
 * workflow fills this in automatically. Empty = only the free engines.
 */
// ==================== API PLACE (yahan apna API address lagayein) ====================
// Apna API address in quotes ke andar likhein, jaise:
//   'https://voxnova.vercel.app/api'   ya   'https://voicesync-tts.xxxx.workers.dev'
// Vercel par site aur API saath hon to khali chhod dein (khud /api ban jata hai).
// API KEYS (JSF / Azure) yahan NAHI likhni — wo admin page → "API settings" mein.
var VS_API_ADDRESS = 'https://voicesync-studio-psi.vercel.app/api';
// ======================================================================================

window.VS_CONFIG = window.VS_CONFIG || {
  ttsProxy: VS_API_ADDRESS ||
    ((typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname)) ? location.origin + '/api' : ''),

  /*
   * Pro plans (see js/pro.js). Edit prices, offers and payment details here.
   * Paid today: HD JSF Labs voices + voice cloning (need an activation code;
   * the character balance is enforced on the Worker). Everything else free.
   *
   * enforce: true would ALSO add free-tier limits (chars per voiceover,
   * daily count, video watermark, features listed in proFeatures).
   */
  pro: {
    enforce: false,
    showBadges: true,
    freeMaxChars: 1500,         // only used when enforce is true
    freeDailyGenerations: 15,   // only used when enforce is true
    watermarkFreeVideos: true,  // only used when enforce is true
    proFeatures: ['hd', 'clone'],
    currency: 'Rs',

    // Plan cards. price = normal monthly price; firstMonth = offer price for
    // the first month. chars = HD characters per month.
    // Boss pricing: Rs 1,500 per 1M characters, multiplied up to 10M; first
    // month Rs 300 off. Free tier (freeTrialChars) is granted by the API,
    // once per device; after it is used up, a subscription is needed.
    freeTrialChars: 10000,
    plans: [
      {
        id: 'starter', name: 'Starter', chars: 1000000, price: 1500, firstMonth: 1200,
        perks: {
          en: ['1M HD characters / month', 'Clone up to 20 voices', 'Urdu + 60 languages', 'WhatsApp support'],
          ur: ['10 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'اردو + 60 زبانیں', 'واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'plus', name: 'Plus', chars: 2000000, price: 3000, firstMonth: 2700,
        perks: {
          en: ['2M HD characters / month', 'Clone up to 20 voices', 'Good for weekly videos', 'WhatsApp support'],
          ur: ['20 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'ہفتہ وار ویڈیوز کے لیے', 'واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'creator', name: 'Creator', chars: 3000000, price: 4500, firstMonth: 4200, badge: 'popular',
        perks: {
          en: ['3M HD characters / month', 'Clone up to 20 voices', 'Best for YouTubers', 'WhatsApp support'],
          ur: ['30 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'یوٹیوبرز کے لیے بہترین', 'واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'pro', name: 'Pro', chars: 5000000, price: 7500, firstMonth: 7200,
        perks: {
          en: ['5M HD characters / month', 'Clone up to 20 voices', 'For agencies & channels', 'WhatsApp support'],
          ur: ['50 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'ایجنسیوں اور چینلز کے لیے', 'واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'studio', name: 'Studio', chars: 10000000, price: 15000, firstMonth: 14700,
        perks: {
          en: ['10M HD characters / month', 'Clone up to 50 voices', 'For studios & heavy creators', 'WhatsApp support'],
          ur: ['1 کروڑ ایچ ڈی حروف / ماہ', '50 تک آوازیں کلون کریں', 'اسٹوڈیوز اور ہیوی کریئیٹرز کے لیے', 'واٹس ایپ سپورٹ']
        }
      }
    ],

    offers: [
      { en: 'FREE: 10,000 tokens — no subscription needed', ur: 'مفت: 10,000 ٹوکن — سبسکرپشن کی ضرورت نہیں' },
      { en: 'After free: request your subscription in the app or on WhatsApp', ur: 'مفت کے بعد: ایپ میں یا واٹس ایپ پر سبسکرپشن کی درخواست دیں' },
      { en: 'First month Rs 300 off on every paid plan', ur: 'ہر پیڈ پلان پر پہلے ماہ 300 روپے کی چھوٹ' },
      { en: 'Pay 3 months together: 10% off', ur: '3 ماہ اکٹھے ادا کریں: 10% چھوٹ' },
      { en: 'Refer a friend: you both get 100,000 bonus characters', ur: 'دوست کو بتائیں: دونوں کو 1 لاکھ بونس حروف' }
    ],

    // How users pay. WhatsApp number in international format (no + or 0).
    // Add methods to show them on the back of each plan card; a method with
    // an empty value is hidden. Example:
    //   { label: { en: 'JazzCash', ur: 'جاز کیش' }, value: '03xx xxxxxxx', name: 'Account title' }
    //   { label: { en: 'Bank (IBAN)', ur: 'بینک (IBAN)' }, value: 'PK00 XXXX ....', name: 'Account title' }
    payment: {
      whatsapp: '923107100275',
      methods: [
        { label: { en: 'JazzCash', ur: 'جاز کیش' }, value: '', name: '' },
        { label: { en: 'Easypaisa', ur: 'ایزی پیسہ' }, value: '', name: '' },
        { label: { en: 'Bank account (IBAN)', ur: 'بینک اکاؤنٹ (IBAN)' }, value: '', name: '' }
      ]
    }
  }
};
