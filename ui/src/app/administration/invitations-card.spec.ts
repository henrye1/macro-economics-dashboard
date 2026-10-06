import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ADMIN_INVITATIONS_URL, type Invitation } from '../core/admin-directory';
import { InvitationsCard } from './invitations-card';
import { InvitationsStore } from './invitations.store';

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

const PENDING: Invitation = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  email: 'naledi@treasuryrisk.co.za',
  role: 'Member',
  invitedBy: 'Thandi Mokoena',
  sentAt: '2026-10-06T08:00:00.000Z',
  expiresAt: '2026-10-07T08:00:00.000Z',
  status: 'pending'
};

const EXPIRED: Invitation = {
  ...PENDING,
  id: 'c0ffee00-0000-4000-8000-000000000002',
  email: 'grace@treasuryrisk.co.za',
  sentAt: '2026-10-01T08:00:00.000Z',
  expiresAt: '2026-10-02T08:00:00.000Z',
  status: 'expired'
};

describe('InvitationsCard', () => {
  let fixture: ComponentFixture<InvitationsCard>;
  let httpMock: HttpTestingController;

  function setUp(): void {
    TestBed.configureTestingModule({
      imports: [InvitationsCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), InvitationsStore]
    });

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InvitationsCard);
    fixture.detectChanges();
  }

  async function list(invitations: Invitation[] | 'fail'): Promise<void> {
    const request = httpMock.expectOne({ method: 'GET', url: ADMIN_INVITATIONS_URL });
    if (invitations === 'fail') {
      request.flush({ error: 'The user directory could not be reached.' }, { status: 502, statusText: 'Bad' });
    } else {
      request.flush({ data: invitations, expiresInHours: 24 });
    }
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const states = () =>
    Array.from(el().querySelectorAll('[role="status"]')).map((n) => n.textContent?.trim());
  const rows = () => Array.from(el().querySelectorAll('tbody tr'));
  const cells = (row: Element) =>
    Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
  const button = (row: Element | undefined, label: string) =>
    Array.from(row?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (b) => b.textContent?.trim() === label
    );
  const alert = (row: Element) => row.querySelector('[role="alert"]')?.textContent?.trim();

  it('says it is loading, then lists invitations with UTC expiry and status', async () => {
    setUp();
    expect(states()).toEqual(['Loading invitations…']);

    await list([PENDING, EXPIRED]);

    expect(rows().map((row) => cells(row).slice(0, 5))).toEqual([
      ['naledi@treasuryrisk.co.za', 'Member', '2026-10-06', '2026-10-07 08:00 UTC', 'Pending'],
      ['grace@treasuryrisk.co.za', 'Member', '2026-10-01', '2026-10-02 08:00 UTC', 'Expired']
    ]);
  });

  it('offers Revoke on a pending row and Resend too on an expired one', async () => {
    setUp();
    await list([PENDING, EXPIRED]);

    expect(button(rows()[0], 'Resend')).toBeUndefined();
    expect(button(rows()[0], 'Revoke')).toBeDefined();
    expect(button(rows()[1], 'Resend')).toBeDefined();
    expect(button(rows()[1], 'Revoke')).toBeDefined();
  });

  it('says so when nobody is waiting, or the list cannot load', async () => {
    setUp();
    await list([]);
    expect(states()).toEqual(['No invitations waiting.']);

    TestBed.resetTestingModule();
    setUp();
    await list('fail');
    expect(states()).toEqual(['Could not load invitations.']);
  });

  describe('Revoke', () => {
    it('asks first, and Keep puts the row back untouched', async () => {
      setUp();
      await list([PENDING]);

      button(rows()[0], 'Revoke')!.click();
      fixture.detectChanges();
      expect(rows()[0].textContent).toContain('Revoke the invitation to naledi@treasuryrisk.co.za?');

      button(rows()[0], 'Keep')!.click();
      fixture.detectChanges();
      expect(rows()[0].textContent).not.toContain('Revoke the invitation to');
    });

    it('removes the row and confirms once the API agrees', async () => {
      setUp();
      await list([PENDING, EXPIRED]);

      button(rows()[0], 'Revoke')!.click();
      fixture.detectChanges();
      button(rows()[0], 'Revoke')!.click();
      fixture.detectChanges();

      const request = httpMock.expectOne({ method: 'DELETE', url: `${ADMIN_INVITATIONS_URL}/${PENDING.id}` });
      expect(button(rows()[0], 'Revoking…')?.disabled).toBeTrue();
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      fixture.detectChanges();

      expect(rows().length).toBe(1);
      expect(states()).toContain(
        'Revoked the invitation to naledi@treasuryrisk.co.za. That link no longer works.'
      );
    });

    it('keeps the row and shows the refusal in it', async () => {
      setUp();
      await list([PENDING]);

      button(rows()[0], 'Revoke')!.click();
      fixture.detectChanges();
      button(rows()[0], 'Revoke')!.click();
      httpMock
        .expectOne(`${ADMIN_INVITATIONS_URL}/${PENDING.id}`)
        .flush({ error: 'That invitation is not in your organisation.' }, { status: 404, statusText: 'No' });
      await settle();
      fixture.detectChanges();

      expect(rows().length).toBe(1);
      expect(alert(rows()[0])).toBe('That invitation is not in your organisation.');
    });
  });

  describe('Resend', () => {
    it('replaces the row with the fresh invitation and confirms', async () => {
      setUp();
      await list([EXPIRED]);

      button(rows()[0], 'Resend')!.click();
      fixture.detectChanges();

      const request = httpMock.expectOne({ method: 'POST', url: `${ADMIN_INVITATIONS_URL}/${EXPIRED.id}/resend` });
      expect(button(rows()[0], 'Sending…')?.disabled).toBeTrue();
      expect(button(rows()[0], 'Revoke')?.disabled).toBeTrue();
      request.flush({
        data: { ...EXPIRED, id: 'c0ffee00-0000-4000-8000-000000000009', status: 'pending', expiresAt: '2026-10-07T12:00:00.000Z' }
      });
      await settle();
      fixture.detectChanges();

      expect(cells(rows()[0])[4]).toBe('Pending');
      expect(states()).toContain(
        'Sent a new invitation to grace@treasuryrisk.co.za. The old link no longer works.'
      );
    });

    it('shows a generic failure in the row when the API gives no reason', async () => {
      setUp();
      await list([EXPIRED]);

      button(rows()[0], 'Resend')!.click();
      httpMock.expectOne(`${ADMIN_INVITATIONS_URL}/${EXPIRED.id}/resend`).error(new ProgressEvent('error'));
      await settle();
      fixture.detectChanges();

      expect(alert(rows()[0])).toBe('Could not update the invitation. Try again.');
    });
  });
});
