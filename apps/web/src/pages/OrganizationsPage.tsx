import {
  ORGANIZATION_TYPE_LABELS,
  ORGANIZATION_TYPES,
  type CreateOrganizationInput,
  type Organization,
  type OrganizationType,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Organisations</h1>
      <form className="flex flex-wrap gap-2" onSubmit={onSubmit}>
        <Select value={type} onValueChange={(value) => setType(value as OrganizationType)}>
          <SelectTrigger aria-label="Type" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIZATION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ORGANIZATION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          placeholder="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          className="w-64"
          placeholder="Région"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Ajouter
        </Button>
      </form>
      {create.error && <ErrorAlert error={create.error} />}

      {organizations.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {organizations.error && <ErrorAlert error={organizations.error} />}
      {organizations.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Région</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.data.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.name}</TableCell>
                <TableCell>{ORGANIZATION_TYPE_LABELS[o.type]}</TableCell>
                <TableCell>{o.region ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
