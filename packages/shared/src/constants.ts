/**
 * Values shared by the API and the web client. Keeping them in one place stops
 * the two sides of the app from drifting apart (e.g. a mode the UI offers but
 * the backend rejects).
 */

export const EXPERIENCE_LEVELS = [
  'STUDENT_FRESHER',
  'ENTRY_LEVEL',
  'INTERMEDIATE',
  'EXPERIENCED',
  'CAREER_SWITCHER',
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  STUDENT_FRESHER: 'Student / Fresher',
  ENTRY_LEVEL: 'Entry Level',
  INTERMEDIATE: 'Intermediate',
  EXPERIENCED: 'Experienced',
  CAREER_SWITCHER: 'Career Switcher',
};

export const INTERVIEW_MODES = ['TECHNICAL', 'NON_TECHNICAL', 'APTITUDE', 'HR'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  TECHNICAL: 'Technical Interview',
  NON_TECHNICAL: 'Non-Technical Interview',
  APTITUDE: 'Aptitude Interview',
  HR: 'HR Interview',
};

export const INTERVIEW_MODE_DESCRIPTIONS: Record<InterviewMode, string> = {
  TECHNICAL:
    'Programming fundamentals, data structures, databases, APIs, system design and project deep-dives.',
  NON_TECHNICAL:
    'Communication, situational judgement, collaboration, prioritisation and workplace scenarios.',
  APTITUDE:
    'Numerical and logical reasoning, pattern recognition, data interpretation and verbal reasoning.',
  HR: 'Self-introduction, motivation, strengths and weaknesses, teamwork and behavioural questions.',
};

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

export const SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const GAP_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type GapLevel = (typeof GAP_LEVELS)[number];

export const SKILL_EVIDENCE_STATUSES = [
  'EVIDENCE_IN_RESUME',
  'CLAIMED_WITHOUT_EVIDENCE',
  'NOT_MENTIONED',
  'PROFICIENCY_UNCLEAR',
] as const;
/**
 * Why a skill got the proficiency estimate it did. Absence from a resume is not
 * proof the candidate lacks a skill, so the two cases are modelled separately.
 */
export type SkillEvidenceStatus = (typeof SKILL_EVIDENCE_STATUSES)[number];

export const SKILL_EVIDENCE_LABELS: Record<SkillEvidenceStatus, string> = {
  EVIDENCE_IN_RESUME: 'Evidence found in resume',
  CLAIMED_WITHOUT_EVIDENCE: 'Listed but not demonstrated',
  NOT_MENTIONED: 'Not mentioned in resume',
  PROFICIENCY_UNCLEAR: 'Proficiency could not be established',
};

export const QUESTION_COUNT_OPTIONS = [5, 10, 15] as const;
export type QuestionCount = (typeof QUESTION_COUNT_OPTIONS)[number];

export const ANSWER_FORMATS = ['TEXT', 'MULTIPLE_CHOICE'] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

/** Source of a generated question. Fallback questions are never labelled as AI generated. */
export const QUESTION_SOURCES = ['AI_GENERATED', 'CURATED_FALLBACK'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** 1-5 proficiency scale used for every skill estimate. */
export const PROFICIENCY_SCALE = {
  min: 1,
  max: 5,
  labels: {
    1: 'No practical exposure',
    2: 'Aware of the basics',
    3: 'Can work with guidance',
    4: 'Works independently',
    5: 'Can lead and mentor',
  },
} as const;

export const LIMITS = {
  nameMin: 2,
  nameMax: 120,
  passwordMin: 10,
  passwordMax: 200,
  answerMin: 1,
  answerMax: 8000,
  jobDescriptionMax: 12000,
  careerObjectiveMax: 1500,
  targetRoleMax: 120,
  skillMax: 60,
  maxSkills: 50,
  resumeTextMax: 120_000,
} as const;

export const SUPPORTED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const SUPPORTED_RESUME_EXTENSIONS = ['.pdf', '.docx'] as const;

/** Standard disclaimer shown anywhere an AI estimate is displayed. */
export const AI_ESTIMATE_DISCLAIMER =
  'AI-generated estimate. It is feedback to practise with, not a verified assessment or a hiring prediction.';
