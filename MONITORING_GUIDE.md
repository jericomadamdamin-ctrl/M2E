# Auto-Exchange System Monitoring & Operations Guide

## Overview

This guide covers monitoring, alerting, and operational procedures for the auto-exchange system.

## Key Metrics

### System Health Metrics

#### 1. Exchange Success Rate
```sql
-- Query success rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN status = 'fallback' THEN 1 END) as fallback_created
FROM auto_exchange_requests
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Alert Condition:** Success rate < 95% for any hour

#### 2. Fallback Rate
```sql
-- Query fallback usage
SELECT 
  DATE(created_at) as date,
  COUNT(*) as fallback_requests,
  (SELECT COUNT(*) FROM auto_exchange_requests WHERE DATE(created_at) = DATE(fallback_conversion_requests.created_at)) as total_exchanges,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM auto_exchange_requests WHERE DATE(created_at) = DATE(fallback_conversion_requests.created_at)), 2) as fallback_rate_pct
FROM fallback_conversion_requests
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Alert Condition:** Fallback rate > 10% for any day

#### 3. API Response Times
```sql
-- Response time distribution
SELECT 
  DATE(created_at) as date,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99,
  MAX(response_time_ms) as max_response_time
FROM api_metrics
WHERE endpoint IN ('auto-exchange-request', 'auto-exchange-status', 'auto-exchange-config')
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Alert Condition:** P95 response time > 2000ms

#### 4. Error Rate
```sql
-- Error tracking
SELECT 
  DATE(created_at) as date,
  action,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
  ROUND(COUNT(CASE WHEN status = 'error' THEN 1 END) * 100.0 / COUNT(*), 2) as error_rate_pct
FROM exchange_audit_log
GROUP BY DATE(created_at), action
ORDER BY date DESC, error_rate_pct DESC;
```

**Alert Condition:** Error rate > 5% for any endpoint

### Business Metrics

#### 1. User Engagement
```sql
-- Daily active exchangers
SELECT 
  DATE(created_at) as date,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_exchanges,
  ROUND(AVG(diamond_amount), 0) as avg_diamonds,
  SUM(diamond_amount) as total_diamonds,
  ROUND(AVG(wld_received), 6) as avg_wld_received
FROM auto_exchange_requests
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

#### 2. Economic Flow
```sql
-- Diamond to WLD conversion
SELECT 
  DATE(created_at) as date,
  SUM(diamond_amount) as total_diamonds_requested,
  SUM(CASE WHEN status = 'completed' THEN diamond_amount ELSE 0 END) as diamonds_converted,
  SUM(CASE WHEN status = 'completed' THEN wld_received ELSE 0 END) as wld_distributed,
  ROUND(AVG(CASE WHEN status = 'completed' THEN wld_received/diamond_amount ELSE NULL END), 6) as avg_wld_per_diamond
FROM auto_exchange_requests
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Smart Contract Metrics

#### 1. Contract Call Success
```sql
-- Track successful vs failed contract calls
SELECT 
  DATE(created_at) as date,
  action,
  COUNT(CASE WHEN details->>'tx_hash' IS NOT NULL THEN 1 END) as successful_calls,
  COUNT(CASE WHEN details->>'error' IS NOT NULL THEN 1 END) as failed_calls,
  COUNT(*) as total_calls
FROM exchange_audit_log
WHERE action = 'contract_call'
GROUP BY DATE(created_at), action
ORDER BY date DESC;
```

**Alert Condition:** Failed calls > 10% of total

#### 2. Gas Usage
```sql
-- Monitor gas consumption
SELECT 
  DATE(created_at) as date,
  COUNT(*) as transactions,
  AVG((details->>'gas_used')::numeric) as avg_gas,
  MAX((details->>'gas_used')::numeric) as max_gas,
  SUM((details->>'gas_cost')::numeric) as total_gas_cost
FROM exchange_audit_log
WHERE action IN ('exchange_executed', 'contract_call')
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Logging & Audit Trail

### Audit Log Structure
All auto-exchange operations logged to `exchange_audit_log`:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "action": "exchange_initiated | exchange_executed | exchange_failed | fallback_created",
  "request_id": "uuid",
  "details": {
    "diamond_amount": 100,
    "wld_target": 0.1,
    "slippage_tolerance": 1.0,
    "tx_hash": "0x...",
    "error": "message"
  },
  "timestamp": "2026-02-15T12:00:00Z"
}
```

### Query Recent Issues
```sql
-- Recent failures
SELECT * FROM exchange_audit_log
WHERE status = 'error'
ORDER BY timestamp DESC
LIMIT 50;

-- User-specific history
SELECT * FROM exchange_audit_log
WHERE user_id = '[USER_ID]'
ORDER BY timestamp DESC;

-- Last 24h activity summary
SELECT action, COUNT(*), 
       COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
