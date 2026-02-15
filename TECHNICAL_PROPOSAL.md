# Automatic Diamond-to-WLD Exchange System
## Technical Proposal & Implementation Plan

**Version:** 1.0  
**Date:** February 15, 2026  
**Status:** Ready for Review

---

## Executive Summary

This proposal outlines a production-ready system for enabling players to automatically convert in-game Diamonds into WLD (Worldcoin tokens) on World Chain. The system maintains backward compatibility with the existing manual cashout workflow while introducing an optional, player-initiated auto-exchange feature with robust fallback mechanisms.

---

## 1. Overall System Architecture

### 1.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PLAYER INITIATES AUTO-SWAP                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Frontend Form  │
                    │ (Auto-Swap Tab) │
                    └────────┬────────┘
                             ↓
                ┌────────────────────────────┐
                │  game-auto-exchange/init   │ (Supabase Edge Function)
                │   - Validate player state  │
                │   - Create exchange request│
                │   - Reserve diamonds       │
                │   - Get market price quote │
                └─────────┬──────────────────┘
                          ↓
        ┌─────────────────────────────────────────┐
        │  AUTO-EXCHANGE REQUEST CREATED          │
        │  Status: pending_confirmation           │
        │  (Database: auto_exchange_requests)     │
        └──────────────┬──────────────────────────┘
                       ↓
        ┌──────────────────────────────────────────┐
        │  PLAYER CONFIRMS TRANSACTION             │
        │  (MiniKit transaction flow)              │
        └──────────────┬───────────────────────────┘
                       ↓
    ┌─────────────────────────────────────────────┐
    │  game-auto-exchange/execute                 │
    │   - Call Smart Contract                     │
    │   - Burn Diamonds                           │
    │   - Execute DEX swap (Uniswap)              │
    │   - Send WLD to player wallet               │
    │   - Update database state                   │
    └──────────┬────────────────────────────────┘
               ↓
    ┌──────────────────────────────────────┐
    │  TRANSACTION EXECUTED                │
    │  Status: completed                   │
    └──────┬───────────────────────────────┘
           ↓
    [SUCCESS PATH] ────────────────────────
           │
           ├─→ Update player Diamonds
           ├─→ Emit wallet receive event
           ├─→ Notify player success
           └─→ Log transaction

    [FALLBACK PATH] ───────────────────────
           │
           ├─→ Transaction failed
           ├─→ Status: failed_revert_to_manual
           ├─→ Diamonds unreserved
           ├─→ Create manual cashout request
           └─→ Notify player to use manual path
```

### 1.2 Key Components

| Component | Responsibility | Tech Stack |
|-----------|----------------|-----------|
| **Frontend** | Player initiation, UX, wallet integration | React, Tailwind, MiniKit |
| **Edge Functions** | Request creation, execution, state management | Supabase Functions (Deno) |
| **Smart Contracts** | Token burning, DEX interaction, WLD transfer | Solidity, Ethers.js, Uniswap V3 |
| **Database** | Request tracking, player state, audit logs | Supabase PostgreSQL |
| **World Chain** | L2 execution, gas optimization | Ethereum-compatible |
| **DEX** | Price quotes, token swapping | Uniswap V3 + Router |

---

## 2. Smart Contract Design & Interaction Flow

### 2.1 Smart Contract Architecture

#### **AutoExchangeContract (Main Contract)**

```solidity
// Simplified contract overview (production version more complex)

