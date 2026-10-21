import { emptyParsedResume, LIMITS, type ParsedResume } from '@career-prep/shared';

/**
 * Deterministic, section-heading driven extraction. This runs instead of an LLM
 * call: it costs nothing, it cannot invent a certification the candidate does
 * not have, and anything it is unsure about is left null for the candidate to
 * correct in the editable preview.
 */

const SECTION_PATTERNS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: 'summary', pattern: /^(professional\s+)?(summary|profile|objective|about\s+me)\b/i },
  { key: 'education', pattern: /^(education|academic(s| background| qualifications?)?)\b/i },
  {
    key: 'experience',
    pattern: /^(work\s+)?(experience|employment(\s+history)?|professional\s+experience|career\s+history)\b/i,
  },
  { key: 'projects', pattern: /^(projects?|personal\s+projects?|selected\s+projects?)\b/i },
  {
    key: 'skills',
    pattern: /^(technical\s+)?(skills|skills?\s*(&|and)\s*(tools|technologies)|core\s+competenc(y|ies)|technologies)\b/i,
  },
  { key: 'certifications', pattern: /^(certification|certificate|licence|license)s?\b/i },
  {
    key: 'achievements',
    pattern: /^(achievements?|awards?|honors?|honours?|accomplishments?|publications?)\b/i,
  },
  { key: 'other', pattern: /^(languages?|interests?|hobbies|references?|volunteer|extra[- ]curricular)\b/i },
];

type SectionKey =
  | 'summary'
  | 'education'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'achievements'
  | 'other'
  | 'header';

/** A heading line is short and matches one of the known section names. */
function headingKey(line: string): SectionKey | null {
  const cleaned = line.replace(/[:\-|_]+$/g, '').trim();
  if (cleaned.length === 0 || cleaned.length > 45) return null;
  // Headings do not end in a sentence.
  if (/[.!?]$/.test(cleaned)) return null;
  const match = SECTION_PATTERNS.find((candidate) => candidate.pattern.test(cleaned));
  return match ? match.key : null;
}

function splitIntoSections(text: string): Record<SectionKey, string[]> {
  const sections = {
    header: [],
    summary: [],
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
    achievements: [],
    other: [],
  } as Record<SectionKey, string[]>;

  let active: SectionKey = 'header';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = headingKey(trimmed);
    if (key) {
      active = key;
      continue;
    }
    sections[active].push(trimmed);
  }
  return sections;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
/**
 * Conservative on purpose. Either an international prefix, or a run of digits
 * long enough that a date range such as "(2022-2025)" cannot satisfy it.
 */
const PHONE_RE =
  /(?:\+\d{1,3}[\s.()-]*)?(?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{2,4}/;
/** Year ranges and similar numeric spans are not phone numbers. */
const DATE_RANGE_RE = /^\(?(19|20)\d{2}\s*[-–—/]\s*((19|20)\d{2}|present|current)\)?$/i;

const NAME_STOPWORDS = /(resume|curriculum\s+vitae|^cv$|portfolio|@|http|www\.|\d{4})/i;

/**
 * The name is only accepted when the line looks like a name: two to four
 * capitalised words at the top of the document with no digits or contact noise.
 */
function guessName(headerLines: string[]): string | null {
  for (const line of headerLines.slice(0, 5)) {
    if (NAME_STOPWORDS.test(line)) continue;
    if (line.length < 4 || line.length > LIMITS.nameMax) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    const looksLikeName = words.every((word) => /^[A-Z][A-Za-z'’.-]*$/.test(word) || /^[A-Z.]{1,3}$/.test(word));
    const allCaps = line === line.toUpperCase() && words.length <= 4;
    if (looksLikeName || allCaps) {
      return line.replace(/\s+/g, ' ').slice(0, LIMITS.nameMax);
    }
  }
  return null;
}

function firstMatch(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    const match = re.exec(line);
    if (match?.[0]) return match[0].trim();
  }
  return null;
}

const SKILL_SPLIT_RE = /[,;|/•·]|\s{2,}|\s-\s/;

function parseSkills(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Drop a leading category label such as "Languages:".
    const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    for (const token of body.split(SKILL_SPLIT_RE)) {
      const skill = token.replace(/^[\s\-–—*]+|[\s.]+$/g, '').trim();
      if (skill.length < 2 || skill.length > LIMITS.skillMax) continue;
      // A fragment with this many words is prose, not a skill.
      if (skill.split(/\s+/).length > 5) continue;
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(skill);
      if (out.length >= 120) return out;
    }
  }
  return out;
}

const BULLET_RE = /^[-–—*•]\s*/;

/**
 * Groups a section's lines into entries. Resumes use two layouts, so the rule
 * depends on the section: when there are heading lines, bullets belong to the
 * heading above them; when the whole section is bullets, each bullet is its own
 * entry (otherwise an all-bullet job history collapses into one blob).
 */
function groupEntries(lines: string[], maxLength: number, limit: number): string[] {
  const entries: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const entry = current.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    if (entry.length > 2) entries.push(entry);
    current = [];
  };

  let previous: string | null = null;

  for (const line of lines) {
    if (entries.length >= limit) break;

    if (startsNewEntry(line, previous)) flush();
    current.push(line.replace(BULLET_RE, ''));
    previous = line;
  }
  flush();

  return entries.slice(0, limit);
}

