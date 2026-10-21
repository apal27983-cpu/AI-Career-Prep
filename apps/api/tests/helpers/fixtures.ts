/** PDF string literals use these as delimiters. */
function escapePdfText(text: string): string {
  return text.replace(/([\\()])/g, '\\$1');
}

/**
 * Builds a small, structurally valid PDF with a real text layer, so the parsing
 * tests exercise the actual pdfjs path rather than a stub.
 *
 * Each input line becomes its own positioned text-showing operation, which is
 * what a real exporter produces. A single-line PDF would hide the line
 * structure the field extractor depends on.
 */
export function buildTestPdf(text: string): Buffer {
  const lines = text.split('\n');
  const content = [
    'BT',
    '/F1 11 Tf',
    '14 TL',
    '54 740 Td',
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    'ET',
  ].join('\n');

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** A resume long enough to pass the "is there any text" check. */
export const SAMPLE_RESUME_TEXT = `Jane Doe
jane.doe@example.com | +44 7700 900123 | London

Professional Summary
Backend engineer with four years building Node.js and Python services, focused on
API design, PostgreSQL performance and pragmatic testing.

Work Experience
- Senior Backend Engineer, Northwind Ltd (2022-2025)
- Cut p95 latency on the orders API from 820ms to 180ms by removing N+1 queries.
- Backend Engineer, Acme Corp (2021-2022)
- Built the billing reconciliation service in Python and PostgreSQL.

Projects
- Open-source rate limiter for Express, used by 40 downstream projects.

Skills
TypeScript, Node.js, Express, Python, PostgreSQL, Redis, Docker, AWS, Vitest, Git

Education
BSc Computer Science, University of Manchester, 2021

Certifications
AWS Certified Developer - Associate, 2023

Achievements
Internal award for the latency work on the orders API.
`;

/**
 * The same resume as a PDF, with its line structure intact - which is what the
 * extractor sees for a real upload.
 */
export const SAMPLE_RESUME_PDF = (): Buffer => buildTestPdf(SAMPLE_RESUME_TEXT);
