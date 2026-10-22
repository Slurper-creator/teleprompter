/*
 * Language filter word list
 * ---------------------------------------------------------------
 * Words the teleprompter filters (see PROFANITY_FILTER in config.js).
 * You can edit this file, or add and remove words in config.js with
 * EXTRA_BLOCKED_WORDS and ALLOWED_WORDS.
 *
 * How entries match (capitals don't matter):
 *   "word"    the whole word, plus "words" / "wordes"
 *   "word*"   any word that starts with it   (bitch* -> bitchy, bitching)
 *   "*word"   any word that ends with it     (*shit -> bullshit)
 *   "*word*"  any word that contains it      (*fuck* -> clusterfuck)
 *
 * Common disguises are caught automatically: repeated letters (fuuuck),
 * look-alike characters (sh1t, $hit, a$$, f*ck) and dots or dashes
 * between letters (f.u.c.k).
 *
 * Words that often have an innocent meaning (for example dick, cock,
 * prick, hoe, chink, coon, cum) are left out on purpose, so names and
 * normal sentences aren't masked. Mild words (damn, hell, crap) are
 * also left out. Add any of them to EXTRA_BLOCKED_WORDS if you want.
 */
window.TELEPROMPTER_WORDLIST = Object.freeze([
  // f-word
  "*fuck*", "fuk", "fuking", "fukin", "fck", "fcking", "fcuk", "wtf", "stfu", "gtfo",

  // s-word
  "*shit", "shitty", "shitting", "shitted", "shithead", "shitface", "shitshow",

  // a-word
  "ass", "asshole", "asshat", "asswipe", "jackass", "dumbass", "smartass", "fatass",
  "badass", "arse", "arsehole",

  // other profanity
  "bitch*", "sonofabitch", "bastard", "cunt", "twat", "wank", "wanker", "wanking",
  "bollocks", "piss*", "goddamn*", "douchebag", "dickhead", "cocksucker",
  "motherfucker",

  // sexual
  "pussy", "pussies", "tits", "titty", "titties", "dildo", "porn", "porno",
  "jizz", "slut*", "whore*", "skank",

  // slurs
  "nigger", "nigga", "niggaz", "faggot", "fag", "retard", "retarded", "spic",
  "kike", "wetback", "beaner", "tranny", "dyke"
]);
