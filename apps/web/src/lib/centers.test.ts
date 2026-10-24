import { describe, expect, it } from 'vitest';
import { CENTER_A, CENTER_B, INSURER, member, userWith } from '../test/users';
import { centersWith, organizationsWith } from './centers';

describe('centersWith', () => {
  it('lists each health center once where one of the roles grants the permission', () => {
    const user = userWith(
      member(CENTER_A, 'reception'),
      member(CENTER_A, 'doctor'),
      member(CENTER_B, 'billing'),
      member(INSURER, 'insurer_manager'),
    );
    expect(centersWith(user, 'patient.read_admin').map((c) => c.id)).toEqual([CENTER_A, CENTER_B]);
    expect(centersWith(user, 'patient.create').map((c) => c.id)).toEqual([CENTER_A]);
  });
});

describe('organizationsWith', () => {
  it('lists insurers where the user may manage insured people', () => {
    const user = userWith(member(CENTER_A, 'reception'), member(INSURER, 'insurer_manager'));
    expect(organizationsWith(user, 'insured.manage', 'insurer').map((o) => o.id)).toEqual([
      INSURER,
    ]);
  });
});
