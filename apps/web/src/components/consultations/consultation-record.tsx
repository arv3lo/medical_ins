import type { Consultation } from '@medical-ins/shared';
import { VITAL_LABELS } from '@medical-ins/shared';
import { useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAddAddendum } from '@/lib/consultations';
import { formatLocalDate, formatTime } from '@/lib/format';
import { formatVital, VITALS } from '@/lib/vitals';
import { ConsultationStatusBadge } from './consultation-status-badge';

const when = (instant: string) => `${formatLocalDate(instant)} à ${formatTime(instant)}`;

/** A consultation as recorded: read-only once signed, corrected only through addenda. */
export function ConsultationRecord({
  centerId,
  consultation,
  canAmend,
}: {
  centerId: string;
  consultation: Consultation;
  canAmend: boolean;
}) {
  const measured = VITALS.filter((vital) => consultation.vitals[vital] !== undefined);
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{consultation.reason}</CardTitle>
          <ConsultationStatusBadge signedAt={consultation.signedAt} />
        </CardHeader>
        <CardContent className="grid gap-6">
          <p className="text-sm text-muted-foreground">
            {consultation.doctor.fullName} · {consultation.organization.name}
            {consultation.signedAt && ` · signée le ${when(consultation.signedAt)}`}
          </p>
          {measured.length > 0 && (
            <dl className="grid gap-4 sm:grid-cols-4">
              {measured.map((vital) => (
                <div key={vital}>
                  <dt className="text-sm text-muted-foreground">{VITAL_LABELS[vital].label}</dt>
                  <dd>{formatVital(vital, consultation.vitals[vital]!)}</dd>
                </div>
              ))}
            </dl>
          )}
          <Section title="Examen" text={consultation.examination} />
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Diagnostics</h3>
            <ul className="grid gap-1">
              {consultation.diagnoses.map((d) => (
                <li key={d.code} className="flex items-center gap-2">
                  <span className="font-mono text-sm">{d.code}</span>
                  <span>{d.label}</span>
                  {d.primary && <Badge>Principal</Badge>}
                </li>
              ))}
            </ul>
          </div>
          <Section title="Notes" text={consultation.notes} />
        </CardContent>
      </Card>
      {(consultation.addenda.length > 0 || canAmend) && (
        <Card>
          <CardHeader>
            <CardTitle>Avenants</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {consultation.addenda.map((a) => (
              <div key={a.id} className="grid gap-1 border-l-2 pl-4">
                <p className="text-sm text-muted-foreground">
                  {a.author.fullName} · {when(a.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{a.content}</p>
              </div>
            ))}
            {canAmend && <AddendumForm centerId={centerId} consultationId={consultation.id} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function AddendumForm({ centerId, consultationId }: { centerId: string; consultationId: string }) {
  const add = useAddAddendum(centerId, consultationId);
  const [content, setContent] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(content, { onSuccess: () => setContent('') });
  };
  return (
    <form className="grid gap-2" onSubmit={submit}>
      {add.error && <ErrorAlert error={add.error} />}
      <Label htmlFor="addendum">Nouvel avenant</Label>
      <Textarea
        id="addendum"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
      />
      <Button type="submit" className="w-fit" disabled={add.isPending || !content.trim()}>
        Ajouter un avenant
      </Button>
    </form>
  );
}
