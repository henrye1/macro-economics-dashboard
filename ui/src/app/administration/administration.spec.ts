import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ADMIN_USERS_URL, type AdminUser } from '../core/admin-directory';
import type { Session } from '../core/auth.provider';
import { SESSION_STORAGE, SessionStore } from '../core/session.store';
import { SUPABASE_CLIENT } from '../core/supabase/supabase.client';
import { AdministrationPage } from './administration';

/** One turn of the task queue. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

const ADMIN: Session = {
  email: 'thandi@treasuryrisk.co.za',
  fullName: 'Thandi Mokoena',
  organisation: 'Treasury Risk',
  role: 'Administrator'
};

const PEOPLE: AdminUser[] = [
  {
    id: 'a',
    email: 'thandi@treasuryrisk.co.za',
    fullName: 'Thandi Mokoena',
    role: 'Administrator',
    lastSignInAt: '2026-10-06T07:45:21.000Z'
  },
  {
    id: 'b',
    email: 'sipho@treasuryrisk.co.za',
    fullName: '<b>Sipho</b> Nkosi',
    role: 'Member',
    lastSignInAt: null
  }
];

describe('AdministrationPage', () => {
  let fixture: ComponentFixture<AdministrationPage>;
  let httpMock: HttpTestingController;

  function setUp(session: Session = ADMIN): void {
    TestBed.configureTestingModule({
      imports: [AdministrationPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SUPABASE_CLIENT, useValue: null },
        { provide: SESSION_STORAGE, useValue: null }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).signIn(session);
    fixture = TestBed.createComponent(AdministrationPage);
    fixture.detectChanges();
  }

  async function answer(body: object, status = 200): Promise<void> {
    httpMock
      .expectOne({ method: 'GET', url: ADMIN_USERS_URL })
      .flush(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
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
  const denied = () => el().querySelector('.denied');

  it('says it is loading until the directory answers', async () => {
    setUp();

    expect(states()).toEqual(['Loading users…']);
    expect(el().querySelector('h1')?.textContent).toBe('Administration');
    expect(el().querySelector('.organisation')?.textContent).toBe('Treasury Risk');

    await answer({ data: [] });
  });

  it('lists the organisation with roles, dates and the caller marked as you', async () => {
    setUp();
    await answer({ data: PEOPLE });

    expect(el().querySelector('.card-head .meta')?.textContent).toBe('2 people in Treasury Risk');
    expect(rows().map(cells)).toEqual([
      ['Thandi Mokoena you', 'thandi@treasuryrisk.co.za', 'Administrator', '2026-10-06', "You can't change your own role"],
      ['<b>Sipho</b> Nkosi', 'sipho@treasuryrisk.co.za', 'Member', 'Never', 'Change role']
    ]);
  });

  it('renders a name as text, never as markup', async () => {
    setUp();
    await answer({ data: PEOPLE });

    expect(el().querySelector('tbody b')).toBeNull();
  });

  it('marks you by email, not by a name someone else could copy', async () => {
    setUp();
    await answer({
      data: [{ ...PEOPLE[1], fullName: 'Thandi Mokoena' }]
    });

    expect(el().querySelector('.you')).toBeNull();
  });

  it('says so when the organisation has nobody in it', async () => {
    setUp();
    await answer({ data: [] });

    expect(states()).toEqual(['No users in Treasury Risk yet.']);
    expect(el().querySelector('table')).toBeNull();
  });

  it('shows a Member the not-permitted card and asks the API nothing', () => {
    setUp({ ...ADMIN, role: 'Member' });

    expect(denied()?.textContent).toContain('Administration is for administrators.');
    expect(denied()?.textContent).toContain(
      'Ask an administrator in your organisation to change your role.'
    );
    expect(el().querySelector('table')).toBeNull();
  });

  it('treats a near-miss role as a Member, as the API does', () => {
    setUp({ ...ADMIN, role: 'administrator' });

    expect(denied()).not.toBeNull();
  });

  it('shows the not-permitted card when the API refuses a stale Administrator session', async () => {
    setUp();
    await answer({ error: 'This account does not have permission for this request.' }, 403);

    expect(denied()).not.toBeNull();
    expect(el().querySelector('h1')).toBeNull();
  });

  it('says so when the Administrator has no organisation to administer', async () => {
    setUp();
    await answer({ error: 'This account has no organisation to administer.' }, 403);

    expect(states()).toEqual(['This account has no organisation to administer.']);
    expect(denied()).toBeNull();
  });

  it('says so when the directory cannot be reached', async () => {
    setUp();
    await answer({ error: 'The user directory could not be reached.' }, 502);

    expect(states()).toEqual(['Could not load users.']);
    expect(el().querySelector('table')).toBeNull();
  });

  describe('changing a role', () => {
    const PIETER: AdminUser = {
      id: 'c0ffee00-0000-4000-8000-000000000003',
      email: 'pieter@treasuryrisk.co.za',
      fullName: 'Pieter van der Merwe',
      role: 'Member',
      lastSignInAt: '2026-10-03T08:00:00.000Z'
    };
    const LERATO: AdminUser = { ...PIETER, id: 'c0ffee00-0000-4000-8000-000000000004', email: 'lerato@treasuryrisk.co.za', fullName: 'Lerato Dlamini' };

    async function ready(): Promise<void> {
      setUp();
      await answer({ data: [PEOPLE[0], PIETER, LERATO] });
    }

    const row = (index: number) => rows()[index];
    const button = (scope: Element | undefined, label: string) =>
      Array.from(scope?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
        (b) => b.textContent?.trim() === label
      );
    const select = () => el().querySelector<HTMLSelectElement>('select.role-select');

    function choose(role: string): void {
      const control = select()!;
      control.value = role;
      control.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function edit(index: number): void {
      button(row(index), 'Change role')!.click();
      fixture.detectChanges();
    }

    async function rendered(): Promise<void> {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('offers no button on your own row, only the reason', async () => {
      await ready();

      expect(row(0).textContent).toContain("You can't change your own role");
      expect(button(row(0), 'Change role')).toBeUndefined();
      expect(button(row(1), 'Change role')).toBeDefined();
    });

    it('opens the row with the current role chosen, labelled, and focused', async () => {
      await ready();
      edit(1);
      await rendered();

      expect(select()?.value).toBe('Member');
      expect(select()?.getAttribute('aria-label')).toBe('Role for Pieter van der Merwe');
      expect(document.activeElement).toBe(select());
    });

    it('keeps Save closed until the role actually changes', async () => {
      await ready();
      edit(1);

      expect(button(row(1), 'Save role')?.disabled).toBeTrue();
      choose('Administrator');
      expect(button(row(1), 'Save role')?.disabled).toBeFalse();
    });

    it('edits one row at a time', async () => {
      await ready();
      edit(1);
      edit(2);

      expect(el().querySelectorAll('select.role-select').length).toBe(1);
      expect(select()?.getAttribute('aria-label')).toBe('Role for Lerato Dlamini');
    });

    it('cancels back to the row, returning focus to its button', async () => {
      await ready();
      edit(1);
      choose('Administrator');

      button(row(1), 'Cancel')!.click();
      fixture.detectChanges();
      await rendered();

      expect(select()).toBeNull();
      expect(cells(row(1))[2]).toBe('Member');
      expect(document.activeElement).toBe(button(row(1), 'Change role')!);
    });

    it('cancels on Escape from the select', async () => {
      await ready();
      edit(1);

      select()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(select()).toBeNull();
    });

    it('saves, shows the new role and confirms, then returns focus', async () => {
      await ready();
      edit(1);
      choose('Administrator');
      button(row(1), 'Save role')!.click();
      fixture.detectChanges();

      const request = httpMock.expectOne({ method: 'PUT', url: `${ADMIN_USERS_URL}/${PIETER.id}/role` });
      expect(request.request.body).toEqual({ role: 'Administrator' });
      expect(button(row(1), 'Saving…')?.disabled).toBeTrue();
      expect(button(row(1), 'Cancel')?.disabled).toBeTrue();
      expect(select()?.disabled).toBeTrue();

      request.flush({ data: { ...PIETER, role: 'Administrator' } });
      await rendered();

      expect(select()).toBeNull();
      expect(cells(row(1))[2]).toBe('Administrator');
      expect(states()).toContain(
        'Pieter van der Merwe is now Administrator. It takes effect the next time their session refreshes.'
      );
      expect(document.activeElement).toBe(button(row(1), 'Change role')!);
    });

    for (const [status, message] of [
      [409, 'This would leave your organisation without an Administrator.'],
      [403, 'Your account is no longer an Administrator.'],
      [404, 'That person is not in your organisation.']
    ] as const) {
      it(`keeps the row open and shows the ${status} refusal in it`, async () => {
        await ready();
        edit(1);
        choose('Administrator');
        button(row(1), 'Save role')!.click();

        httpMock
          .expectOne(`${ADMIN_USERS_URL}/${PIETER.id}/role`)
          .flush({ error: message }, { status, statusText: 'Refused' });
        await rendered();

        expect(select()?.value).toBe('Administrator');
        expect(row(1).querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
        expect(button(row(1), 'Save role')?.disabled).toBeFalse();
        expect(denied()).toBeNull();
      });
    }

    it('says it could not change the role when the failure carries no message', async () => {
      await ready();
      edit(1);
      choose('Administrator');
      button(row(1), 'Save role')!.click();

      httpMock.expectOne(`${ADMIN_USERS_URL}/${PIETER.id}/role`).error(new ProgressEvent('error'));
      await rendered();

      expect(row(1).querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Could not change the role. Try again.'
      );
    });

    it('clears the row error when the selection changes', async () => {
      await ready();
      edit(1);
      choose('Administrator');
      button(row(1), 'Save role')!.click();
      httpMock
        .expectOne(`${ADMIN_USERS_URL}/${PIETER.id}/role`)
        .flush({ error: 'That person is not in your organisation.' }, { status: 404, statusText: 'No' });
      await rendered();

      choose('Member');

      expect(row(1).querySelector('[role="alert"]')).toBeNull();
    });
  });
});
