import { AFFILIATION_STATUS_LABELS, type AffiliationStatus } from '@medical-ins/shared';
import { Badge } from '@/components/ui/badge';

const VARIANTS = {
  pending: 'outline',
  validated: 'secondary',
  rejected: 'destructive',
  withdrawn: 'ghost',
} as const satisfies Record<AffiliationStatus, string>;

export function AffiliationStatusBadge({ status }: { status: AffiliationStatus }) {
  return <Badge variant={VARIANTS[status]}>{AFFILIATION_STATUS_LABELS[status]}</Badge>;
}
