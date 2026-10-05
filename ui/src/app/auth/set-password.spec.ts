import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import { App } from '../app';
import { routes } from '../app.routes';
import { AUTH, type AuthFailure, type AuthProvider, type Session } from '../core/auth.provider';
import { FIXTURE_SESSION, FixtureAuthProvider } from '../core/fixtures/fixture-auth.provider';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { provideNoSession } from '../core/fixtures/signed-in-session';
import { MACRO_DATA } from '../core/macro-data.provider';
import { SessionStore } from '../core/session.store';

const GOOD_PASSWORD = 'Correct-horse-1-battery';

/** The fixture with only `setPassword` swapped, so every other path is the real one. */
function providerAnswering(
  answer: Session | AuthFailure | 'raise'
): AuthProvider {
  const fixture = new FixtureAuthProvider();

  return Object.assign(Object.create(Object.getPrototypeOf(fixture) as object), fixture, {
    setPassword: (): Observable<Session | AuthFailure> =>
      answer === 'raise'
        ? new Observable<Session>((subscriber) => subscriber.error(new Error('down')))
        : of(answer)
  }) as AuthProvider;
}

async function open(
  answer: Session | AuthFailure | 'raise' = FIXTURE_SESSION
): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoSession(),
      { provide: MACRO_DATA, useClass: FixtureMacroDataProvider },
      { provide: AUTH, useValue: providerAnswering(answer) }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl('/set-password');
  fixture.detectChanges();

  return fixture;
}

function host(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function type(fixture: ComponentFixture<App>, value: string): void {
  const input = host(fixture).querySelector<HTMLInputElement>('input[name="password"]')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<App>): void {
  host(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
}

describe('Set password', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders inside the auth layout, not the console chrome', async () => {
    const page = host(await open());

    expect(page.querySelector('app-auth-layout')).toBeTruthy();
    expect(page.querySelector('.tabs')).toBeNull();
    expect(page.querySelector('h2')?.textContent).toBe('Set a new password');
  });

  it('asks for a password and nothing else, since the account already exists', async () => {
    const page = host(await open());

    expect(page.querySelector('input[name="password"]')).toBeTruthy();
    expect(page.querySelector('input[name="fullName"]')).toBeNull();
    expect(page.querySelector('input[name="email"]')).toBeNull();
  });

  it('shows each rule as it is met, like the screen it borrows the form from', async () => {
    const fixture = await open();
    type(fixture, 'short1!A');

    const items = Array.from(host(fixture).querySelectorAll('.rules li'));

    expect(items.length).toBe(3);
    expect(items.map((li) => li.classList.contains('met'))).toEqual([false, true, true]);
    expect(items[0]?.textContent).toContain('not met yet');
  });

  it('refuses to submit until the rules are met', async () => {
    const fixture = await open();
    type(fixture, 'short');

    const button = host(fixture).querySelector<HTMLButtonElement>('.auth-submit')!;

    expect(button.disabled).toBeTrue();
  });

  it('signs the visitor in and lands on the console, because the link already signed them in', async () => {
    const fixture = await open();
    type(fixture, GOOD_PASSWORD);
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(SessionStore).session()).toEqual(FIXTURE_SESSION);
    expect(TestBed.inject(Router).url).toBe('/overview');
  });

  it('becomes a dead end when the link has been used or has expired', async () => {
    const fixture = await open('denied');
    type(fixture, GOOD_PASSWORD);
    submit(fixture);
    await fixture.whenStable();

    const page = host(fixture);

    expect(page.querySelector('h2')?.textContent).toBe('This link is no longer valid');
    // No form to keep trying against: a new link is the only way forward, and
    // the screen says so rather than leaving the field there.
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('a')?.getAttribute('href')).toBe('/reset-password');
  });

  it('keeps the form and reports a service failure, which a retry can fix', async () => {
    const fixture = await open('unavailable');
    type(fixture, GOOD_PASSWORD);
    submit(fixture);
    await fixture.whenStable();

    const page = host(fixture);

    expect(page.querySelector('.problem')?.textContent?.trim()).toBe(
      'We could not set your password just now. Try again in a moment.'
    );
    expect(page.querySelector('form')).toBeTruthy();
    expect(page.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe('');
  });

  it('reports an unexpected failure the same way, rather than leaving the button spinning', async () => {
    const fixture = await open('raise');
    type(fixture, GOOD_PASSWORD);
    submit(fixture);
    await fixture.whenStable();

    const page = host(fixture);

    expect(page.querySelector('.problem')?.textContent?.trim()).toContain('could not set your password');
    expect(page.querySelector<HTMLButtonElement>('.auth-submit')?.disabled).toBeTrue();
    expect(TestBed.inject(SessionStore).signedIn()).toBeFalse();
  });

  it('announces the problem, since the visitor is mid-flow', async () => {
    const fixture = await open('unavailable');

    expect(host(fixture).querySelector('.problem')?.getAttribute('role')).toBe('status');
  });
});
