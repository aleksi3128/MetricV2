import { describe, expect, it } from 'vitest';

import { plainText } from './voice';

describe('ce qui se lit à voix haute', () => {
  it('retire le markdown sans retirer les mots', () => {
    expect(
      plainText(
        '## Demain\n- **Endurance** 40 min, `EF`\n- voir [la page](https://x.test/plan)\n1. Repos',
      ),
    ).toBe('Demain Endurance 40 min, EF voir la page Repos');
  });
});
