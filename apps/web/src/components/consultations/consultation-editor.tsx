import {
  signingProblem,
  VITAL_LABELS,
  type Consultation,
  type Diagnosis,
} from '@medical-ins/shared';
import { useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { useSignConsultation, useUpdateConsultation } from '@/lib/consultations';
import { toVitals, toVitalsForm, VITALS, type VitalsForm } from '@/lib/vitals';
import { ConsultationStatusBadge } from './consultation-status-badge';
import { DiagnosisPicker } from './diagnosis-picker';

/** The author's draft: saved as often as needed, then signed once and for all. */
export function ConsultationEditor({
  centerId,
  consultation,
}: {
  centerId: string;
  consultation: Consultation;
}) {
  const update = useUpdateConsultation(centerId, consultation.id);
  const sign = useSignConsultation(centerId, consultation.id);
  const [reason, setReason] = useState(consultation.reason);
  const [examination, setExamination] = useState(consultation.examination ?? '');
  const [notes, setNotes] = useState(consultation.notes ?? '');
  const [vitals, setVitals] = useState<VitalsForm>(toVitalsForm(consultation.vitals));
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(consultation.diagnoses);

  const values = () => ({
    reason,
    examination,
    notes,
    vitals: toVitals(vitals),
    diagnoses: diagnoses.map(({ code, primary }) => ({ code, primary })),
  });
  const save = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(values());
  };
  // Signs what is on screen: unsaved changes would otherwise be lost to the read-only record.
  const saveAndSign = () => update.mutate(values(), { onSuccess: () => sign.mutate() });
  const problem = signingProblem({ diagnoses });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Consultation</CardTitle>
        <ConsultationStatusBadge signedAt={null} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={save}>
          {update.error && <ErrorAlert error={update.error} />}
          {sign.error && <ErrorAlert error={sign.error} />}
          <div className="grid gap-2">
            <Label htmlFor="reason">Motif</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">Constantes</legend>
            {VITALS.map((vital) => (
              <div key={vital} className="grid gap-2">
                <Label htmlFor={vital}>
                  {VITAL_LABELS[vital].label}{' '}
                  <span className="text-muted-foreground">({VITAL_LABELS[vital].unit})</span>
                </Label>
                <Input
                  id={vital}
                  inputMode="decimal"
                  value={vitals[vital]}
                  onChange={(e) => setVitals({ ...vitals, [vital]: e.target.value })}
                />
              </div>
            ))}
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="examination">Examen clinique</Label>
            <Textarea
              id="examination"
              value={examination}
              onChange={(e) => setExamination(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Diagnostics</Label>
            <DiagnosisPicker value={diagnoses} onChange={setDiagnoses} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={update.isPending}>
              Enregistrer le brouillon
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" disabled={Boolean(problem)} title={problem ?? undefined}>
                  Signer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Signer la consultation ?</DialogTitle>
                  <DialogDescription>
                    Une fois signée, la consultation ne peut plus être modifiée. Les corrections se
                    font par avenant.
                  </DialogDescription>
                </DialogHeader>
                <Button
                  onClick={saveAndSign}
                  disabled={update.isPending || sign.isPending}
                  className="w-fit"
                >
                  Enregistrer et signer
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
