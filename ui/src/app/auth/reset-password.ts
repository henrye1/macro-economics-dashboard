import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AUTH } from '../core/auth.provider';

const UNAVAILABLE = 'We could not send the link just now. Try again in a moment.';

/**
 * Request a password reset link.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account. A form that answers differently tells anyone who asks which
 * addresses are registered, and the design's own copy is hedged the same way.
 *
 * Only the request half exists. The screen that consumes the emailed link is
 * not in the reference and is out of scope for feature 19.
 */
@Component({
  selector: 'app-reset-password',
  imports: [RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './auth-form.scss'
})
export class ResetPasswordPage {
  private readonly auth = inject(AUTH);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly sent = signal(false);

  /** Held so the confirmation can name the address that was asked for. */
  protected readonly submitted = signal('');

  protected onEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    const address = this.email().trim();
    this.busy.set(true);
    this.problem.set('');

    this.auth.requestPasswordReset(address)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.busy.set(false);
        this.submitted.set(address);
        this.sent.set(true);
      },
      error: () => {
        // A failure to send must not render the confirmation. Telling someone
        // to wait for an email that is not coming is worse than an error.
        this.busy.set(false);
        this.problem.set(UNAVAILABLE);
      }
    });
  }
}
