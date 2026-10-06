import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from '../app';
import { routes } from '../app.routes';
import { Observable, of } from 'rxjs';

import { AUTH, type Invitation, type PasswordRejection, type Session } from '../core/auth.provider';
import {
  FIXTURE_REFUSED_TOKEN,
  FixtureAuthProvider
} from '../core/fixtures/fixture-auth.provider';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { provideNoSession } from '../core/fixtures/signed-in-session';
import { MACRO_DATA } from '../core/macro-data.provider';
import { SessionStore } from '../core/session.store';

/** The fixture, but the project refuses every password as too weak. */
class WeakPasswordAuth extends FixtureAuthProvider {
  override acceptInvitation(): Observable<Session | PasswordRejection> {
    return of('weak-password');
  }
}

/** What the real provider answers for a link Supabase refused: no dates to show. */
class RefusedLinkAuth extends FixtureAuthProvider {
  override invitation(): Observable<Invitation> {
    return of({
      token: '',
      email: '',
      organisation: '',
      role: '',
      invitedBy: '',
      sentAt: '',
      expiresAt: '',
      status: 'expired'
    });
  }
}

async function open(
  token: string,
  auth: new () => FixtureAuthProvider = FixtureAuthProvider,
  path = `/accept-invite/${token}`
): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoSession(),
      { provide: MACRO_DATA, useClass: FixtureMacroDataProvider },
      { provide: AUTH, useClass: auth }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl(path);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function type(fixture: ComponentFixture<App>, name: string, value: string): void {
  const input = host(fixture).querySelector<HTMLInputElement>(`input[name="${name}"]`);
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('Accept invitation', () => {
  describe('a valid invitation', () => {
    let fixture: ComponentFixture<App>;

    beforeEach(async () => {
      fixture = await open('valid-token');
    });

    it('shows who was invited, by whom, and as what', () => {
      const values = Array.from(host(fixture).querySelectorAll('.invite dd')).map((d) =>
        d.textContent?.trim()
      );

      expect(values).toEqual([
        'lerato.khumalo@cyte.co.za',
        'Treasury Risk',
        'Member',
        'Thandi Mokoena'
      ]);
    });

    it('holds the button until a name and every password rule are in', () => {
      const button = () => host(fixture).querySelector<HTMLButtonElement>('.auth-submit')!;

      expect(button().disabled).toBeTrue();

      type(fixture, 'fullName', 'Lerato Khumalo');
      expect(button().disabled).withContext('name alone').toBeTrue();

      type(fixture, 'password', 'short1!A');
      expect(button().disabled).withContext('too short').toBeTrue();

      type(fixture, 'password', 'Correct-horse-1');
      expect(button().disabled).withContext('all rules met').toBeFalse();
    });

    it('points the password field at both its rules and its message', () => {
      const described = host(fixture)
        .querySelector('input[name="password"]')
        ?.getAttribute('aria-describedby')
        ?.split(' ');

      expect(described).toContain('password-rules');
      expect(described).toContain('accept-problem');
      for (const id of described ?? []) {
        expect(host(fixture).querySelector('#' + id)).withContext(id).toBeTruthy();
      }
    });

    it('marks each rule as it is met, in text as well as colour', () => {
      type(fixture, 'password', 'correcthorse');

      const items = Array.from(host(fixture).querySelectorAll('.rules li'));
      const met = items.map((li) => li.classList.contains('met'));

      expect(met).toEqual([true, false, false]);
      expect(items[0]?.textContent).toContain('met');
      expect(items[1]?.textContent).toContain('not met yet');
    });

    it('activates the account and lands in the console, signed in', async () => {
      type(fixture, 'fullName', 'Lerato Khumalo');
      type(fixture, 'password', 'Correct-horse-1');
      host(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      // The emailed link already signed them in; setting the password is the
      // last step, as after a reset.
      expect(TestBed.inject(Router).url).toBe('/overview');
      expect(TestBed.inject(SessionStore).session()?.fullName).toBe('Lerato Khumalo');
    });
  });

  it('reports a refusal at acceptance without losing the form', async () => {
    const fixture = await open(FIXTURE_REFUSED_TOKEN);
    type(fixture, 'fullName', 'Kabelo Botha');
    type(fixture, 'password', 'Correct-horse-1');
    host(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const after = host(fixture);

    expect(after.querySelector('.problem')?.textContent?.trim()).toBe(
      'We could not activate your account just now. Try again in a moment.'
    );
    // The form stays, the password does not: the invitee can try again without
    // re-reading the link, but not with a password the screen still shows.
    expect(after.querySelector('form')).toBeTruthy();
    expect(after.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe('');
    expect(TestBed.inject(SessionStore).signedIn()).toBeFalse();
  });

  it('keeps the form and says why when the project refuses the password', async () => {
    const fixture = await open('valid-token', WeakPasswordAuth);
    type(fixture, 'fullName', 'Lerato Khumalo');
    type(fixture, 'password', 'Correct-horse-1');
    host(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const after = host(fixture);

    expect(after.querySelector('.problem')?.textContent?.trim()).toBe(
      'That password is too easy to guess, or has appeared in a known data breach. Choose a different one.'
    );
    expect(after.querySelector('form')).toBeTruthy();
    expect(after.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe('');
    expect(TestBed.inject(SessionStore).signedIn()).toBeFalse();
  });

  it('answers the address Supabase\'s email links to, which carries no token', async () => {
    const page = host(await open('', RefusedLinkAuth, '/accept-invite'));

    expect(page.querySelector('h2')?.textContent?.trim()).toBe('This invitation is no longer valid');
  });

  describe('a dead end', () => {
    it('names both dates when the invitation expired, without promising a lifetime', async () => {
      const text = host(await open('expired-token')).querySelector('.alert')?.textContent ?? '';

      expect(text).toContain('d.jacobs@cyte.co.za');
      expect(text).toContain('8 September 2026');
      expect(text).toContain('15 September 2026');
      expect(text).not.toContain('seven days');
    });

    it('says the link expired or was used when Supabase refused it with no dates', async () => {
      const text = host(await open('', RefusedLinkAuth, '/accept-invite')).querySelector('.alert')?.textContent;

      expect(text?.trim()).toBe('This invitation link has expired or has already been used.');
    });

    it('says something different when it was revoked', async () => {
      const text = host(await open('revoked-token')).querySelector('.alert')?.textContent ?? '';

      expect(text).toContain('withdrawn by an administrator');
      expect(text).not.toContain('expire');
    });

    it('treats a token nobody issued as a dead end, not an error', async () => {
      const page = host(await open('typo'));

      expect(page.querySelector('h2')?.textContent?.trim()).toBe(
        'This invitation is no longer valid'
      );
      expect(page.querySelector('.alert')?.textContent).toContain('does not match any invitation');
    });

    it('offers only the way back, never a password form', async () => {
      for (const token of ['expired-token', 'revoked-token', 'typo']) {
        TestBed.resetTestingModule();
        const page = host(await open(token));

        expect(page.querySelector('form')).withContext(token).toBeNull();
        const action = page.querySelector('a.btn.outline-green');
        expect(action?.textContent?.trim()).withContext(token).toBe('Back to sign in');
        expect(action?.getAttribute('href')).withContext(token).toBe('/sign-in');
      }
    });

    it('states the reason on the error surface the reference uses, not as body copy', async () => {
      const page = host(await open('expired-token'));

      expect(page.querySelector('.alert')).toBeTruthy();
      expect(page.querySelector('.sub')).withContext('no plain sub copy').toBeNull();
    });

    it('announces the reason, since it replaces the whole screen', async () => {
      expect(host(await open('expired-token')).querySelector('.alert')?.getAttribute('role')).toBe(
        'status'
      );
    });
  });
});
