# Life Dashboard

A personal life dashboard — workouts, to-do list and (later) neurology — built as a
Progressive Web App: plain HTML, CSS and JavaScript with no build step, installable on
iPhone, iPad and Mac, and designed to be hosted for free on GitHub Pages.

**Current status: Phase 3 — Tasks and productivity (v0.4.2, the third of seven small releases).** A real
to-do list with priorities, dates and times, categories, subtasks and links, smart views, search and sorting,
fast capture — type tasks in plain words, a + button on every tab, a tap-a-task quick menu and swipes — and
reminders for tasks and subtasks (subtasks can have their own date and time), with "Still not done" follow-ups —
on top of Phase 2 (workouts, and ward rounds from your logsheet in **Ward Patients**, Neurology tab) and
Phase 1 (dashboard, settings, Google Sheets sync and backups). Data is stored on each device and, once sync is
set up, in your own Google Sheet.

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

### Updating the sync script

Some app versions need a newer script in your Google Sheet: v0.3 needs script version 2 (your exercises
and workout templates get their own tabs), v0.3.2 needs version 3 (Ward Patients), v0.3.4 needs
version 4 (editing lab results), v0.4 needs version 5 (your tasks get readable tabs, and tasks can go
into Google Calendar) and v0.4.2 brings **version 6** (each subtask's own date, time and reminders show in the
Subtasks tab, and subtasks can go into Google Calendar too). Each version includes everything before it, so
one update is enough however old yours is. Until it's updated, everything else keeps syncing and anything new
stays safely on your devices; the app shows **Update sync** on the dashboard and **Update the sync script** in
Settings → Sync (tap it for these steps):

1. Settings → Sync → **Update the sync script** → **Copy code**.
2. In your Google Sheet: **Extensions → Apps Script**. Select all the code (⌘A), paste (⌘V), click **Save**.
   Near the top, a line should now read `const SCRIPT_VERSION = 6;`.
3. **Once, after pasting:** in the toolbar choose **setup** and click **Run** (it keeps your token, so your devices
   stay connected). If Google asks for permission (coming from version 4 or older it will, now including Google
   Calendar): **Review permissions** → your account → **Advanced** → **Go to … (unsafe)** → **Allow**. This also
   tidies the task tabs and starts a 30-minute check used by the Calendar link.
4. **Deploy → Manage deployments** → pencil (**Edit**) → Version: **New version** → **Deploy**.
   (Don't make a *new deployment* — that would change the Web app URL.)
5. Back in the app, tap **Check now**. To double-check, open the Web app URL in Safari: it should end with
   `"version":6`.

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

## To Do (Phase 3)

The To Do tab is a full task list (v0.4.0) with fast capture (v0.4.1) and reminders (v0.4.2). The Google
Calendar link, repeating tasks, the focus timer and habits arrive in the next small updates (0.4.3 – 0.4.6).

- **Type a task the way you'd say it** in the box at the top of To Do, or after tapping **+** (bottom right, on every
  tab): *Finish STRAMA paper tomorrow 8pm #MBA !!!* becomes "Finish STRAMA paper", tomorrow at 8:00 PM, MBA, High.
  What the box understands shows as chips under it — tap a chip to keep those words in the name instead. It knows
  dates (today, tonight, tomorrow, Friday, next Monday, in 3 days, Oct 3, 10/15), times (8pm, 8:30 PM, 20:00, noon,
  8–9 PM), priority (! low, !! medium, !!! high), #category (the start of a name is enough) and @tags. When something
  could mean two things — "3/10", "at 8" — it asks before adding. The **?** in the box lists everything.
  Enter or **Add** adds the task; **Details** opens the full task sheet with everything filled in.
- **The + button** opens Quick Add at the top of the screen (the keyboard never covers it): a new task, or
  **Start workout**. Start focus and Log habit join it later.
- **A task** has a name, a priority (High, Medium, Low or None — always shown as a coloured dot *and* a word), a date,
  an optional time or time range, a category, tags, notes, subtasks and links. Pin a task to keep it at the top and
  always in Today. One tap adds one task; adding the same task twice within a minute asks **Keep both** or **Merge**.
- **Tap a task** for the quick menu: **Complete** in the middle and four actions around it (to start with: Move to
  tomorrow, Details, Delete and Pin — Reminder and Focus take the top and left places when they arrive). Choose the
  four in Settings → Tasks → Quick menu. Everything has Undo.
- **Swipes (iPhone, iPad):** swipe a task right to complete it, left to move it to tomorrow.
- **Reminders:** in a task's sheet, tap **10 min**, **30 min** or **1 hour before** (several at once), or **Custom** —
  any number of minutes, hours or days before, or an exact date and time. Also from the quick menu's **Reminder**
  button, or by typing "remind me 30 min before". A task with a date but no time reminds you counting from 8:00 AM
  (Settings → Tasks → Reminders, where you can also give new tasks a reminder automatically). The row shows a bell
  with the next reminder's time.
