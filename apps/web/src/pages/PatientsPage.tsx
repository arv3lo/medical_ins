import { SEX_LABELS, type CreatePatientInput, type CurrentUser } from '@medical-ins/shared';
import { PlusIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { CenterPicker } from '@/components/center-picker';
import { ErrorAlert } from '@/components/error-alert';
import { DuplicateWarning } from '@/components/patients/duplicate-warning';
import { PatientForm } from '@/components/patients/patient-form';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { canIn, centersWith } from '@/lib/centers';
import { formatDate } from '@/lib/format';
import { duplicatesOf, useCreatePatient, useLinkPatient, usePatients } from '@/lib/patients';

/** The center a page is about: `?centre=` when the user may use it, else their first center. */
export function useCenterParam(user: CurrentUser) {
  const [params, setParams] = useSearchParams();
  const centers = centersWith(user, 'patient.read_admin');
  const requested = params.get('centre');
  const centerId = centers.find((c) => c.id === requested)?.id ?? centers[0]?.id;
  const setCenterId = (id: string) => setParams({ centre: id });
  return { centers, centerId, setCenterId };
}

export function PatientsPage() {
  const user = useOutletContext<CurrentUser>();
  const { centers, centerId, setCenterId } = useCenterParam(user);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());

  if (!centerId) return <p className="text-muted-foreground">Aucun centre accessible.</p>;

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <div className="flex flex-wrap gap-2">
          <CenterPicker centers={centers} value={centerId} onChange={setCenterId} />
          {canIn(user, centerId, 'patient.create') && <NewPatientDialog centerId={centerId} />}
        </div>
      </div>
      <Input
        type="search"
        placeholder="Rechercher par nom, CIN ou téléphone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />
      <PatientsList centerId={centerId} query={deferredQuery} />
    </section>
  );
}

export function PatientsList({ centerId, query }: { centerId: string; query: string }) {
  const patients = usePatients(centerId, query);

  if (patients.error) return <ErrorAlert error={patients.error} />;
  if (!patients.data) return <p className="text-muted-foreground">Chargement…</p>;
  if (patients.data.length === 0) {
    return <p className="text-muted-foreground">Aucun patient trouvé.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Naissance</TableHead>
          <TableHead>Sexe</TableHead>
          <TableHead>CIN</TableHead>
          <TableHead>Téléphone</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {patients.data.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <Link
                to={`/patients/${p.id}?centre=${centerId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {p.lastName} {p.firstNames}
              </Link>
            </TableCell>
            <TableCell>{formatDate(p.birthDate)}</TableCell>
            <TableCell>{SEX_LABELS[p.sex]}</TableCell>
            <TableCell>{p.nationalId ?? '—'}</TableCell>
            <TableCell>{p.phone ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NewPatientDialog({ centerId }: { centerId: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CreatePatientInput | null>(null);
  const create = useCreatePatient(centerId);
  const link = useLinkPatient(centerId);
  const navigate = useNavigate();
  const duplicates = duplicatesOf(create.error);

  const openPatient = (patientId: string) => {
    setOpen(false);
    navigate(`/patients/${patientId}?centre=${centerId}`);
  };
  const submit = (input: CreatePatientInput) => {
    setValues(input);
    create.mutate(input, { onSuccess: (patient) => openPatient(patient.id) });
  };
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) create.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Nouveau patient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau patient</DialogTitle>
          <DialogDescription>
            Le dossier est partagé entre les centres qui suivent le patient.
          </DialogDescription>
        </DialogHeader>
        {duplicates && values ? (
          <DuplicateWarning
            duplicates={duplicates.duplicates}
            pending={create.isPending || link.isPending}
            onLink={(patientId) =>
              link.mutate(patientId, { onSuccess: () => openPatient(patientId) })
            }
            onCreateAnyway={
              duplicates.sameNationalId
                ? undefined
                : () => submit({ ...values, allowDuplicate: true })
            }
          />
        ) : (
          <>
            {create.error && <ErrorAlert error={create.error} />}
            <PatientForm submitLabel="Enregistrer" pending={create.isPending} onSubmit={submit} />
          </>
        )}
        {link.error && <ErrorAlert error={link.error} />}
      </DialogContent>
    </Dialog>
  );
}
