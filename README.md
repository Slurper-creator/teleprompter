# Teleprompter for Student Chromebooks

A small, private teleprompter that runs in the browser. There is no server and no database.

## What students can do

- **Load a script** in one of three ways:
  - **Choose Google Doc**: sign in with their school account and pick a doc. This only works after the one-time setup below.
  - **Paste**: in the doc, press Ctrl+A, then Ctrl+C, then paste into the box.
  - **Upload**: a .docx or .txt file (in Google Docs, File → Download).
- **Play/Pause**: the button, the **Space** key, or a tap on the text.
- **Speed slider** (1–20). The **↑ / ↓** keys also change the speed.
- **Text size** slider (the **+ / −** keys also work), **Mirror** for beam-splitter glass, **Full screen**, and **Top**.
- **Scroll by hand** with the touchpad, mouse wheel or touchscreen, whether playing or paused.
- A yellow **reading line** marks where to read. While the script is playing, the controls fade and the screen stays awake.
- **Works offline** after it has been opened once (see below).
- **Language filter**: bad words are masked as `****` on the teleprompter, or can block the script from starting (see below).

## Accessibility

The app is built to meet **WCAG 2.1 Level AA**, the standard used for ADA compliance in schools.

- **Keyboard:** every control works with Tab, Space and Enter. Space and Enter press the focused button, and the shortcuts below work from anywhere on the teleprompter screen.
- **Screen readers:** buttons, sliders and the text box have clear names. Changes made with shortcuts (Playing, Paused, Speed 6, Mirror on, End of script) are announced. Errors are announced and mark the text box as needing attention.
- **Speech input:** the single-key shortcuts (K, M, F, + and −) can be turned off with the **Letter keys** button, so spoken words aren't taken as commands. The setting is remembered.
- **Contrast:** text has at least 4.5:1 contrast, and field borders and focus outlines have at least 3:1. Every control shows a thick blue outline when it has keyboard focus.
- **Moving text:** scrolling only starts when the student presses Play, and it can be paused at any time.
- **Zoom and small screens:** the page reflows at 320 px wide (400% zoom) with no sideways scrolling.
- **Reduced motion and high contrast:** the controls stop fading in and out when the device asks for less motion, and buttons, states and the reading line stay visible in Windows High Contrast mode.

## Offline use

After the app has been opened once with an internet connection, it keeps a copy of its own files on the Chromebook. It then opens and runs with no connection, from the launcher or the bookmarked address.

- **Works offline:** pasting a script, uploading a .docx or .txt file, and every teleprompter control.
- **Needs internet:** **Choose Google Doc**. Offline, the button shows "Google unavailable" and students can paste or upload instead. To prepare offline, students can download the doc beforehand (File → Download → .docx).
- **Updates:** when online, the app always loads the newest version, so changes you publish reach students the next time they open it. No cache clearing or version bumps are needed.
- **What is stored:** only the app's own files (the page, code, styles, config and icons). Student scripts are never stored.

## Language filter

The app checks scripts against the word list in `wordlist.js`. Choose what happens with `PROFANITY_FILTER` in `config.js`:

| Setting | What students see |
|---|---|
| `"mask"` (default) | Filtered words show as `****` on the teleprompter. The text box keeps their original text. |
| `"block"` | **Start** refuses to open the teleprompter. It says how many words need changing and highlights the first one. |
| `"off"` | No filtering. |

- **Add words**: put them in `EXTRA_BLOCKED_WORDS`, for example `["damn", "crap"]`, or edit `wordlist.js`.
- **Allow words**: put them in `ALLOWED_WORDS`, for example `["badass"]`.
- **Patterns**: `word` matches the whole word and its plural. `word*` matches words that start with it, `*word` words that end with it, and `*word*` words that contain it.
- **Disguises are caught**: repeated letters (`fuuuck`), look-alike characters (`sh1t`, `$hit`, `a$$`, `f*ck`) and dots or dashes between letters (`f.u.c.k`).
- **Whole words only**, so words like *class*, *assignment*, *Scunthorpe* or *shiitake* are left alone. Words with common innocent meanings (*dick*, *cock*, *prick*, *hoe*, *cum*) and mild words (*damn*, *hell*, *crap*) are not on the default list. Add them if you want them filtered.

The filter runs entirely on the Chromebook. Nothing is logged or reported.

## Security and privacy

