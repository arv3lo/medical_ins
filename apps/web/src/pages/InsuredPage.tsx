import {
  AFFILIATION_STATUS_LABELS,
  AFFILIATION_STATUSES,
  HOLDER_STATUS_LABELS,
  type AffiliationStatus,
  type CurrentUser,
  type InsuredAffiliation,
} from '@medical-ins/shared';
import { type FormEvent, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { formatPeriod } from '@/components/affiliations/affiliations-table';
import { AffiliationStatusBadge } from '@/components/affiliations/affiliation-status-badge';
import { CenterPicker } from '@/components/center-picker';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDecideAffiliation, useInsuredAffiliations } from '@/lib/affiliations';
import { organizationsWith } from '@/lib/centers';
import { formatDate } from '@/lib/format';

/** The insurer's queue of affiliations declared by centers. */
export function InsuredPage() {
  const user = useOutletContext<CurrentUser>();
  const insurers = organizationsWith(user, 'insured.manage', 'insurer');
  const [params, setParams] = useSearchParams();
  const insurerId = insurers.find((i) => i.id === params.get('assureur'))?.id ?? insurers[0]?.id;
  const [status, setStatus] = useState<AffiliationStatus>('pending');

  if (!insurerId) return <p className="text-muted-foreground">Aucun assureur accessible.</p>;

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Assurés</h1>
        <div className="flex flex-wrap gap-2">
          <CenterPicker
            centers={insurers}
            value={insurerId}
            onChange={(id) => setParams({ assureur: id })}
          />
          <Select value={status} onValueChange={(v) => setStatus(v as AffiliationStatus)}>
            <SelectTrigger aria-label="Statut" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AFFILIATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {AFFILIATION_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <InsuredList insurerId={insurerId} status={status} />
    </section>
  );
}

function InsuredList({ insurerId, status }: { insurerId: string; status: AffiliationStatus }) {
  const affiliations = useInsuredAffiliations(insurerId, status);
  const decide = useDecideAffiliation(insurerId);

  if (affiliations.error) return <ErrorAlert error={affiliations.error} />;
  if (!affiliations.data) return <p className="text-muted-foreground">Chargement…</p>;
  if (affiliations.data.length === 0) {
    return <p className="text-muted-foreground">Aucune affiliation.</p>;
  }

  return (
    <div className="grid gap-4">
      {decide.error && <ErrorAlert error={decide.error} />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assuré</TableHead>
            <TableHead>N° d'assuré</TableHead>
            <TableHead>Qualité</TableHead>
            <TableHead>Période</TableHead>
            <TableHead>Statut</TableHead>
            {status === 'pending' && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {affiliations.data.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <div className="font-medium">
                  {a.patient.lastName} {a.patient.firstNames}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(a.patient.birthDate)}
                  {a.patient.nationalId && ` · CIN ${a.patient.nationalId}`}
                  {a.employer && ` · ${a.employer}`}
                </div>
              </TableCell>
              <TableCell>{a.memberNumber}</TableCell>
              <TableCell>{HOLDER_STATUS_LABELS[a.holderStatus]}</TableCell>
              <TableCell>{formatPeriod(a)}</TableCell>
              <TableCell>
                <AffiliationStatusBadge status={a.status} />
                {a.rejectionReason && (
                  <div className="text-xs text-muted-foreground">{a.rejectionReason}</div>
                )}
              </TableCell>
              {status === 'pending' && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: a.id })}
                    >
                      Valider
                    </Button>
                    <RejectDialog
                      affiliation={a}
                      pending={decide.isPending}
                      onReject={(reason) => decide.mutate({ id: a.id, reject: { reason } })}
                    />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RejectDialog({
  affiliation,
  pending,
  onReject,
}: {
  affiliation: InsuredAffiliation;
  pending: boolean;
  onReject: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onReject(reason);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          Refuser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refuser l'affiliation</DialogTitle>
          <DialogDescription>
            {affiliation.patient.lastName} {affiliation.patient.firstNames}, n°{' '}
            {affiliation.memberNumber}. Le centre verra le motif.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="reason">Motif</Label>
            <Input
              id="reason"
              value={reason}
              minLength={3}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="destructive">
            Refuser
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
