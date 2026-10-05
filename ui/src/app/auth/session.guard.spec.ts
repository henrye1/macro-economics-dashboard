import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  Router,
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot
} from '@angular/router';
import { Observable } from 'rxjs';

import { SessionStore } from '../core/session.store';
import { sessionGuard } from './session.guard';

/**
 * A store whose hydration the test finishes by hand.
 *
 * It models the real store's one promise: `ready` settles after hydration has
 * set `signedIn`, never before. Supabase restores a persisted session
 * asynchronously, which is the whole reason the guard waits.
 */
function hydratingStore() {
  let finish!: () => void;
  const signedIn = signal(false);
  const ready = new Promise<void>((resolve) => (finish = resolve));

  return {
    store: { ready, signedIn: signedIn.asReadonly() },
    hydrate(withSession: boolean): void {
      signedIn.set(withSession);
      finish();
    }
  };
}

describe('sessionGuard', () => {
  let hydration: ReturnType<typeof hydratingStore>;
  let emitted: unknown[];

  beforeEach(() => {
    hydration = hydratingStore();
    emitted = [];

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SessionStore, useValue: hydration.store }]
    });

    const state = { url: '/series?indicator=NGDP_RPCH' } as RouterStateSnapshot;
    const result = TestBed.runInInjectionContext(() =>
      sessionGuard({} as ActivatedRouteSnapshot, state)
    ) as Observable<boolean | UrlTree>;

    result.subscribe((value) => emitted.push(value));
  });

  /** Lets the settled `ready` promise and its continuation run. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('decides nothing while the session is still being restored', async () => {
    await settle();

    // A guard that read `signedIn()` now would see false and bounce a
    // signed-in visitor who had just reloaded the tab.
    expect(emitted).toEqual([]);
  });

  it('admits a visitor once hydration finds a session', async () => {
    hydration.hydrate(true);
    await settle();

    expect(emitted).toEqual([true]);
  });

  it('sends a visitor with no session to sign-in, carrying where they were going', async () => {
    hydration.hydrate(false);
    await settle();

    expect(emitted.length).toBe(1);
    const tree = emitted[0] as UrlTree;
    expect(tree).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe(
      '/sign-in?returnUrl=%2Fseries%3Findicator%3DNGDP_RPCH'
    );
  });
});
