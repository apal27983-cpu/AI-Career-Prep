-- CreateTable
CREATE TABLE "resume_fit_analyses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "resumeId" UUID NOT NULL,
    "targetRole" VARCHAR(120) NOT NULL,
    "jobDescription" TEXT,
    "reportData" JSONB NOT NULL,
    "checksData" JSONB NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "generatedBy" "ContentSource" NOT NULL DEFAULT 'AI_GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_fit_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_fit_analyses_userId_createdAt_idx" ON "resume_fit_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "resume_fit_analyses_resumeId_createdAt_idx" ON "resume_fit_analyses"("resumeId", "createdAt");

-- AddForeignKey
ALTER TABLE "resume_fit_analyses" ADD CONSTRAINT "resume_fit_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_fit_analyses" ADD CONSTRAINT "resume_fit_analyses_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
