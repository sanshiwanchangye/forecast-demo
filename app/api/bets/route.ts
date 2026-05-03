import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, BadRequestError } from "@/src/lib/errors";
import { placeBet } from "@/src/services/bet.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.number().int().positive(),
  gameId: z.string().min(1),
  amount: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestError("缺少请求头 Idempotency-Key");
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new BadRequestError("请求体必须是合法 JSON");
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestError("请求体不合法，需包含 userId/gameId/amount");
    }

    const result = await placeBet({
      userId: parsed.data.userId,
      gameId: parsed.data.gameId,
      amount: parsed.data.amount,
      idempotencyKey: idempotencyKey.trim(),
    });

    return NextResponse.json(result.data, {
      status: result.statusCode,
      headers: {
        "Idempotency-Replayed": String(result.replayed),
      },
    });
  } catch (error: unknown) {
    console.error("bet api error:", error);

    if (error instanceof AppError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "服务器内部错误";

    return NextResponse.json(
      { code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}