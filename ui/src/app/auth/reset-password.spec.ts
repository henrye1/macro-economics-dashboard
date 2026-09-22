import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from '../app';
import { routes } from '../app.routes';
import { AUTH } from '../core/auth.provider';
import {
  FIXTURE_EMAIL,
  FIXTURE_UNREACHABLE_EMAIL,
  FixtureAuthProvider
} from '../core/fixtures/fixture-auth.provider';
import { FixtureMacroDataProvider } from '../core/fixtures/fixture-macro-data.provider';
import { provideNoSession } from '../core/fixtures/signed-in-session';
import { MACRO_DATA } from '../core/macro-data.provider';

async function openReset(): Promise<ComponentFixture<App>> {
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

  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl('/reset-password');
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<App>): HTMLElement {
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function request(fixture: ComponentFixture<App>, address: string): void {
  const input = host(fixture).querySelector<HTMLInputElement>('input[name="email"]');
  input!.value = address;
  input!.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  host(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
}

describe('Reset password', () => {
  let fixture: ComponentFixture<App>;

  beforeEach(async () => {
    fixture = await openReset();
  });

  it('states the 60 minute validity the reference names', () => {
    expect(host(fixture).querySelector('.sub')?.textContent).toContain('valid for 60 minutes');
  });

  it('replaces the form with a confirmation in place, without navigating', async () => {
    request(fixture, FIXTURE_EMAIL);
    await fixture.whenStable();

    const after = host(fixture);

    expect(TestBed.inject(Router).url).toBe('/reset-password');
    expect(after.querySelector('form')).toBeNull();
    expect(after.querySelector('h2')?.textContent?.trim()).toBe('Check your email');
    expect(after.querySelector('.sub')?.getAttribute('role')).toBe('status');
  });

  it('hedges the confirmation, so the form never reveals who has an account', async () => {
    request(fixture, 'nobody@cyte.co.za');
    await fixture.whenStable();

    expect(host(fixture).querySelector('.sub')?.textContent).toContain('If an account exists');
  });

  it('shows the error state rather than a confirmation when sending fails', async () => {
    request(fixture, FIXTURE_UNREACHABLE_EMAIL);
    await fixture.whenStable();

    const after = host(fixture);

    expect(after.querySelector('form')).withContext('form stays').toBeTruthy();
    expect(after.querySelector('.problem')?.textContent?.trim()).toBe(
      'We could not send the link just now. Try again in a moment.'
    );
    expect(after.querySelector('h2')?.textContent?.trim()).toBe('Reset your password');
  });

  it('returns to sign in', async () => {
    const router = TestBed.inject(Router);
    host(fixture).querySelector<HTMLAnchorElement>('.back')!.click();
    await fixture.whenStable();

    expect(router.url).toBe('/sign-in');
  });
});
