# Changelog

All notable changes to the Teleprompter are listed here, newest first.

## 1.3.0 — 2026-10-23 · Accessibility (WCAG 2.1 AA)

### Added
- **Letter keys** button. It turns the single-key shortcuts (K, M, F, + and −) on or off for speech-input users (WCAG 2.1.4). The setting is remembered.
- Screen-reader announcements for changes made with shortcuts: Playing, Paused, Speed, Text size, Mirror on/off, Back at the top, End of script.
- Slider values read as "6 of 20" and "56 pixels".
- Visible instructions above the text box, which replace the placeholder text.
- Support for reduced motion and Windows High Contrast (forced colors).

### Fixed
- **Space on a focused button played or paused the script** instead of pressing that button. Space now presses the focused button.
- **Low contrast.** Blue buttons had 3.7:1 contrast with white text and now have 5.2:1. The text box border had 1.5:1 and now has 4.4:1.
- **Hidden focus on Upload.** The upload button now shows a focus outline. Focus outlines are thicker (3 px) and brighter.
- The Play button no longer reads its symbols ("black right-pointing triangle"). Its name changes between Play and Pause, without a conflicting "pressed" state.
- The arrow symbols on Edit and Top are no longer read aloud.
- An empty or blocked script marks the text box as invalid and links it to the error message.
- The page title shows which screen is open. The teleprompter screen is now a main landmark with a heading.
- The controls reappear when a key is pressed while they are faded.

## 1.2.1 — 2026-10-21 · Security fixes

### Fixed
- **Language filter slowdown (ReDoS).** Unbounded repeats in the filter's patterns made some input, such as a long run of one letter, take time that grew with the square of its length. A 500,000-character paste could freeze the tab for many minutes. The repeats are now bounded, and the worst case takes about 70 ms.
- **.docx zip bomb.** The reader unzipped the whole document before checking the 60 MB limit, so a small file that expands to gigabytes could exhaust memory. It now unzips in chunks and stops at the limit. A 1 MB file that expands to 1 GB is rejected in about 0.1 s.
- **Clickjacking.** The app now refuses to run inside another site's frame. GitHub Pages can't send `X-Frame-Options`, and a `<meta>` CSP ignores `frame-ancestors`.

### Changed
- The .docx reader rejects documents that contain an XML `DOCTYPE` or `ENTITY` declaration. Real .docx files never do, and this blocks entity-expansion attacks.

## 1.2.0 — 2026-10-21 · Language filter

### Added
- **Language filter.** Scripts are checked against a word list of profanity, sexual terms and slurs before they show on the teleprompter.
  - `"mask"` mode (default): filtered words show as `****` on the teleprompter. The student's text box keeps the original text.
  - `"block"` mode: **Start** refuses to open the teleprompter. It says how many words need changing and highlights the first one.
  - `"off"` mode: no filtering.
- `wordlist.js`: the editable word list. It supports whole-word (`word`), starts-with (`word*`), ends-with (`*word`) and contains (`*word*`) patterns.
- New `config.js` settings: `PROFANITY_FILTER`, `EXTRA_BLOCKED_WORDS` and `ALLOWED_WORDS`.
- The filter catches disguised spellings: repeated letters (`fuuuck`), look-alike characters (`sh1t`, `$hit`, `a$$`, `f*ck`) and dots or dashes between letters (`f.u.c.k`).
- README section "Language filter".

### Changed
- The service worker now caches `wordlist.js`, so the filter works offline.
- `index.html` loads `wordlist.js` before `app.js`.

### Notes
- Matches whole words only, so words like *class*, *assignment*, *Scunthorpe* and *shiitake* are not filtered.
- Words with common innocent meanings (*dick*, *cock*, *prick*, *hoe*, *cum*) and mild words (*damn*, *hell*, *crap*) are left off the default list. Add them with `EXTRA_BLOCKED_WORDS`.

## 1.1.0 — 2026-10-21 · Offline support

### Added
- `sw.js`: a service worker that keeps a copy of the app's own files. After the first visit, the app opens and runs with no connection.
  - Network first: when online, students always get the newest version, with no version bump or cache clearing needed.
  - Only the app's files are cached. Student scripts are never stored.
  - Requests to Google (sign-in, Picker, Drive) are not touched.
- README section "Offline use". It covers what works offline and what needs internet ("Choose Google Doc").

### Changed
- `app.js` registers the service worker.

## 1.0.0 — 2026-10-21 · First release

### Added
- A browser-only teleprompter for student Chromebooks, with no server, database or external libraries.
- Three ways to load a script:
  - Paste text.
  - Upload a `.docx` or `.txt` file. A built-in `.docx` reader has size limits (20 MB file, 60 MB unzipped).
  - **Choose Google Doc** through the Google Picker. This is optional and turns on once `config.js` has Google values.
- Teleprompter controls: Play/Pause, a speed slider (1–20), text size (24–120 px), Mirror for beam-splitter glass, Full screen, Top, and a reading line.
- Manual scrolling with the mouse wheel, touchpad or touchscreen, whether playing or paused.
- Keyboard shortcuts: Space/K, ↑/↓, +/−, Page Up/Down, Home, M, F and Esc.
- While playing, the controls fade and the screen stays awake (Wake Lock).
- Speed, size and mirror preferences are remembered on the device.
- Security and privacy:
  - A strict Content-Security-Policy.
  - Text-only rendering, so a document can't inject code.
  - The narrowest Google scope (`drive.file`), so the app can read only the doc the student picks.
  - Tokens are kept in memory only, with no analytics or cookies.
  - An optional school-domain sign-in hint (`SCHOOL_DOMAIN`).
- `manifest.json` and icons, so the app can be installed on Chromebooks or force-installed from the Google Admin console.
- README with deploy steps, Google Doc setup and a keyboard shortcut reference.
