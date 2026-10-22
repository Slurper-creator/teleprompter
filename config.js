/*
 * Teleprompter configuration
 * ---------------------------------------------------------------
 * Fill these in to turn on the "Choose Google Doc" button.
 * Leave them empty and the app still works: students can paste
 * text or upload a .docx / .txt file instead.
 *
 * See README.md, "Google Doc setup", for how to get these values.
 * None of these are secrets. They are safe to publish, because
 * Google restricts them to the website address you register.
 */
window.TELEPROMPTER_CONFIG = Object.freeze({
  // OAuth 2.0 Client ID (type: Web application),
  // e.g. "1234567890-abc123.apps.googleusercontent.com"
  GOOGLE_CLIENT_ID: "",

  // API key restricted to the Google Picker API and your site's address
  GOOGLE_API_KEY: "",

  // Google Cloud project NUMBER (numbers only), e.g. "1234567890"
  GOOGLE_APP_ID: "",

  // Optional: limit sign-in to your school's Google Workspace domain,
  // e.g. "myschool.org". Leave "" to allow any account.
  SCHOOL_DOMAIN: "",

  // Language filter, using the words in wordlist.js:
  //   "mask"  - bad words show as **** on the teleprompter (default)
  //   "block" - the script won't start until those words are changed
  //   "off"   - no filtering
  PROFANITY_FILTER: "mask",

  // More words to filter, e.g. ["damn", "crap"]. Same patterns as wordlist.js.
  EXTRA_BLOCKED_WORDS: [],

  // Words that should never be filtered, e.g. ["badass"]
  ALLOWED_WORDS: []
});
