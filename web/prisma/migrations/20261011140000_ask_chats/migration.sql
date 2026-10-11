/*
  Warnings:

  - You are about to drop the column `homeId` on the `ChatMessage` table. All the data in the column will be lost.
  - You are about to drop the column `scenarioId` on the `ChatMessage` table. All the data in the column will be lost.
  - Added the required column `chatId` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_homeId_fkey";

-- DropIndex
DROP INDEX "ChatMessage_homeId_createdAt_idx";

-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "homeId",
DROP COLUMN "scenarioId",
ADD COLUMN     "chatId" TEXT NOT NULL,
ADD COLUMN     "reply" JSONB;

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "homeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chat_homeId_updatedAt_idx" ON "Chat"("homeId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
