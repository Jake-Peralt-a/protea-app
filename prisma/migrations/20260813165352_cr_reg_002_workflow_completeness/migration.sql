-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Decision" ADD VALUE 'INFO_REQUESTED';
ALTER TYPE "Decision" ADD VALUE 'REVOKED';

-- AlterEnum
ALTER TYPE "MatchBasis" ADD VALUE 'NAME_DOB';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegistrationStatus" ADD VALUE 'INFO_REQUIRED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "ApprovalDecision" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DuplicateFlag" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1;
