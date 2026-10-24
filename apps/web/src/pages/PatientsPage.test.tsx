import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { DuplicateWarning } from '../components/patients/duplicate-warning';
import { failWith, render, testQueryClient } from '../test/render';
import { CENTER_A } from '../test/users';
import { PatientsList } from './PatientsPage';

describe('PatientsList', () => {
  it('shows why the patients could not be loaded', async () => {
    const queryClient = testQueryClient();
    await queryClient.prefetchQuery({
      queryKey: ['patients', CENTER_A, ''],
      queryFn: failWith(403, 'Accès refusé'),
    });
    const html = render(queryClient, <PatientsList centerId={CENTER_A} query="" />);
    expect(html).toContain('Accès refusé');
  });
});

describe('DuplicateWarning', () => {
  it('lists the patients that look like the one being registered', () => {
    const html = renderToString(
      <MemoryRouter>
        <DuplicateWarning
          message="Un patient existe déjà avec ce CIN"
          duplicates={[
            {
              id: '1',
              lastName: 'Rakoto',
              firstNames: 'Jean',
              birthDate: '1985-03-12',
              sex: 'male',
            },
          ]}
          onLink={() => {}}
          onCreateAnyway={() => {}}
          pending={false}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Rakoto Jean');
    expect(html).toContain('12/03/1985');
    // The API says why: a CIN match is certain, not a mere resemblance.
    expect(html).toContain('Un patient existe déjà avec ce CIN');
    expect(html).not.toContain('semble déjà enregistré');
  });
});
