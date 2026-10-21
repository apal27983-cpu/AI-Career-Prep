import { useState } from 'react';
import { Save } from 'lucide-react';
import type { ParsedResume } from '@career-prep/shared';
import { Button } from '../ui/Button';
import { TextAreaField, TextField } from '../ui/Field';
import { TagInput } from '../ui/TagInput';
import { ErrorState } from '../ui/States';
import { useAsyncAction } from '../../hooks/useAsync';

type ListKey = 'education' | 'workExperience' | 'projects' | 'certifications' | 'achievements';

const LIST_FIELDS: Array<{ key: ListKey; label: string; hint: string }> = [
  { key: 'workExperience', label: 'Work experience', hint: 'One role or responsibility per line.' },
  { key: 'education', label: 'Education', hint: 'One qualification per line.' },
  { key: 'projects', label: 'Projects', hint: 'One project per line.' },
  { key: 'certifications', label: 'Certifications', hint: 'One certification per line.' },
  { key: 'achievements', label: 'Achievements', hint: 'One achievement per line.' },
];

/**
 * Extraction is heuristic, so everything here is editable and nothing is
 * pre-filled with a guess. An empty field means "we could not establish this",
 * not "this does not exist".
 */
export function ParsedResumeEditor({
  value,
  onSave,
}: {
  value: ParsedResume;
  onSave: (next: ParsedResume) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ParsedResume>(value);
  const [dirty, setDirty] = useState(false);

  const update = <K extends keyof ParsedResume>(key: K, next: ParsedResume[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
    setDirty(true);
  };

  const save = useAsyncAction(async () => onSave(draft), {
    onSuccess: () => setDirty(false),
  });

  const emptyCount = [
    draft.candidateName,
    draft.email,
    draft.phone,
    draft.summary,
  ].filter((field) => !field).length;

  return (
    <div className="space-y-5">
      {save.error ? <ErrorState error={save.error} onRetry={() => void save.run()} /> : null}

      {emptyCount > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {emptyCount} contact field{emptyCount === 1 ? '' : 's'} could not be read confidently
          from your file. Fill them in so the analysis has accurate input.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          value={draft.candidateName ?? ''}
          onChange={(event) => update('candidateName', event.target.value || null)}
        />
        <TextField
          label="Email"
          type="email"
          value={draft.email ?? ''}
          onChange={(event) => update('email', event.target.value || null)}
        />
        <TextField
          label="Phone"
          value={draft.phone ?? ''}
          onChange={(event) => update('phone', event.target.value || null)}
        />
      </div>

      <TextAreaField
        label="Professional summary"
        rows={3}
        value={draft.summary ?? ''}
        onChange={(event) => update('summary', event.target.value || null)}
      />

      <TagInput
        label="Skills"
        value={draft.skills}
        onChange={(next) => update('skills', next)}
        maxTags={120}
        hint="These feed the skill gap analysis. Remove anything the file picked up by mistake."
      />

      {LIST_FIELDS.map((field) => (
        <TextAreaField
          key={field.key}
          label={field.label}
          hint={field.hint}
          rows={4}
          value={draft[field.key].join('\n')}
          onChange={(event) =>
            update(
              field.key,
              event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            )
          }
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void save.run()}
          loading={save.loading}
          loadingLabel="Saving changes..."
          disabled={!dirty}
          icon={<Save className="h-4 w-4" />}
        >
          Save corrections
        </Button>
        {dirty && !save.loading ? (
          <span className="text-xs text-slate-500">You have unsaved changes.</span>
        ) : null}
      </div>
    </div>
  );
}
