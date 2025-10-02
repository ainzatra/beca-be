-- AlterTable
ALTER TABLE "public"."Campaign" ADD COLUMN     "candidateName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "candidateParty" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "candidatePosition" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fbUrl" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "public"."FacebookPost" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phase" "public"."CampaignPhase" NOT NULL,
    "content" TEXT,
    "url" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FacebookComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "phase" "public"."CampaignPhase" NOT NULL,
    "content" TEXT,
    "authorName" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPost_url_key" ON "public"."FacebookPost"("url");

-- AddForeignKey
ALTER TABLE "public"."FacebookPost" ADD CONSTRAINT "FacebookPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FacebookComment" ADD CONSTRAINT "FacebookComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."FacebookPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
