/*
  Warnings:

  - Added the required column `position` to the `HistoryData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `HistoryData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."HistoryData" ADD COLUMN     "position" TEXT NOT NULL,
ADD COLUMN     "year" TEXT NOT NULL;