- **When one rings:** a banner at the top of any screen, with a chime — **Complete · Snooze · Stop · Open**. Stop means
  "seen it": if the task still isn't ticked, **Still not done** follows 2 hours later, up to 2 times, never between
  10 PM and 8 AM (all changeable in Settings; per task too, or off). Ticking a task on any device stops its follow-ups.
  Anything that came due while the app was closed is listed in **Missed while the app was closed** when you open it.
- **iPhone limit:** reminders ring only while Life Dashboard is open on your screen (and sound needs a tap after it
  opens). Google Calendar alerts, which also ring on a locked phone, arrive in 0.4.3. **Try a reminder** in Settings
  shows and plays one.
- **Subtasks with their own time:** the clock button on a subtask gives it its own date, time and reminders. A subtask
  with a date also shows as its own row in Today, Upcoming and Overdue, with its task's name under it — tap it for its
  menu, tick it, or swipe it like a task.
- **Mac keys:** N new task · / search · ↑ ↓ move between tasks · Space complete · Enter quick menu · ? help ·
  ⌘Enter save · Esc closes the quick menu.
- **Nothing you type is lost by accident:** the task sheet, Quick Add and the small boxes for a link, a subtask or a
  category name close only with their own buttons (Cancel, Done, Add task, Close) — a tap outside or Esc just gives
  a little bounce. Cancelling a new task you've typed something into asks first.
- **Views:** Today (overdue, due today and pinned), Upcoming (the next 7 days, by day), Overdue, By category, All and
  Completed (with when you did each one). Settings → Tasks → Views hides views or changes their order, and
  List spacing makes the list compact. The search box looks in names, notes, tags and categories.
- **Sort** (top right): Smart — overdue first, then pinned, then High → Medium → Low → None, earliest time first —
  or Priority, Time, Recently added, Category or Manual (drag ≡). Automatic sorting can be switched off so tasks stay
  put until you choose Sort now.
- **Ticking:** the circle on the right ticks a task (with Undo); a task stays visible, moves to a "Completed today"
  group or hides, as you choose in Settings → Tasks. Ticking a task's last subtask offers to complete the task too.
- **Move to tomorrow** (in a task) always changes the task's date — it's never used for reminders.
- **Deleting** asks first and can be undone; deleted tasks stay in ⋯ → **Recently deleted** for 30 days. They're never
  erased: backups and your Google Sheet keep them.
- **Categories** (⋯ → Categories, or Settings → Tasks): add, rename, recolour, change the icon, reorder, or delete —
  deleting asks where its tasks should go.
- **Main dashboard:** the To Do card lists what's left today and lets you tick tasks; Today at a Glance shows tasks
  left, overdue, the top priority and the next timed task.
- **Manila time:** days roll over at midnight Manila time, even if a device is set to another time zone.
- **Export tasks (CSV)** is in Settings → Backup (and ⋯ in the To Do tab). It opens cleanly in Excel, Numbers and
  Google Sheets.
- **In your Google Sheet** (script version 5; 6 adds subtasks' own date, time and reminders): the Tasks, Subtasks and
  Task categories tabs have readable columns — priority as "High", times like "2026-09-27 08:15" (Manila time),
  reminders like "30 min before", categories by name and id. The Sheet is a copy for reading: change tasks in the app.

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

## Ward census: Ward Patients (Neurology tab, Phase 2)

**Neurology → Ward Patients** shows your ward logsheet — a Google Sheet — as a rounds list.

- **Logsheet layout:** patients from row 2: **A** Name, **B** Hospital Number, **C** Laboratory Results,
  **D** Recommendations. Rows without a name are ignored; the hospital number identifies each patient.
- **The list:** patients not yet rounded come first, by the priority written in their recommendations:
  **P1** (high — the word "priority" on its own counts as P1), then **P2**, then **P3**; then the others not
  yet rounded, then those rounded — each group in the sheet's order. Capitals don't matter, and if a note
  has more than one, the most urgent counts. Each priority shows a flag and words ("P1 · High"), not just a
  colour. Cards on iPhone, a table on iPad landscape and Mac. Long labs and recommendations fold behind
  **Show more**; tap a patient for everything.
- **Always current:** it reloads when you open it, with **Refresh**, and every 3 minutes while it's on
  screen. Offline, the last list stays with an "Offline — last updated at …" note.
- **Colours:** Neurology is green.
- **Rounds:** **Start Rounds** / **End Rounds** time the session. During rounds, opening a patient starts
  their timer and ticking **Rounded** records the end time and duration ("5 of 12 rounded"). Unticking
  asks first and clears the end time. Ticks reset at midnight, Manila time. Each device keeps a daily
  rounds history (⋯ → Rounds history): dates, times and hospital numbers.
- **Saved to the logsheet:** ticks go to columns **E–G** (Rounded, Rounds Start, Rounds End — the headings
  are added only if E1:G1 are empty; if they hold anything else the app stops and asks). Lab results and
  recommendations can be edited in a patient's sheet (**Edit**) and go back to columns **C** and **D**.
  Names and hospital numbers (A, B) are never changed, and rows are never added, deleted or moved. Before each write the app finds the patient's row again by hospital number and checks the cell
  hasn't changed; if someone else changed it, you see both versions and choose. Changes that can't be saved
  yet stay on the device, marked **Not synced**, and are retried automatically.
- **Private by design:** the logsheet link, the patient list and the rounds history stay on each device —
  never synced to your Life Dashboard sheet, never in backup files, the app's code or its logs.
- It works through your sync script (version 4, running as you), so sync must be set up on the device.
  Edited lab results wait on the device until the script is version 4.

Setting it up (once the sync script is updated):

1. Make sure the logsheet is shared — with edit access — with the Google account that owns your Life
   Dashboard sheet (the account the sync script runs as).
2. In the app: **Neurology → Ward Patients → Link logsheet**. Paste the logsheet's link (from the address
   bar, or Share → Copy link) and its tab name (Sheet1 unless yours is different), then **Check logsheet**
   → **Link this logsheet**. Do this on each device: the link is never shared between them.
