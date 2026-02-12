# Game Master (Admin) Manual

This document details every feature available in the Game Master dashboard, the simple math behind them, and their impact on the game economy.

## 1. Access & Security
- **Access**: Via the "Game Master" tab in the main UI. Requires the wallet address to be flagged as `is_admin` in the database.
- **Security**:
  - **Access Key**: Critical actions require an `x-admin-key` header (handled automatically by the UI).
  - **Verification**: All financial actions run through the World Dev Portal API to ensure proof-of-personhood and valid payments.

---

## 2. Global Economy (Game Config)
*Location: "Primary Calibration" Accordion*

Change these values to instantly balance the game without code deployments.

### Variables & Math
| Variable | Math / Logic | Impact |
| :--- | :--- | :--- |
| **OIL / WLD** | `1 WLD = X Oil` | Higher = Oil is cheaper. Lower = Oil is more expensive. Controls the "faucet" of the game. |
| **OIL / USDC** | `1 USDC = X Oil` | Same as above but for USDC deposits. |
| **Diamond Drop** | `Diamonds = Action * DropRate` | The base rate at which players earn Diamonds (Pre-token currency). |
| **Daily Cap** | `If UserDailyTotal > Cap THEN Stop` | Hard limit on how many diamonds a single user can mine in 24h. Prevents bot farming. |
| **Treasury %** | `Pool = TotalRevenue * (Pct / 100)` | Defines how much of the game's revenue goes back to players. **Crucial for sustainability.** |
| **Cooldown** | `NextCashout = LastCashout + X Days` | How many days a user must wait between cashout requests. |

### Impact of Changes
- **Increasing Treasury %**: Makes the game more attractive (higher payouts) but leaves less profit for maintenance/devs.
- **Decreasing Fuel Cost**: Makes the game easier/idlier but might reduce ad/login frequency if fuel lasts too long.

---

## 3. Machine Matrix
*Location: "Machine Matrix" Accordion*

Calibrate the NFT-like mining machines.

| Field | Math | Impact |
| :--- | :--- | :--- |
| **WLD Cost** | `Price = Cost` | Entry price for new players. |
| **Actions/Hr** | `Earnings = (Actions/Hr) * DiamondDrop` | Determines the ROI (Return on Investment) speed. |
| **Fuel/Hr** | `BurnTime = Capacity / (Fuel/Hr)` | How often a user **must** log in to refuel. Higher burn = more active play required. |
| **Capacity** | `MaxFuel = Capacity` | Larger tanks allow for longer AFK (Away From Keyboard) periods. |

> **Note**: Changes to `Actions/Hr` or `Fuel/Hr` apply to **all** active machines instantly. Costs only affect **new** purchases.

---

## 4. Financials & Approvals
*Location: "Pending Approval" Section*

The system places all high-value actions (Oil, Machines, Slots) into a "Pending" queue for safety.

### Verification Flow
1. **User Pays**: WLD is sent on-chain.
2. **Pending State**: Database records the attempt but doesn't grant items yet.
3. **Verification**:
   - **Auto-Verify**: Cron job runs every 5 minutes. Checks World Dev Portal.
   - **Manual Verify**: You click "Confirm".
4. **Math Check**: `abs(PaidAmount - ExpectedAmount) < 1%`.
   - If the user paid 10 WLD for a 100 WLD machine, the system **rejects** it automatically (or warns you manually).

### Actions
- **Verify All**: Runs the auto-verifier on everything. Safe to spam.
- **Confirm**: **Overpower** force-credit. Use only if you are checking the blockchain manually.
- **Void**: Marks as failed. User gets nothing.

---

## 5. Payout Protocol (Cashout)
*Location: "Payout Protocols"*

This is the engine that pays players. It follows a **Revenue Share Model**, not a fixed exchange rate. This ensures the game **never** goes bankrupt.

### The Algorithm
1. **Accumulation**:
   - Users request cashouts.
   - `TotalDiamonds` = Sum of all valid requests.
2. **Pool Calculation (**Phase 01: Closure**)**:
   - `PayoutPool` = `TotalGameRevenue` * `Treasury %`.
3. **Value Determination**:
   - `DiamondValue` = `PayoutPool` / `TotalDiamonds`.
   - *Example*: $1,000 Pool / 10,000 Diamonds = $0.10 per Diamond.
4. **Distribution (**Phase 02: Execution**)**:
   - System calculates `UserPayout = UserDiamonds * DiamondValue`.
   - Sends batch transactions on-chain.

### Admin Responsibility
- **Monitor the Pool**: Ensure `PayoutPool` is growing.
- **Finalize Rounds**: Click "Finalize & Distribute" to lock in the Diamond Value.
- **Execute**: Click "Initialize Transactions" to send the money.

---

## 6. User Management
*Location: "User Accounts"*

- **Search**: Find by Name, Wallet (0x...), or User ID.
- **Stats**: View current Oil/Diamond/Reserve balances.
- **Ban Hammer**:
  - **Shadow Ban**: Toggling "Ban" sets `is_shadow_banned = true`.
  - **Impact**: User looks normal to themselves but cannot cash out, and their actions might be ignored by the server.

---

## Summary Checklist for Admins
1. **Daily**: Check "Pending Approvals". Run "Verify All" if cron is stuck.
2. **Weekly**: Close the Cashout Round (`Phase 01`) -> Execute Payouts (`Phase 02`).
3. **Bi-Weekly**: Review "Global Economy" stats. If users are earning too fast, lower `Diamond Drop` or increase `Machine Cost`.
