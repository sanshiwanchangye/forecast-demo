import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deposit } from "@/src/services/deposit.service";
import { AppError, BadRequestError } from "@/src/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  amount: z.number().int().positive(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestError("路径参数 id 必须是正整数");
    }

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
      throw new BadRequestError("请求体不合法，amount 必须为正整数");
    }

    const result = await deposit({
      userId,
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
    console.error("deposit api error:", error);

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
