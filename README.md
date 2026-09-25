# Life Dashboard

A personal life dashboard — workouts, to-do list and (later) neurology — built as a
Progressive Web App: plain HTML, CSS and JavaScript with no build step, installable on
iPhone, iPad and Mac, and designed to be hosted for free on GitHub Pages.

**Current status: Phase 1 — Foundation.** Everything runs on sample data and is stored
only on the device. Syncing with Google Sheets/Calendar comes in later phases.

## Install the app (from GitHub Pages)

Once GitHub Pages is switched on (repository **Settings → Pages → Branch: main, / (root)**),
the app lives at `https://<your-username>.github.io/life-dashboard/`.

- **iPhone / iPad:** open that address in Safari → **Share** (inside the **•••** menu on newer
  iPhones) → **Add to Home Screen**.
- **Mac:** open it in Safari → **File → Add to Dock**.

To publish an update: in GitHub Desktop, **Commit to main**, then **Push origin**. The installed
app picks up the new version the next time it's opened.

## Preview on your Mac

1. In Finder, open this folder and double-click **Start Preview.command**.
   A Terminal window opens and the app opens in your browser at <http://localhost:8000>.
2. Keep the Terminal window open while you use the app. Close it to stop the preview.

(Alternative: in Terminal, run `python3 tools/serve.py` from this folder.)

## Preview on your iPhone or iPad

1. Start the preview on your Mac (above). The Terminal window shows an
   **On your iPhone** address, like `http://192.168.1.23:8000`.
2. Make sure the iPhone is on the **same Wi-Fi** as the Mac.
3. On the iPhone, open **Safari** and type that address.
4. Optional: tap **Share → Add to Home Screen** to open it full-screen like an app.

Good to know about the Wi-Fi preview:
- Offline mode needs a secure `https://` address, so it's off here. It turns on
  automatically once the app is hosted on GitHub Pages.
- Each browser and home-screen app keeps its **own** data. Don't enter anything important
  yet — this is for trying the design.
- Some networks (guest, hospital or office Wi-Fi) block devices from reaching each other.

## What Phase 1 includes

- Five-tab navigation (Workout · To Do · **Main** · Neurology · Settings) with the Main button
  centred and larger; swipe between tabs on touch screens; a side rail on iPad landscape and Mac.
- Main dashboard: profile photo, nickname, date, today's calendar (or a daily quote), Today at a
  Glance, and collapsible module cards you can reorder (Arrange → drag the handles).
- Settings: profile, theme (dark/light/system), workout and task preferences, sample-data
  switches, one-tap JSON backup export, delete-all-data.
- Neurology placeholder; preview screens for Workout and To Do showing what's coming.
- Dark futuristic design system, local storage in IndexedDB, offline support (service worker),
  Dynamic Type, VoiceOver labels and Reduce Motion support.

## Project layout

```
index.html            App page
manifest.json         Makes it installable (name, icons, colours)
sw.js                 Service worker: offline copy of the app
css/                  Design tokens, base, components, layout, screens
js/main.js            Start-up
js/core/              Database, state, navigation, UI helpers, icons, dates
js/modules/           Life categories (workout, todo, neurology) + registry
js/screens/           Dashboard, settings, welcome
js/services/          Calendar provider, sample data, backup, storage, images
icons/                App icons (edit the SVGs, then run tools/make-icons.py)
tools/                Local preview server and icon generator
```

### Notes for future phases

- **New life category:** add a file in `js/modules/` (see the comment in `registry.js`) and
  import it in `js/modules/index.js`. It appears on the dashboard automatically.
- **Database changes:** append a migration in `js/core/schema.js` (never edit an old one).
  Records carry `id`, `createdAt`, `updatedAt` and `deletedAt` so Google Sheets sync can keep
  the newest version on conflicts. Sample records are marked `sample: true` and must never sync.
- **Calendar:** `js/services/calendar.js` uses a provider; a Google Calendar provider (via Apps
  Script) will replace the sample one without dashboard changes.
- **Releasing:** bump the version in `js/core/config.js` and `CACHE_VERSION` in `sw.js`, and list
  any new files in `sw.js` (`SHELL`) and `index.html` (`modulepreload`).
