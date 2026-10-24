import { Badge } from '@/components/ui/badge';

export function ConsultationStatusBadge({ signedAt }: { signedAt: string | null }) {
  return signedAt ? (
    <Badge variant="secondary">Signée</Badge>
  ) : (
    <Badge variant="outline">Brouillon</Badge>
  );
}
