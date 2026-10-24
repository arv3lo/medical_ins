import {
  ORGANIZATION_TYPE_LABELS,
  ORGANIZATION_TYPES,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationType,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api';

export function OrganizationsPage() {
  const queryClient = useQueryClient();
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<Organization[]>('/organizations'),
  });
  const create = useMutation({
    mutationFn: (input: CreateOrganizationInput) =>
      api<Organization>('/organizations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
  const [type, setType] = useState<OrganizationType>('health_center');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { type, name, region: region || undefined },
      {
        onSuccess: () => {
          setName('');
          setRegion('');
        },
      },
    );
  };

  return (
    <section>
      <h1>Organisations</h1>
      <form className="inline" onSubmit={onSubmit}>
        <select value={type} onChange={(e) => setType(e.target.value as OrganizationType)}>
          {ORGANIZATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ORGANIZATION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Région" value={region} onChange={(e) => setRegion(e.target.value)} />
        <button type="submit" disabled={create.isPending}>
          Ajouter
        </button>
      </form>
      {create.error && <p className="error">{create.error.message}</p>}

      {organizations.isPending && <p>Chargement…</p>}
      {organizations.error && <p className="error">{organizations.error.message}</p>}
      {organizations.data && (
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Région</th>
            </tr>
          </thead>
          <tbody>
            {organizations.data.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{ORGANIZATION_TYPE_LABELS[o.type]}</td>
                <td>{o.region ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
