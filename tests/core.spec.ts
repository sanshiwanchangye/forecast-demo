import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { deposit } from "../src/services/deposit.service";
import { placeBet } from "../src/services/bet.service";
import { settleBet } from "../src/services/settle.service";

async function resetDb() {
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany();
    await tx.idempotencyKey.deleteMany();
    await tx.bet.deleteMany();
    await tx.user.deleteMany();

    const users = [
      { id: 1, username: "alice", balance: 10000 },
      { id: 2, username: "bob", balance: 5000 },
      { id: 3, username: "charlie", balance: 2000 },
    ];

    await tx.user.createMany({
      data: users,
    });

    await tx.ledgerEntry.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "DEPOSIT",
        amount: u.balance,
        ref: `test:initial-balance:user-${u.id}`,
      })),
    });
  });
}

describe("core flows", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("1. 充值成功后余额正确增加", async () => {
    const res = await deposit({ userId: 1, amount: 1000, idempotencyKey: "dep-t1" });
    expect(res.data.balance).toBe(11000);
  });

  it("2. 充值幂等性验证（多次请求，一次生效）", async () => {
    const a = await deposit({ userId: 1, amount: 1000, idempotencyKey: "dep-t2" });
    const b = await deposit({ userId: 1, amount: 1000, idempotencyKey: "dep-t2" });

    expect(a.data.balance).toBe(11000);
    expect(b.data.balance).toBe(11000);
    expect(b.replayed).toBe(true);
  });

  it("3. 余额不足时，下注应当失败", async () => {
    await expect(
      placeBet({
        userId: 3,
        gameId: "G-1",
        amount: 999999,
        idempotencyKey: "bet-t3",
      })
    ).rejects.toThrow("余额不足");
  });

  it("4. 下注操作的幂等性验证", async () => {
    const a = await placeBet({
      userId: 1,
      gameId: "G-2",
      amount: 3000,
      idempotencyKey: "bet-t4",
    });

    const b = await placeBet({
      userId: 1,
      gameId: "G-2",
      amount: 3000,
      idempotencyKey: "bet-t4",
    });

    expect(a.data.betId).toBe(b.data.betId);
    expect(a.data.balance).toBe(7000);
    expect(b.data.balance).toBe(7000);
    expect(b.replayed).toBe(true);
  });

  it("5. 结算为 WIN 时，余额正确增加", async () => {
    const placed = await placeBet({
      userId: 1,
      gameId: "G-3",
      amount: 3000,
      idempotencyKey: "bet-t5",
    });

    const settled = await settleBet({ betId: placed.data.betId, result: "WIN" });

    expect(settled.payout).toBe(6000);
    expect(settled.balance).toBe(13000); // 10000 -3000 +6000
  });

  it("6. 已结算订单不允许重复结算", async () => {
    const placed = await placeBet({
      userId: 1,
      gameId: "G-4",
      amount: 1000,
      idempotencyKey: "bet-t6",
    });

    await settleBet({ betId: placed.data.betId, result: "LOSE" });

    await expect(
      settleBet({ betId: placed.data.betId, result: "WIN" })
    ).rejects.toThrow("不可重复结算");
  });
});
