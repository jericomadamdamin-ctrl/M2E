# Auto-Exchange System - Quick Reference

## 🚀 What Is This?

A production-ready system for automatically converting player diamonds to WLD tokens with smart contract execution, fallback protection, and comprehensive monitoring.

## 📋 Quick Navigation

| Need | Document | Time |
|------|----------|------|
| **Understand the system** | [TECHNICAL_PROPOSAL.md](./TECHNICAL_PROPOSAL.md) | 10 min |
| **Deploy to production** | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | 2-4 hours |
| **Set up monitoring** | [MONITORING_GUIDE.md](./MONITORING_GUIDE.md) | 1 hour |
| **Run QA checklist** | [QA_CHECKLIST.md](./QA_CHECKLIST.md) | 2-4 hours |
| **Full project overview** | [AUTO_EXCHANGE_SUMMARY.md](./AUTO_EXCHANGE_SUMMARY.md) | 15 min |

## 🎯 Key Features

✅ **Atomic Operations** - Diamond deduction only if swap succeeds  
✅ **Automatic Fallback** - Failed exchanges → manual withdrawal requests  
✅ **Slippage Protection** - User-configurable 0.1%-5% tolerance  
✅ **Enterprise Security** - RLS, audit trails, World ID verification  
✅ **Real-time Monitoring** - Comprehensive metrics & alerts  
✅ **Staged Rollout** - 7-day gradual launch plan included  

## 📁 Project Structure

```
Core Components:
├── supabase/migrations/     → Database schema (4 tables)
├── contracts/               → Solidity smart contract
├── supabase/functions/      → Edge functions (4 endpoints)
├── src/components/          → React components (modal + history)
├── src/hooks/               → useAutoExchange custom hook
└── scripts/                 → Test suite

Documentation:
├── TECHNICAL_PROPOSAL.md           → Architecture & design
├── AUTO_EXCHANGE_IMPLEMENTATION.md → Implementation details
├── DEPLOYMENT_GUIDE.md             → How to deploy
├── MONITORING_GUIDE.md             → How to operate
├── QA_CHECKLIST.md                 → Testing requirements
└── AUTO_EXCHANGE_SUMMARY.md        → Complete overview
```

## ⚡ Quick Start (Already Implemented)

### 1. Database Ready ✅
```bash
# Migration file: supabase/migrations/20260215100000_auto_exchange_system.sql
# Tables: auto_exchange_requests, auto_exchange_config, 
#         fallback_conversion_requests, exchange_audit_log

# Apply migration:
supabase db push
```

### 2. Smart Contract Ready ✅
```bash
# Located: contracts/AutoExchangeManager.sol
# Deploy to blockchain, store address in game config
```

### 3. Edge Functions Ready ✅
```bash
# Located: supabase/functions/auto-exchange-*/
# Deploy:
supabase functions deploy auto-exchange-request
supabase functions deploy auto-exchange-execute
supabase functions deploy auto-exchange-status
supabase functions deploy auto-exchange-config
```

### 4. Frontend Ready ✅
```bash
# Components: src/components/auto-exchange-*.tsx
# Hook: src/hooks/useAutoExchange.ts
# Utilities: src/lib/backend.ts (added functions)
# Already integrated and ready to use
```

## 🧪 Testing

```bash
# Run comprehensive test suite
npm run test:auto-exchange

# Expected: 10 tests, all passing
# Tests cover: schema, validation, transitions, integrity, etc.
```

## 📊 Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Success Rate** | > 95% | < 90% |
| **Fallback Rate** | < 5% | > 10% |
| **Response Time (p95)** | < 1s | > 2s |
| **Error Rate** | < 1% | > 5% |
| **Contract Failures** | < 2% | > 5% |

## 🔄 User Flow

```
Player Opens Modal
    ↓
Enters Diamond Amount + Slippage
    ↓
Confirms Exchange
    ↓
auto-exchange-request Creates Order
    ↓
auto-exchange-execute Runs (Backend Job)
    ├─ Success → Update to "completed"
    └─ Failure → Create "fallback" request
    ↓
Player Sees Status in auto-exchange-history
    ├─ Completed → WLD sent to wallet
    └─ Fallback → Can process manual withdrawal
```

## 🛡️ Security Features

- **RLS Policies**: Users only see their own data
- **Audit Logging**: Every operation logged immutably
- **World ID**: Verification required (Sybil attack prevention)
- **Atomic Transactions**: All-or-nothing operations
- **Service Role Only**: Backend-only execution endpoint
- **Input Validation**: Strict bounds checking (1-1M diamonds, 0.1%-5% slippage)

## 📡 API Endpoints (Edge Functions)

