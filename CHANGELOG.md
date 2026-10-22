# Changelog

All notable changes to the Teleprompter are listed here, newest first.

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
