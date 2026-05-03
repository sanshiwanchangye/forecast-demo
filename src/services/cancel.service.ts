import { prisma } from "../lib/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";

type CancelInput = {
  betId: number;
};

type CancelResponse = {
  betId: number;
  userId: number;
  status: "CANCELLED";
  refund: number;
  balance: number;
  ledgerEntryId: number;
};

export async function cancelBet(input: CancelInput): Promise<CancelResponse> {
  const { betId } = input;

  if (!Number.isInteger(betId) || betId <= 0) {
    throw new BadRequestError("betId 必须是正整数");
  }

  return prisma.$transaction(async (tx) => {
    const bet = await tx.bet.findUnique({ where: { id: betId } });
    if (!bet) {
      throw new NotFoundError("订单不存在");
    }

    const changed = await tx.bet.updateMany({
      where: { id: betId, status: "PLACED" },
      data: {
        status: "CANCELLED",
        settledAt: new Date(),
      },
    });

    if (changed.count === 0) {
      throw new ConflictError("仅允许 PLACED 订单取消");
    }

    const updatedUser = await tx.user.update({
      where: { id: bet.userId },
      data: { balance: { increment: bet.amount } },
    });

    const ledger = await tx.ledgerEntry.create({
      data: {
        userId: bet.userId,
        betId: bet.id,
        type: "BET_REFUND",
        amount: bet.amount,
        ref: `cancel:${bet.id}`,
      },
    });

    return {
      betId: bet.id,
      userId: bet.userId,
      status: "CANCELLED",
      refund: bet.amount,
      balance: updatedUser.balance,
      ledgerEntryId: ledger.id,
    };
  });
}