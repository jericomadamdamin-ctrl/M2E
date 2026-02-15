# Auto-Exchange System QA Checklist

## Pre-Launch Testing

### Database & Schema
- [ ] All 4 core tables exist with proper columns
- [ ] Row-level security (RLS) policies enforced
- [ ] Primary/foreign key constraints set
- [ ] Indexes created for performance (user_id, status, created_at)
- [ ] Test script runs without errors: `npm run test:auto-exchange`

### Edge Functions
- [ ] `auto-exchange-request` endpoint responds correctly
- [ ] `auto-exchange-execute` accepts service role auth only
- [ ] `auto-exchange-status` returns accurate data
- [ ] `auto-exchange-config` GET/POST/PUT methods work
- [ ] All functions handle errors gracefully
- [ ] CORS headers properly configured
- [ ] Auth validation working on all endpoints

### Smart Contract
- [ ] Contract deployed to correct network
- [ ] Diamond token address configured
- [ ] WLD token address configured
- [ ] Uniswap router address set
- [ ] Contract owner set to backend service account
- [ ] Emergency pause function accessible
- [ ] Fee mechanism functional (max 5%)

### Frontend Components
- [ ] AutoExchangeModal opens/closes correctly
- [ ] Form validation shows appropriate errors
- [ ] Slippage input accepts 0.1% - 5% range
- [ ] Diamond amount validation works (1 - 1,000,000)
- [ ] Confirm step displays correct summary
- [ ] Success message appears after submission
- [ ] Modal resets after successful exchange
- [ ] AutoExchangeHistory component loads data
- [ ] Status filters work (all, pending, completed, failed)
- [ ] Pagination functions correctly

### Backend Integration
- [ ] requestAutoExchange function works
- [ ] getAutoExchangeConfig returns user settings
- [ ] updateAutoExchangeConfig saves changes
- [ ] getAutoExchangeStatus fetches history
- [ ] useAutoExchange hook initializes properly
- [ ] Error handling returns user-friendly messages

## Functional Testing

### Exchange Flow
- [ ] Player can initiate exchange with valid amounts
- [ ] Request creates record in auto_exchange_requests table
- [ ] Status shows "pending" initially
- [ ] Audit log records the action
- [ ] Config respects user's slippage preference
- [ ] Multiple concurrent requests don't conflict
- [ ] Exchange history displays most recent first

### Fallback Mechanism
- [ ] Failed exchange creates fallback_conversion_request
- [ ] Main request status changes to "fallback"
- [ ] User is notified of fallback creation
- [ ] Diamonds are not lost on failure
- [ ] Manual cashout request created as alternative
- [ ] Audit log records both exchange and fallback

### Error Scenarios
- [ ] Insufficient diamonds error displayed
- [ ] Invalid diamond amount rejected
- [ ] Slippage out of range rejected (< 0.1%, > 5%)
- [ ] Network error handled gracefully
- [ ] Invalid config values rejected
- [ ] Unauthorized access returns 401/403
- [ ] Missing required fields return 400

### Data Consistency
- [ ] Diamond balance never negative after failed exchange
- [ ] Audit logs complete for all operations
- [ ] Status transitions follow valid paths
- [ ] WLD amounts calculated correctly
- [ ] Timestamps consistent across all records
- [ ] User can only see own exchange history

## Performance Testing

### Load Testing
- [ ] Handle 100+ concurrent exchange requests
- [ ] Response time < 500ms for config fetch
- [ ] Response time < 1s for status fetch
- [ ] Database queries use indexes properly
- [ ] No N+1 query problems
- [ ] Pagination prevents large data transfers

### Resource Usage
- [ ] Edge functions use < 100MB memory
- [ ] No memory leaks in frontend components
- [ ] Database connection pool properly configured
- [ ] Query execution plans optimized

## Security Testing

### Authentication & Authorization
- [ ] World ID verification enforced
- [ ] User can only access own data (RLS)
- [ ] Service role restricted to backend only
- [ ] No sensitive data in logs
- [ ] Session tokens validated on each request
- [ ] CORS properly restricts origins

### Input Validation
- [ ] SQL injection attempts blocked
- [ ] XSS payloads sanitized
- [ ] Numeric inputs validated for range
- [ ] String inputs trimmed/validated
- [ ] File uploads not allowed
- [ ] Request size limits enforced

### Data Protection
- [ ] Audit trail immutable
- [ ] Historical data not accidentally modified
- [ ] Sensitive values encrypted at rest (if needed)
- [ ] API responses don't leak user IDs
- [ ] Error messages don't expose system details

## Monitoring & Logging

### Metrics
- [ ] Exchange success rate tracked
- [ ] Fallback rate < 5%
- [ ] Average response times monitored
- [ ] Failed request count tracked
- [ ] Audit log size monitored
- [ ] Database connection pool utilization

### Alerts
- [ ] Alert when fallback rate > 10%
- [ ] Alert on API error rate > 5%
- [ ] Alert on response time > 2s (p95)
- [ ] Alert on database connection failures
- [ ] Alert on Edge Function errors

## User Experience

### UI/UX
- [ ] Modal is responsive on mobile
- [ ] Form has clear labels and help text
- [ ] Error messages are understandable
- [ ] Success feedback is immediate
- [ ] Loading states show progress
- [ ] Disabled states are visually clear

### Accessibility
- [ ] Forms keyboard navigable
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader compatible
- [ ] Error messages announced to screen readers
- [ ] Modal has proper focus management
- [ ] No reliance on color alone

### Documentation
- [ ] README explains auto-exchange feature
- [ ] API documentation complete
- [ ] Configuration documented
- [ ] Common errors documented
- [ ] Troubleshooting guide available

## Post-Launch

### Monitoring Phase (First 24h)
- [ ] No unexpected error spikes
- [ ] Fallback mechanism working
- [ ] Audit logs complete and accurate
- [ ] No performance degradation
- [ ] User feedback collected

### Week 1 Checklist
- [ ] Slippage tolerances appropriate
- [ ] Fee collection working correctly
- [ ] Diamond/WLD exchange rate accurate
- [ ] No data corruption issues
- [ ] User satisfaction feedback positive

### Ongoing Maintenance
- [ ] Weekly audit log review
- [ ] Monthly performance analysis
- [ ] Quarterly security review
- [ ] Failed exchange root cause analysis
- [ ] Smart contract function monitoring

## Sign-Off

- [ ] QA Lead: __________________ Date: __________
- [ ] Engineering Lead: __________________ Date: __________
- [ ] Product Owner: __________________ Date: __________
