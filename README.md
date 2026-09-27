# Life Dashboard

A personal life dashboard — workouts, to-do list and (later) neurology — built as a
Progressive Web App: plain HTML, CSS and JavaScript with no build step, installable on
iPhone, iPad and Mac, and designed to be hosted for free on GitHub Pages.

**Current status: Phase 2 — Workout core (v0.3).** Log workouts with sets, reps and weights, a rest
timer, templates, full history and a Hevy import — on top of Phase 1 (dashboard, settings, Google
Sheets sync and backups). Data is stored on each device and, once sync is set up, in your own Google Sheet.

## Install the app (from GitHub Pages)

Once GitHub Pages is switched on (repository **Settings → Pages → Branch: main, / (root)**),
the app lives at `https://<your-username>.github.io/life-dashboard/`.

- **iPhone / iPad:** open that address in Safari → **Share** (inside the **•••** menu on newer
  iPhones) → **Add to Home Screen**.
- **Mac:** open it in Safari → **File → Add to Dock**.

To publish an update: in GitHub Desktop, **Commit to main**, then **Push origin**. The installed
app picks up the new version the next time it's opened.

## Sync with Google Sheets (one-time setup, about 10 minutes)

Sync keeps a copy of your data in a Google Sheet that you own and shares it between your
iPhone, iPad and Mac. It's free and uses a small script that runs in your own Google account
([`apps-script/Code.gs`](apps-script/Code.gs)). Easiest on a Mac:

