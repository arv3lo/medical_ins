import {
  SEX_LABELS,
  SEXES,
  today,
  type CreatePatientInput,
  type Patient,
  type Sex,
} from '@medical-ins/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Values = Omit<CreatePatientInput, 'allowDuplicate'>;

type Props = {
  initial?: Patient;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: Values) => void;
};

/** An emptied field is sent as null: on an update, that is what clears the stored value. */
export const blankToNull = (value: string) => value.trim() || null;

/** Administrative data of a patient, for registration and correction alike. */
export function PatientForm({ initial, submitLabel, pending, onSubmit }: Props) {
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [firstNames, setFirstNames] = useState(initial?.firstNames ?? '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [sex, setSex] = useState<Sex | ''>(initial?.sex ?? '');
  const [nationalId, setNationalId] = useState(initial?.nationalId ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!sex) return;
    onSubmit({
      lastName,
      firstNames,
      birthDate,
      sex,
      nationalId: blankToNull(nationalId),
      phone: blankToNull(phone),
      region: blankToNull(region),
      address: blankToNull(address),
    });
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <Field id="lastName" label="Nom">
        <Input
          id="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
      </Field>
      <Field id="firstNames" label="Prénoms">
        <Input
          id="firstNames"
          value={firstNames}
          onChange={(e) => setFirstNames(e.target.value)}
          required
        />
      </Field>
      <Field id="birthDate" label="Date de naissance">
        <Input
          id="birthDate"
          type="date"
          value={birthDate}
          max={today()}
          onChange={(e) => setBirthDate(e.target.value)}
          required
        />
      </Field>
      <Field id="sex" label="Sexe">
        <Select value={sex} onValueChange={(value) => setSex(value as Sex)} required>
          <SelectTrigger id="sex" className="w-full">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
          <SelectContent>
            {SEXES.map((s) => (
              <SelectItem key={s} value={s}>
                {SEX_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="nationalId" label="CIN (facultatif)">
        <Input
          id="nationalId"
          inputMode="numeric"
          placeholder="12 chiffres"
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value)}
        />
      </Field>
      <Field id="phone" label="Téléphone">
        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field id="region" label="Région">
        <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} />
      </Field>
      <Field id="address" label="Adresse">
        <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || !sex}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
