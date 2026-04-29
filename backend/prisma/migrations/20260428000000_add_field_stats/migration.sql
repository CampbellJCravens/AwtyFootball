-- CreateTable
CREATE TABLE "FieldStat" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "played" TEXT NOT NULL,
    "eviteResponse" INTEGER,
    "responseRate" DOUBLE PRECISION NOT NULL,
    "showUp" INTEGER,
    "attendanceRate" DOUBLE PRECISION NOT NULL,
    "engagement" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldStat_date_key" ON "FieldStat"("date");

-- CreateIndex
CREATE INDEX "FieldStat_year_idx" ON "FieldStat"("year");
