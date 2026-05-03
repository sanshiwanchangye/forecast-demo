import path from "node:path";
import { PrismaClient } from "../../app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  // Make sqlite relative URLs stable under Next dev/build runtime.
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relative = raw.slice("file:".length);
    const absolute = path.resolve(process.cwd(), relative).replace(/\\/g, "/");
    return `file:${absolute}`;
  }

  return raw;
}

const databaseUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
