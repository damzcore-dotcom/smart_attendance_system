-- SQL Migration Script to Update Database for Chatbot features
-- Apply this script in your production PostgreSQL database

-- Create ChatLog Table
CREATE TABLE IF NOT EXISTS "ChatLog" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "detectedIntent" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "response" TEXT,
    "feedback" TEXT,
    "feedbackNote" TEXT,
    "responseTimeMs" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- Create NlpKeywordConfig Table
CREATE TABLE IF NOT EXISTS "NlpKeywordConfig" (
    "id" SERIAL NOT NULL,
    "intent" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NlpKeywordConfig_pkey" PRIMARY KEY ("id")
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS "ChatLog_username_idx" ON "ChatLog"("username");
CREATE INDEX IF NOT EXISTS "ChatLog_detectedIntent_idx" ON "ChatLog"("detectedIntent");
CREATE INDEX IF NOT EXISTS "ChatLog_createdAt_idx" ON "ChatLog"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "NlpKeywordConfig_intent_keyword_key" ON "NlpKeywordConfig"("intent", "keyword");
CREATE INDEX IF NOT EXISTS "NlpKeywordConfig_intent_idx" ON "NlpKeywordConfig"("intent");
