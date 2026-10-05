import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AUTH } from '../core/auth.provider';
import { passwordMeetsRules, passwordRules } from '../core/password-rules';
import { SessionStore } from '../core/session.store';

const UNAVAILABLE = 'We could not set your password just now. Try again in a moment.';

/** The form, or the dead end a spent link lands on. */
type ScreenState = 'form' | 'expired';

/**
 * Set a new password, from the link the reset email sends.
 *
 * The reference draws the request half of reset and not this half, so the
 * markup is the accept-invitation form with its name field removed and its
 * heading changed. Feature 19 proposed exactly that and recorded that the
 * wording wants a design review; the spec carries the same note.
 *
 * There is no token in the URL to read. Supabase puts the recovery token in the
 * link's fragment and its client consumes it on load, which leaves an ordinary
 * session behind. So this screen never sees a credential: it asks for a new
 * password and lets the service say whether anyone is there to change one for.
 */
@Component({
  selector: 'app-set-password',
  imports: [RouterLink],
  templateUrl: './set-password.html',
  styleUrl: './accept-invitation.scss'
})
export class SetPasswordPage {
  private readonly auth = inject(AUTH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly state = signal<ScreenState>('form');

  protected readonly ruleList = computed(() => {
    const rules = passwordRules(this.password());

    return [
      { label: 'At least 12 characters', met: rules.longEnough },
      { label: 'One number and one symbol', met: rules.hasNumber && rules.hasSymbol },
      { label: 'Upper and lower case', met: rules.hasBothCases }
    ];
  });

  protected readonly canSubmit = computed(
    () => !this.busy() && passwordMeetsRules(this.password())
  );

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    this.problem.set('');

    this.auth
      .setPassword(this.password())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);

          if (result === 'denied') {
            // Nobody to change a password for. That is the link, not the
            // password, so the screen stops asking for one.
            this.password.set('');
            this.state.set('expired');
            return;
          }

          if (result === 'unavailable') {
            this.password.set('');
            this.problem.set(UNAVAILABLE);
            return;
          }

          // The recovery link signed them in, so they are already through: the
          // console is the right place to land, not the sign-in form.
          this.session.signIn(result);
          void this.router.navigateByUrl('/overview');
        },
        error: () => {
          this.busy.set(false);
          this.password.set('');
          this.problem.set(UNAVAILABLE);
        }
      });
  }
}

