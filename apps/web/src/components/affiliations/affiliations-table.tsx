import { HOLDER_STATUS_LABELS, isAffiliationActive, type Affiliation } from '@medical-ins/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { AffiliationStatusBadge } from './affiliation-status-badge';

export const formatPeriod = (a: Pick<Affiliation, 'startsOn' | 'endsOn'>) =>
  a.endsOn
    ? `${formatDate(a.startsOn)} au ${formatDate(a.endsOn)}`
    : `depuis le ${formatDate(a.startsOn)}`;

/** A patient's affiliations, as the center sees them. */
export function AffiliationsTable({
  affiliations,
  today,
}: {
  affiliations: Affiliation[];
  today: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assureur</TableHead>
          <TableHead>N° d'assuré</TableHead>
          <TableHead>Qualité</TableHead>
          <TableHead>Période</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {affiliations.map((a) => (
          <TableRow key={a.id}>
            <TableCell>
              <div className="font-medium">{a.insurerName}</div>
              {(a.planName || a.employer) && (
                <div className="text-xs text-muted-foreground">
                  {[a.planName, a.employer].filter(Boolean).join(' · ')}
                </div>
              )}
            </TableCell>
            <TableCell>{a.memberNumber}</TableCell>
            <TableCell>{HOLDER_STATUS_LABELS[a.holderStatus]}</TableCell>
            <TableCell>{formatPeriod(a)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <AffiliationStatusBadge status={a.status} />
                {isAffiliationActive(a, today) && <Badge>Couvert aujourd'hui</Badge>}
              </div>
              {a.rejectionReason && (
                <div className="text-xs text-muted-foreground">{a.rejectionReason}</div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
