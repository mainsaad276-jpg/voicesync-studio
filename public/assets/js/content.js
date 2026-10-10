/* FAQ + Help Center content. Edit answers here. {brand} and {free} are replaced automatically. */
VS.FAQ = [
  { c: 'Product', q: 'What is {brand}?', a: '{brand} is an AI voice platform. Paste a script, choose a voice (or clone your own) and download a natural-sounding voiceover in seconds. It supports 20+ languages including Urdu, English, Arabic and Hindi.' },
  { c: 'Product', q: 'Can I clone my own voice?', a: 'Yes. Go to Voice Cloning in your dashboard, upload or record 10–30 seconds of clean speech and give the voice a name. It is ready in about a minute and you can reuse it forever. Only clone your own voice or one you have written permission to use.' },
  { c: 'Product', q: 'Which languages are supported?', a: 'English, Urdu, Arabic, Hindi, Punjabi, Bengali, Persian, Turkish, Spanish, French, German, Portuguese, Italian, Russian, Chinese, Japanese, Korean, Indonesian, Malay and Dutch.' },
  { c: 'Pricing', q: 'Is there a free plan?', a: 'Yes — every account gets {free} free characters every month, including voice cloning. No card or payment details are needed.' },
  { c: 'Pricing', q: 'How do I pay?', a: 'Choose a plan in Billing, send the amount by EasyPaisa, JazzCash or bank transfer to the account shown, then submit your transaction ID. Your credits are activated as soon as the payment is confirmed (usually within a few hours during business hours).' },
  { c: 'Pricing', q: 'Do unused characters roll over?', a: 'Monthly plan characters reset every 30 days. Top-up packs never expire. If you upgrade before your cycle ends, unused paid characters are moved into your top-up balance so you never lose them.' },
  { c: 'Technical', q: 'How long can a single generation be?', a: 'Up to 50,000 characters per job. Long scripts are processed in parallel and stitched into one seamless, loudness-normalised WAV file.' },
  { c: 'Technical', q: 'Can I use the audio commercially?', a: 'Audio generated on paid plans can be used commercially — YouTube monetisation, ads, courses and client work. You must own the rights to any voice you clone.' },
  { c: 'Technical', q: 'Do you have an API?', a: 'Yes. Pro and Scale plans include API access. Create a key under API Keys in your dashboard and see the API documentation for endpoints and examples.' },
  { c: 'Account', q: 'How are characters counted?', a: 'Every character of your script counts as one character, including spaces and punctuation. You are only charged for successful generations — failed jobs are refunded automatically.' },
  { c: 'Account', q: 'Can I delete my account and data?', a: 'Yes. Go to Settings → Delete account. Your generations, private voice clones and API keys are permanently removed.' },
  { c: 'Account', q: 'I paid but my credits have not appeared.', a: 'Payments are verified manually against the transaction ID you submit. If it has been more than 12 business hours, message us on WhatsApp with your invoice number.' },
];
VS.HELP = [
  { t: 'Credits & top-ups', icon: '💳', items: [
    ['How do I add credits?', 'Dashboard → Billing → choose a plan or top-up pack → pay → submit the transaction ID. You will see the payment as “Pending” until it is confirmed.'],
    ['Do my credits expire?', 'Monthly plan characters reset every 30 days. Top-up pack characters never expire.'],
    ['Payment succeeded but credits are missing', 'Check Billing → Payment history. If it is still pending after 12 business hours, WhatsApp us with your invoice number.'],
    ['How are characters counted?', 'One character of input text = one character of credit. Failed generations are refunded.'] ] },
  { t: 'Account', icon: '👤', items: [
    ['Change my name or password', 'Dashboard → Settings. You need your current password to set a new one.'],
    ['Invite teammates', 'Team seats are available on Scale and custom plans — contact sales on WhatsApp.'],
    ['I lost access to my account', 'Email or WhatsApp support from the address you signed up with and we will verify and reset access.'],
    ['Delete my account and data', 'Dashboard → Settings → Delete account. This cannot be undone.'] ] },
  { t: 'Payments & billing', icon: '🧾', items: [
    ['Which payment methods do you accept?', 'EasyPaisa, JazzCash and bank transfer. Card payments are coming soon.'],
    ['Switch plans mid-cycle', 'Buy the new plan any time. Unused paid characters move into your top-up balance.'],
    ['Where are my invoices?', 'Dashboard → Billing → Payment history lists every invoice number and status.'],
    ['How do refunds work?', 'See the Refund Policy page. Unused credits bought in the last 7 days can be refunded on request.'] ] },
  { t: 'Voices & quality', icon: '🎙️', items: [
    ['How long does cloning take?', 'Usually about a minute. Use a clean 10–30 second WAV or MP3 for best results.'],
    ['Can I use audio commercially?', 'Yes on paid plans, provided you own the rights to the voice.'],
    ['The output sounds off', 'Try punctuation to control pauses, split very long sentences, adjust speed, or re-record the clone sample in a quiet room.'],
    ['Which voice should I pick?', 'Preview voices in the library with the ▶ button. For Urdu content choose a voice cloned from an Urdu speaker for the most natural accent.'] ] },
];
VS.fillText = (s) => s.replace(/\{brand\}/g, VS.config?.brand.name || '').replace(/\{free\}/g, VS.num(VS.config?.freeMonthlyChars || 10000));
VS.renderFaq = (el, list) => { el.innerHTML = list.map((f, i) => `<details ${i === 0 ? 'open' : ''}><summary>${VS.esc(VS.fillText(f.q))}</summary><p>${VS.esc(VS.fillText(f.a))}</p></details>`).join(''); };
