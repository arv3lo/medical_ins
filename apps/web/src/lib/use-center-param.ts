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
  const setCenterId = (id: string) => setParams((current) => withCenter(current, id));
  return { centers, centerId, setCenterId };
}

/**
 * `params` pointing at center `id`. The page's other params are kept on purpose: switching
 * center should not drop, say, a search the page keeps in the URL.
 */
export function withCenter(params: URLSearchParams, id: string): URLSearchParams {
  params.set('centre', id);
  return params;
}
