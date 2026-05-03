import { NextResponse } from "next/server";
import { AppError, BadRequestError } from "@/src/lib/errors";
import { cancelBet } from "@/src/services/cancel.service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const betId = Number(id);

    if (!Number.isInteger(betId) || betId <= 0) {
      throw new BadRequestError("路径参数 id 必须是正整数");
    }

    const result = await cancelBet({ betId });
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    console.error("cancel api unknown error:", error);

    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "服务器内部错误" },
      { status: 500 }
    );
  }
}