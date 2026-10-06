import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ADMIN_INVITATIONS_URL, type Invitation } from '../core/admin-directory';
import { InvitationsStore } from './invitations.store';
import { InviteForm } from './invite-form';

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('InviteForm', () => {
  let fixture: ComponentFixture<InviteForm>;
  let httpMock: HttpTestingController;
  let store: InvitationsStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [InviteForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), InvitationsStore]
    });

    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(InvitationsStore);
    // The card normally loads the list; load it here for the hint's hours.
    store.load();
    httpMock.expectOne(ADMIN_INVITATIONS_URL).flush({ data: [], expiresInHours: 24 });
    await settle();

    fixture = TestBed.createComponent(InviteForm);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const input = () => el().querySelector<HTMLInputElement>('#invite-email')!;
  const submit = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const radio = (label: string) =>
    Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (r) => r.value === label
    )!;
  const text = (selector: string) => el().querySelector(selector)?.textContent?.trim();

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function send(): void {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('labels the input, preselects Member and states the link lifetime', () => {
    expect(el().querySelector('label[for="invite-email"]')?.textContent).toContain('Email address');
    expect(radio('Member').checked).toBeTrue();
    expect(el().querySelector('fieldset legend')?.textContent).toContain('Role');
    expect(text('.hint')).toBe('They get an email with a link to set a password. The link expires after 24 hours.');
  });

  it('refuses an incomplete address on the field, focuses it, and sends nothing', () => {
    type('kagiso@treasuryrisk');
    send();

    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe('invite-email-error');
    expect(text('#invite-email-error')).toBe('Enter a full email address, like name@company.co.za.');
    expect(document.activeElement).toBe(input());
    httpMock.expectNone(ADMIN_INVITATIONS_URL);
  });

  it('clears the field error as soon as the address is edited', () => {
    type('');
    send();
    type('k');

    expect(input().hasAttribute('aria-invalid')).toBeFalse();
    expect(el().querySelector('#invite-email-error')).toBeNull();
  });

  it('sends, disables itself while sending, then confirms and clears the address but keeps the role', async () => {
    radio('Administrator').dispatchEvent(new Event('change'));
    type('kagiso@treasuryrisk.co.za');
    send();

    const request = httpMock.expectOne({ method: 'POST', url: ADMIN_INVITATIONS_URL });
    expect(request.request.body).toEqual({ email: 'kagiso@treasuryrisk.co.za', role: 'Administrator' });
    expect(submit().textContent?.trim()).toBe('Sending…');
    expect(submit().disabled).toBeTrue();

    const created: Invitation = {
      id: 'c0ffee00-0000-4000-8000-000000000001',
      email: 'kagiso@treasuryrisk.co.za',
      role: 'Administrator',
      invitedBy: 'Thandi Mokoena',
      sentAt: '2026-10-06T12:00:00.000Z',
      expiresAt: '2026-10-07T12:00:00.000Z',
      status: 'pending'
    };
    request.flush({ data: created }, { status: 201, statusText: 'Created' });
    await settle();
    fixture.detectChanges();

    expect(text('.confirm')).toBe(
      'Invitation sent to kagiso@treasuryrisk.co.za as Administrator. It expires on 2026-10-07 12:00 UTC.'
    );
    expect(input().value).toBe('');
    expect(radio('Administrator').checked).toBeTrue();
    expect(store.invitations()[0]).toEqual(created);
  });

  for (const [status, message] of [
    [409, "This email address can't be invited."],
    [429, 'Too many invitations have been sent. Try again later.']
  ] as const) {
    it(`shows the ${status} refusal and keeps the address`, async () => {
      type('taken@treasuryrisk.co.za');
      send();

      httpMock.expectOne(ADMIN_INVITATIONS_URL).flush({ error: message }, { status, statusText: 'Refused' });
      await settle();
      fixture.detectChanges();

      expect(text('[role="alert"]')).toBe(message);
      expect(input().value).toBe('taken@treasuryrisk.co.za');
      expect(submit().disabled).toBeFalse();
    });
  }

  it('says it could not send when the failure carries no reason', async () => {
    type('k@treasuryrisk.co.za');
    send();

    httpMock.expectOne(ADMIN_INVITATIONS_URL).error(new ProgressEvent('error'));
    await settle();
    fixture.detectChanges();

    expect(text('[role="alert"]')).toBe('Could not send the invitation. Try again.');
  });
});
