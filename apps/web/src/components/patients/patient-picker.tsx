import type { Patient } from '@medical-ins/shared';
import { useDeferredValue, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { usePatients } from '@/lib/patients';

type Picked = Pick<Patient, 'id' | 'lastName' | 'firstNames'>;

/** Search the center's patients and pick one. */
export function PatientPicker({
  centerId,
  value,
  onChange,
}: {
  centerId: string;
  value: Picked | null;
  onChange: (patient: Picked | null) => void;
}) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const patients = usePatients(centerId, deferred);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="font-medium">
          {value.lastName} {value.firstNames}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Input
        type="search"
        placeholder="Nom, CIN, téléphone ou n° d'assuré"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {deferred && (
        <ul className="max-h-48 overflow-y-auto rounded-md border">
          {patients.data?.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Aucun patient trouvé.</li>
          )}
          {patients.data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onChange(p)}
              >
                <span className="font-medium">
                  {p.lastName} {p.firstNames}
                </span>{' '}
                <span className="text-muted-foreground">· {formatDate(p.birthDate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