| Measure | What it does |
|---|---|
| Strict Content-Security-Policy | The page can only run its own files and Google's sign-in/Picker code. It blocks inline scripts, plugins and form posts to anywhere else. |
| Text-only rendering | Script text is inserted as plain text and never as HTML, so a doc can't inject code. |
| Narrowest Google scope (`drive.file`) | The app can read **only the single doc a student picks**. It can't see the rest of their Drive, and it has no write access. |
| No storage of content | Scripts and sign-in tokens stay in memory only and are gone when the tab closes. The only things saved on the device are speed/size/mirror preferences and an offline copy of the app's own files. |
| No tracking | There are no analytics, cookies, ads or third-party fonts. |
| Safe file parsing | The built-in .docx reader has size limits (20 MB file, 60 MB unzipped). It unzips in chunks and stops at the limit, so a "zip bomb" can't fill memory. It also refuses XML entity tricks. |
| No framing | The app won't run inside another site's frame, which blocks clickjacking even on hosts like GitHub Pages that can't send `X-Frame-Options`. |
| Fast language filter | The filter's patterns have fixed limits, so even a 500,000-character script is checked in well under a second and can't freeze the tab. |
| Optional domain lock | Set `SCHOOL_DOMAIN` so the sign-in screen suggests your school's accounts. For a hard lock, use the "Internal" setting below. |

**Student data (FERPA/COPPA):** the app never transmits or keeps student content. The only data exchange is between the student's browser and Google, under your existing Workspace agreement.

## Deploy (pick one)

The app is static files. Host the folder anywhere that serves **HTTPS**:

- **GitHub Pages**: create a repo, upload these files, then go to Settings → Pages → Deploy from branch.
- **Netlify / Cloudflare Pages**: drag the folder onto their deploy page.
- **Your school or district web server**: copy the folder into any web directory.

For the strongest protection, also have the host send the CSP as a real HTTP header and add `X-Frame-Options: DENY`. On Netlify, use a `_headers` file.

### Push it to Chromebooks (Google Admin console)

1. Go to **Devices → Chrome → Apps & extensions → Users & browsers**, then pick the student OU.
2. Click **+ → Add by URL**, enter your app's URL, and set it to **Force install** (choose "Open as window" if you like).
3. Students will see **Teleprompter** in their launcher. The app also has a manifest, so they can install it from Chrome themselves.

## Google Doc setup (one time, about 10 minutes)

The "Choose Google Doc" button appears once `config.js` has three values. Without them, paste and upload still work.

1. Go to <https://console.cloud.google.com>, signed in with a school admin or staff account, and **create a project** (for example "Teleprompter").
2. **APIs & Services → Library**: enable the **Google Drive API** and the **Google Picker API**.
3. **OAuth consent screen**: choose **Internal**. That restricts sign-in to your school domain and skips Google's app review. Enter an app name and a support email. Add the scope `.../auth/drive.file`.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   Under **Authorized JavaScript origins**, add your site's origin, for example `https://yourname.github.io`. Copy the **Client ID**.
5. **Credentials → Create credentials → API key**. Edit it:
   - *Application restrictions*: **Websites**, add `https://yourname.github.io/*`
   - *API restrictions*: **Google Picker API** only
6. Find the **Project number** under **IAM & Admin → Settings**.
7. Put the values into `config.js`:

```js
GOOGLE_CLIENT_ID: "1234567890-xxxx.apps.googleusercontent.com",
GOOGLE_API_KEY:   "AIza...",
GOOGLE_APP_ID:    "1234567890",
SCHOOL_DOMAIN:    "myschool.org"
```

These values are **not secrets**: Google locks them to your site's address. Your Workspace admin may also need to allow the app under **Security → API controls → App access control**. To do that, add it as "Trusted" using the Client ID.

## Files

- `index.html`: the page, including its security policy
- `app.js`: all app logic, with no external libraries
- `styles.css`: the styling
- `config.js`: the Google and language-filter settings
- `wordlist.js`: the language filter's word list
- `manifest.json` and the icons: let the app be installed on Chromebooks
- `sw.js`: the service worker that makes the app work offline
- `CHANGELOG.md`: the list of changes in each version

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space / K | Play / Pause |
| ↑ / ↓ | Faster / slower |
| + / − | Bigger / smaller text |
| Page Up / Down | Jump back / forward |
| Home | Back to top |
| M | Mirror |
| F | Full screen |
| Esc | Back to the script editor |

Turn off K, M, F and + / − with the **Letter keys** button. Space, the arrow keys, Page Up/Down, Home and Esc always work.
