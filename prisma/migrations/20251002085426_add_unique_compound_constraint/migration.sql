/*
  Warnings:

  - A unique constraint covering the columns `[postId,phase,url]` on the table `FacebookComment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[campaignId,phase,url]` on the table `FacebookPost` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "FacebookComment_postId_phase_url_key" ON "public"."FacebookComment"("postId", "phase", "url");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPost_campaignId_phase_url_key" ON "public"."FacebookPost"("campaignId", "phase", "url");