contract AutoExchange {
    // State variables
    address public diamondToken;
    address public wldToken;
    address public uniswapRouter;
    address public treasury;
    
    // Exchange configuration
    uint256 public swapSlippage = 50; // 0.5%
    uint256 public adminFee = 25; // 0.25% of swap output
    
    // Tracking
    mapping(bytes32 => ExchangeOrder) public orders;
    mapping(address => uint256) public userExchangeCount;
    
    struct ExchangeOrder {
        address player;
        uint256 diamondAmount;
        uint256 wldAmountOut;
        uint256 timestamp;
        OrderStatus status;
        bytes32 txHash;
    }
    
    enum OrderStatus {
        PENDING,
        EXECUTED,
        FAILED,
        CANCELLED
    }
    
    // Events
    event ExchangeInitiated(
        bytes32 indexed orderId,
        address indexed player,
        uint256 diamondAmount,
        uint256 expectedWldOutput
    );
    
    event ExchangeCompleted(
        bytes32 indexed orderId,
        address indexed player,
        uint256 wldReceived,
        bytes32 transactionHash
    );
    
    event ExchangeFailed(
        bytes32 indexed orderId,
        string reason
    );
    
    // Core functions
    function initiateExchange(
        uint256 diamondAmount,
        uint256 minWldOut,
        uint256 deadline
    ) external returns (bytes32 orderId);
    
    function executeExchange(
        bytes32 orderId,
        bytes calldata uniswapPath
    ) external returns (uint256 wldReceived);
    
    function getExchangeRate(
        uint256 diamondAmount
    ) external view returns (uint256 estimatedWldOut);
    
    function cancelExchange(bytes32 orderId) external;
}
```

### 2.2 Interaction Flow

```
1. INITIALIZATION (Backend)
   └─→ Create exchange order on smart contract
   └─→ Reserve diamonds in database
   └─→ Return orderId to frontend

2. PLAYER CONFIRMATION (Frontend/MiniKit)
   └─→ Player reviews exchange rate
   └─→ Sets slippage tolerance (0.5% - 5%)
   └─→ Confirms transaction
   └─→ MiniKit initiates contract call

3. EXECUTION (Smart Contract)
   └─→ Verify order exists and is PENDING
   └─→ Burn Diamond tokens
   └─→ Query Uniswap for best path
   └─→ Execute swap with slippage check
   └─→ Transfer WLD to player wallet
   └─→ Emit ExchangeCompleted event
   └─→ Update order status to EXECUTED

4. SETTLEMENT (Backend)
   └─→ Listen for ExchangeCompleted event
   └─→ Update database order status
   └─→ Deduct diamonds from player state
   └─→ Log transaction for audit
   └─→ Send confirmation notification
```

### 2.3 Deployment Targets

| Chain | Environment | Contract Address | Status |
|-------|-------------|-----------------|--------|
| **World Chain (Mainnet)** | Production | `0x...` | Deploy after audit |
| **World Chain (Testnet)** | Staging | `0x...` | Ready for testing |
| **Local Hardhat** | Development | `0x...` | For testing |

---

## 3. Security Considerations

### 3.1 Smart Contract Security

**Access Control:**
- Only authorized players can initiate exchanges (World ID verification)
- Only contract owner can update fee parameters
- Order execution limited to specific relayer addresses
- Emergency pause function for critical issues

**Input Validation:**
- Minimum/maximum Diamond amounts enforced
- Slippage tolerance limits (0.1% - 10%)
- Deadline checks on Uniswap swaps (prevent stale orders)
- Reentrancy protection on all state-changing functions

**Token Safety:**
- Use OpenZeppelin SafeERC20 for all token transfers
- Verify token contract addresses before swap
- Implement pause mechanism for emergency situations
- Audit required before mainnet deployment

**Slippage & Price Protection:**
- Client specifies `minWldOut` before execution
- Contract enforces minimum output on Uniswap swap
- If Uniswap returns less than minimum, entire transaction reverts
- No partial fills - all-or-nothing execution

### 3.2 Backend Security

**Authentication:**
- All requests require valid session token
- User must be World ID verified
- Admin endpoints require admin key
- Rate limiting on exchange initiation (1 per minute per player)

**State Validation:**
- Verify player has sufficient unreserved diamonds
- Check exchange request hasn't been processed
- Validate wallet address format (ERC20)
- Prevent double-submission via idempotency keys

**Database Integrity:**
- Use Supabase RLS policies to ensure users can only see their own orders
- Audit log every exchange attempt (successful and failed)
- Transaction atomicity on multi-step operations
- Backup strategies for recovery

**Network Security:**
- Use HTTPS only for all API calls
- Validate RPC responses for smart contract calls
- Implement circuit breaker for DEX failures
- Monitor for suspicious patterns (flash loan attacks, etc.)

### 3.3 Player Fund Protection

**Diamond Safety:**
- Diamonds reserved immediately upon request creation
- If swap fails, diamonds unreserved and available for manual withdrawal
- Never move diamonds to external contract without guaranteed WLD output
- Timeout mechanism (24 hours) for pending orders

**WLD Delivery:**
- Direct transfer to player's verified wallet address
- No intermediate transfers or custody
- Events logged on World Chain for transparency
- Recovery mechanism if transfer fails (send to escrow)

---

## 4. Backend Integration Process

### 4.1 New Database Tables

```sql
-- Auto-exchange requests and tracking
CREATE TABLE auto_exchange_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    diamonds_amount NUMERIC NOT NULL CHECK (diamonds_amount > 0),
    estimated_wld_output NUMERIC NOT NULL,
    slippage_tolerance NUMERIC DEFAULT 0.5,
    min_wld_accepted NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending_confirmation' 
        CHECK (status IN (
            'pending_confirmation',
            'pending_execution',
            'completed',
            'failed_slippage',
            'failed_contract_error',
            'failed_revert_to_manual',
            'cancelled'
        )),
    contract_order_id BYTEA UNIQUE,
    transaction_hash BYTEA,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP,
    confirmed_at TIMESTAMP
);

