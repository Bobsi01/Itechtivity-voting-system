-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('CSD_STUDENT', 'NON_CSD_STUDENT', 'VISITOR', 'ALUMNI');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('GENERATED', 'ACTIVATED', 'VOID');

-- CreateEnum
CREATE TYPE "StubStatus" AS ENUM ('INACTIVE', 'ACTIVATED', 'REDEEMED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "EventConfig" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL DEFAULT 'Itechtivity 2027',
    "isAwardsLocked" BOOLEAN NOT NULL DEFAULT false,
    "maxAwards" INTEGER NOT NULL DEFAULT 6,
    "isVotingOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicProgram" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booth" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "capstoneCategory" TEXT NOT NULL,
    "teamMembers" TEXT,
    "tableNumber" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "boothId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationTransaction" (
    "id" TEXT NOT NULL,
    "processedByUserId" TEXT NOT NULL,
    "buyerType" "BuyerType" NOT NULL,
    "buyerName" TEXT NOT NULL,
    "studentNumber" TEXT,
    "program" TEXT,
    "yearAndSection" TEXT,
    "affiliation" TEXT,
    "contactInfo" TEXT,
    "quantityBought" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoCard" (
    "id" TEXT NOT NULL,
    "cardSerial" TEXT NOT NULL,
    "masterQrHash" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" "CardStatus" NOT NULL DEFAULT 'GENERATED',
    "pdfBatchId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BingoCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStub" (
    "id" TEXT NOT NULL,
    "bingoCardId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "awardId" TEXT,
    "stubSerial" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "status" "StubStatus" NOT NULL DEFAULT 'INACTIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "ticketStubId" TEXT NOT NULL,
    "boothId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "scannedByUserId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "totalCards" INTEGER NOT NULL,
    "totalSheets" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicProgram_code_key" ON "AcademicProgram"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Award_slotNumber_key" ON "Award"("slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Booth_code_key" ON "Booth"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_cardSerial_key" ON "BingoCard"("cardSerial");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_masterQrHash_key" ON "BingoCard"("masterQrHash");

-- CreateIndex
CREATE UNIQUE INDEX "TicketStub_stubSerial_key" ON "TicketStub"("stubSerial");

-- CreateIndex
CREATE INDEX "TicketStub_stubSerial_status_idx" ON "TicketStub"("stubSerial", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_ticketStubId_key" ON "Vote"("ticketStubId");

-- CreateIndex
CREATE INDEX "Vote_boothId_awardId_idx" ON "Vote"("boothId", "awardId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyLog_idempotencyKey_key" ON "IdempotencyLog"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PdfBatch_batchNumber_key" ON "PdfBatch"("batchNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_boothId_fkey" FOREIGN KEY ("boothId") REFERENCES "Booth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationTransaction" ADD CONSTRAINT "RegistrationTransaction_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "RegistrationTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_pdfBatchId_fkey" FOREIGN KEY ("pdfBatchId") REFERENCES "PdfBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStub" ADD CONSTRAINT "TicketStub_bingoCardId_fkey" FOREIGN KEY ("bingoCardId") REFERENCES "BingoCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStub" ADD CONSTRAINT "TicketStub_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_ticketStubId_fkey" FOREIGN KEY ("ticketStubId") REFERENCES "TicketStub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_boothId_fkey" FOREIGN KEY ("boothId") REFERENCES "Booth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_scannedByUserId_fkey" FOREIGN KEY ("scannedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
