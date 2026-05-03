import { buildRequestHash, runIdempotent } from "../lib/idempotency";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";

type PlaceBetInput = {
  userId: number;
  gameId: string;
  amount: number; // 单位：分
  idempotencyKey: string;
};

type PlaceBetResponse = {
  betId: number;
  userId: number;
  gameId: string;
  amount: number;
  status: "PLACED";
  balance: number;
  ledgerEntryId: number;
};

export async function placeBet(input: PlaceBetInput): Promise<{
  data: PlaceBetResponse;
  statusCode: number;
  replayed: boolean;
}> {
  const { userId, gameId, amount, idempotencyKey } = input;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new BadRequestError("userId 必须是正整数");
  }

  if (!gameId || typeof gameId !== "string" || !gameId.trim()) {
    throw new BadRequestError("gameId 不能为空");
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestError("amount 必须是正整数（单位：分）");
  }

  const normalizedGameId = gameId.trim();
  const requestHash = buildRequestHash({ userId, gameId: normalizedGameId, amount });
  const scope = `bet:user:${userId}`;

  return runIdempotent<PlaceBetResponse>({
    scope,
    key: idempotencyKey,
    requestHash,
    handler: async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundError("用户不存在");
      }

      // 原子扣款：避免并发下出现负余额
      const debitResult = await tx.user.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });

      if (debitResult.count === 0) {
        throw new ConflictError("余额不足，下注失败");
      }

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: normalizedGameId,
          amount,
          status: "PLACED",
        },
      });

      const ledger = await tx.ledgerEntry.create({
        data: {
          userId,
          betId: bet.id,
          type: "BET_DEBIT",
          amount,
          ref: `bet:${idempotencyKey}`,
        },
      });

      const updatedUser = await tx.user.findUnique({ where: { id: userId } });
      if (!updatedUser) {
        throw new NotFoundError("用户不存在");
      }

      return {
        data: {
          betId: bet.id,
          userId,
          gameId: bet.gameId,
          amount: bet.amount,
          status: "PLACED",
          balance: updatedUser.balance,
          ledgerEntryId: ledger.id,
        },
        statusCode: 200,
      };
    },
  });
}