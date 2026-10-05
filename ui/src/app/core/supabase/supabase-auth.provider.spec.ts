import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

import type { Session } from '../auth.provider';
import { FIXTURE_INVITATIONS, FixtureAuthProvider } from '../fixtures/fixture-auth.provider';
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
}

function make(stub: Partial<ClientStub> = {}, origin = 'https://console.cyte.co.za') {
  const client: ClientStub = {
    signInWithPassword: jasmine
      .createSpy('signInWithPassword')
      .and.resolveTo({ data: { user: user(), session: {} }, error: null }),
    resetPasswordForEmail: jasmine
      .createSpy('resetPasswordForEmail')
      .and.resolveTo({ data: {}, error: null }),
    ...stub
  };

  TestBed.configureTestingModule({
    providers: [
      SupabaseAuthProvider,
      FixtureAuthProvider,
      { provide: SUPABASE_CLIENT, useValue: { auth: client } as unknown as SupabaseClient },
      { provide: DOCUMENT, useValue: { location: { origin } } }
    ]
  });

  return { client, provider: TestBed.inject(SupabaseAuthProvider) };
}

/** The same wiring with no project, which is what a blank environment builds. */
function makeUnconfigured() {
  TestBed.configureTestingModule({
    providers: [
      SupabaseAuthProvider,
      FixtureAuthProvider,
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

  describe('the two methods Supabase Auth cannot answer yet', () => {
    it('reads an invitation through the fixture, unchanged', async () => {
      const { provider } = make();
      const expected = FIXTURE_INVITATIONS[0]!;

      await expectAsync(firstValueFrom(provider.invitation(expected.token))).toBeResolvedTo(expected);
    });

    it('accepts an invitation through the fixture, unchanged', async () => {
      const { provider } = make();
      const valid = FIXTURE_INVITATIONS[0]!;

      const result = (await firstValueFrom(
        provider.acceptInvitation(valid.token, 'Lerato Khumalo', 'pw')
      )) as Session;

      expect(result.email).toBe(valid.email);
      expect(result.organisation).toBe(valid.organisation);
    });

    it('does not ask Supabase about either, so no half-built call reaches the project', async () => {
      const { client, provider } = make();

      await firstValueFrom(provider.invitation('valid-token'));
      await firstValueFrom(provider.acceptInvitation('valid-token', 'Name', 'pw'));

      expect(client.signInWithPassword).not.toHaveBeenCalled();
      expect(client.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });
});
