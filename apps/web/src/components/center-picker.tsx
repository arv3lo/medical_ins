import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Center } from '@/lib/centers';

/** Lets a user who works in several centers choose which one a page is about. */
export function CenterPicker({
  centers,
  value,
  onChange,
}: {
  centers: Center[];
  value: string;
  onChange: (centerId: string) => void;
}) {
  if (centers.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Centre" className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {centers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
