import {
  MAX_APPOINTMENT_RANGE_DAYS,
  SEX_LABELS,
  type CurrentUser,
  type Patient,
} from '@medical-ins/shared';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { today } from '@medical-ins/shared';
import { AffiliationsTable } from '@/components/affiliations/affiliations-table';
import { AppointmentsTable } from '@/components/appointments/appointments-table';
import { BookAppointmentDialog } from '@/components/appointments/book-appointment-dialog';
import { ConsultationsTable } from '@/components/consultations/consultations-table';
import { StartConsultationDialog } from '@/components/consultations/start-consultation-dialog';
import { DeclareAffiliationDialog } from '@/components/affiliations/declare-affiliation-dialog';
import { ErrorAlert } from '@/components/error-alert';
import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canIn } from '@/lib/centers';
import { usePatientAffiliations, useWithdrawAffiliation } from '@/lib/affiliations';
import { useAppointments } from '@/lib/appointments';
import { usePatientConsultations } from '@/lib/consultations';
import { addDays, daysRange, formatDate, localToday } from '@/lib/format';
import { usePatient, useUpdatePatient } from '@/lib/patients';
import { useCenterParam } from '@/lib/use-center-param';

export function PatientPage() {
  const user = useOutletContext<CurrentUser>();
  const { patientId = '' } = useParams();
  const { centerId } = useCenterParam(user, 'patient.read_admin');

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
      {patient.data && canIn(user, centerId, 'appointment.read') && (
        <AppointmentsCard
          centerId={centerId}
          patient={patient.data}
          canManage={canIn(user, centerId, 'appointment.manage')}
        />
      )}
      {patient.data && canIn(user, centerId, 'medical_record.read') && (
        <ConsultationsCard
          centerId={centerId}
          patientId={patientId}
          canWrite={canIn(user, centerId, 'medical_record.write')}
        />
      )}
      {patient.data && (
        <AffiliationsCard
          centerId={centerId}
          patientId={patientId}
          canDeclare={canIn(user, centerId, 'patient.update')}
        />
      )}
    </section>
  );
}

function AffiliationsCard({
  centerId,
  patientId,
  canDeclare,
}: {
  centerId: string;
  patientId: string;
  canDeclare: boolean;
}) {
  const affiliations = usePatientAffiliations(centerId, patientId);
  const withdraw = useWithdrawAffiliation(centerId, patientId);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Affiliations</CardTitle>
        {canDeclare && <DeclareAffiliationDialog centerId={centerId} patientId={patientId} />}
      </CardHeader>
      <CardContent>
        {affiliations.error && <ErrorAlert error={affiliations.error} />}
        {withdraw.error && <ErrorAlert error={withdraw.error} />}
        {affiliations.data?.length === 0 && (
          <p className="text-muted-foreground">Aucune affiliation déclarée.</p>
        )}
        {affiliations.data && affiliations.data.length > 0 && (
          <AffiliationsTable
            affiliations={affiliations.data}
            today={today()}
            withdrawableFrom={canDeclare ? centerId : undefined}
            onWithdraw={(id) => withdraw.mutate(id)}
            withdrawing={withdraw.isPending}
          />
        )}
      </CardContent>
    </Card>
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

function AppointmentsCard({
  centerId,
  patient,
  canManage,
}: {
  centerId: string;
  patient: Patient;
  canManage: boolean;
}) {
  // Last month and the next two: the widest range one list may cover.
  const range = daysRange(addDays(localToday(), -30), MAX_APPOINTMENT_RANGE_DAYS);
  const appointments = useAppointments(centerId, { ...range, patientId: patient.id });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Rendez-vous</CardTitle>
          <p className="text-sm text-muted-foreground">Le mois passé et les deux prochains</p>
        </div>
        {canManage && <BookAppointmentDialog centerId={centerId} patient={patient} />}
      </CardHeader>
      <CardContent>
        {appointments.error && <ErrorAlert error={appointments.error} />}
        {appointments.data?.length === 0 && (
          <p className="text-muted-foreground">Aucun rendez-vous.</p>
        )}
        {appointments.data && appointments.data.length > 0 && (
          <AppointmentsTable
            centerId={centerId}
            appointments={appointments.data}
            canManage={canManage}
            showDate
            showPatient={false}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ConsultationsCard({
  centerId,
  patientId,
  canWrite,
}: {
  centerId: string;
  patientId: string;
  canWrite: boolean;
}) {
  const consultations = usePatientConsultations(centerId, patientId);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Consultations</CardTitle>
        {canWrite && <StartConsultationDialog centerId={centerId} patientId={patientId} />}
      </CardHeader>
      <CardContent>
        {consultations.error && <ErrorAlert error={consultations.error} />}
        {consultations.data?.length === 0 && (
          <p className="text-muted-foreground">Aucune consultation.</p>
        )}
        {consultations.data && consultations.data.length > 0 && (
          <ConsultationsTable centerId={centerId} consultations={consultations.data} />
        )}
      </CardContent>
    </Card>
  );
}
