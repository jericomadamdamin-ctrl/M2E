# Auto-Exchange System Implementation Guide

## Overview
This document covers the complete implementation of the Automatic Diamond-to-WLD exchange system with fallback mechanisms for player-initiated conversions.

## Architecture Components

### 1. Database Layer (`supabase/migrations/20260215100000_auto_exchange_system.sql`)
**Tables Created:**
- `auto_exchange_requests` - Main exchange order tracking with status, amounts, slippage tolerance
- `auto_exchange_config` - User settings (enabled/disabled, slippage preferences, min amounts)
- `fallback_conversion_requests` - Fallback manual withdrawal requests when auto-exchange fails
- `exchange_audit_log` - Comprehensive audit trail for compliance and debugging

**Key Features:**
- Row-level security (RLS) policies ensuring users only see their own data
- Atomic updates via triggers for `updated_at` timestamps
- Indexes on user_id, status, and created_at for performance
- Service role access for backend functions

### 2. Smart Contract (`contracts/AutoExchangeManager.sol`)
**Solidity Contract Features:**
- ERC20 token support for Diamond and WLD tokens
- Uniswap V3 integration for DEX swaps
- Safe fee collection mechanism (configurable, max 5%)
- Order lifecycle management (pending → executing → completed/failed)
- Emergency pause and withdrawal functions
- Comprehensive event logging

**Key Functions:**
- `requestExchange()` - Player initiates exchange with slippage tolerance
- `executeExchange()` - Backend executes pending orders (admin-only)
- `cancelOrder()` - Player can cancel pending orders
- `_performSwap()` - Atomic swap execution with try-catch for error handling

### 3. Backend Edge Functions

#### `auto-exchange-request` (POST)
**Purpose:** Create new auto-exchange requests
**Authentication:** Requires user auth + World ID verification
**Flow:**
1. Validate diamond amount and slippage tolerance
2. Check user's auto-exchange config is enabled
3. Verify player has sufficient diamonds
4. Create pending exchange request in database
5. Log security event

**Response:**
```json
{
  "ok": true,
  "request_id": "uuid",
  "diamond_amount": 1000,
  "wld_target_amount": 1.0,
  "slippage_tolerance": 1.0,
  "status": "pending"
}
```

#### `auto-exchange-execute` (POST - Backend Only)
**Purpose:** Execute pending exchange requests (called by scheduled jobs)
**Authentication:** Requires service role key
**Flow:**
1. Fetch pending exchange request
2. Mark as "executing"
3. Verify player balance hasn't changed
4. Lock and deduct diamonds atomically
5. Call smart contract for DEX swap
6. If successful: mark completed, log audit event
7. If failed: trigger fallback mechanism

**Fallback Trigger:**
When execution fails, automatically:
- Create fallback_conversion_request
- Mark main request as "fallback"
- Restore diamond balance if needed
- Log failure reason
- Notify player of fallback

#### `auto-exchange-status` (GET)
**Purpose:** Check exchange request status and history
**Authentication:** Requires user auth
**Params:**
- `requestId` (optional) - Check specific request
- `limit` (default: 20, max: 100) - Pagination limit
- `offset` (default: 0) - Pagination offset

**Response with requestId:**
```json
{
  "ok": true,
  "request": {
    "id": "uuid",
    "diamond_amount": 1000,
    "wld_target_amount": 1.0,
    "wld_received": 0.99,
    "status": "completed",
    "tx_hash": "0x...",
    "created_at": "2026-02-15T12:00:00Z"
  },
  "fallback": null
}
```

#### `auto-exchange-config` (GET/POST/PUT)
**Purpose:** Manage user auto-exchange settings
**Authentication:** Requires user auth + World ID verification

**GET Response:**
```json
{
  "ok": true,
  "config": {
    "user_id": "uuid",
    "enabled": true,
    "slippage_tolerance": 1.0,
    "min_wld_amount": 10.0,
    "auto_retry": true
  }
}
```

**POST/PUT Payload:**
```json
{
  "enabled": true,
  "slippageTolerance": 1.5,
  "minWldAmount": 20.0,
  "autoRetry": true
}
```

### 4. Security Measures

**Input Validation:**
- Diamond amount range: 1 - 1,000,000
- Slippage tolerance: 0.1% - 5%
- All numeric inputs floored/validated

**Database Security:**
- Row-level security on all exchange tables
- Audit logging of all state changes
- IP address and user agent tracking
- Immutable audit trail

