import { useId, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface TagInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Comma or Enter adds a tag. Used for skills, which the candidate must be able
 * to correct before an analysis runs.
 */
export function TagInput({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder = 'Type a skill and press Enter',
  maxTags = 50,
  maxLength = 60,
  disabled = false,
}: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const atLimit = value.length >= maxTags;

  const add = (raw: string) => {
    const candidate = raw.trim().slice(0, maxLength);
    if (!candidate || atLimit) return;
    if (value.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, candidate]);
    setDraft('');
  };

  const remove = (index: number) => {
    onChange(value.filter((_, position) => position !== index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
      return;
    }
    // Backspace on an empty field removes the last tag, as users expect.
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value.length - 1);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>

      <div
        className={cn(
          'rounded-lg border bg-white p-2',
          error ? 'border-red-400' : 'border-slate-300',
          disabled && 'bg-slate-50',
        )}
      >
        {value.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {value.map((tag, index) => (
              <li
                key={`${tag}-${index}`}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={`Remove ${tag}`}
                  className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => add(draft)}
            disabled={disabled || atLimit}
            maxLength={maxLength}
            placeholder={atLimit ? `Limit of ${maxTags} reached` : placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className="h-8 min-w-0 flex-1 border-0 px-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-0 disabled:bg-transparent"
          />
          <button
            type="button"
            onClick={() => add(draft)}
            disabled={disabled || atLimit || draft.trim() === ''}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