-- Exchange audit log
CREATE TABLE auto_exchange_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES auto_exchange_requests(id),
    event_type TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Smart contract events tracking
CREATE TABLE smart_contract_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    order_id BYTEA,
    transaction_hash BYTEA,
    block_number INTEGER,
    log_index INTEGER,
    data JSONB,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 New Edge Functions

```typescript
// supabase/functions/game-auto-exchange/init
// Purpose: Initialize auto-exchange request
// Inputs: diamonds_amount, slippage_tolerance, player_wallet
// Outputs: orderId, estimated_wld, contract_address
// Fallback: None (creation failure means player retries)

// supabase/functions/game-auto-exchange/execute
// Purpose: Execute swap on smart contract
// Inputs: orderId, transaction_receipt
// Outputs: confirmation, final_wld_amount
// Fallback: Create manual cashout request if execution fails

// supabase/functions/game-auto-exchange/quote
// Purpose: Get real-time exchange rate and DEX quote
// Inputs: diamonds_amount
// Outputs: estimated_wld, current_rate, price_slippage
// Fallback: Return cached rate if DEX unavailable

// supabase/functions/game-auto-exchange/events
// Purpose: Listen for and process smart contract events
// Inputs: Event logs from World Chain
// Outputs: Update database, trigger notifications
// Fallback: Manual query of contract state
```

### 4.3 Integration with Existing Systems

**With Manual Cashout:**
```
player_state.diamonds_burned_total
├─→ Increased by both manual AND auto-exchange
└─→ New column: diamonds_burned_via_auto_exchange (subset)

cashout_requests
├─→ New field: auto_exchange_request_id (nullable)
├─→ Can be created as fallback from failed auto-exchange
└─→ Manual requests unaffected

cashout_payouts
├─→ New field: auto_exchange_source (boolean)
├─→ WLD amount from auto-exchange included in total player balance
└─→ All payouts recorded regardless of source
```

**Backward Compatibility:**
- Existing manual cashout flow remains 100% unchanged
- Auto-exchange is purely additive feature
- If auto-exchange contract unavailable, players fall back to manual
- No migration needed for existing requests or payouts

---

## 5. Fallback Mechanism to Manual Withdrawal

### 5.1 Automatic Fallback Scenarios

