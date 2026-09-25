/* Module registry — the plug-in point for life categories.

   A module describes itself once and the dashboard, navigation and backup pick
   it up automatically. To add a new category later (Finance, Habits, …), create
   a file like workout.js, call registerModule(), and import it in modules/index.js.

   registerModule({
     id: 'workout',                      unique id (also the dashboard card id)
     title: 'Workout',
     icon: 'dumbbell',                   name from core/icons.js
     accent: 'workout',                  accent colour (see .accent-* in tokens.css)
     status: 'active' | 'planned',
     load(now)    → Promise<model>       gather the data the card needs
     summary(m)   → { text, progress (0–1 or null), ringText, ringLabel, idleIcon }
     body(m)      → html                 expanded card content
     glance(m)    → [{ id, order, icon, accent, label, value, big, sub, subTone, action, data }]
   })
*/
const modules = [];

export function registerModule(def) {
  if (modules.some((m) => m.id === def.id)) throw new Error(`Module "${def.id}" is already registered`);
  modules.push(def);
}

export const getModules = () => modules;
export const getModule = (id) => modules.find((m) => m.id === id);