/**
 * Decides whether a line opens a new entry or continues the previous one.
 *
 * PDFs wrap long sentences across several physical lines, so treating every
 * line as its own entry shredded one job into five fragments. A line starting
 * in lower case is the one dependable sign that it is the rest of the line
 * above. Using "the previous line had no full stop" as well was tried and
 * over-merged: list-style sections such as education have no punctuation at
 * all, and four qualifications collapsed into one entry.
 */
function startsNewEntry(line: string, previous: string | null): boolean {
  if (previous === null) return true;
  // A bullet is an explicit "new item" marker.
  if (BULLET_RE.test(line)) return true;
  return !/^[a-z]/.test(line);
}

function joinSummary(lines: string[]): string | null {
  if (lines.length === 0) return null;
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 20 ? text.slice(0, 3000) : null;
}

export function extractResumeFields(normalisedText: string): ParsedResume {
  const sections = splitIntoSections(normalisedText);
  const parsed = emptyParsedResume();
  // Contact details live at the top of a resume. Searching the whole document
  // is what turns a date range in the job history into a "phone number".
  const contactPool = [...sections.header, ...sections.other].slice(0, 15);

  parsed.candidateName = guessName(sections.header);
  parsed.email = firstMatch(contactPool, EMAIL_RE);

  // The email and phone usually share one line, so the email is stripped out
  // rather than the line being skipped.
  const phoneCandidate = firstMatch(
    contactPool.map((line) => line.replace(new RegExp(EMAIL_RE.source, 'g'), ' ')),
    PHONE_RE,
  );
  const digitCount = phoneCandidate?.replace(/\D/g, '').length ?? 0;
  parsed.phone =
    phoneCandidate &&
    digitCount >= 9 &&
    digitCount <= 15 &&
    !DATE_RANGE_RE.test(phoneCandidate.trim())
      ? phoneCandidate
      : null;

  parsed.summary = joinSummary(sections.summary);
  parsed.education = groupEntries(sections.education, 500, 20);
  parsed.workExperience = groupEntries(sections.experience, 1500, 40);
  parsed.projects = groupEntries(sections.projects, 1500, 40);
  parsed.skills = parseSkills(sections.skills);
  parsed.certifications = groupEntries(sections.certifications, 300, 40);
  parsed.achievements = groupEntries(sections.achievements, 500, 40);

  return parsed;
}

/** True when there is enough content to run a meaningful skill gap analysis. */
export function hasUsableContent(parsed: ParsedResume, text: string): boolean {
  const signals =
    parsed.skills.length +
    parsed.workExperience.length +
    parsed.projects.length +
    parsed.education.length;
  return signals >= 2 || text.length >= 400;
}