| Scenario | Trigger | Action | Result |
|----------|---------|--------|--------|
| **Smart contract unavailable** | Init fails | Graceful error, suggest manual | Player retries or uses manual |
| **Insufficient slippage** | Swap returns less than minimum | Revert entire transaction | Diamonds unreserved, retry with higher slippage |
| **Contract execution error** | Unforeseen contract bug | Log error, unreserve diamonds | Create manual cashout request |
| **Network congestion** | Gas price spike | Timeout after 24 hours | Auto-create manual request |
| **DEX liquidity issue** | Insufficient trading pair liquidity | Quote failure | Suggest manual as alternative |
| **Player wallet invalid** | Invalid or changed wallet address | Transaction fails | Notify player, allow edit & retry |

### 5.2 Manual Fallback Flow

```
AUTO-EXCHANGE FAILURE
        ↓
    [Auto-Fallback Check]
    ├─→ Is fallback enabled? (config setting)
    ├─→ Are diamonds still reserved?
    ├─→ Is wallet valid?
    └─→ Should we create manual request?
        ↓
    [YES: Create Manual Request]
    ├─→ Create cashout_request with diamonds
    ├─→ Set auto_exchange_failed_reason
    ├─→ Unreserve diamonds
    └─→ Notify player (email + in-game)
        ↓
    [Manual flow continues as normal]
    ├─→ Admin reviews
    ├─→ Approves (or rejects)
    ├─→ Process in next cashout round
    └─→ Execute manual payout via existing system
```

### 5.3 Implementation Details

```typescript
// In game-auto-exchange/execute edge function

async function executeWithFallback(orderId: string) {
    try {
        // Attempt auto-exchange
        const result = await smartContract.executeExchange(orderId);
        return { success: true, result };
    } catch (error) {
        // Catch specific errors and decide on fallback
        if (error.code === 'INSUFFICIENT_SLIPPAGE') {
            // User-recoverable: they can retry with higher slippage
            throw error;
        }
        
        if (error.code === 'CONTRACT_ERROR' && isAutoFallbackEnabled()) {
            // Contract error: create manual request
            const request = await createManualCashoutRequest(
                orderId,
                error.message
            );
            
            // Notify player
            await notifyPlayerFallback(request);
            
            // Return success with fallback info
            return { 
                success: false,
                fallback_created: true,
                fallback_request_id: request.id
            };
        }
        
        // Non-recoverable error
        throw error;
    }
}
```

---

## 6. Risk Assessment & Mitigation Strategies

### 6.1 Technical Risks

| Risk | Severity | Mitigation | Responsibility |
|------|----------|-----------|-----------------|
| **Smart contract bug** | CRITICAL | Full security audit (OpenZeppelin), testnet deployment, bug bounty | Dev Team |
| **DEX liquidity shortage** | HIGH | Real-time liquidity checks, fallback to manual, admin monitoring | Dev Team + DevOps |
| **Flash loan attack** | HIGH | Implement MEV protections, use trusted DEX routers, sandwich protection | Security Auditor |
| **Reentrancy** | HIGH | OpenZeppelin Guards, state validation order, checks-effects-interactions | Dev Team |
| **Integer overflow** | MEDIUM | Solidity 0.8+, SafeMath (automatic), comprehensive testing | Dev Team |
| **Gas limit exceeded** | MEDIUM | Transaction size limits, batch operation limits, gas price monitoring | Dev Team |

### 6.2 Business Risks

| Risk | Severity | Mitigation | Responsibility |
|------|----------|-----------|-----------------|
| **Player loses funds** | CRITICAL | Comprehensive testing, fallback mechanism, insurance fund | Product + Legal |
| **Exchange rate manipulation** | HIGH | Slippage limits, oracle-based pricing, admin pause ability | Product Team |
| **WLD price volatility** | MEDIUM | Player warned before swap, historical rate display, slippage control | UX/Product |
| **Tax compliance** | HIGH | Audit trail, transaction logging, legal review, KYC verification | Legal Team |
| **Regulatory changes** | MEDIUM | Modular contract design, rapid pause ability, legal monitoring | Legal Team |

### 6.3 Operational Risks