3. To try it first, choose **Create a practice logsheet**: made-up patients in a new sheet in your Google
   Drive. Change to your real logsheet later from ⋯ → **Change logsheet** (or Settings → Neurology).

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
css/                  Design tokens, base, components, layout, screens, workout, ward, todo
js/main.js            Start-up
js/core/              Database, state, navigation, UI helpers, icons, dates (manila.js: Manila time for tasks)
js/modules/           Life categories (workout, todo, neurology) + registry
js/modules/workout/   Workout pieces: model, exercise library, logger, rest timer, templates,
                      history, Hevy import/export
js/modules/todo/      To Do: model (views, sorting, search, CSV), store (saving), rows, list (the screen),
                      detail (the task sheet), pages (Recently deleted, Categories, Views, export),
                      parse (plain words → a task), capture (the typing box), quickmenu (tap a task),
                      gestures (swipes, Mac keys), task-actions (complete, tomorrow, delete… with Undo),
                      alerts (when reminders ring; snooze and follow-ups), reminders (the banner and
                      the missed list), reminder-ui (choosing reminders), subtask-sheet (a subtask's
                      own date, time and reminders)
js/core/quick-add.js  The + button on every tab and the Quick Add sheet
js/modules/ward/      Ward Patients (Neurology): model (Manila time, sorting), engine (list, rounds,
                      changes waiting to be saved), page (screen, patient sheet, history), store
js/screens/           Dashboard, settings, welcome
js/services/          Sync, backup, calendar provider, sample data, storage, images
apps-script/Code.gs   Google Sheets sync script (runs in your Google account)
icons/                App icons (edit the SVGs, then run tools/make-icons.py)
tools/                Local preview server, icon generator, and todo-checks.html (checks the task logic and
                      the plain-words reader in the browser: open
                      http://localhost:8000/tools/todo-checks.html while previewing)
tools/sync-test/      Test Code.gs on a Mac without Google: test_code_gs.py (checks) and
                      mock_server.py (pretend web app at http://127.0.0.1:8124/macros/s/TEST/exec;
                      --code OLD.gs runs an older script, to test the update notice; /__ward/… edits
                      a pretend logsheet like a co-resident would). Made-up patients only. The checks also
                      cover the to-do tabs and the Google Calendar link (with a pretend calendar).
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
  Version 3 adds the Ward Patients actions (`wardCheck`, `wardSync`, `wardCreateTest`), which open the logsheet
  by the ID the app sends; the app reaches them with `callSyncScript()`.
- **To Do:** tasks, subtasks (`subtasks` store) and categories sync; tasks and subtasks wait for script version 5,
  so they always arrive together. Task dates are Manila days (`js/core/manila.js`). The Google Calendar link's state
  lives in the script's own **Calendar links** tab (`calendarLinks`), which the app will read from 0.4.3 — the script
  keeps it next to the task rather than inside it, so it never competes with your edits. Starting categories carry a
  fixed old timestamp, so a device that joins later can't overwrite a category renamed elsewhere.
- **Reminders:** a task's or subtask's `reminders` (`{ kind: 'before', minutes }` or `{ kind: 'at', at }`) and `followUp`
  are read by the sync script too (Calendar alerts), so keep that shape. What has rung lives in `alerts` on the item
  and is changed only by `saveAlerts()` (store.js); every other save keeps the saved copy's `alerts`
  (`settleAlerts()` in alerts.js), so a sheet that was open while a reminder rang can't make it ring again. The
  engine is `js/modules/todo/reminders.js`; the rules (and their checks in todo-checks.html) are in `alerts.js`.
- **Ward Patients data** is device-only: the `wardDays` and `wardQueue` stores and the `ward` / `wardCache`
  meta keys are never synced or backed up. Never log patient data or put a logsheet link in the code.
- **Calendar:** `js/services/calendar.js` uses a provider; a Google Calendar provider (via Apps
  Script) will replace the sample one without dashboard changes.
- **Releasing:** bump the version in `js/core/config.js` and `CACHE_VERSION` in `sw.js`, and list
  any new files in `sw.js` (`SHELL`) and `index.html` (`modulepreload`).
