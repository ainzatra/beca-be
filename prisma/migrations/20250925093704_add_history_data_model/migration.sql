-- CreateTable
CREATE TABLE "public"."HistoryData" (
    "id" TEXT NOT NULL,
    "json" JSONB NOT NULL,

    CONSTRAINT "HistoryData_pkey" PRIMARY KEY ("id")
);
