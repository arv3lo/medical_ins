import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** The one way pages show a failed request. */
export function ErrorAlert({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}
