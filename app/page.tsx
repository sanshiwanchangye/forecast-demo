"use client";

import { useMemo, useState } from "react";

type HttpMethod = "GET" | "POST";
type ToastType = "success" | "error" | "info";
type ActionKey = "deposit" | "bet" | "settle" | "cancel" | "reconcile";
type ActionStatus = "idle" | "loading" | "success" | "error";

function pickBetId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).betId;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return null;
}

async function requestApi<T>(
  method: HttpMethod,
  url: string,
  body?: unknown,
  idemKey?: string
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (idemKey) headers["Idempotency-Key"] = idemKey;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // keep raw text
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return data as T;
}

export default function Home() {
  const [userId, setUserId] = useState(1);
  const [amount, setAmount] = useState(1000);
  const [depositKey, setDepositKey] = useState("dep-ui-001");

  const [betUserId, setBetUserId] = useState(1);
  const [gameId, setGameId] = useState("BTC-2026-YES");
  const [betAmount, setBetAmount] = useState(3000);
  const [betKey, setBetKey] = useState("bet-ui-001");

  const [betId, setBetId] = useState(1);
  const [latestBetId, setLatestBetId] = useState<number | null>(null);
  const [settleResult, setSettleResult] = useState<"WIN" | "LOSE">("WIN");

  const [reconcileUserId, setReconcileUserId] = useState(1);

  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const [statusMap, setStatusMap] = useState<Record<ActionKey, ActionStatus>>({
    deposit: "idle",
    bet: "idle",
    settle: "idle",
    cancel: "idle",
    reconcile: "idle",
  });
  const [statusText, setStatusText] = useState("等待操作");
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    show: boolean;
    type: ToastType;
    title: string;
    message: string;
  }>({ show: false, type: "info", title: "", message: "" });

  function showToast(type: ToastType, title: string, message: string) {
    setToast({ show: true, type, title, message });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 2200);
  }

  const pretty = useMemo(
    () => (response ? JSON.stringify(response, null, 2) : ""),
    [response]
  );

  function setActionStatus(action: ActionKey, status: ActionStatus, text: string) {
    setStatusMap((prev) => ({ ...prev, [action]: status }));
    setStatusText(text);
  }

  async function run(action: ActionKey, fn: () => Promise<unknown>) {
    setLoading(true);
    setLastAction(action);
    setError("");
    setActionStatus(action, "loading", `${action} 请求中...`);
    try {
      const data = await fn();
      setResponse(data);
      if (action === "bet") {
        const created = pickBetId(data);
        if (created) {
          setLatestBetId(created);
          setBetId(created);
          setActionStatus(action, "success", `下注成功，订单 #${created}`);
          showToast("success", "下注成功", `已自动绑定订单 #${created}`);
          return;
        }
      }
      setActionStatus(action, "success", `${action} 成功`);
      showToast("success", "操作成功", `${action} 已执行成功`);
    } catch (e) {
      setResponse(null);
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setActionStatus(action, "error", `${action} 失败：${msg}`);
      showToast("error", "操作失败", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-4 py-8 text-slate-900 md:px-8">
      <section className="mx-auto w-full max-w-4xl">
        {toast.show && (
          <div className="pointer-events-none fixed left-1/2 top-5 z-50 -translate-x-1/2">
            <div
              className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : toast.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <div className="font-semibold">{toast.title}</div>
              <div>{toast.message}</div>
            </div>
          </div>
        )}

        <header className="mb-5 rounded-3xl border border-[#ebeade] bg-white px-6 py-6 shadow-sm">
          <div className="mb-2 inline-flex rounded-full border border-[#ecebe1] px-3 py-1 text-xs text-slate-500">
            Forecasting Sandbox
          </div>
          <h1 className="text-4xl font-serif tracking-tight">
            Forecast Console
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            极简操作台：充值、下注、结算、取消、对账。每次操作会弹出成功/失败提示。
          </p>
          <p className="mt-2 text-xs text-slate-500">当前动作：{lastAction || "-"}</p>
          <div className="mt-3 rounded-xl bg-[#f8f8f2] px-3 py-2 text-sm text-slate-700">
            当前状态：{statusText}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(Object.keys(statusMap) as ActionKey[]).map((k) => (
              <span
                key={k}
                className={`rounded-full px-3 py-1 ${
                  statusMap[k] === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : statusMap[k] === "error"
                    ? "bg-red-50 text-red-700"
                    : statusMap[k] === "loading"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {k}: {statusMap[k]}
              </span>
            ))}
          </div>
        </header>

        <div className="grid gap-4">
          <section className="rounded-3xl border border-[#ebeade] bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">1) 充值接口</h2>
            <p className="mb-4 text-xs text-slate-500">POST /api/users/:id/deposit</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={userId} onChange={(e) => setUserId(Number(e.target.value))} type="number" placeholder="userId" />
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={amount} onChange={(e) => setAmount(Number(e.target.value))} type="number" placeholder="amount(分)" />
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={depositKey} onChange={(e) => setDepositKey(e.target.value)} placeholder="Idempotency-Key" />
              <button className="h-11 rounded-2xl bg-[#191919] px-4 text-white transition hover:bg-black disabled:bg-slate-400" disabled={loading} onClick={() => run("deposit", () => requestApi("POST", `/api/users/${userId}/deposit`, { amount }, depositKey))}>执行充值</button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ebeade] bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">2) 下注接口</h2>
            <p className="mb-4 text-xs text-slate-500">POST /api/bets</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={betUserId} onChange={(e) => setBetUserId(Number(e.target.value))} type="number" placeholder="userId" />
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="gameId" />
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} type="number" placeholder="amount(分)" />
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={betKey} onChange={(e) => setBetKey(e.target.value)} placeholder="Idempotency-Key" />
              <button className="h-11 rounded-2xl bg-[#191919] px-4 text-white transition hover:bg-black disabled:bg-slate-400" disabled={loading} onClick={() => run("bet", () => requestApi("POST", "/api/bets", { userId: betUserId, gameId, amount: betAmount }, betKey))}>执行下注</button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ebeade] bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">3) 结算 / 取消</h2>
            <p className="mb-2 text-xs text-slate-500">POST /api/bets/:id/settle | POST /api/bets/:id/cancel</p>
            <p className="mb-4 rounded-xl bg-[#f8f8f2] px-3 py-2 text-xs text-slate-700">
              当前订单ID：
              <span className="ml-1 font-semibold text-slate-900">
                {latestBetId ?? "暂无（先执行第2步下注）"}
              </span>
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={betId} onChange={(e) => setBetId(Number(e.target.value))} type="number" placeholder="betId" />
              <select className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={settleResult} onChange={(e) => setSettleResult(e.target.value as "WIN" | "LOSE")}>
                <option value="WIN">WIN</option>
                <option value="LOSE">LOSE</option>
              </select>
              <button className="h-11 rounded-2xl bg-[#191919] px-4 text-white transition hover:bg-black disabled:bg-slate-400" disabled={loading} onClick={() => run("settle", () => requestApi("POST", `/api/bets/${betId}/settle`, { result: settleResult }))}>执行结算</button>
              <button className="h-11 rounded-2xl border border-[#dad9cc] bg-white px-4 text-slate-800 transition hover:bg-slate-50 disabled:text-slate-400" disabled={loading} onClick={() => run("cancel", () => requestApi("POST", `/api/bets/${betId}/cancel`, {}))}>执行取消</button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ebeade] bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">4) 对账接口</h2>
            <p className="mb-4 text-xs text-slate-500">GET /api/admin/reconcile?userId=...</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input className="h-11 rounded-2xl border border-[#ecebe1] bg-[#fcfcf9] px-4" value={reconcileUserId} onChange={(e) => setReconcileUserId(Number(e.target.value))} type="number" placeholder="userId" />
              <button className="h-11 rounded-2xl bg-[#191919] px-4 text-white transition hover:bg-black disabled:bg-slate-400" disabled={loading} onClick={() => run("reconcile", () => requestApi("GET", `/api/admin/reconcile?userId=${reconcileUserId}`))}>执行对账</button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ebeade] bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">响应数据</h2>
            {loading && <p className="rounded-xl bg-[#f8f8f2] px-3 py-2 text-sm text-slate-700">请求处理中...</p>}
            {error && <pre className="overflow-x-auto rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</pre>}
            {!error && pretty && <pre className="overflow-x-auto rounded-xl bg-[#f8f8f2] p-3 text-sm">{pretty}</pre>}
          </section>
        </div>
      </section>
    </main>
  );
}
