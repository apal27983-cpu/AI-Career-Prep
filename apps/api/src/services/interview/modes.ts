import { MODE_SCORE_DIMENSIONS, type InterviewMode } from '@career-prep/shared';

/**
 * Everything that differs between the four modes lives here, so the shared
 * interview infrastructure stays identical across them.
 */
export interface ModeConfig {
  /** Topics the generator should draw from. */
  focusAreas: string[];
  /** Added to the question-generation system prompt. */
  generationGuidance: string;
  /** Added to the evaluation system prompt. */
  evaluationGuidance: string;
  /** Human-readable criteria, stored with the question and shown in reports. */
  evaluationCriteria: string[];
  /** Whether this mode should produce multiple-choice questions. */
  allowsMultipleChoice: boolean;
}

export const MODE_CONFIG: Record<InterviewMode, ModeConfig> = {
  TECHNICAL: {
    focusAreas: [
      'programming fundamentals',
      'data structures and algorithms',
      'database concepts',
      'API design',
      'system design fundamentals',
      'frameworks relevant to the target role',
      'debugging and problem solving',
      'project-specific technical decisions',
    ],
    generationGuidance: `Ask questions a working engineer would actually ask for this role and level.
- Do not assume a specific programming language unless the target role names one. Where code is involved, say that any language is fine.
- Mix conceptual questions, a practical problem, and at least one question about a decision the candidate would have to make.
- For a coding question, state the input, the expected output and one edge case, and ask for the complexity.
- Every question must be answerable in writing in a few minutes. No multi-part exercises requiring a whiteboard.`,
    evaluationGuidance: `Judge correctness separately from presentation.
- technicalAccuracy: is what they said actually true for the question asked?
- reasoning: does the explanation show how they got there, not just the conclusion?
- completeness: did they cover the parts the question asked for, including edge cases where relevant?
- practicalApplicability: would this answer work in a real system?
Accept any reasonable language or technology choice. Credit a correct approach described in prose as highly as code. Do not reward length or confident tone when the substance is thin.`,
    evaluationCriteria: ['Technical accuracy', 'Reasoning', 'Completeness', 'Practical applicability'],
    allowsMultipleChoice: false,
  },

  NON_TECHNICAL: {
    focusAreas: [
      'communication',
      'problem solving',
      'situational judgement',
      'collaboration',
      'time management',
      'decision making',
      'work prioritisation',
      'general professional scenarios',
    ],
    generationGuidance: `Ask about realistic workplace situations someone in this role would meet.
- Use concrete scenarios ("you are given X and Y on the same day...") rather than abstract questions about qualities.
- Do NOT ask about programming, frameworks, algorithms or any technical implementation detail in this mode, even for a technical target role.
- Keep each scenario self-contained and answerable without knowing a specific company.`,
    evaluationGuidance: `Judge the thinking and the handling of the situation, not technical knowledge.
- relevance: does the answer address the situation that was actually described?
- communication: is it clear, ordered and appropriately brief?
- problemSolving: does it show a workable approach with the right information gathered first?
- professionalJudgement: are the choices ones a reasonable colleague would make?
Never penalise an answer for lacking technical detail in this mode.`,
    evaluationCriteria: ['Relevance', 'Communication', 'Problem solving', 'Professional judgement'],
    allowsMultipleChoice: false,
  },

  APTITUDE: {
    focusAreas: [
      'numerical reasoning',
      'logical reasoning',
      'pattern recognition',
      'quantitative aptitude',
      'verbal reasoning',
      'data interpretation',
    ],
    generationGuidance: `Produce unambiguous questions with one defensible correct answer.
- Prefer "MULTIPLE_CHOICE" with exactly four options for numerical and logical items, and set correctOptionIndex.
- Use "TEXT" only where the method matters more than the result; then expectedAnswer must state the final answer and the steps.
- expectedAnswer must always contain the worked solution, because it is used to grade the response.
- Every number needed must be in the question. No outside knowledge, no trick wording, no two defensible answers.
- Keep each item solvable in about two minutes.`,
    evaluationGuidance: `Correctness is decided by the expected answer supplied to you, not by how convincing the candidate sounds.
- correctness: does the final answer match the expected answer?
- reasoning: is the method sound and stated?
- calculationAccuracy: are the arithmetic steps right?
- methodEfficiency: was a reasonable route taken, or a needlessly long one?
Always explain the correct method in the summary, so the candidate learns from a wrong answer.`,
    evaluationCriteria: ['Correctness', 'Reasoning', 'Calculation accuracy', 'Method efficiency'],
    allowsMultipleChoice: true,
  },

  HR: {
    focusAreas: [
      'self-introduction',
      'strengths and weaknesses',
      'career goals',
      'motivation for the role',
      'conflict resolution',
      'teamwork',
      'leadership',
      'handling feedback',
      'adaptability',
      'behavioural questions',
    ],
    generationGuidance: `Ask the behavioural and motivational questions an interviewer would really ask.
- Include at least two questions that invite a STAR answer (situation, task, action, result), and say so in the question.
- Never ask about age, gender, marital or family status, pregnancy, religion, ethnicity, nationality, disability, health, sexual orientation, political views or any other protected characteristic, or anything that would invite that information.
- Keep questions open; do not script the answer in the question.`,
    evaluationGuidance: `Judge whether the answer is specific, relevant and evidenced.
- relevance: does it answer the question that was asked?
- specificity: real situations and outcomes rather than generalities about what they "always" do?
- behaviouralEvidence: is their own action clear, and is the result stated?
- structureAndClarity: for STAR questions, are situation, task, action and result all present and in a usable order?
Never comment on or score anything relating to a protected personal characteristic. If the candidate volunteers such information, ignore it entirely in the evaluation.`,
    evaluationCriteria: ['Relevance', 'Specificity', 'Behavioural evidence', 'Structure and clarity'],
    allowsMultipleChoice: false,
  },
};

export function scoreDimensionsFor(mode: InterviewMode): readonly string[] {
  return MODE_SCORE_DIMENSIONS[mode];
}
