# Auto-Exchange System Deployment Guide

## Pre-Deployment Checklist

### Environment Setup
- [ ] Vercel project configured with correct environment variables
- [ ] Supabase project ready and credentials added to `.env.local`
- [ ] PostgreSQL database initialized
- [ ] GitHub repository connected and on `main` branch
- [ ] Staging environment available for pre-release testing

### Configuration
- [ ] Game config has `auto_exchange_enabled: true`
- [ ] Diamond-to-WLD exchange rate set in config
- [ ] Smart contract address stored in game config
- [ ] Fee percentage configured (1-5%)
- [ ] Min/max diamond amounts configured

## Phase 1: Database Migration

### Step 1: Apply Database Schema
```bash
# Run the migration
supabase db push

# Or manually run the migration file:
# supabase/migrations/20260215100000_auto_exchange_system.sql
```

### Verification
```bash
# Check tables created
psql $DATABASE_URL -c "\dt auto_exchange* fallback* exchange_audit"

# Expected output: 4 tables
# - auto_exchange_requests
# - auto_exchange_config
# - fallback_conversion_requests
# - exchange_audit_log
```

## Phase 2: Smart Contract Deployment

### Step 1: Deploy Contract
```bash
# Deploy to mainnet (or testnet for staging)
npx hardhat run scripts/deploy.ts --network [network-name]

# Expected output:
# AutoExchangeManager deployed to: 0x[address]
```

### Step 2: Verify Contract
```bash
# Verify on block explorer
npx hardhat verify --network [network] [CONTRACT_ADDRESS] [ARGS]
```

### Step 3: Update Configuration
```bash
# Update game config with contract address
UPDATE game_config 
SET auto_exchange_contract = '0x[contract_address]'
WHERE key = 'auto_exchange';
```

### Step 4: Grant Permissions
```solidity
// Call on contract to set backend service account as executor
contract.grantExecutor(BACKEND_SERVICE_ACCOUNT);
```

## Phase 3: Deploy Edge Functions

### Step 1: Deploy All Functions
```bash
# Deploy auto-exchange functions
supabase functions deploy auto-exchange-request
supabase functions deploy auto-exchange-execute
supabase functions deploy auto-exchange-status
supabase functions deploy auto-exchange-config

# Verify deployment
supabase functions list
```

### Step 2: Configure Secrets
```bash
# Set environment variables in Supabase
supabase secrets set \
  SUPABASE_URL=$SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
  AUTO_EXCHANGE_CONTRACT=$AUTO_EXCHANGE_CONTRACT
```

### Step 3: Test Functions
```bash
# Test auto-exchange-request endpoint
curl -X POST https://[project].supabase.co/functions/v1/auto-exchange-request \
  -H "Authorization: Bearer [jwt]" \
  -H "Content-Type: application/json" \
  -d '{"diamondAmount": 100, "slippageTolerance": 1.0}'
```

## Phase 4: Frontend Deployment

### Step 1: Build Verification
```bash
# Build frontend
npm run build

# Check for errors
npm run lint
npm run type-check
```

### Step 2: Deploy to Vercel
```bash
# Deploy to staging first
vercel --prod --scope=staging

# After approval, deploy to production
vercel --prod
```

### Step 3: Verify Frontend
- [ ] Auto-exchange modal appears in Bank tab
- [ ] Components load without errors
- [ ] API calls reach backend functions
- [ ] Styling displays correctly

## Phase 5: System Integration Testing

### Step 1: End-to-End Flow Test
```bash
# 1. User initiates exchange
# 2. Request stored in database
# 3. Edge function receives request
# 4. Smart contract execution triggered
# 5. Status updates in frontend
# 6. History displays exchange
```

### Step 2: Fallback Testing
```bash
# 1. Simulate contract failure
# 2. Verify fallback creation
# 3. Check user notification
# 4. Verify diamond balance restoration
```

### Step 3: Performance Testing
```bash
# Load test with 100 concurrent requests
npm run test:load

# Expected response time: < 1000ms
# Expected success rate: > 99%
```

## Phase 6: Monitoring Setup

### Step 1: Configure Logging
```javascript
// Enable Supabase audit logging
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(url, key);
// All operations automatically logged to exchange_audit_log
```

