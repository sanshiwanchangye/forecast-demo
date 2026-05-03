import { prisma } from "../lib/prisma";
import { BadRequestError, NotFoundError } from "../lib/errors";

type ReconcileInput = {
  userId: number;
};

type ReconcileOutput = {
  userId: number;
  dbBalance: number;
  ledgerDerivedBalance: number;
  balanceConsistent: boolean;
  betStatusStats: {
    PLACED: number;
    SETTLED: number;
    CANCELLED: number;
  };
  anomalies: string[];
};

export async function reconcileUser(input: ReconcileInput): Promise<ReconcileOutput> {
  const { userId } = input;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new BadRequestError("userId 必须是正整数");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("用户不存在");
  }

  const [bets, ledgers] = await Promise.all([
    prisma.bet.findMany({ where: { userId } }),
    prisma.ledgerEntry.findMany({ where: { userId } }),
  ]);

  const ledgerDerivedBalance = ledgers.reduce((acc, entry) => {
    if (entry.type === "DEPOSIT" || entry.type === "BET_CREDIT" || entry.type === "BET_REFUND") {
      return acc + entry.amount;
    }
    if (entry.type === "BET_DEBIT") {
      return acc - entry.amount;
    }
    return acc;
  }, 0);

  const betStatusStats = {
    PLACED: bets.filter((b) => b.status === "PLACED").length,
    SETTLED: bets.filter((b) => b.status === "SETTLED").length,
    CANCELLED: bets.filter((b) => b.status === "CANCELLED").length,
  };

  const anomalies: string[] = [];

  if (user.balance !== ledgerDerivedBalance) {
    anomalies.push("余额不一致：User.balance 与账本推导余额不一致");
  }

  const ledgerByBet = new Map<number, typeof ledgers>();
  for (const l of ledgers) {
    if (!l.betId) continue;
    const list = ledgerByBet.get(l.betId) ?? [];
    list.push(l);
    ledgerByBet.set(l.betId, list);
  }

  for (const bet of bets) {
    const entries = ledgerByBet.get(bet.id) ?? [];
    const debitCount = entries.filter((e) => e.type === "BET_DEBIT").length;
    const creditCount = entries.filter((e) => e.type === "BET_CREDIT").length;
    const refundCount = entries.filter((e) => e.type === "BET_REFUND").length;

    if (debitCount === 0) {
      anomalies.push(`订单 ${bet.id} 缺少 BET_DEBIT 扣款记录`);
    }

    if (creditCount > 1) {
      anomalies.push(`订单 ${bet.id} 存在重复结算（BET_CREDIT > 1）`);
    }

    if (bet.status === "CANCELLED" && refundCount === 0) {
      anomalies.push(`订单 ${bet.id} 已取消但缺少 BET_REFUND 退款记录`);
    }

    if (bet.status === "SETTLED" && bet.result === "WIN" && creditCount === 0) {
      anomalies.push(`订单 ${bet.id} 为 WIN 但缺少 BET_CREDIT 发奖记录`);
    }

    if (bet.status === "SETTLED" && bet.result === "LOSE" && creditCount > 0) {
      anomalies.push(`订单 ${bet.id} 为 LOSE 但存在 BET_CREDIT 发奖记录`);
    }
  }

  return {
    userId,
    dbBalance: user.balance,
    ledgerDerivedBalance,
    balanceConsistent: user.balance === ledgerDerivedBalance,
    betStatusStats,
    anomalies,
  };
}