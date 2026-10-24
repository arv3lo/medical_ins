import { HOLDER_STATUS_LABELS, HOLDER_STATUSES, type HolderStatus } from '@medical-ins/shared';
import { PlusIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
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
import { useDeclareAffiliation, useInsurers } from '@/lib/affiliations';

const optional = (value: string) => value.trim() || undefined;

export function DeclareAffiliationDialog({
  centerId,
  patientId,
}: {
  centerId: string;
  patientId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          Déclarer une affiliation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Déclarer une affiliation</DialogTitle>
          <DialogDescription>
            L'affiliation sera active une fois validée par l'assureur.
          </DialogDescription>
        </DialogHeader>
        {/* Unmounted on close, so each opening starts from an empty form and no error. */}
        <DeclareAffiliationForm
          centerId={centerId}
          patientId={patientId}
          onDeclared={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeclareAffiliationForm({
  centerId,
  patientId,
  onDeclared,
}: {
  centerId: string;
  patientId: string;
  onDeclared: () => void;
}) {
  const insurers = useInsurers();
  const declare = useDeclareAffiliation(centerId, patientId);
  const [insurerId, setInsurerId] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [holderStatus, setHolderStatus] = useState<HolderStatus>('holder');
  const [planName, setPlanName] = useState('');
  const [employer, setEmployer] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    declare.mutate(
      {
        insurerId,
        memberNumber,
        holderStatus,
        planName: optional(planName),
        employer: optional(employer),
        startsOn,
        endsOn: optional(endsOn),
      },
      { onSuccess: onDeclared },
    );
  };

  return (
    <>
      {insurers.error && <ErrorAlert error={insurers.error} />}
      {declare.error && <ErrorAlert error={declare.error} />}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="insurer">Assureur</Label>
          <Select value={insurerId} onValueChange={setInsurerId} required>
            <SelectTrigger id="insurer" className="w-full">
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {insurers.data?.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="memberNumber">N° d'assuré</Label>
          <Input
            id="memberNumber"
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="holderStatus">Qualité</Label>
          <Select value={holderStatus} onValueChange={(v) => setHolderStatus(v as HolderStatus)}>
            <SelectTrigger id="holderStatus" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOLDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {HOLDER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="planName">Régime (facultatif)</Label>
          <Input id="planName" value={planName} onChange={(e) => setPlanName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="employer">Employeur (facultatif)</Label>
          <Input id="employer" value={employer} onChange={(e) => setEmployer(e.target.value)} />
        </div>
        <div />
        <div className="grid gap-2">
          <Label htmlFor="startsOn">Début</Label>
          <Input
            id="startsOn"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsOn">Fin (facultatif)</Label>
          <Input
            id="endsOn"
            type="date"
            min={startsOn || undefined}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={declare.isPending || !insurerId}>
            Déclarer
          </Button>
        </div>
      </form>
    </>
  );
}
