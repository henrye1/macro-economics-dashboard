import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from '../app';
import { routes } from '../app.routes';
import { AUTH } from '../core/auth.provider';
import {
  FIXTURE_EMAIL,
  FIXTURE_FAILING_EMAIL,
  FIXTURE_PASSWORD,
  FixtureAuthProvider
} from '../core/fixtures/fixture-auth.provider';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { MACRO_DATA } from '../core/macro-data.provider';
import { provideNoSession } from '../core/fixtures/signed-in-session';
import { SessionStore } from '../core/session.store';
import { safeReturnUrl } from './session.guard';

function el(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

async function mount(): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoSession(),
      { provide: MACRO_DATA, useClass: FixtureMacroDataProvider },
      { provide: AUTH, useClass: FixtureAuthProvider }
    ]
  }).compileComponents();

  return TestBed.createComponent(App);
}

/**
 * Type, then settle. The settle matters: `[value]` writes the DOM only when the
 * bound value differs from what Angular last wrote, so without a cycle here a
 * later reset to the empty string looks like no change and the field keeps the
 * text the test poked in.
 */
function type(
  fixture: ComponentFixture<App>,
  name: string,
  value: string
): void {
  const host = fixture.nativeElement as HTMLElement;
  const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<App>): void {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLFormElement>('form')!
    .dispatchEvent(new Event('submit'));
}

describe('Sign in', () => {
  let fixture: ComponentFixture<App>;
  let router: Router;

  beforeEach(async () => {
    fixture = await mount();
    router = TestBed.inject(Router);
    await router.navigateByUrl('/sign-in');
  });

  it('renders inside the auth layout, not the console chrome', () => {
    const host = el(fixture);

    expect(host.querySelector('app-auth-layout')).toBeTruthy();
    expect(host.querySelector('app-console-shell')).toBeNull();
    expect(host.querySelector('.tabs')).toBeNull();
    expect(host.querySelector('.pitch .wordmark')).toBeTruthy();
  });

  it('refuses a wrong credential without saying which half was wrong', async () => {
    el(fixture);
    type(fixture, 'email', FIXTURE_EMAIL);
    type(fixture, 'password', 'not-the-password');

    submit(fixture);
    await fixture.whenStable();

    const problem = el(fixture).querySelector('.problem');

    expect(problem?.textContent?.trim()).toBe(
      'That email address and password do not match an account.'
    );
    expect(problem?.getAttribute('role')).toBe('status');
    expect(TestBed.inject(SessionStore).signedIn()).toBeFalse();
  });

  it('keeps the address and clears only the password after a refusal', async () => {
    el(fixture);
    type(fixture, 'email', FIXTURE_EMAIL);
    type(fixture, 'password', 'not-the-password');
    submit(fixture);
    await fixture.whenStable();

    const after = el(fixture);

    expect(after.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe(FIXTURE_EMAIL);
    expect(after.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe('');
  });

  it('reports an unexpected failure as unavailable, not as a wrong password', async () => {
    el(fixture);
    type(fixture, 'email', FIXTURE_FAILING_EMAIL);
    type(fixture, 'password', FIXTURE_PASSWORD);
    submit(fixture);
    await fixture.whenStable();

    const problem = el(fixture).querySelector('.problem');

    expect(problem?.textContent?.trim()).toBe(
      'Sign-in is unavailable. Try again in a moment.'
    );
    expect(TestBed.inject(SessionStore).signedIn()).toBeFalse();
  });

  it('signs in and lands on Overview', async () => {
    el(fixture);
    type(fixture, 'email', FIXTURE_EMAIL);
    type(fixture, 'password', FIXTURE_PASSWORD);

    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(SessionStore).signedIn()).toBeTrue();
    expect(router.url).toBe('/overview');
  });
});

describe('the session guard', () => {
  it('sends a signed-out visitor to sign-in, carrying where they were going', async () => {
    const fixture = await mount();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/vintages');
    el(fixture);

    expect(router.url).toBe('/sign-in?returnUrl=%2Fvintages');
  });

  it('returns them to what they asked for, not to Overview', async () => {
    const fixture = await mount();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/vintages');

    el(fixture);
    type(fixture, 'email', FIXTURE_EMAIL);
    type(fixture, 'password', FIXTURE_PASSWORD);
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/vintages');
  });
});

describe('safeReturnUrl', () => {
  it('allows a path on this origin', () => {
    expect(safeReturnUrl('/vintages')).toBe('/vintages');
    expect(safeReturnUrl('/series?page=2')).toBe('/series?page=2');
  });

  it('refuses anything that could leave the origin', () => {
    // `//evil.test` is a protocol-relative URL, and the browser treats it as
    // absolute. Testing only for a leading slash would let it through.
    for (const hostile of [
      '//evil.test',
      '///evil.test',
      // A backslash is an authority separator to the URL parser even though
      // Angular's serialiser reads it as a path character.
      '/\\evil.test',
      '/\\\\evil.test',
      // Stripped by the URL parser before it parses, so the character
      // this function inspects is not the one the parser sees.
      '/\n/evil.test',
      '/\t/evil.test',
      '/\r/evil.test',
      '/\n\\evil.test',
      'https://evil.test',
      'http://evil.test/x',
      'javascript:alert(1)',
      'vintages'
    ]) {
      expect(safeReturnUrl(hostile)).withContext(hostile).toBe('/overview');
    }
  });

  it('falls back when there is no parameter at all', () => {
    expect(safeReturnUrl(null)).toBe('/overview');
    expect(safeReturnUrl(undefined)).toBe('/overview');
  });
});

describe('the notice after accepting an invitation', () => {
  it('is shown when the visitor arrives from acceptance', async () => {
    const fixture = await mount();
    await TestBed.inject(Router).navigateByUrl('/sign-in?accepted=1');

    const notice = el(fixture).querySelector('.notice');

    expect(notice?.textContent?.trim()).toBe('Your account is ready. Sign in to continue.');
    // Announced, because the visitor arrives here mid-flow having asked for
    // something else.
    expect(notice?.getAttribute('role')).toBe('status');
  });

  it('is absent on an ordinary visit, so it is not a permanent banner', async () => {
    const fixture = await mount();
    await TestBed.inject(Router).navigateByUrl('/sign-in');

    expect(el(fixture).querySelector('.notice')).toBeNull();
  });
});