### Step 2: Setup Alerts
```bash
# Configure alerts in monitoring dashboard
# Alert on:
# - Fallback rate > 10%
# - Error rate > 5%
# - Response time > 2s (p95)
# - Failed requests > 10 per hour
```

### Step 3: Dashboard Metrics
Create dashboard tracking:
- Exchange requests per day
- Success rate (%)
- Fallback rate (%)
- Average WLD received per diamond
- Contract error frequency
- API response times

## Staged Rollout Plan

### Stage 1: Internal Testing (24 hours)
- [ ] Admin users only access
- [ ] Monitor for errors
- [ ] Verify calculations
- [ ] Test fallback mechanisms

### Stage 2: Pilot Group (48 hours)
- [ ] 5-10% of user base
- [ ] Monitor engagement
- [ ] Collect feedback
- [ ] Watch for edge cases

### Stage 3: Partial Rollout (7 days)
- [ ] 25-50% of user base
- [ ] Monitor at scale
- [ ] Adjust parameters if needed
- [ ] Prepare full launch

### Stage 4: Full Rollout
- [ ] 100% of user base
- [ ] Monitor metrics closely
- [ ] Quick response team on standby
- [ ] Daily reviews for first week

## Rollback Procedure

### If Critical Issues Found:

**Immediate Actions:**
```bash
# 1. Disable feature flag
UPDATE game_config SET auto_exchange_enabled = false;

# 2. Pause smart contract
contract.pause();

# 3. Notify users via in-game alert
```

**Short Term (within 1 hour):**
```bash
# 1. Investigate root cause
SELECT * FROM exchange_audit_log WHERE action = 'error' ORDER BY created_at DESC LIMIT 20;

# 2. Identify affected users
SELECT DISTINCT user_id FROM auto_exchange_requests WHERE status = 'failed' AND updated_at > now() - interval '1 hour';

# 3. Manual fallback for stuck exchanges
INSERT INTO fallback_conversion_requests (user_id, diamond_amount, status, reason)
SELECT user_id, diamond_amount, 'pending', 'Exchange rollback'
FROM auto_exchange_requests WHERE status IN ('executing', 'pending');
```

**Medium Term (within 24 hours):**
```bash
# 1. Deploy fix
npm run deploy

# 2. Re-enable feature flag
UPDATE game_config SET auto_exchange_enabled = true;

# 3. Resume smart contract
contract.unpause();
```

## Post-Deployment Monitoring (First 7 Days)

### Daily Checklist
- [ ] No critical errors in logs
- [ ] Fallback rate < 5%
- [ ] Response times normal
- [ ] User feedback positive
- [ ] Database queries performing

### Metrics to Watch
```sql
-- Success rate
SELECT 
  COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM auto_exchange_requests
WHERE created_at > now() - interval '1 day';

-- Average fallback delay
SELECT AVG(EXTRACT(EPOCH FROM (fallback_created_at - exchange_created_at))) as avg_delay_seconds
FROM fallback_view
WHERE fallback_created_at > now() - interval '1 day';

-- User engagement
SELECT COUNT(DISTINCT user_id) as unique_exchangers,
       AVG(diamond_amount) as avg_diamonds,
       SUM(diamond_amount) as total_diamonds
FROM auto_exchange_requests
WHERE created_at > now() - interval '1 day';
```

## Maintenance Tasks

### Weekly
- [ ] Review audit logs for anomalies
- [ ] Check smart contract gas usage
- [ ] Monitor database growth
- [ ] Validate exchange rates

### Monthly
- [ ] Performance analysis
- [ ] Security audit
- [ ] User feedback review
- [ ] Contract health check

### Quarterly
- [ ] Full system stress test
- [ ] Smart contract audit
- [ ] Database optimization
- [ ] Feature improvements evaluation

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| On-Call Engineer | [Contact] | 24/7 |
| Smart Contract Auditor | [Contact] | Business hours |
| Database Admin | [Contact] | Business hours |
| Product Manager | [Contact] | Business hours |

## Deployment Checklist Final

- [ ] All tests passing
- [ ] Database migration applied
- [ ] Smart contract deployed & verified
- [ ] Edge functions deployed
- [ ] Frontend deployed
- [ ] Monitoring configured
- [ ] Rollback plan documented
- [ ] Team trained on system
- [ ] Stakeholders notified
- [ ] Launch readiness meeting completed

**Deployment Date:** ________________  
**Approved By:** ________________  
**Deployed By:** ________________  
