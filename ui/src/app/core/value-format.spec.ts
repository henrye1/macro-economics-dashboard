import { unitLabel } from './value-format';

describe('unitLabel', () => {
  it('is the unit alone when there is no scale', () => {
    expect(unitLabel('Percent', null)).toBe('Percent');
    expect(unitLabel('Percent', undefined)).toBe('Percent');
    expect(unitLabel('Percent', '   ')).toBe('Percent');
  });

  it('puts the scale beside the unit when there is one', () => {
    expect(unitLabel('National currency', 'Billions')).toBe('National currency (Billions)');
    expect(unitLabel('US dollars', ' Units ')).toBe('US dollars (Units)');
  });
});
