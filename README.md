# Forecast Demo（类 Polymarket 简化版）

一个面向后端/全栈技术测验的预测平台核心实现，重点覆盖：
- 账户余额管理
- 幂等性处理（Idempotency-Key）
- 订单状态机控制
- 追加式账本（Append-only Ledger）
- 对账接口（Admin Reconciliation）

## 技术栈
- 后端：Next.js Route Handler + TypeScript
- 数据库：SQLite + Prisma
- 测试：Vitest

## 功能完成情况
- 用户静态预置（seed）
- `POST /api/users/:id/deposit`（充值 + 幂等）
- `POST /api/bets`（下注 + 余额校验 + 幂等）
- `POST /api/bets/:id/settle`（结算：WIN/LOSE）
- `POST /api/bets/:id/cancel`（取消并退款）
- `GET /api/admin/reconcile?userId=...`（对账）
- 6 个核心自动化测试全部通过

## 项目结构
```txt
app/api/
  users/[id]/deposit/route.ts
  bets/route.ts
  bets/[id]/settle/route.ts
  bets/[id]/cancel/route.ts
  admin/reconcile/route.ts

src/
  lib/
    prisma.ts
    idempotency.ts
    errors.ts
  services/
    deposit.service.ts
    bet.service.ts
    settle.service.ts
    cancel.service.ts
    reconcile.service.ts

prisma/
  schema.prisma
  seed.ts
tests/
  core.spec.ts
```

## 运行步骤
1. 安装依赖
```bash
npm install
```

2. 执行数据库迁移
```bash
npx prisma migrate dev -n init
```

3. 初始化静态数据（用户 + 初始账本）
```bash
npx prisma db seed
```

4. 启动开发服务
```bash
npm run dev
```

5. 运行测试
```bash
npm run test
```

## 金额单位说明
- 后端金额字段统一使用整数（单位：分）。
- 前端展示时可自行 `/100` 转换为元。

## 幂等规则说明
涉及幂等的接口：
- `POST /api/users/:id/deposit`
- `POST /api/bets`

规则：
- 相同 `Idempotency-Key` + 相同请求体：只生效一次，后续返回首次结果（重放）。
- 相同 `Idempotency-Key` + 不同请求体：返回 `409 Conflict`。

## 状态机规则
订单状态：
- `PLACED`
- `SETTLED`
- `CANCELLED`

允许流转：
- `PLACED -> SETTLED`
- `PLACED -> CANCELLED`

限制：
- `SETTLED` 和 `CANCELLED` 为终态，不允许重复结算或再次取消。

## 账本模型（追加式）
账本类型：
- `DEPOSIT`：充值成功
- `BET_DEBIT`：下注扣款
- `BET_CREDIT`：WIN 发奖
- `BET_REFUND`：取消退款

原则：
- 不修改历史账本记录，只允许新增账本条目。
- 余额变更与账本写入在同一事务内完成，保证一致性。

## API 示例
### 1) 充值
`POST /api/users/:id/deposit`

Header:
```txt
Idempotency-Key: dep-001
```

Body:
```json
{
  "amount": 1000
}
```

### 2) 下单
`POST /api/bets`

Header:
```txt
Idempotency-Key: bet-001
```

Body:
```json
{
  "userId": 1,
  "gameId": "BTC-2026-YES",
  "amount": 3000
}
```

### 3) 结算
`POST /api/bets/:id/settle`

Body:
```json
{
  "result": "WIN"
}
```

### 4) 取消
`POST /api/bets/:id/cancel`

### 5) 对账
`GET /api/admin/reconcile?userId=1`

返回示例字段：
- `dbBalance`
- `ledgerDerivedBalance`
- `balanceConsistent`
- `betStatusStats`
- `anomalies`

## 自动化测试
已覆盖并通过以下 6 个核心用例：
1. 充值成功后余额正确增加
2. 充值幂等性验证（多次请求，一次生效）
3. 余额不足时下注失败
4. 下注幂等性验证
5. WIN 结算后余额正确增加
6. 已结算订单不允许重复结算

## 说明
- 本项目核心目标是后端交易一致性与状态控制，不依赖复杂前端页面。
- 如需在线演示，可进一步部署到 Vercel（可选）。


## 提交信息
- GitHub 仓库地址：`<在这里填你的仓库链接>`
- 在线预览地址（可选）：`未部署（本次以本地可复现运行为主）`

## 错误码说明
- `400 BAD_REQUEST`：参数不合法
- `404 NOT_FOUND`：用户或订单不存在
- `409 CONFLICT`：幂等冲突、余额不足、重复结算等业务冲突
- `500 INTERNAL_ERROR`：服务器内部异常
