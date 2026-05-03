import { prisma } from "../lib/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";

type SettleInput = {
  betId: number;
  result: "WIN" | "LOSE";
};

type SettleResponse = {
  betId: number;
  userId: number;
  result: "WIN" | "LOSE";
  status: "SETTLED";
  payout: number;
  balance: number;
  ledgerEntryId: number | null;
};

export async function settleBet(input: SettleInput): Promise<SettleResponse> {
  const { betId, result } = input;

  if (!Number.isInteger(betId) || betId <= 0) {
    throw new BadRequestError("betId 必须是正整数");
  }

  if (result !== "WIN" && result !== "LOSE") {
    throw new BadRequestError("result 必须是 WIN 或 LOSE");
  }

  return prisma.$transaction(async (tx) => {
    const bet = await tx.bet.findUnique({ where: { id: betId } });
    if (!bet) {
      throw new NotFoundError("订单不存在");
    }

    const changed = await tx.bet.updateMany({
      where: { id: betId, status: "PLACED" },
      data: {
        status: "SETTLED",
        result,
        settledAt: new Date(),
      },
    });

    if (changed.count === 0) {
      throw new ConflictError("仅允许 PLACED 订单结算，且不可重复结算");
    }

    let payout = 0;
    let ledgerEntryId: number | null = null;

    if (result === "WIN") {
      // 原路返还并加盈利：按 2x 发奖
      payout = bet.amount * 2;

      const updatedUser = await tx.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: payout } },
      });

      const ledger = await tx.ledgerEntry.create({
        data: {
          userId: bet.userId,
          betId: bet.id,
          type: "BET_CREDIT",
          amount: payout,
          ref: `settle:win:${bet.id}`,
        },
      });

      ledgerEntryId = ledger.id;

      return {
        betId: bet.id,
        userId: bet.userId,
        result,
        status: "SETTLED",
        payout,
        balance: updatedUser.balance,
        ledgerEntryId,
      };
    }

    const user = await tx.user.findUnique({ where: { id: bet.userId } });
    if (!user) {
      throw new NotFoundError("用户不存在");
    }

    return {
      betId: bet.id,
      userId: bet.userId,
      result,
      status: "SETTLED",
      payout,
      balance: user.balance,
      ledgerEntryId,
    };
  });
}