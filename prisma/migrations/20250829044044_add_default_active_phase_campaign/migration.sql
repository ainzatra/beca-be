/*
  Warnings:

  - Made the column `activePhase` on table `Campaign` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Campaign" ALTER COLUMN "activePhase" SET NOT NULL,
ALTER COLUMN "activePhase" SET DEFAULT 'PRE';
