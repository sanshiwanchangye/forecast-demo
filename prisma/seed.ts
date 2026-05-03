import "dotenv/config";
import path from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relative = raw.slice("file:".length);
    const absolute = path.resolve(process.cwd(), relative).replace(/\\/g, "/");
    return `file:${absolute}`;
  }

  return raw;
}

const prisma = new PrismaClient({
  ...(resolveDatabaseUrl() ? { datasourceUrl: resolveDatabaseUrl() } : {}),
});

async function main() {
  const users = [
    { id: 1, username: "alice", balance: 10000 },
    { id: 2, username: "bob", balance: 5000 },
    { id: 3, username: "charlie", balance: 2000 },
  ];

  await prisma.$transaction(async (tx) => {
    // Reset seed data to keep user balance and ledger sum strictly consistent.
    await tx.ledgerEntry.deleteMany();
    await tx.idempotencyKey.deleteMany();
    await tx.bet.deleteMany();
    await tx.user.deleteMany();

    for (const user of users) {
      await tx.user.create({
        data: {
          id: user.id,
          username: user.username,
          balance: user.balance,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          type: "DEPOSIT",
          amount: user.balance,
          ref: `seed:initial-balance:user-${user.id}`,
        },
      });
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
