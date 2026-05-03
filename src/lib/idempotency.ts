import crypto from "node:crypto";
import type { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "./prisma";
import { ConflictError } from "./errors";

type TxClient = Prisma.TransactionClient;

type IdempotentResult<T> = {
  data: T;
  statusCode: number;
  replayed: boolean;
};

export function buildRequestHash(input: unknown): string {
  const normalized = JSON.stringify(input);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function safeJsonParse<T>(text: string): T {
  return JSON.parse(text) as T;
}

export async function runIdempotent<T>(params: {
  scope: string;
  key: string;
  requestHash: string;
  handler: (tx: TxClient) => Promise<{ data: T; statusCode?: number }>;
}): Promise<IdempotentResult<T>> {
  const { scope, key, requestHash, handler } = params;

  // Fast path: if key already exists, return replay/409 directly.
  const existingBefore = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope, key } },
  });

  if (existingBefore) {
    if (existingBefore.requestHash !== requestHash) {
      throw new ConflictError(
        "Idempotency-Key 冲突：相同 Key 但请求内容不一致"
      );
    }

    if (
      existingBefore.statusCode === 0 ||
      existingBefore.responseJson === "__PENDING__"
    ) {
      throw new ConflictError("该请求正在处理中，请稍后重试");
    }

    return {
      data: safeJsonParse<T>(existingBefore.responseJson),
      statusCode: existingBefore.statusCode,
      replayed: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          scope,
          key,
          requestHash,
          statusCode: 0,
          responseJson: "__PENDING__",
        },
      });

      const output = await handler(tx);
      const statusCode = output.statusCode ?? 200;

      await tx.idempotencyKey.update({
        where: { scope_key: { scope, key } },
        data: {
          statusCode,
          responseJson: JSON.stringify(output.data),
        },
      });

      return { data: output.data, statusCode, replayed: false as const };
    });

    return result;
  } catch (e: unknown) {
    const maybeCode =
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      typeof (e as { code?: unknown }).code === "string"
        ? (e as { code: string }).code
        : "";

    if (maybeCode !== "P2002") {
      throw e;
    }

    const existing = await prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });

    if (!existing) {
      throw e;
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        "Idempotency-Key 冲突：相同 Key 但请求内容不一致"
      );
    }

    if (existing.statusCode === 0 || existing.responseJson === "__PENDING__") {
      throw new ConflictError("该请求正在处理中，请稍后重试");
    }

    return {
      data: safeJsonParse<T>(existing.responseJson),
      statusCode: existing.statusCode,
      replayed: true,
    };
  }
}
