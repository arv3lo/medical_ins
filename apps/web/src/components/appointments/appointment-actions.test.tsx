import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppointmentActions } from './appointment-actions';

const NOW = new Date('2026-11-03T09:00:00+03:00');
const PAST = '2026-11-03T08:30:00+03:00';

const render = (
  status: Parameters<typeof AppointmentActions>[0]['status'],
  startsAt: string = PAST,
) =>
  renderToString(
    <AppointmentActions
      status={status}
      startsAt={startsAt}
      now={NOW}
      pending={false}
      onChange={() => {}}
    />,
  );

describe('AppointmentActions', () => {
  it('offers arrival, no-show and cancellation for a scheduled appointment', () => {
    const html = render('scheduled');
    expect(html).toContain('Arrivé');
    expect(html).toContain('Absent');
    expect(html).toContain('Annuler');
    expect(html).not.toContain('Terminé');
  });

  it('only offers to cancel an appointment that is days away', () => {
    const html = render('scheduled', '2026-11-10T09:00:00+03:00');
    expect(html).toContain('Annuler');
    expect(html).not.toContain('Arrivé');
    expect(html).not.toContain('Absent');
  });

  it('offers arrival, not yet no-show, within the hour before the start', () => {
    const html = render('scheduled', '2026-11-03T09:45:00+03:00');
    expect(html).toContain('Arrivé');
    expect(html).not.toContain('Absent');
  });

  it('only offers to finish once the patient arrived', () => {
    const html = render('arrived');
    expect(html).toContain('Terminé');
    expect(html).not.toContain('Annuler');
  });

  it('offers nothing for a final status', () => {
    expect(render('completed')).not.toContain('button');
  });
});
