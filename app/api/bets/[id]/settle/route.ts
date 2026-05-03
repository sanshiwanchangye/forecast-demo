import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, BadRequestError } from "@/src/lib/errors";
import { settleBet } from "@/src/services/settle.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  result: z.enum(["WIN", "LOSE"]),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const betId = Number(id);

    if (!Number.isInteger(betId) || betId <= 0) {
      throw new BadRequestError("路径参数 id 必须是正整数");
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new BadRequestError("请求体必须是合法 JSON");
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestError("请求体不合法，result 必须是 WIN 或 LOSE");
    }

    const result = await settleBet({
      betId,
      result: parsed.data.result,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    console.error("settle api unknown error:", error);

    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "服务器内部错误" },
      { status: 500 }
    );
  }
}