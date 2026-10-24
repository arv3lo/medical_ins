import { SEX_LABELS, type CurrentUser, type Patient } from '@medical-ins/shared';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { ErrorAlert } from '@/components/error-alert';
import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canIn } from '@/lib/centers';
import { formatDate } from '@/lib/format';
import { usePatient, useUpdatePatient } from '@/lib/patients';
import { useCenterParam } from './PatientsPage';

export function PatientPage() {
  const user = useOutletContext<CurrentUser>();
  const { patientId = '' } = useParams();
  const { centerId } = useCenterParam(user);

  if (!centerId) return <p className="text-muted-foreground">Aucun centre accessible.</p>;
  return <PatientDetails user={user} centerId={centerId} patientId={patientId} />;
}

function PatientDetails({
  user,
  centerId,
  patientId,
}: {
  user: CurrentUser;
  centerId: string;
  patientId: string;
}) {
  const patient = usePatient(centerId, patientId);
  const [editing, setEditing] = useState(false);

  return (
    <section className="grid gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to={`/patients?centre=${centerId}`}>
          <ArrowLeftIcon />
          Patients
        </Link>
      </Button>
      {patient.error && <ErrorAlert error={patient.error} />}
      {patient.data && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">
              {patient.data.lastName} {patient.data.firstNames}
            </CardTitle>
            {canIn(user, centerId, 'patient.update') && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <EditPatient
                centerId={centerId}
                patient={patient.data}
                onDone={() => setEditing(false)}
              />
            ) : (
              <PatientFacts patient={patient.data} />
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function PatientFacts({ patient }: { patient: Patient }) {
  const facts: [string, string][] = [
    ['Date de naissance', formatDate(patient.birthDate)],
    ['Sexe', SEX_LABELS[patient.sex]],
    ['CIN', patient.nationalId ?? '—'],
    ['Téléphone', patient.phone ?? '—'],
    ['Région', patient.region ?? '—'],
    ['Adresse', patient.address ?? '—'],
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditPatient({
  centerId,
  patient,
  onDone,
}: {
  centerId: string;
  patient: Patient;
  onDone: () => void;
}) {
  const update = useUpdatePatient(centerId, patient.id);
  return (
    <div className="grid gap-4">
      {update.error && <ErrorAlert error={update.error} />}
      <PatientForm
        initial={patient}
        submitLabel="Enregistrer les modifications"
        pending={update.isPending}
        onSubmit={(values) => update.mutate(values, { onSuccess: onDone })}
      />
    </div>
  );
}
