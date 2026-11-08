import type { AccessMenu } from './access-levels';

export function canDeleteHousekeeping(menu: Pick<AccessMenu, 'level' | 'status'> | null | undefined) {
  return menu?.level === 'superadmin' && menu.status === 'active';
}