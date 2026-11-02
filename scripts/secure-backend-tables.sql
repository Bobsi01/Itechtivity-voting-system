-- Backend-only tables use Prisma/node-postgres with the owner connection.
-- No browser Supabase Auth integration or Data API policies are used by this app.
-- Apply only after confirming the production database role bypasses RLS.
BEGIN;

ALTER TABLE public."AcademicProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Award" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BingoCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Booth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EventConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdempotencyLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PdfBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RegistrationTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TicketStub" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Vote" ENABLE ROW LEVEL SECURITY;

COMMIT;
