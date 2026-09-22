import { MINIMUM_PASSWORD_LENGTH, passwordMeetsRules, passwordRules } from './password-rules';

describe('passwordRules', () => {
  it('reports every rule on every call, so the screen can show each state', () => {
    expect(passwordRules('')).toEqual({
      longEnough: false,
      hasNumber: false,
      hasSymbol: false,
      hasBothCases: false
    });
  });

  it('measures length at the boundary, not one either side of it', () => {
    const short = 'Aa1!'.padEnd(MINIMUM_PASSWORD_LENGTH - 1, 'x');
    const exact = 'Aa1!'.padEnd(MINIMUM_PASSWORD_LENGTH, 'x');

    expect(short.length).toBe(MINIMUM_PASSWORD_LENGTH - 1);
    expect(passwordRules(short).longEnough).toBeFalse();
    expect(passwordRules(exact).longEnough).toBeTrue();
  });

  it('counts an astral character as one, not as its two code units', () => {
    // Eleven emoji are 22 UTF-16 code units. Length alone would pass a rule
    // the visitor has not met.
    const eleven = '\u{1F600}'.repeat(11);

    expect(eleven.length).toBe(22);
    expect(passwordRules(eleven).longEnough).toBeFalse();
  });

  it('accepts any non-letter non-digit as the symbol, not an ASCII list', () => {
    expect(passwordRules('a').hasSymbol).toBeFalse();
    expect(passwordRules('1').hasSymbol).toBeFalse();
    expect(passwordRules('!').hasSymbol).toBeTrue();
    expect(passwordRules(' ').hasSymbol).toBeTrue();
    expect(passwordRules('©').hasSymbol).toBeTrue();
  });

  it('counts a non-ASCII digit as a number', () => {
    // Arabic-Indic five. A \d test would miss it.
    expect(passwordRules('٥').hasNumber).toBeTrue();
  });

  it('needs both cases, not either', () => {
    expect(passwordRules('lower').hasBothCases).toBeFalse();
    expect(passwordRules('UPPER').hasBothCases).toBeFalse();
    expect(passwordRules('Mixed').hasBothCases).toBeTrue();
  });

  it('treats a caseless script as failing the case rule rather than crashing', () => {
    // Hebrew has no case, so the rule cannot be met. The point is that it
    // answers rather than throwing.
    expect(passwordRules('א'.repeat(14)).hasBothCases).toBeFalse();
  });
});

describe('passwordMeetsRules', () => {
  it('is true only when every rule passes', () => {
    expect(passwordMeetsRules('Correct-horse-1')).toBeTrue();
  });

  it('fails on the one missing rule, whichever it is', () => {
    expect(passwordMeetsRules('Correct-horse')).toBeFalse();
    expect(passwordMeetsRules('correct-horse-1')).toBeFalse();
    expect(passwordMeetsRules('CorrectHorse1')).toBeFalse();
    expect(passwordMeetsRules('Corr-1')).toBeFalse();
  });
});
