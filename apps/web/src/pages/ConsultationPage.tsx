import type { CurrentUser } from '@medical-ins/shared';
import { ArrowLeftIcon } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router';
import { ConsultationEditor } from '@/components/consultations/consultation-editor';
import { ConsultationRecord } from '@/components/consultations/consultation-record';
import { ErrorAlert } from '@/components/error-alert';
import { Button } from '@/components/ui/button';
import { canIn } from '@/lib/centers';
import { useConsultation } from '@/lib/consultations';
import { useCenterParam } from '@/lib/use-center-param';

export function ConsultationPage() {
  const user = useOutletContext<CurrentUser>();
  const { patientId = '', consultationId = '' } = useParams();
  const { centerId } = useCenterParam(user, 'medical_record.read');

  if (!centerId) return <p className="text-muted-foreground">Aucun centre accessible.</p>;
  return (
    <section className="grid gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to={`/patients/${patientId}?centre=${centerId}`}>
          <ArrowLeftIcon />
          Dossier du patient
        </Link>
      </Button>
      <Consultation user={user} centerId={centerId} consultationId={consultationId} />
    </section>
  );
}

function Consultation({
  user,
  centerId,
  consultationId,
}: {
  user: CurrentUser;
  centerId: string;
  consultationId: string;
}) {
  const consultation = useConsultation(centerId, consultationId);
  if (consultation.error) return <ErrorAlert error={consultation.error} />;
  if (!consultation.data) return <p className="text-muted-foreground">Chargement…</p>;

  const c = consultation.data;
  // Drafts only reach their author; addenda are written by the center that signed it.
  if (!c.signedAt) return <ConsultationEditor key={c.id} centerId={centerId} consultation={c} />;
  const canAmend = c.organizationId === centerId && canIn(user, centerId, 'medical_record.write');
  return <ConsultationRecord centerId={centerId} consultation={c} canAmend={canAmend} />;
}