1. At [sheets.google.com](https://sheets.google.com) create a blank spreadsheet
   (e.g. "Life Dashboard Data"), then choose **Extensions → Apps Script**.
2. Delete what's in the editor, paste the whole of `apps-script/Code.gs`
   (the app's **Settings → Sync → Copy code** button copies it), and click **Save**.
3. In the toolbar, choose **setup** and click **Run**. Google asks for permission:
   **Review permissions** → pick your account → **Advanced** → **Go to … (unsafe)** → **Allow**.
   (Google shows this for any personal script it hasn't reviewed; it's your own code.)
   Your secret token appears in the sheet's **Connection** tab.
4. **Deploy → New deployment** → gear icon → **Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, click **Deploy**, and copy the **Web app URL** (it ends in `/exec`).
5. In the app: **Settings → Sync → Sync with Google Sheets**, paste the Web app URL and the token,
   and tap **Connect**. On your other devices, do only this step, with the same URL and token.

How it works: each device keeps working offline and syncs a few seconds after each change,
when the app opens, and every few minutes. If the same item was changed on two devices, the
newest change wins and the other version is kept in the sheet's **Conflicts** tab. When a device
joins, the profile and settings already in the sheet are used. Sample data never syncs.

If you change `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version → Deploy**.

### Updating the sync script (needed once for v0.3)

Version 0.3 adds two kinds of data — your exercises and workout templates — that need the latest
script in your Google Sheet. Until it's updated they stay safely on your devices, and the app shows
**Update sync** on the dashboard and **Update the sync script** in Settings → Sync (tap it for these steps):

1. Settings → Sync → **Update the sync script** → **Copy code**.
2. In your Google Sheet: **Extensions → Apps Script**. Select all the code (⌘A), paste (⌘V), click **Save**.
3. **Deploy → Manage deployments** → pencil (**Edit**) → Version: **New version** → **Deploy**.
   (Don't make a *new deployment* — that would change the Web app URL.)
4. Back in the app, tap **Check now**. The new **Exercises** and **Workout templates** tabs appear in the sheet.

## Backups

- **Settings → Backup → Export backup** saves a complete JSON copy (on iPhone: Share → Save to Files).
  Backup files never include your sync token.
- **Restore from backup…** shows what's in the file, then **Merge** (keep the newest of each item)
  or **Replace** (use only the backup). Both can be undone right after.
- A weekly reminder appears on the dashboard if you have real data, no recent backup, and sync isn't working.
- New phone? Install the app, then connect sync — everything comes back from your sheet.

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

## Workouts (Phase 2)

- **Start Workout** (Main dashboard or the Workout tab) asks for confirmation, then what you're training
  (Push, Pull, Legs, Chest… — several allowed; your split suggests one), then offers exercises that fit.
  Or start from a **template** (Push / Pull / Leg Day starters, or your own).
- **Logging:** each exercise shows *Previous: 70 kg × 8*; the grey hints in each box are last time's numbers,
  and ticking ✓ on an empty set uses them. Tap the set number for warm-up / drop / failure sets, notes or
  delete; ⋯ on an exercise for notes, rest time, supersets, reorder, replace or remove. The effort column is
  RIR or RPE (Settings → Workout). Everything saves the moment you change it.
- **Timers:** the workout timer (with Pause, which asks first, and End Workout) is calculated from the start
  time, so it's right even after the phone locks. Ticking a set starts the **rest between sets**; ticking the
  last set of an exercise starts the **rest between exercises** (Settings → Workout, 2 min to start with).
  Both have −15 / +15 / +30 / Skip. When a rest is over (while the app is open) you hear a chime — two notes
  before your next set, three before your next exercise — and the screen edge glows. The chime plays over your
  music; on iPhone it's quiet when the phone is on silent unless you turn on **Chime even on silent** (music
  apps pause while it plays — iPhone doesn't let web apps do both). A small bar above the tabs shows a
  workout in progress while you look at other screens.
- **History:** every workout with filters (dates, muscle group, exercise, template); open one to edit it,
  do it again, save it as a template, or delete it (with Undo).
- **Exercise library:** ~200 exercises named like Hevy's, plus your own; favourites, notes, rest time per
  exercise, a video link, and each exercise's history and best set.
- **Hevy:** in Hevy go to Settings → Export & Import Data → Export Workouts, save the CSV to Files, then in
  this app choose **Import Hevy** (Workout tab) or Settings → Hevy. You'll see a preview first; workouts you
  already have are skipped, so importing again later is safe. **Export workouts (CSV)** writes the same format.

## What Phase 1 includes

- Five-tab navigation (Workout · To Do · **Main** · Neurology · Settings) with the Main button
  centred and larger; swipe between tabs on touch screens; a side rail on iPad landscape and Mac.
- Main dashboard: profile photo, nickname, date, today's calendar (or a daily quote), Today at a
  Glance, and collapsible module cards you can reorder (Arrange → drag the handles).
- Settings: profile, theme (dark/light/system), workout and task preferences, Google Sheets sync,
  backup export/restore with reminders, sample-data switches, delete-all-data.
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
js/modules/workout/   Workout pieces: model, exercise library, logger, rest timer, templates,
                      history, Hevy import/export
js/screens/           Dashboard, settings, welcome
js/services/          Sync, backup, calendar provider, sample data, storage, images
apps-script/Code.gs   Google Sheets sync script (runs in your Google account)
icons/                App icons (edit the SVGs, then run tools/make-icons.py)
tools/                Local preview server and icon generator
tools/sync-test/      Test Code.gs on a Mac without Google: test_code_gs.py (checks) and
                      mock_server.py (pretend web app at http://127.0.0.1:8124/macros/s/TEST/exec;
                      --code OLD.gs runs an older script, to test the update notice)
```

### Notes for future phases

- **New life category:** add a file in `js/modules/` (see the comment in `registry.js`) and
  import it in `js/modules/index.js`. It appears on the dashboard automatically.
- **Database changes:** append a migration in `js/core/schema.js` (never edit an old one).
  Records carry `id`, `createdAt`, `updatedAt` and `deletedAt` so sync can keep the newest
  version on conflicts. Save synced records with `saveRecord()` (`js/core/records.js`) so they're
  queued for sync; delete by setting `deletedAt`, never by removing the record. New synced
  stores must be added to `SYNC_STORES` (schema.js) and `STORES` (Code.gs). Sample records are
  marked `sample: true` and never sync.
- **Pages inside a tab:** a tab can have sub-pages (`#/workout/history`). The router passes the part after
  the tab id to the screen (`onShow(view, sub)` / `onRoute(view, sub)`); open one with
  `openPage('workout', 'history')` and go back with `goBack()`. See `js/modules/workout.js` for a table of pages.
- **Workouts** are one record each with their exercises and sets inside (see `js/modules/workout/model.js`);
  the built-in exercise list lives in code (`library.js`) and the `exercises` store only keeps your own
  exercises and your changes to built-in ones. Never rename a built-in exercise: its id comes from its name.
- **Sync script versions:** `SCRIPT_VERSION` in `Code.gs` and `LATEST_SCRIPT_VERSION` / `STORE_SCRIPT_VERSION`
  in `sync.js`. A new synced store that an older script can't save waits in the outbox until the script is updated.
- **Calendar:** `js/services/calendar.js` uses a provider; a Google Calendar provider (via Apps
  Script) will replace the sample one without dashboard changes.
- **Releasing:** bump the version in `js/core/config.js` and `CACHE_VERSION` in `sw.js`, and list
  any new files in `sw.js` (`SHELL`) and `index.html` (`modulepreload`).
