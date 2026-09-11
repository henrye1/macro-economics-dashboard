import { InjectionToken } from '@angular/core';

/** Resolves when the text is on the clipboard, rejects when it is refused. */
export type RequestClipboard = (text: string) => Promise<void>;

/**
 * Writing to the clipboard, behind a token so specs never touch the real one.
 *
 * Matches `EXPORT_DOWNLOADER` and `SAVED_QUERY_STORAGE`: the browser API that
 * can refuse, prompt, or be absent is the one thing a spec should not depend on.
 *
 * A refusal is ordinary rather than exceptional. `navigator.clipboard` is
 * undefined on an insecure origin and rejects without a user gesture or when
 * permission is denied, so the caller reports it and the curl stays on screen to
 * be selected by hand.
 */
export const REQUEST_CLIPBOARD = new InjectionToken<RequestClipboard>('REQUEST_CLIPBOARD', {
  providedIn: 'root',
  factory: () => writeToClipboard
});

function writeToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return Promise.reject(new Error('This browser does not allow copying to the clipboard.'));
  }

  return navigator.clipboard.writeText(text);
}