FROM exchange_audit_log
WHERE timestamp > now() - interval '24 hours'
GROUP BY action;
```

## Alert Setup

### Critical Alerts (Immediate Notification)

**1. Fallback Rate Spike**
```
Condition: Fallback rate > 20% in rolling 1-hour window
Severity: CRITICAL
Action: Page on-call engineer, investigate contract issues
```

**2. API Unavailability**
```
Condition: 3+ consecutive failed requests to any endpoint
Severity: CRITICAL
Action: Check Supabase status, restart functions if needed
```

**3. Database Connection Issues**
```
Condition: Connection pool exhaustion or query timeouts
Severity: CRITICAL
Action: Check database load, scale if necessary
```

### High Alerts (Within 15 Minutes)

**1. Success Rate Drop**
```
Condition: Success rate < 90% for 30 minutes
Severity: HIGH
Action: Review error logs, may not require immediate action
```

**2. Response Time Degradation**
```
Condition: P95 response time > 3000ms for 15 minutes
Severity: HIGH
Action: Check database/API load, optimize if needed
```

**3. High Error Rate**
```
Condition: Error rate > 10% for any endpoint
Severity: HIGH
Action: Review recent deployments, check for bugs
```

### Medium Alerts (Daily Review)

**1. Contract Gas Cost Spike**
```
Condition: Daily gas cost > 2x average
Severity: MEDIUM
Action: Investigate contract optimization opportunities
```

**2. User Engagement Decline**
```
Condition: Daily active users < 50% of 7-day average
Severity: MEDIUM
Action: Check for feature issues or announcements
```

## Operations Runbooks

### Incident: High Fallback Rate

**Symptoms:**
- Fallback rate > 20%
- Users reporting failed exchanges

**Investigation:**
```sql
-- Check what's failing
SELECT error_message, COUNT(*) 
FROM auto_exchange_requests 
WHERE status = 'fallback' 
  AND created_at > now() - interval '1 hour'
GROUP BY error_message;

-- Check contract status
SELECT * FROM exchange_audit_log
WHERE action = 'contract_call'
  AND status = 'error'
  AND timestamp > now() - interval '1 hour';
```

**Resolution:**
1. Check smart contract health on blockchain explorer
2. Verify contract pause status
3. If paused, unpause with: `contract.unpause()`
4. If gas prices high, wait or increase gas limit
5. If persistent, activate rollback plan

### Incident: API Response Time Degradation

**Symptoms:**
- P95 response time > 3000ms
- Slow status checks reported by users

**Investigation:**
```sql
-- Check database query performance
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE query LIKE '%auto_exchange%'
ORDER BY mean_time DESC;

-- Check for blocking queries
SELECT * FROM pg_stat_activity
WHERE state = 'active' AND wait_event IS NOT NULL;
```

**Resolution:**
1. Add missing indexes: `CREATE INDEX idx_user_status ON auto_exchange_requests(user_id, status);`
2. Kill long-running queries if safe
3. Scale database if CPU/memory high
4. Review recent code changes for N+1 queries

### Incident: Database Growth Alarm

**Symptoms:**
- Database nearing storage limit
- Write operations slowing down

**Investigation:**
```sql
-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check audit log growth
SELECT COUNT(*) as audit_log_rows,
       pg_size_pretty(pg_total_relation_size('exchange_audit_log')) as size
FROM exchange_audit_log;
```

**Resolution:**
1. Archive old audit logs (> 90 days) to cold storage
2. Enable automated log rotation
3. Upgrade database plan if needed
4. Implement retention policies

### Incident: Smart Contract Error

**Symptoms:**
- Contract calls failing
- Users see "Contract execution failed"

**Investigation:**
```solidity
// Check contract state
await contract.paused() // Should return false
await contract.owner() // Verify correct owner
await contract.diamondToken() // Verify token address
await contract.wldToken() // Verify token address
```

**Resolution:**
1. If paused, unpause contract
2. If wrong token addresses, redeploy with correct addresses
3. If access control issue, grant executor role to backend service
4. If logic bug found, prepare and deploy fix

## Daily Operations

### Morning Checklist
```
[ ] Review overnight logs for errors
[ ] Check fallback rate from 10pm-8am
[ ] Verify all API endpoints responding
[ ] Check database connection health
[ ] Review user feedback/support tickets
```

### Weekly Review
```
[ ] Analyze success metrics
[ ] Check smart contract gas efficiency
[ ] Review error logs for patterns
[ ] Update runbook documentation
[ ] Prepare incident reports if any
```

### Monthly Maintenance
```
[ ] Full system performance analysis
[ ] Database optimization & vacuuming
[ ] Archive old audit logs
[ ] Security audit of permissions
[ ] Plan for upcoming improvements
```

## Escalation Matrix

| Severity | Response Time | Notify | Actions |
|----------|---------------|--------|---------|
| CRITICAL | 5 minutes | On-call, Lead | Immediate investigation, consider rollback |
| HIGH | 15 minutes | Team lead, On-call | Investigate, prepare fix |
| MEDIUM | 1 hour | Team, Product | Schedule investigation |
| LOW | Next business day | Team | Document, plan improvement |

## Documentation

- **Runbooks:** Detailed step-by-step procedures for common incidents
- **Architecture:** System design and data flow documentation
- **API Reference:** Complete endpoint documentation
- **Smart Contract:** Contract ABI and deployment info
- **Test Coverage:** Test results and coverage reports

---

**Last Updated:** 2026-02-15  
**Owner:** Engineering Team  
**Review Cycle:** Monthly
