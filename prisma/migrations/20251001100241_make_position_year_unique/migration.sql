/*
  Warnings:

  - A unique constraint covering the columns `[year,position]` on the table `HistoryData` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "HistoryData_year_position_key" ON "public"."HistoryData"("year", "position");
