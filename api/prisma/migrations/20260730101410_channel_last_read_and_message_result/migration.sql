-- AlterTable
ALTER TABLE "ChannelMember" ADD COLUMN     "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "resultJson" JSONB;
