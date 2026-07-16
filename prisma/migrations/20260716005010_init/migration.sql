-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "publicName" TEXT,
    "exportAllowed" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" DATETIME,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'created',
    "trigger" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "sourceTotal" INTEGER NOT NULL DEFAULT 0,
    "sourceSuccess" INTEGER NOT NULL DEFAULT 0,
    "sourceFailed" INTEGER NOT NULL DEFAULT 0,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "dedupCount" INTEGER NOT NULL DEFAULT 0,
    "aiSuccess" INTEGER NOT NULL DEFAULT 0,
    "aiFailed" INTEGER NOT NULL DEFAULT 0,
    "aiSkipped" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoryGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedTitle" TEXT NOT NULL,
    "primaryArticleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" DATETIME,
    "excerpt" TEXT,
    "content" TEXT,
    "contentHash" TEXT NOT NULL,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'fetched',
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "storyGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Article_storyGroupId_fkey" FOREIGN KEY ("storyGroupId") REFERENCES "StoryGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "relevanceScore" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "topics" TEXT NOT NULL,
    "summaryZh" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "insufficientContent" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAnalysis_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "userTakeaway" TEXT NOT NULL DEFAULT '',
    "whyFollow" TEXT,
    "impact" TEXT,
    "confirmedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningEntry_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LearningEntryTopic" (
    "learningEntryId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    PRIMARY KEY ("learningEntryId", "topicId"),
    CONSTRAINT "LearningEntryTopic_learningEntryId_fkey" FOREIGN KEY ("learningEntryId") REFERENCES "LearningEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningEntryTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learningEntryId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectUrl" TEXT NOT NULL,
    "note" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProjectLink_learningEntryId_fkey" FOREIGN KEY ("learningEntryId") REFERENCES "LearningEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT,
    "articleId" TEXT,
    "stage" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RunError_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "filePath" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_normalizedUrl_key" ON "Source"("normalizedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Article_canonicalUrl_key" ON "Article"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Article_normalizedTitle_idx" ON "Article"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Article_contentHash_idx" ON "Article"("contentHash");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysis_articleId_key" ON "AIAnalysis"("articleId");

-- CreateIndex
CREATE INDEX "AIAnalysis_inputHash_idx" ON "AIAnalysis"("inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "LearningEntry_articleId_key" ON "LearningEntry"("articleId");

-- CreateIndex
CREATE INDEX "LearningEntry_status_idx" ON "LearningEntry"("status");

-- CreateIndex
CREATE INDEX "LearningEntry_publishedAt_idx" ON "LearningEntry"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");
