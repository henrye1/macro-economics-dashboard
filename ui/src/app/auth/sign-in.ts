import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AUTH } from '../core/auth.provider';
import { SessionStore } from '../core/session.store';
import { safeReturnUrl } from './session.guard';

const DENIED = 'That email address and password do not match an account.';
const UNAVAILABLE = 'Sign-in is unavailable. Try again in a moment.';

/**
 * Sign in.
 *
 * The form is deliberately plain state rather than Angular forms: three
 * signals, one submit, and no validation the design does not draw. An empty
 * field is refused by the same "does not match" message as a wrong one, so the
 * screen never reports which half was wrong.
 */
@Component({
  selector: 'app-sign-in',
  imports: [RouterLink],
  templateUrl: './sign-in.html',
  styleUrl: './auth-form.scss'
})
export class SignInPage {
  private readonly auth = inject(AUTH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');

  /** Whether the last attempt was refused, for the fields' invalid state. */
  protected readonly denied = signal(false);

  protected onEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  /**
   * The native submit event, not `ngSubmit`: this form is three signals and a
   * handler, so pulling in `FormsModule` for one directive would buy nothing.
   */
  protected submit(event: Event): void {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.problem.set('');

    this.auth.signIn(this.email(), this.password())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (result) => {
        this.busy.set(false);

        if (result === 'denied' || result === 'unavailable') {
          // The address stays in the field. Clearing it would make a typo in
          // the password cost the visitor both.
          this.denied.set(true);
          this.password.set('');
          this.problem.set(result === 'denied' ? DENIED : UNAVAILABLE);
          return;
        }

        this.denied.set(false);
        this.session.signIn(result);
        void this.router.navigateByUrl(
          safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'))
        );
      },
      error: () => {
        // Anything the provider did not classify is unexpected, and is reported
        // as unavailable rather than as a rejected credential.
        this.busy.set(false);
        this.password.set('');
        this.problem.set(UNAVAILABLE);
      }
    });
  }
}
