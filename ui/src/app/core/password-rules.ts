/**
 * The four rules the accept-invitation screen shows, stated by the design
 * reference as three lines: at least 12 characters, one number and one symbol,
 * upper and lower case.
 *
 * Every rule is evaluated on every call rather than short-circuiting, because
 * the screen shows each one's state as the visitor types rather than one
 * pass or fail.
 *
 * This decides nothing about security. No password reaches a server in this
 * feature, and when one does in feature 14 the service's own policy is the
 * authority; this is the feedback the design asks for, not a gate.
 */
export interface PasswordRules {
  readonly longEnough: boolean;
  readonly hasNumber: boolean;
  readonly hasSymbol: boolean;
  readonly hasBothCases: boolean;
}

export const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * A symbol is anything that is neither a letter nor a digit, which keeps the
 * rule true for the accented and non-Latin characters a passphrase may carry
 * rather than limiting it to an ASCII punctuation list.
 */
export function passwordRules(candidate: string): PasswordRules {
  return {
    longEnough: [...candidate].length >= MINIMUM_PASSWORD_LENGTH,
    hasNumber: /\p{Nd}/u.test(candidate),
    hasSymbol: /[^\p{L}\p{Nd}]/u.test(candidate),
    hasBothCases: /\p{Lu}/u.test(candidate) && /\p{Ll}/u.test(candidate)
  };
}

export function passwordMeetsRules(candidate: string): boolean {
  return Object.values(passwordRules(candidate)).every(Boolean);
}

/**
 * What to say when the project refuses a password the screen's rules allowed:
 * its own policy, leaked-password protection included, goes beyond the three.
 * One sentence for the set-password and accept-invitation screens alike.
 */
export const WEAK_PASSWORD =
  'That password is too easy to guess, or has appeared in a known data breach. Choose a different one.';
