import { StethoscopeIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStartConsultation } from '@/lib/consultations';

/** Opens a draft consultation for a patient seen without an appointment. */
export function StartConsultationDialog({
  centerId,
  patientId,
}: {
  centerId: string;
  patientId: string;
}) {
  const navigate = useNavigate();
  const start = useStartConsultation(centerId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    start.mutate(
      { patientId, reason },
      {
        onSuccess: (c) =>
          navigate(`/patients/${patientId}/consultations/${c.id}?centre=${centerId}`),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) start.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <StethoscopeIcon />
          Nouvelle consultation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle consultation</DialogTitle>
        </DialogHeader>
        {start.error && <ErrorAlert error={start.error} />}
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="consultation-reason">Motif</Label>
            <Input
              id="consultation-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={start.isPending} className="w-fit">
            Commencer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
