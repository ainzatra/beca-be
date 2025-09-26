-- CreateTable
CREATE TABLE "public"."AiReport" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phase" "public"."CampaignPhase" NOT NULL,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."AiReport" ADD CONSTRAINT "AiReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
