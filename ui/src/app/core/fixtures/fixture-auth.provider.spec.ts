import { firstValueFrom } from 'rxjs';

import type { Invitation, Session } from '../auth.provider';
import {
  FIXTURE_EMAIL,
  FIXTURE_PASSWORD,
  FIXTURE_SESSION,
  FIXTURE_UNREACHABLE_EMAIL,
  FixtureAuthProvider
} from './fixture-auth.provider';

describe('FixtureAuthProvider', () => {
  let auth: FixtureAuthProvider;

  beforeEach(() => {
    auth = new FixtureAuthProvider();
  });

  describe('signIn', () => {
    it('answers with the session for the known credential', async () => {
      expect(await firstValueFrom(auth.signIn(FIXTURE_EMAIL, FIXTURE_PASSWORD))).toEqual(
        FIXTURE_SESSION
      );
    });

    it('ignores case and surrounding space in the address, as a login should', async () => {
      const result = await firstValueFrom(
        auth.signIn(`  ${FIXTURE_EMAIL.toUpperCase()} `, FIXTURE_PASSWORD)
      );

      expect(result).toEqual(FIXTURE_SESSION);
    });

    it('does not do the same to the password', async () => {
      expect(await firstValueFrom(auth.signIn(FIXTURE_EMAIL, ` ${FIXTURE_PASSWORD}`))).toBe(
        'denied'
      );
      expect(await firstValueFrom(auth.signIn(FIXTURE_EMAIL, FIXTURE_PASSWORD.toLowerCase()))).toBe(
        'denied'
      );
    });

    it('answers denied rather than erroring, so the screen shows a message', async () => {
      expect(await firstValueFrom(auth.signIn('nobody@cyte.co.za', 'whatever'))).toBe('denied');
    });
  });

  describe('requestPasswordReset', () => {
    it('answers the same for an unknown address as for a known one', async () => {
      await expectAsync(firstValueFrom(auth.requestPasswordReset(FIXTURE_EMAIL))).toBeResolved();
      await expectAsync(
        firstValueFrom(auth.requestPasswordReset('nobody@cyte.co.za'))
      ).toBeResolved();
    });

    it('errors for the one address that exists to reach the failure state', async () => {
      await expectAsync(
        firstValueFrom(auth.requestPasswordReset(FIXTURE_UNREACHABLE_EMAIL))
      ).toBeRejected();
    });
  });

  describe('invitation', () => {
    async function statusOf(token: string): Promise<Invitation> {
      return firstValueFrom(auth.invitation(token));
    }

    it('resolves each designed outcome from its own token', async () => {
      expect((await statusOf('valid-token')).status).toBe('valid');
      expect((await statusOf('expired-token')).status).toBe('expired');
      expect((await statusOf('revoked-token')).status).toBe('revoked');
    });

    it('answers unknown for a token nobody issued, rather than erroring', async () => {
      const unknown = await statusOf('typo');

      expect(unknown.status).toBe('unknown');
      expect(unknown.token).toBe('typo');
    });

    it('carries both dates on the expired one, which its screen prints', async () => {
      const expired = await statusOf('expired-token');

      expect(Date.parse(expired.sentAt)).not.toBeNaN();
      expect(Date.parse(expired.expiresAt)).toBeGreaterThan(Date.parse(expired.sentAt));
    });

    it('expires an invitation seven days after it was sent, as the design states', async () => {
      const week = 7 * 24 * 60 * 60 * 1000;

      for (const token of ['valid-token', 'expired-token', 'revoked-token']) {
        const invitation = await statusOf(token);

        expect(Date.parse(invitation.expiresAt) - Date.parse(invitation.sentAt))
          .withContext(token)
          .toBe(week);
      }
    });
  });

  describe('acceptInvitation', () => {
    it('signs the invitee in with the invitation\'s own organisation and role', async () => {
      const result = (await firstValueFrom(
        auth.acceptInvitation('valid-token', '  Lerato Khumalo ', 'Correct-horse-1')
      )) as Session;

      expect(result).toEqual({
        email: 'lerato.khumalo@cyte.co.za',
        fullName: 'Lerato Khumalo',
        organisation: 'Treasury Risk',
        role: 'Member'
      });
    });

    it('refuses an invitation that is not valid, whichever way it died', async () => {
      for (const token of ['expired-token', 'revoked-token', 'typo']) {
        expect(await firstValueFrom(auth.acceptInvitation(token, 'A Name', 'Correct-horse-1')))
          .withContext(token)
          .toBe('denied');
      }
    });
  });
});
