import type { CurrentUser, Permission } from '@medical-ins/shared';
import { useSearchParams } from 'react-router';
import { centersWith } from './centers';

/**
 * The center a page is about: `?centre=` when the user holds `permission` there, else the first
 * center where they do.
 */
export function useCenterParam(user: CurrentUser, permission: Permission) {
  const [params, setParams] = useSearchParams();
  const centers = centersWith(user, permission);
  const requested = params.get('centre');
  const centerId = centers.find((c) => c.id === requested)?.id ?? centers[0]?.id;
  const setCenterId = (id: string) =>
    setParams((current) => {
      current.set('centre', id);
      return current;
    });
  return { centers, centerId, setCenterId };
}
