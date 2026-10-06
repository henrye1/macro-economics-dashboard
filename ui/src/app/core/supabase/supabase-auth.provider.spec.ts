import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

import type { Session } from '../auth.provider';
import { RESET_PATH, SupabaseAuthProvider } from './supabase-auth.provider';
import { SUPABASE_CLIENT } from './supabase.client';

/** A Supabase user as the project really hands one back. */
function user(overrides: Partial<User> = {}): User {
  return {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'thandi.mokoena@cyte.co.za',
    app_metadata: { provider: 'email', role: 'Administrator', organisation: 'Treasury Risk' },
    user_metadata: { full_name: 'Thandi Mokoena' },
    aud: 'authenticated',
    created_at: '2026-09-01T09:00:00.000Z',
    ...overrides
  } as User;
}

function authError(code: string, message = 'refused'): AuthError {
  return { name: 'AuthApiError', message, code, status: 400 } as AuthError;
}

interface ClientStub {
  signInWithPassword: jasmine.Spy;
  resetPasswordForEmail: jasmine.Spy;
  updateUser: jasmine.Spy;
  getSession: jasmine.Spy;
}

function make(stub: Partial<ClientStub> = {}, origin = 'https://console.cyte.co.za', hash = '') {
  const client: ClientStub = {
    signInWithPassword: jasmine
      .createSpy('signInWithPassword')
      .and.resolveTo({ data: { user: user(), session: {} }, error: null }),
    resetPasswordForEmail: jasmine
      .createSpy('resetPasswordForEmail')
      .and.resolveTo({ data: {}, error: null }),
    updateUser: jasmine
      .createSpy('updateUser')
      .and.resolveTo({ data: { user: user() }, error: null }),
    getSession: jasmine
      .createSpy('getSession')
      .and.resolveTo({ data: { session: null }, error: null }),
    ...stub
  };

  TestBed.configureTestingModule({
    providers: [
      SupabaseAuthProvider,
      { provide: SUPABASE_CLIENT, useValue: { auth: client } as unknown as SupabaseClient },
      { provide: DOCUMENT, useValue: { location: { origin, hash } } }
    ]
  });

  return { client, provider: TestBed.inject(SupabaseAuthProvider) };
}

/** The same wiring with no project, which is what a blank environment builds. */
function makeUnconfigured() {
  TestBed.configureTestingModule({
    providers: [
      SupabaseAuthProvider,
      { provide: SUPABASE_CLIENT, useValue: null },
      { provide: DOCUMENT, useValue: { location: { origin: 'https://console.cyte.co.za' } } }
    ]
  });

  return TestBed.inject(SupabaseAuthProvider);
}