| Risk | Severity | Mitigation | Responsibility |
|------|----------|-----------|-----------------|
| **Contract needs upgrade** | MEDIUM | Use proxy pattern (UUPS), testing framework, upgrade procedure | Dev Team |
| **Monitoring gaps** | HIGH | Real-time alerts, health dashboards, event indexing, transaction tracking | DevOps |
| **Recovery procedures** | MEDIUM | Documented runbooks, emergency key management, disaster recovery plan | DevOps |
| **Key management** | CRITICAL | Hardware wallet for treasury, multi-sig for contract upgrades, key rotation | Security Team |

---

## 7. Implementation Roadmap

### Phase 1: Development & Testing (Weeks 1-4)
- [ ] Smart contract development (Solidity)
- [ ] Unit tests (Hardhat, 95%+ coverage)
- [ ] Edge function implementations
- [ ] Database schema creation
- [ ] Testnet deployment and integration tests

### Phase 2: Security & Audit (Weeks 5-8)
- [ ] Internal security review
- [ ] External smart contract audit (OpenZeppelin/Trail of Bits)
- [ ] Penetration testing on edge functions
- [ ] Database RLS policy review
- [ ] Load testing and performance optimization

### Phase 3: Staging & User Testing (Weeks 9-11)
- [ ] Deploy to World Chain testnet
- [ ] Internal UAT with admin users
- [ ] Player beta testing (whitelisted group)
- [ ] Fallback mechanism testing
- [ ] Performance and reliability validation

### Phase 4: Production Rollout (Weeks 12-14)
- [ ] Mainnet smart contract deployment
- [ ] Production edge function deployment
- [ ] Gradual rollout (50% → 100%)
- [ ] Real-time monitoring and alerts
- [ ] Support team training

---

## 8. Monitoring & Maintenance

### 8.1 Key Metrics to Monitor

```
Real-Time Dashboards:
├─→ Active exchange requests (pending, completed, failed)
├─→ Average exchange rate vs manual cashout baseline
├─→ Fallback rate (% of auto-exchanges requiring manual fallback)
├─→ Smart contract gas costs
├─→ DEX liquidity levels
├─→ Player satisfaction score
├─→ Failed transaction reasons (by category)
└─→ Treasury WLD balance

Alerts (Threshold-based):
├─→ Fallback rate > 5%
├─→ Smart contract error rate > 2%
├─→ DEX liquidity < $100k
├─→ Treasury balance < reserve minimum
├─→ Transaction confirmation time > 2 minutes
└─→ Players reporting funds lost
```

### 8.2 Maintenance Tasks

- **Weekly:** Review audit logs, check DEX prices vs historical averages
- **Monthly:** Analyze exchange rates and adjust fees if needed, review security logs
- **Quarterly:** Smart contract health check, dependency updates, player feedback review
- **Annually:** Security re-audit (if significant changes), contract upgrade evaluation

---

## 9. Success Criteria

### Launch Success Indicators
- ✓ Zero critical bugs in first 30 days
- ✓ Fallback rate < 2%
- ✓ Player satisfaction score > 4.5/5
- ✓ Transaction success rate > 99%
- ✓ Median transaction time < 60 seconds
- ✓ No significant DEX liquidity issues

### Long-term KPIs
- Auto-exchange adoption rate: 40%+ of players
- Average exchange rate variance from market: < 1%
- Player-initiated refund requests: < 0.1%
- Treasury remains solvent and healthy

---

## 10. Approval & Next Steps

### Review Checklist

- [ ] Product team approves feature scope
- [ ] Security team approves architecture
- [ ] Legal team reviews compliance implications
- [ ] Finance team approves fee structure
- [ ] Ops team ready for monitoring/support
- [ ] Engineering team ready to implement

### Questions for Discussion

1. Should fallback creation be automatic or require player consent?
2. What's the minimum WLD reserve we need in the treasury?
3. Should we integrate with Chainlink for oracle-based pricing?
4. What's the maximum diamonds per exchange request?
5. Do we need to implement MEV protection (Flashbots)?

---

**Prepared By:** Web3 Development Team  
**Reviewed By:** [Pending]  
**Approved By:** [Pending]  
**Last Updated:** February 15, 2026
