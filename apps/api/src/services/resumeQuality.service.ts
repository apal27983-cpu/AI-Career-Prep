import type { ParsedResume, ResumeQualityChecks } from '@career-prep/shared';

/**
 * Objective, checkable facts about a resume. These are computed here rather
 * than asked of a model: they are cheap, they are the same every time, and a
 * model is not needed to count whether a bullet contains a number.
 *
 * The results are shown to the candidate directly AND handed to the model as
 * established facts, so its commentary agrees with what the UI displays.
 */

/** Verbs that open a strong resume bullet. */
const ACTION_VERBS = new Set([
  'achieved', 'added', 'analysed', 'analyzed', 'architected', 'automated', 'built',
  'collaborated', 'configured', 'created', 'cut', 'debugged', 'delivered', 'deployed',
  'designed', 'developed', 'drove', 'engineered', 'enhanced', 'established', 'expanded',
  'implemented', 'improved', 'increased', 'integrated', 'introduced', 'launched', 'led',
  'maintained', 'managed', 'migrated', 'optimised', 'optimized', 'owned', 'performed',
  'planned', 'produced', 'reduced', 'refactored', 'resolved', 'scaled', 'shipped',
  'simplified', 'streamlined', 'supported', 'tested', 'trained', 'validated', 'wrote',
]);

/** A number, percentage or money figure - the usual proxy for a measured result. */
const QUANTIFIED = /\d/;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function firstWord(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

export function computeResumeQuality(
  parsed: ParsedResume,
  extractedText: string,
): ResumeQualityChecks {
  // Everything that reads as an achievement bullet across the resume.
  const bullets = [
    ...parsed.workExperience,
    ...parsed.projects,
    ...parsed.achievements,
  ].filter((entry) => countWords(entry) >= 4);

  const quantified = bullets.filter((entry) => QUANTIFIED.test(entry));
  const actionLed = bullets.filter((entry) => ACTION_VERBS.has(firstWord(entry)));

  const missingContactFields: string[] = [];
  if (!parsed.candidateName) missingContactFields.push('name');
  if (!parsed.email) missingContactFields.push('email');
  if (!parsed.phone) missingContactFields.push('phone');

  return {
    wordCount: countWords(extractedText),
    hasSummary: Boolean(parsed.summary && countWords(parsed.summary) >= 10),
    hasAchievements: parsed.achievements.length > 0,
    hasCertifications: parsed.certifications.length > 0,
    hasProjects: parsed.projects.length > 0,
    hasWorkExperience: parsed.workExperience.length > 0,
    skillCount: parsed.skills.length,
    contactComplete: missingContactFields.length === 0,
    missingContactFields,
    bulletCount: bullets.length,
    quantifiedBulletCount: quantified.length,
    quantifiedBulletRatio: bullets.length === 0 ? 0 : quantified.length / bullets.length,
    actionVerbRatio: bullets.length === 0 ? 0 : actionLed.length / bullets.length,
    longestBulletWords: bullets.reduce((max, entry) => Math.max(max, countWords(entry)), 0),
  };
}

/** Renders the checks as plain statements for the prompt. */
export function describeQuality(checks: ResumeQualityChecks): string {
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return [
    `Total words: ${checks.wordCount}`,
    `Professional summary present: ${checks.hasSummary ? 'yes' : 'NO'}`,
    `Work experience entries: ${checks.hasWorkExperience ? 'yes' : 'NO'}`,
    `Projects section: ${checks.hasProjects ? 'yes' : 'NO'}`,
    `Certifications section: ${checks.hasCertifications ? 'yes' : 'NO'}`,
    `Dedicated achievements section: ${checks.hasAchievements ? 'yes' : 'NO'}`,
    `Skills listed: ${checks.skillCount}`,
    `Contact details complete: ${checks.contactComplete ? 'yes' : `NO, missing ${checks.missingContactFields.join(', ')}`}`,
    `Bullets analysed: ${checks.bulletCount}`,
    `Bullets containing a number or percentage: ${checks.quantifiedBulletCount} (${percent(checks.quantifiedBulletRatio)})`,
    `Bullets starting with an action verb: ${percent(checks.actionVerbRatio)}`,
    `Longest bullet: ${checks.longestBulletWords} words`,
  ].join('\n');
}