```bash
# Request Exchange (User Facing)
POST /functions/v1/auto-exchange-request
Authorization: Bearer [jwt]
{
  "diamondAmount": 100,
  "slippageTolerance": 1.0
}

# Check Status (User Facing)
GET /functions/v1/auto-exchange-status?requestId=[id]&limit=20
Authorization: Bearer [jwt]

# Manage Config (User Facing)
GET /functions/v1/auto-exchange-config
POST /functions/v1/auto-exchange-config
{
  "enabled": true,
  "slippageTolerance": 1.5,
  "minWldAmount": 10,
  "autoRetry": true
}

# Execute Exchange (Backend Only - Service Role)
POST /functions/v1/auto-exchange-execute
Authorization: Bearer [service-role-key]
{
  "requestId": "uuid",
  "txHash": "0x...",
  "wldReceived": 0.099
}
```

## 🚨 Troubleshooting

### High Fallback Rate (> 10%)
1. Check smart contract on blockchain explorer
2. Verify contract is not paused
3. Check gas prices (if too high, contract fails)
4. Check DEX liquidity for diamond/WLD pair

### Slow Response Times (p95 > 2s)
1. Check database load: `SELECT * FROM pg_stat_activity;`
2. Verify indexes exist on user_id, status columns
3. Check for missing queries: `SELECT * FROM pg_stat_statements ORDER BY mean_time DESC;`
4. Scale database if CPU > 80%

### Users Report Missing Diamonds
1. Check audit log: `SELECT * FROM exchange_audit_log WHERE user_id = '[id]';`
2. Verify fallback was created: `SELECT * FROM fallback_conversion_requests WHERE user_id = '[id]';`
3. Check if manual withdrawal processed
4. Investigate root cause, compensate if needed

### API Returns 401/403
1. Verify JWT token is valid
2. Check user has World ID verification
3. For execute endpoint: verify using service role key
4. Check RLS policy: `SELECT * FROM pg_policies WHERE tablename = 'auto_exchange_requests';`

## 📈 Success Criteria (Post-Launch)

- ✅ Success rate maintained > 95% for 7 days
- ✅ Fallback rate stable < 5%
- ✅ Zero critical incidents
- ✅ User satisfaction > 4/5 stars
- ✅ No diamond/WLD loss incidents
- ✅ Smooth operation during peak hours

## 🔑 Important Reminders

1. **Slippage Range**: Always validate 0.1% - 5% (not 0% - 50%)
2. **Diamond Amounts**: Min 1, Max 1,000,000 (hardcoded validation)
3. **Atomic Operations**: Never partial updates; always all-or-nothing
4. **Audit Logs**: Immutable - don't delete, only archive old records
5. **Fallback Protection**: Always happens automatically - never requires player action
6. **World ID**: Required for security - don't bypass verification
7. **Service Role**: Execute endpoint only via service role, never expose to frontend

## 📞 Support Resources

- **Architecture Questions** → See [TECHNICAL_PROPOSAL.md](./TECHNICAL_PROPOSAL.md)
- **Deployment Help** → See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Operations** → See [MONITORING_GUIDE.md](./MONITORING_GUIDE.md)
- **Test Requirements** → See [QA_CHECKLIST.md](./QA_CHECKLIST.md)
- **Complete Overview** → See [AUTO_EXCHANGE_SUMMARY.md](./AUTO_EXCHANGE_SUMMARY.md)

## ✅ Pre-Launch Checklist (30 min)

- [ ] Database migration applied: `supabase db push`
- [ ] Smart contract deployed & address in config
- [ ] Edge functions deployed: `supabase functions deploy auto-exchange-*`
- [ ] Frontend builds without errors: `npm run build`
- [ ] Test suite passes: `npm run test:auto-exchange`
- [ ] Staging environment validated
- [ ] Team trained on operations
- [ ] Monitoring alerts configured
- [ ] Rollback plan reviewed
- [ ] Stakeholder sign-off obtained

## 🎓 Team Training Links

- **Developers**: Read [AUTO_EXCHANGE_IMPLEMENTATION.md](./AUTO_EXCHANGE_IMPLEMENTATION.md)
- **DevOps**: Read [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Operations**: Read [MONITORING_GUIDE.md](./MONITORING_GUIDE.md)
- **QA**: Read [QA_CHECKLIST.md](./QA_CHECKLIST.md)
- **Product**: Read [AUTO_EXCHANGE_SUMMARY.md](./AUTO_EXCHANGE_SUMMARY.md)

---

**Status:** ✅ PRODUCTION READY  
**Last Updated:** 2026-02-15  
**Maintained By:** Engineering Team  
**Version:** 1.0
