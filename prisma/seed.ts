/**
 * Development seed. Creates one demo candidate with a profile so the app can be
 * clicked through immediately after a fresh migration.
 *
 * It deliberately creates NO resumes, reports or interview sessions: those are
 * the user's own records, and seeding them would put fabricated metrics on the
 * dashboard. Run `npm run prisma:seed` after `npm run prisma:deploy`.
 *
 * Refuses to run against a production database.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';
/** Printed once below so it is not a secret hidden in the source. */
const DEMO_PASSWORD = 'DemoPassword1';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const passwordHash = await hash(DEMO_PASSWORD, {
    algorithm: 2, // Argon2id
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { name: 'Demo Candidate', email: DEMO_EMAIL, passwordHash },
    select: { id: true, email: true },
  });

  await prisma.candidateProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      fullName: 'Demo Candidate',
      currentRole: 'Final year Computer Science student',
      targetRole: 'Backend Engineer',
      experienceLevel: 'STUDENT_FRESHER',
      yearsOfExperience: 0,
      education: 'BSc Computer Science (final year)',
      skills: ['Python', 'SQL', 'Git', 'Flask'],
      learningGoals: ['System design', 'Docker', 'TypeScript'],
      preferredInterviewMode: 'TECHNICAL',
      targetIndustry: 'Software',
      careerObjective: 'Join a backend team and get strong at API and database work.',
      jobDescription: '',
    },
  });

  console.log('Seeded demo account:');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log('No resumes, reports or interviews were created - those are yours to generate.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
