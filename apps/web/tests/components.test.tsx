import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnswerEvaluation } from '@career-prep/shared';
import { renderWithProviders } from './helpers';
import {
  ResumeDropzone,
  validateSelection,
} from '../src/components/feature/ResumeDropzone';
import { FeedbackPanel } from '../src/components/feature/FeedbackPanel';
import { ParsedResumeEditor } from '../src/components/feature/ParsedResumeEditor';
import { ErrorState, EmptyState, ScoreBar } from '../src/components/ui/States';
import { ProgressStages } from '../src/components/ui/Spinner';
import { ApiError } from '../src/services/api';

const MAX_BYTES = 5 * 1024 * 1024;

function makeFile(name: string, size: number, type: string): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('resume upload validation', () => {
  it('accepts a PDF within the size limit', () => {
    expect(validateSelection(makeFile('cv.pdf', 1024, 'application/pdf'), MAX_BYTES)).toBeNull();
  });

  it('accepts a DOCX', () => {
    const file = makeFile(
      'cv.docx',
      2048,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(validateSelection(file, MAX_BYTES)).toBeNull();
  });

  it('rejects an unsupported extension', () => {
    expect(validateSelection(makeFile('cv.txt', 1024, 'text/plain'), MAX_BYTES)).toMatch(
      /only pdf and docx/i,
    );
  });

  it('rejects an oversized file and names the limit', () => {
    const error = validateSelection(makeFile('cv.pdf', 9 * 1024 * 1024, 'application/pdf'), MAX_BYTES);
    expect(error).toMatch(/9\.00 MB/);
    expect(error).toMatch(/5\.00 MB/);
  });

  it('rejects an empty file', () => {
    expect(validateSelection(makeFile('cv.pdf', 0, 'application/pdf'), MAX_BYTES)).toMatch(/empty/i);
  });

  it('shows the file name, type and size once chosen', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <ResumeDropzone maxBytes={MAX_BYTES} uploading={false} progress={null} onSelect={onSelect} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile('resume.pdf', 2048, 'application/pdf'));

    expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    expect(screen.getByText(/PDF document/)).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('does not start an upload for a file that is too large', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <ResumeDropzone maxBytes={MAX_BYTES} uploading={false} progress={null} onSelect={onSelect} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // A valid type, so the file picker accepts it and our own check has to catch it.
    await userEvent.upload(input, makeFile('huge.pdf', 9 * 1024 * 1024, 'application/pdf'));

    expect(screen.getByRole('alert')).toHaveTextContent(/9\.00 MB/);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('labels an unsupported file by what it actually is', () => {
    const onReject = vi.fn();
    const { container } = renderWithProviders(
      <ResumeDropzone
        maxBytes={MAX_BYTES}
        uploading={false}
        progress={null}
        onSelect={() => {}}
        onReject={onReject}
      />,
    );

    // The file input carries an `accept` filter, so a .txt only reaches the
    // component by drag and drop - which is how a user hits this case.
    const zone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [makeFile('notes.txt', 5, 'text/plain')] } });

    // It is not a Word document just because it is not a PDF.
    expect(screen.getByText(/TXT file/)).toBeInTheDocument();
    expect(screen.queryByText(/Word document/)).not.toBeInTheDocument();
    expect(onReject).toHaveBeenCalledWith(expect.stringMatching(/only pdf and docx/i));
  });

  it('reports the rejection to the caller instead of starting an upload', async () => {
    const onSelect = vi.fn();
    const onReject = vi.fn();
    renderWithProviders(
      <ResumeDropzone
        maxBytes={MAX_BYTES}
        uploading={false}
        progress={null}
        onSelect={onSelect}
        onReject={onReject}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile('huge.pdf', 9 * 1024 * 1024, 'application/pdf'));

    expect(onSelect).not.toHaveBeenCalled();
    // The page uses this to raise an error toast.
    expect(onReject).toHaveBeenCalledWith(expect.stringMatching(/9\.00 MB/));
  });

  it('shows a spinner and a descriptive label on the button while uploading', () => {
    renderWithProviders(
      <ResumeDropzone maxBytes={MAX_BYTES} uploading progress={30} onSelect={() => {}} />,
    );

    const button = screen.getByRole('button', { name: /uploading resume/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('reports upload progress accessibly', () => {
    renderWithProviders(
      <ResumeDropzone maxBytes={MAX_BYTES} uploading progress={42} onSelect={() => {}} />,
    );

    const bar = screen.getByRole('progressbar', { name: /upload progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    // The percentage is unique; "Uploading resume" now also appears on the button.
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});

const evaluation: AnswerEvaluation = {
  strengths: [{ title: 'Clear explanation', description: 'Explains the main concept accurately.' }],
  weaknesses: [{ title: 'Missing example', description: 'No concrete supporting example.' }],
  suggestedImprovements: [
    {
      title: 'Add a practical example',
      description: 'Explain a relevant situation and the steps you took.',
      actionableStep: 'Prepare one example from a project you shipped.',
    },
  ],
  scores: { technicalAccuracy: 4, reasoning: 3, completeness: 3, practicalApplicability: 4 },
  overallScore: 63,
  summary: 'A solid answer that would be stronger with an example.',
  insufficientAnswer: false,
  evaluationLimitation: null,
  objectiveResult: null,
  generatedBy: 'AI_GENERATED',
};

describe('feedback panel', () => {
  it('colour codes the three groups and shows a count on each', () => {
    const { container } = renderWithProviders(<FeedbackPanel evaluation={evaluation} />);

    const headingFor = (name: RegExp) =>
      screen.getByRole('heading', { name }).closest('div') as HTMLElement;

    // Green for strengths, red for weaknesses, blue for improvements.
    expect(headingFor(/^Strengths$/).className).toMatch(/emerald/);
    expect(headingFor(/^Weaknesses$/).className).toMatch(/red/);
    expect(headingFor(/^Suggested improvements$/).className).toMatch(/brand/);

    // Counts render beside each heading, so colour is never the only signal.
    expect(within(headingFor(/^Strengths$/)).getByText('1')).toBeInTheDocument();
    expect(within(headingFor(/^Weaknesses$/)).getByText('1')).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('shows a zero count rather than hiding an empty group', () => {
    renderWithProviders(
      <FeedbackPanel evaluation={{ ...evaluation, strengths: [], weaknesses: [] }} />,
    );

    expect(screen.getByRole('heading', { name: /^Strengths$/ })).toBeInTheDocument();
    expect(screen.getByText(/nothing stood out as a strength/i)).toBeInTheDocument();
  });

  it('renders the three mandatory sections', () => {
    renderWithProviders(<FeedbackPanel evaluation={evaluation} />);

    expect(screen.getByRole('heading', { name: 'Strengths' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weaknesses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suggested improvements' })).toBeInTheDocument();

    expect(screen.getByText('Clear explanation')).toBeInTheDocument();
    expect(screen.getByText('Missing example')).toBeInTheDocument();
    expect(screen.getByText(/prepare one example from a project/i)).toBeInTheDocument();
  });

  it('never shows a score without the feedback that explains it', () => {
    renderWithProviders(<FeedbackPanel evaluation={evaluation} />);

    expect(screen.getByRole('meter', { name: /overall score/i })).toHaveAttribute(
      'aria-valuenow',
      '63',
    );
    expect(screen.getByText(/a solid answer that would be stronger/i)).toBeInTheDocument();
  });

  it('labels the feedback as an AI estimate', () => {
    renderWithProviders(<FeedbackPanel evaluation={evaluation} />);
    expect(screen.getByText(/ai-generated estimate/i)).toBeInTheDocument();
    expect(screen.getByText('AI feedback')).toBeInTheDocument();
  });

  it('shows per-dimension scores on a 1-5 scale', () => {
    renderWithProviders(<FeedbackPanel evaluation={evaluation} />);
    const meter = screen.getByRole('meter', { name: /technical accuracy/i });
    expect(meter).toHaveAttribute('aria-valuemax', '5');
    expect(meter).toHaveAttribute('aria-valuenow', '4');
  });

  it('marks curated feedback as curated, not as AI output', () => {
    renderWithProviders(
      <FeedbackPanel evaluation={{ ...evaluation, generatedBy: 'CURATED_FALLBACK' }} />,
    );
    expect(screen.getByText('Baseline feedback')).toBeInTheDocument();
    expect(screen.queryByText('AI feedback')).not.toBeInTheDocument();
  });

  it('shows the objective result and the expected answer for a graded question', () => {
    renderWithProviders(
      <FeedbackPanel
        evaluation={{
          ...evaluation,
          generatedBy: 'DETERMINISTIC',
          objectiveResult: {
            isCorrect: false,
            expectedAnswer: 'Option 2: 5 hours',
            explanation: 'Speed is 80 km/h, so 400 / 80 = 5 hours.',
          },
        }}
      />,
    );

    expect(screen.getByText('Not correct')).toBeInTheDocument();
    expect(screen.getByText(/option 2: 5 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/400 \/ 80/)).toBeInTheDocument();
  });

  it('states plainly when an answer was too short to grade', () => {
    renderWithProviders(
      <FeedbackPanel
        evaluation={{
          ...evaluation,
          insufficientAnswer: true,
          evaluationLimitation: 'The answer was one sentence with no reasoning.',
        }}
      />,
    );
    expect(screen.getByText(/one sentence with no reasoning/i)).toBeInTheDocument();
  });
});

describe('parsed resume editor', () => {
  const parsed = {
    candidateName: 'Jane Doe',
    email: null,
    phone: null,
    summary: null,
    education: ['BSc Computer Science'],
    workExperience: [],
    projects: [],
    skills: ['TypeScript'],
    certifications: [],
    achievements: [],
  };

  it('tells the user which fields could not be read', () => {
    renderWithProviders(<ParsedResumeEditor value={parsed} onSave={async () => {}} />);
    expect(screen.getByText(/3 contact fields could not be read/i)).toBeInTheDocument();
  });

  it('keeps save disabled until something changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ParsedResumeEditor value={parsed} onSave={onSave} />);

    const save = screen.getByRole('button', { name: /save corrections/i });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^email$/i), 'jane@example.com');
    expect(screen.getByRole('button', { name: /save corrections/i })).toBeEnabled();
  });

  it('saves the corrected values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ParsedResumeEditor value={parsed} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText(/^phone$/i), '+44 7700 900123');
    await userEvent.click(screen.getByRole('button', { name: /save corrections/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+44 7700 900123', candidateName: 'Jane Doe' }),
    );
  });
});

describe('loading and error states', () => {
  it('offers a retry for a retryable failure', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ErrorState error={new ApiError('AI_UNAVAILABLE', 'The AI coach is busy.', 503)} onRetry={onRetry} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not offer a retry for a validation failure', () => {
    renderWithProviders(
      <ErrorState
        error={new ApiError('VALIDATION_ERROR', 'Please check the submitted information.', 400)}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('explains an offline failure differently', () => {
    renderWithProviders(
      <ErrorState error={new ApiError('NETWORK_ERROR', 'You appear to be offline.', 0)} />,
    );
    expect(screen.getByText('No connection')).toBeInTheDocument();
  });

  it('reassures the user that their work is kept when rate limited', () => {
    renderWithProviders(
      <ErrorState error={new ApiError('RATE_LIMITED', 'Too many requests.', 429)} />,
    );
    expect(screen.getByText(/your work has been kept/i)).toBeInTheDocument();
  });

  it('announces multi-stage progress without inventing a percentage', () => {
    // Rendered bare: the toast provider also contributes a live status region.
    const { container } = render(
      <ProgressStages
        stages={['Uploading', 'Extracting', 'Analysing']}
        activeIndex={1}
        message="Analysing your skills against the target role..."
      />,
    );

    const status = within(container).getByRole('status');
    expect(status).toHaveTextContent(/analysing your skills/i);
    expect(status).not.toHaveTextContent(/%/);
  });

  it('renders an empty state with an action', () => {
    renderWithProviders(
      <EmptyState title="No resumes yet" description="Upload one to get started." />,
    );
    expect(screen.getByRole('heading', { name: /no resumes yet/i })).toBeInTheDocument();
  });

  it('exposes a score as text as well as a bar', () => {
    renderWithProviders(<ScoreBar label="Readiness" value={72} />);
    expect(screen.getByRole('meter', { name: 'Readiness' })).toHaveAttribute('aria-valuenow', '72');
    expect(screen.getByText('72')).toBeInTheDocument();
  });
});
