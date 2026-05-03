import { NextRequest, NextResponse } from "next/server";
import { AppError, BadRequestError } from "@/src/lib/errors";
import { reconcileUser } from "@/src/services/reconcile.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userIdRaw = req.nextUrl.searchParams.get("userId");
    const userId = Number(userIdRaw);

    if (!userIdRaw || !Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestError("query 参数 userId 必须是正整数");
    }

    const result = await reconcileUser({ userId });
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    console.error("reconcile api unknown error:", error);

    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "服务器内部错误" },
      { status: 500 }
    );
  }
}