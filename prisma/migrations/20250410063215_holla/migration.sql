-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeen" TIMESTAMP(3),
ADD COLUMN     "socketId" TEXT;