**Atomic Operations:**
- Diamond locking prevents double-spending
- Transaction-style execution ensures consistency
- Automatic rollback on contract failure

**Smart Contract Security:**
- Reentrancy guard via nonReentrant
- SafeERC20 for safe token transfers
- Owner-only execution functions
- Emergency pause mechanism
- Minimum order amounts

## Integration Points

### Existing Manual Cashout
The auto-exchange system maintains full backward compatibility:
1. Manual withdrawal route (`/cashout-request`) unchanged
2. Existing cashout_requests, cashout_rounds tables unaffected
3. Failed auto-exchanges create compatible fallback requests
4. Manual cashout remains available anytime

### Player State Management
- Diamonds locked during auto-exchange execution
- Balance restored on failure
- No diamond loss on failed exchanges (except on successful swap)

### World ID Integration
- Leverages existing World ID verification
- Prevents Sybil attacks on auto-exchange
- Consistent with current auth system

## Deployment Steps

### Phase 1: Database Setup
```bash
# Run migration to create tables
supabase db push
```

### Phase 2: Smart Contract Deployment
```bash
# Deploy AutoExchangeManager contract
# 1. Set Diamond token address
# 2. Set WLD token address
# 3. Set Uniswap V3 Router address
# 4. Deploy contract
# 5. Store contract address in game config
```

### Phase 3: Edge Functions
```bash
# Deploy all edge functions
supabase functions deploy auto-exchange-request
supabase functions deploy auto-exchange-execute
supabase functions deploy auto-exchange-status
supabase functions deploy auto-exchange-config
```

### Phase 4: Feature Flag Setup
Create game config entries:
```json
{
  "auto_exchange_enabled": true,
  "diamond_to_wld_rate": { "rate": 0.001 },
  "auto_exchange_contract_address": "0x..."
}
```

## Testing Checklist

- [ ] Request creation with various diamond amounts
- [ ] Slippage validation (reject <0.1%, >5%)
- [ ] Insufficient diamonds error handling
- [ ] Successful execution flow
- [ ] Failed exchange → fallback creation
- [ ] Config persistence and updates
- [ ] Status tracking accuracy
- [ ] Audit log completeness
- [ ] Fallback manual withdrawal processing
- [ ] Double-spending prevention
- [ ] Rate limiting and abuse prevention

## Monitoring & Metrics

**Key Metrics to Track:**
- Exchange requests per day/week
- Success rate (completed / total)
- Fallback rate (fallback / total)
- Average slippage realized
- Average WLD received per diamond
- Contract error frequency
- Execution latency

**Alert Conditions:**
- Fallback rate > 10%
- Contract call failures > 5% of attempts
- Execution latency > 30 seconds
- Audit log write failures
- Diamond balance discrepancies

## API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auto-exchange-request` | POST | User + World ID | Create exchange request |
| `/auto-exchange-execute` | POST | Service Role | Execute pending orders |
| `/auto-exchange-status` | GET | User | Check request status |
| `/auto-exchange-config` | GET | User + World ID | Retrieve user settings |
| `/auto-exchange-config` | POST/PUT | User + World ID | Update user settings |

## Error Handling

### Common Errors & Recovery

**"Invalid diamond amount"**
- Cause: Amount < 1 or > 1,000,000
- Recovery: Show user valid range

**"Slippage tolerance exceeded"**
- Cause: Market movement beyond tolerance
- Recovery: Automatic fallback initiated

**"Insufficient diamonds"**
- Cause: Balance changed before execution
- Recovery: Request cancellation, no diamonds lost

**"Contract execution failed"**
- Cause: Network issue or contract error
- Recovery: Automatic fallback + retry mechanism

**"Fallback mechanism failed"**
- Cause: Critical database/fallback error
- Recovery: Manual admin intervention required

## Rollback Procedure

If issues arise:
1. Disable feature: `auto_exchange_enabled = false`
2. Pause smart contract
3. Create fallback for all pending requests
4. Restore user diamond balances
5. Investigate root cause
6. Deploy fix
7. Re-enable gradual rollout

## Notes

- All timestamps in UTC (ISO 8601)
- Diamond amounts stored as NUMERIC for precision
- WLD amounts use high precision decimals
- Service role operations fully audited
- Player privacy respected via RLS
- Zero trust in frontend calculations

---

**Version:** 1.0  
**Last Updated:** 2026-02-15  
**Status:** Ready for Phase 1 Deployment
