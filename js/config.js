/*
 * VoiceSync Studio: runtime settings (public, no secrets here).
 * ttsProxy: address of the Cloudflare Worker (worker/) that calls Azure AI
 * Speech and JSF Labs and checks plan codes. The GitHub "Deploy voice Worker"
 * workflow fills this in automatically. Empty = only the free engines.
 */
window.VS_CONFIG = window.VS_CONFIG || {
  ttsProxy: '',

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

    // Plan cards. price = normal monthly price; firstMonth = offer price
    // for the first month (leave out for no offer). chars = HD characters.
    // Boss pricing (2026-10-09): FREE tier = 10,000 tokens, no subscription.
    // Paid plans multiply up to 10M characters; subscription via WhatsApp.
    plans: [
      {
        id: 'free', name: 'Free', chars: 10000, price: 0, badge: 'free',
        perks: {
          en: ['10,000 tokens FREE — no subscription needed', 'Try HD voices', 'Urdu + 60 languages', 'Upgrade anytime on WhatsApp'],
          ur: ['10,000 ٹوکن مفت — سبسکرپشن کی ضرورت نہیں', 'ایچ ڈی آوازیں آزمائیں', 'اردو + 60 زبانیں', 'واٹس ایپ پر کسی بھی وقت اپ گریڈ کریں']
        }
      },
      {
        id: 'starter', name: 'Starter', chars: 1000000, price: 1500, firstMonth: 1200,
        perks: {
          en: ['1M HD characters / month', 'Clone up to 20 voices', 'Urdu + 60 languages', 'WhatsApp support'],
          ur: ['10 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'اردو + 60 زبانیں', 'واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'creator', name: 'Creator', chars: 3000000, price: 3999, firstMonth: 3699, badge: 'popular',
        perks: {
          en: ['3M HD characters / month', 'Clone up to 20 voices', 'Best for YouTubers', 'Priority WhatsApp support'],
          ur: ['30 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'یوٹیوبرز کے لیے بہترین', 'ترجیحی واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'business', name: 'Business', chars: 6000000, price: 7499, firstMonth: 7199,
        perks: {
          en: ['6M HD characters / month', 'Clone up to 20 voices', 'For agencies & channels', 'Priority WhatsApp support'],
          ur: ['60 لاکھ ایچ ڈی حروف / ماہ', '20 تک آوازیں کلون کریں', 'ایجنسیوں اور چینلز کے لیے', 'ترجیحی واٹس ایپ سپورٹ']
        }
      },
      {
        id: 'studio', name: 'Studio', chars: 10000000, price: 11999, firstMonth: 11699,
        perks: {
          en: ['10M HD characters / month', 'Clone up to 50 voices', 'For studios & heavy creators', 'Priority WhatsApp support'],
          ur: ['1 کروڑ ایچ ڈی حروف / ماہ', '50 تک آوازیں کلون کریں', 'اسٹوڈیوز اور ہیوی کریئیٹرز کے لیے', 'ترجیحی واٹس ایپ سپورٹ']
        }
      }
    ],

    offers: [
      { en: 'FREE: 10,000 tokens — no subscription needed', ur: 'مفت: 10,000 ٹوکن — سبسکرپشن کی ضرورت نہیں' },
      { en: 'After free: get your subscription on WhatsApp', ur: 'مفت کے بعد: واٹس ایپ پر سبسکرپشن لیں' },
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
