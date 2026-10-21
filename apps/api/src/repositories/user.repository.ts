import { prisma } from '../config/prisma.js';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
}

export async function findUserWithPasswordById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true },
  });
}

export async function createUser(input: { name: string; email: string; passwordHash: string }) {
  return prisma.user.create({ data: input, select: PUBLIC_USER_SELECT });
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function userHasProfile(userId: string): Promise<boolean> {
  const count = await prisma.candidateProfile.count({ where: { userId } });
  return count > 0;
}

/**
 * Cascading foreign keys remove profile, resumes, analyses, sessions, questions,
 * answers and usage logs along with the user row.
 */
export async function deleteUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } });
}
