import type { Diagnosis } from '@medical-ins/shared';
import { XIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIcd10Search } from '@/lib/consultations';

/** Picks ICD-10 diagnoses; the first one added is primary until another is chosen. */
export function DiagnosisPicker({
  value,
  onChange,
}: {
  value: Diagnosis[];
  onChange: (diagnoses: Diagnosis[]) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useIcd10Search(useDeferredValue(query));
  const chosen = new Set(value.map((d) => d.code));

  const add = (code: string, label: string) => {
    onChange([...value, { code, label, primary: !value.some((d) => d.primary) }]);
    setQuery('');
  };
  const makePrimary = (code: string) =>
    onChange(value.map((d) => ({ ...d, primary: d.code === code })));
  const remove = (code: string) => onChange(value.filter((d) => d.code !== code));

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="grid gap-1">
          {value.map((d) => (
            <li key={d.code} className="flex items-center gap-2">
              <span className="font-mono text-sm">{d.code}</span>
              <span className="flex-1">{d.label}</span>
              {d.primary ? (
                <Badge>Principal</Badge>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => makePrimary(d.code)}>
                  Définir principal
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer ${d.code}`}
                onClick={() => remove(d.code)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="search"
        aria-label="Rechercher un diagnostic"
        placeholder="Code ou libellé CIM-10"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.data && query.trim().length >= 2 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border">
          {results.data.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Aucun code trouvé.</li>
          )}
          {results.data
            .filter((r) => !chosen.has(r.code))
            .map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => add(r.code, r.label)}
                >
                  <span className="font-mono">{r.code}</span> {r.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
