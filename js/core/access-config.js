/* The app's lock (Settings → Lock and invites). The preview on your Mac writes this file when
   you set the master password — don't edit it by hand. null = no lock: anyone with the link can open the app.
   Nothing here reveals the password: it holds a check value, a public key for checking invites, and the
   invite-signing key locked with the master password. */
export const ACCESS = null;
