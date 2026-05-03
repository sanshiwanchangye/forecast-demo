import { buildRequestHash, runIdempotent } from "../lib/idempotency";
import { BadRequestError, NotFoundError } from "../lib/errors";

type DepositInput = {
  userId: number;
  amount: number; // 用“分”为单位，整数
  idempotencyKey: string;
};

type DepositResponse = {
  userId: number;
  amount: number;
  balance: number;
  ledgerEntryId: number;
};

export async function deposit(input: DepositInput): Promise<{
  data: DepositResponse;
  statusCode: number;
  replayed: boolean;
}> {
  const { userId, amount, idempotencyKey } = input;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new BadRequestError("userId 必须是正整数");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestError("amount 必须是正整数（单位：分）");
  }

  const requestHash = buildRequestHash({ userId, amount });
  const scope = `deposit:user:${userId}`;

  return runIdempotent<DepositResponse>({
    scope,
    key: idempotencyKey,
    requestHash,
    handler: async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundError("用户不存在");
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      });

      const ledger = await tx.ledgerEntry.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount,
          ref: `deposit:${idempotencyKey}`,
        },
      });

      return {
        data: {
          userId,
          amount,
          balance: updatedUser.balance,
          ledgerEntryId: ledger.id,
        },
        statusCode: 200,
      };
    },
  });
}