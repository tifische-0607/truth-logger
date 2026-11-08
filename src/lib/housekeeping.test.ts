import { describe, expect, it } from 'vitest';
import { canDeleteHousekeeping } from './housekeeping';
import type { AccessLevel } from './access-levels';

describe('housekeeping deletion authority', () => {
  it('allows active SuperAdmins', () => expect(canDeleteHousekeeping({ level: 'superadmin', status: 'active' })).toBe(true));
  it.each<AccessLevel>(['fa_staff', 'client_admin', 'client_staff', 'member'])('refuses %s', level => expect(canDeleteHousekeeping({ level, status: 'active' })).toBe(false));
  it('refuses inactive SuperAdmins', () => expect(canDeleteHousekeeping({ level: 'superadmin', status: 'inactive' })).toBe(false));
  it('refuses missing identity', () => expect(canDeleteHousekeeping(null)).toBe(false));
});