describe('SupabaseAuthProvider', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('signIn', () => {
    it('answers with the session a verified user maps to', async () => {
      const { provider } = make();

      const result = await firstValueFrom(provider.signIn('thandi.mokoena@cyte.co.za', 'pw'));

      expect(result).toEqual({
        email: 'thandi.mokoena@cyte.co.za',
        fullName: 'Thandi Mokoena',
        organisation: 'Treasury Risk',
        role: 'Administrator'
      });
    });

    it('trims the address, because a copied one arrives with a space', async () => {
      const { client, provider } = make();

      await firstValueFrom(provider.signIn('  thandi.mokoena@cyte.co.za ', 'pw'));

      expect(client.signInWithPassword).toHaveBeenCalledWith({
        email: 'thandi.mokoena@cyte.co.za',
        password: 'pw'
      });
    });

    it('never trims the password, which may legitimately end in a space', async () => {
      const { client, provider } = make();

      await firstValueFrom(provider.signIn('a@b.co', ' pw '));

      expect(client.signInWithPassword.calls.mostRecent().args[0].password).toBe(' pw ');
    });

    it('answers denied for a wrong password rather than raising', async () => {
      const { provider } = make({
        signInWithPassword: jasmine
          .createSpy()
          .and.resolveTo({ data: { user: null, session: null }, error: authError('invalid_credentials') })
      });

      await expectAsync(firstValueFrom(provider.signIn('a@b.co', 'wrong'))).toBeResolvedTo('denied');
    });

    it('answers denied for an unconfirmed or banned account, which are also refusals', async () => {
      for (const code of ['email_not_confirmed', 'user_banned']) {
        const { provider } = make({
          signInWithPassword: jasmine
            .createSpy()
            .and.resolveTo({ data: { user: null, session: null }, error: authError(code) })
        });

        await expectAsync(firstValueFrom(provider.signIn('a@b.co', 'pw'))).toBeResolvedTo('denied');
        TestBed.resetTestingModule();
      }
    });

    it('raises rather than denying when Supabase failed to consider the credentials', async () => {
      const { provider } = make({
        signInWithPassword: jasmine
          .createSpy()
          .and.resolveTo({ data: { user: null, session: null }, error: authError('over_request_rate_limit') })
      });

      // Telling a visitor with a correct password that it was wrong is the one
      // mapping mistake that cannot be recovered from by trying again.
      await expectAsync(firstValueFrom(provider.signIn('a@b.co', 'pw'))).toBeRejected();
    });

    it('raises when the transport fails', async () => {
      const { provider } = make({
        signInWithPassword: jasmine.createSpy().and.rejectWith(new TypeError('Failed to fetch'))
      });

      await expectAsync(firstValueFrom(provider.signIn('a@b.co', 'pw'))).toBeRejected();
    });

    it('raises when there is no project configured', async () => {
      await expectAsync(firstValueFrom(makeUnconfigured().signIn('a@b.co', 'pw'))).toBeRejected();
    });

    it('falls back to the address local part when the user set no name', async () => {
      const { provider } = make({
        signInWithPassword: jasmine
          .createSpy()
          .and.resolveTo({ data: { user: user({ user_metadata: {} }), session: {} }, error: null })
      });

      const result = (await firstValueFrom(provider.signIn('a@b.co', 'pw'))) as Session;

      expect(result.fullName).toBe('thandi.mokoena');
    });

    it('leaves organisation and role empty when an administrator set neither', async () => {
      const { provider } = make({
        signInWithPassword: jasmine.createSpy().and.resolveTo({
          data: { user: user({ app_metadata: { provider: 'email' } }), session: {} },
          error: null
        })
      });

      const result = (await firstValueFrom(provider.signIn('a@b.co', 'pw'))) as Session;

      expect(result.organisation).toBe('');
      expect(result.role).toBe('');
    });

    it('ignores a role a visitor wrote about themselves in user_metadata', async () => {
      const { provider } = make({
        signInWithPassword: jasmine.createSpy().and.resolveTo({
          data: {
            user: user({
              app_metadata: { provider: 'email', role: 'Member' },
              user_metadata: { full_name: 'Thandi Mokoena', role: 'Administrator' }
            }),
            session: {}
          },
          error: null
        })
      });

      const result = (await firstValueFrom(provider.signIn('a@b.co', 'pw'))) as Session;

      expect(result.role).toBe('Member');
    });
  });

  describe('requestPasswordReset', () => {
    it('sends the visitor back to the screen that can set a password', async () => {
      const { client, provider } = make();

      await firstValueFrom(provider.requestPasswordReset(' someone@cyte.co.za '));

      expect(client.resetPasswordForEmail).toHaveBeenCalledWith('someone@cyte.co.za', {
        redirectTo: `https://console.cyte.co.za${RESET_PATH}`
      });
    });

    it('answers the same way whether or not the address has an account', async () => {
      const { provider } = make();

      await expectAsync(firstValueFrom(provider.requestPasswordReset('nobody@cyte.co.za'))).toBeResolved();
    });

    it('raises when the mail request itself failed', async () => {
      const { provider } = make({
        resetPasswordForEmail: jasmine
          .createSpy()
          .and.resolveTo({ data: null, error: authError('over_email_send_rate_limit') })
      });

      await expectAsync(firstValueFrom(provider.requestPasswordReset('a@b.co'))).toBeRejected();
    });

    it('raises when there is no project configured', async () => {
      await expectAsync(
        firstValueFrom(makeUnconfigured().requestPasswordReset('a@b.co'))
      ).toBeRejected();
    });
  });

  describe('setPassword', () => {
    function refusing(code: string, status = 422) {
      return make({
        updateUser: jasmine
          .createSpy('updateUser')
          .and.resolveTo({ data: { user: null }, error: { ...authError(code), status } })
      }).provider;
    }

    it('changes the password of whoever the recovery link signed in', async () => {
      const { client, provider } = make();

      const result = (await firstValueFrom(provider.setPassword('N3w-passphrase!'))) as Session;

      expect(client.updateUser).toHaveBeenCalledWith({ password: 'N3w-passphrase!' });
      expect(result.email).toBe('thandi.mokoena@cyte.co.za');
    });

    it('answers same-password when the visitor reuses the one they have', async () => {
      expect(await firstValueFrom(refusing('same_password').setPassword('pw'))).toBe('same-password');
    });

    it('answers weak-password when the project policy is stricter than the screen', async () => {
      expect(await firstValueFrom(refusing('weak_password').setPassword('pw'))).toBe('weak-password');
    });

    it('answers denied when there is no session to change a password for', async () => {
      expect(await firstValueFrom(refusing('session_not_found', 403).setPassword('pw'))).toBe('denied');
    });

    it('answers denied for any 401, whatever the code says', async () => {
      expect(await firstValueFrom(refusing('bad_jwt', 401).setPassword('pw'))).toBe('denied');
    });

    it('raises on a code it does not recognise, rather than blaming the password', async () => {
      await expectAsync(
        firstValueFrom(refusing('unexpected_failure', 500).setPassword('pw'))
      ).toBeRejected();
    });

    it('raises when there is no project configured', async () => {
      await expectAsync(firstValueFrom(makeUnconfigured().setPassword('pw'))).toBeRejected();
    });
  });

  describe('invitation', () => {
    const invitee = () =>
      user({
        email: 'kagiso@treasuryrisk.co.za',
        invited_at: '2026-10-06T12:00:00.000Z',
        app_metadata: {
          provider: 'email',
          organisation: 'Treasury Risk',
          role: 'Administrator',
          invited_by: 'a11ce000-0000-4000-8000-000000000001',
          invited_by_name: 'Thandi Mokoena'
        },
        // A visitor-writable claim that must never become the role shown.
        user_metadata: { role: 'Owner' }
      });

    const withSession = (sessionUser: User | null) =>
      jasmine
        .createSpy('getSession')
        .and.resolveTo({ data: { session: sessionUser === null ? null : { user: sessionUser } }, error: null });

    it('reads the invitation from the session the emailed link left behind', async () => {
      const { provider } = make({ getSession: withSession(invitee()) });

      await expectAsync(firstValueFrom(provider.invitation(''))).toBeResolvedTo({
        token: '',
        email: 'kagiso@treasuryrisk.co.za',
        organisation: 'Treasury Risk',
        role: 'Administrator',
        invitedBy: 'Thandi Mokoena',
        sentAt: '2026-10-06T12:00:00.000Z',
        expiresAt: '',
        status: 'valid'
      });
    });

    it('names "an administrator" when no inviter name was stamped', async () => {
      const unnamed = invitee();
      delete (unnamed.app_metadata as Record<string, unknown>)['invited_by_name'];
      const { provider } = make({ getSession: withSession(unnamed) });

      expect((await firstValueFrom(provider.invitation(''))).invitedBy).toBe('an administrator');
    });

    it('calls a refused link expired when Supabase says otp_expired', async () => {
      const { provider } = make(
        { getSession: withSession(null) },
        'https://console.cyte.co.za',
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
      );

      expect((await firstValueFrom(provider.invitation(''))).status).toBe('expired');
    });

    it('lets a refused link win over a session already in this browser', async () => {
      const { provider } = make(
        { getSession: withSession(invitee()) },
        'https://console.cyte.co.za',
        '#error=access_denied&error_code=otp_expired'
      );

      expect((await firstValueFrom(provider.invitation(''))).status).toBe('expired');
    });

    it('treats any other refusal, or no link at all, as unknown', async () => {
      const other = make({ getSession: withSession(null) }, 'https://console.cyte.co.za', '#error=server_error&error_code=unexpected_failure');
      expect((await firstValueFrom(other.provider.invitation(''))).status).toBe('unknown');

      TestBed.resetTestingModule();
      const bare = make({ getSession: withSession(null) });
      expect((await firstValueFrom(bare.provider.invitation(''))).status).toBe('unknown');
    });

    it('shows no invitation to an ordinary signed-in visitor', async () => {
      const { provider } = make({ getSession: withSession(user()) });

      expect((await firstValueFrom(provider.invitation(''))).status).toBe('unknown');
    });

    it('fails, rather than inventing a state, when the session cannot be read', async () => {
      const { provider } = make({
        getSession: jasmine.createSpy('getSession').and.resolveTo({ data: { session: null }, error: authError('unexpected_failure') })
      });

      await expectAsync(firstValueFrom(provider.invitation(''))).toBeRejected();
    });

    it('fails when this build has no project', async () => {
      await expectAsync(firstValueFrom(makeUnconfigured().invitation(''))).toBeRejected();
    });
  });

  describe('acceptInvitation', () => {
    it('sets the trimmed name and the password on the invite session', async () => {
      const accepted = user({ user_metadata: { full_name: 'Kagiso Molefe' } });
      const { client, provider } = make({
        updateUser: jasmine.createSpy('updateUser').and.resolveTo({ data: { user: accepted }, error: null })
      });

      const result = (await firstValueFrom(
        provider.acceptInvitation('', '  Kagiso Molefe ', 'N3w-passphrase!')
      )) as Session;

      expect(client.updateUser).toHaveBeenCalledOnceWith({
        password: 'N3w-passphrase!',
        data: { full_name: 'Kagiso Molefe' }
      });
      expect(result.fullName).toBe('Kagiso Molefe');
    });

    function refusing(code: string, status = 422) {
      return jasmine
        .createSpy('updateUser')
        .and.resolveTo({ data: { user: null }, error: { ...authError(code), status } });
    }

    it('answers denied when the link left no session', async () => {
      const { provider } = make({ updateUser: refusing('session_not_found', 401) });

      await expectAsync(firstValueFrom(provider.acceptInvitation('', 'N', 'pw'))).toBeResolvedTo('denied');
    });

    it('answers weak-password when the project refuses the password', async () => {
      const { provider } = make({ updateUser: refusing('weak_password') });

      await expectAsync(firstValueFrom(provider.acceptInvitation('', 'N', 'pw'))).toBeResolvedTo(
        'weak-password'
      );
    });

    it('fails on anything else, so the screen says it is unavailable', async () => {
      const { provider } = make({ updateUser: refusing('unexpected_failure', 500) });

      await expectAsync(firstValueFrom(provider.acceptInvitation('', 'N', 'pw'))).toBeRejected();
    });

    it('fails when this build has no project', async () => {
      await expectAsync(firstValueFrom(makeUnconfigured().acceptInvitation('', 'N', 'pw'))).toBeRejected();
    });
  });
});
