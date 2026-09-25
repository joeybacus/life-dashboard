/* First launch: say hello and ask for a nickname (optional). */
import { db } from '../core/db.js';
import { updateProfile } from '../core/state.js';
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { openDialog } from '../core/ui.js';
import { nowISO } from '../core/dates.js';

export async function maybeShowWelcome() {
  if (await db.get('meta', 'welcomed')) return;
  let input = null;
  await openDialog({
    variant: 'modal',
    className: 'welcome',
    dismissible: false,
    body: html`
      <img class="welcome__logo" src="icons/icon.svg" alt="" width="68" height="68">
      <h2 class="dlg__title" id="welcome-title">Welcome to Life Dashboard</h2>
      <p class="welcome__lead">Your personal command center for workouts, tasks and more.</p>
      <div class="welcome__field">
        <label class="welcome__label" for="welcome-nickname">What should we call you?</label>
        <input class="input" id="welcome-nickname" type="text" maxlength="30" autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="Your nickname">
      </div>
      <p class="note">${icon('info')}<span>You’re seeing <strong>sample data</strong> so you can explore. Turn it off anytime in Settings → Data.</span></p>`,
    actions: [{ label: 'Get started', value: 'start', variant: 'primary' }],
    onOpen(dlg, close) {
      dlg.setAttribute('aria-labelledby', 'welcome-title');
      input = dlg.querySelector('#welcome-nickname');
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          close('start');
        }
      });
    },
  });
  const nickname = (input?.value ?? '').trim().slice(0, 30);
  if (nickname) await updateProfile({ nickname }, { source: 'welcome' });
  await db.put('meta', { key: 'welcomed', value: nowISO() });
}
