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
      ['Thandi Mokoena you', 'thandi@treasuryrisk.co.za', 'Administrator', '2026-10-06'],
      ['<b>Sipho</b> Nkosi', 'sipho@treasuryrisk.co.za', 'Member', 'Never']
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
});
