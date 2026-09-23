import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AUTH, type Invitation, type InvitationStatus } from '../core/auth.provider';
import { passwordMeetsRules, passwordRules } from '../core/password-rules';
import { SessionStore } from '../core/session.store';

const DENIED = 'This invitation could not be accepted. Ask for a new one.';
const UNAVAILABLE = 'We could not activate your account just now. Try again in a moment.';

/** `loading` while the token is being resolved, then the invitation's own status. */
type ScreenState = 'loading' | InvitationStatus;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

/**
 * Accept an invitation, or explain why you cannot.
 *
 * Four of the five states are dead ends that share one screen. The reference
 * draws only the expired one, so revoked and unknown reuse its shape with their
 * own sentence rather than inventing a layout the design does not have.
 */
@Component({
  selector: 'app-accept-invitation',
  imports: [RouterLink],
  templateUrl: './accept-invitation.html',
  styleUrl: './accept-invitation.scss'
})
export class AcceptInvitationPage {
  private readonly auth = inject(AUTH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly invitation = signal<Invitation | null>(null);
  protected readonly state = signal<ScreenState>('loading');
  protected readonly fullName = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal('');

  protected readonly ruleList = computed(() => {
    const rules = passwordRules(this.password());

    return [
      { label: 'At least 12 characters', met: rules.longEnough },
      { label: 'One number and one symbol', met: rules.hasNumber && rules.hasSymbol },
      { label: 'Upper and lower case', met: rules.hasBothCases }
    ];
  });

  protected readonly canSubmit = computed(
    () => !this.busy() && this.fullName().trim() !== '' && passwordMeetsRules(this.password())
  );

  /** The dead-end sentence, which differs by how the invitation died. */
  protected readonly deadEnd = computed(() => {
    const invite = this.invitation();
    const state = this.state();

    if (state === 'expired' && invite !== null) {
      return (
        'Invitations expire seven days after they are sent. This one was sent to ' +
        `${invite.email} on ${asDate(invite.sentAt)} and expired on ` +
        `${asDate(invite.expiresAt)}.`
      );
    }

    if (state === 'revoked') {
      return 'This invitation was withdrawn by an administrator before it was accepted.';
    }

    return 'This invitation link does not match any invitation we hold.';
  });

  constructor() {
    const token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

    this.auth.invitation(token).pipe(takeUntilDestroyed()).subscribe({
      next: (invite) => {
        this.invitation.set(invite);
        this.state.set(invite.status);
      },
      // An unresolvable token is a dead end, not a broken screen. `unknown`
      // already has copy that fits, so the error path reuses it.
      error: () => this.state.set('unknown')
    });
  }

  protected onName(event: Event): void {
    this.fullName.set((event.target as HTMLInputElement).value);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    const invite = this.invitation();
    if (!this.canSubmit() || invite === null) {
      return;
    }

    this.busy.set(true);
    this.problem.set('');

    this.auth
      .acceptInvitation(invite.token, this.fullName(), this.password())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (result) => {
        this.busy.set(false);

        if (result === 'denied' || result === 'unavailable') {
          this.password.set('');
          this.problem.set(result === 'denied' ? DENIED : UNAVAILABLE);
          return;
        }

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

function asDate(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : DATE_FORMAT.format(parsed);
}
