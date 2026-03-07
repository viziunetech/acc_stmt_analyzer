export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@cashscope.app';

export const LEGAL_PAGES = {
  privacy: {
    title: 'Privacy Policy',
    effectiveDate: 'Mar 7, 2026',
    sections: [
      {
        title: 'Overview',
        text: [
          'CashScope is designed for privacy-first, local processing. Your bank statement files are processed in your browser and are not uploaded to our servers as part of the analysis workflow.',
          'This policy describes what data we may receive when you interact with our website and purchase/activate Pro.',
        ],
      },
      {
        title: 'Data you provide',
        bullets: [
          'Email address (for purchases, license delivery, and support)',
          'Payment identifiers provided by our payment processor (e.g., order ID/payment ID) to verify your purchase',
          'Support messages you submit via the contact form',
        ],
      },
      {
        title: 'Statement data',
        text: [
          'CashScope does not ask you to log in to your bank and does not intentionally collect your statement contents on our servers.',
          'If you choose to email us screenshots or statement excerpts for support, that content is shared by you voluntarily and will be used only to help resolve your request.',
        ],
      },
      {
        title: 'Third-party services',
        bullets: [
          'Payment processing (Razorpay) to collect payments and confirm successful transactions',
          'Email delivery (Resend) to send license keys and respond to support messages',
          'License storage (Upstash Redis, if configured) to validate license keys',
        ],
      },
      {
        title: 'Contact',
        text: ['For privacy questions, email us at '],
        contactEmail: true,
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    effectiveDate: 'Mar 7, 2026',
    sections: [
      {
        title: 'Use of the service',
        bullets: [
          'CashScope is provided as a personal finance analysis tool and is not financial, tax, or legal advice.',
          'You are responsible for verifying results and using your own judgment before taking action.',
        ],
      },
      {
        title: 'Pro license',
        bullets: [
          'A Pro license is intended for the purchaser’s use. If you need team or bulk licensing, contact us.',
          'Your license key should be kept secure. Anyone with the key may be able to activate Pro on their browser.',
        ],
      },
      {
        title: 'Availability',
        text: [
          'We aim to keep the service available, but we do not guarantee uninterrupted operation. Features may change over time.',
        ],
      },
      {
        title: 'Limitation of liability',
        text: [
          'To the maximum extent permitted by law, CashScope and its contributors are not liable for indirect or consequential damages arising from the use of the service.',
        ],
      },
      {
        title: 'Contact',
        text: ['Questions about these terms? Email us at '],
        contactEmail: true,
      },
    ],
  },

  refund: {
    title: 'Refund Policy',
    effectiveDate: 'Mar 7, 2026',
    sections: [
      {
        title: 'Overview',
        text: [
          'CashScope Pro is a one-time purchase for lifetime access. If something goes wrong with your purchase or you can’t access Pro as promised, contact us and we will help.',
        ],
      },
      {
        title: 'Refund eligibility',
        bullets: [
          'Duplicate charges for the same purchase',
          'Payment succeeded but a license key was not delivered and we are unable to resolve it',
          'Technical issues that prevent Pro from working on supported browsers, after reasonable troubleshooting',
        ],
      },
      {
        title: 'How to request a refund',
        text: [
          'Email support with your purchase email and Order ID (or payment ID). We may ask for additional details to locate the transaction.',
        ],
      },
      {
        title: 'Contact',
        text: ['Refund requests can be sent to '],
        contactEmail: true,
      },
    ],
  },
};
