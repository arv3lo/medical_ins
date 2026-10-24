import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppointmentActions } from './appointment-actions';

const render = (status: Parameters<typeof AppointmentActions>[0]['status']) =>
  renderToString(<AppointmentActions status={status} pending={false} onChange={() => {}} />);

describe('AppointmentActions', () => {
  it('offers arrival, no-show and cancellation for a scheduled appointment', () => {
    const html = render('scheduled');
    expect(html).toContain('Arrivé');
    expect(html).toContain('Absent');
    expect(html).toContain('Annuler');
    expect(html).not.toContain('Terminé');
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
