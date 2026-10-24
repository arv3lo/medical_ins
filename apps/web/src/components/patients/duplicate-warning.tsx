import { SEX_LABELS, type PatientSummary } from '@medical-ins/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

type Props = {
  /** The API's message: a CIN match is certain, a name and birth date match only probable. */
  message: string;
  duplicates: PatientSummary[];
  onLink: (patientId: string) => void;
  /** Absent when the CIN matches: two people never share one. */
  onCreateAnyway?: () => void;
  pending: boolean;
};

/** Shown when the API finds a patient that is probably the one being registered. */
export function DuplicateWarning({ message, duplicates, onLink, onCreateAnyway, pending }: Props) {
  return (
    <Alert>
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription className="grid w-full gap-3">
        <ul className="grid w-full gap-2">
          {duplicates.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span>
                {`${d.lastName} ${d.firstNames}`} · {formatDate(d.birthDate)} · {SEX_LABELS[d.sex]}
              </span>
              <Button size="sm" disabled={pending} onClick={() => onLink(d.id)}>
                C'est ce patient
              </Button>
            </li>
          ))}
        </ul>
        {onCreateAnyway && (
          <Button variant="outline" size="sm" disabled={pending} onClick={onCreateAnyway}>
            C'est une autre personne, enregistrer quand même
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
