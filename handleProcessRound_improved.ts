// Replacement for handleProcessRound function in AdminFinancials.tsx
// Lines 155-213

const handleProcessRound = async (roundId: string) => {
    try {
        console.log('[handleProcessRound] Starting for round:', roundId);

        // Find the round to get diamond count
        const round = stats?.open_rounds?.find(r => r.id === roundId);
        if (!round) {
            console.error('[handleProcessRound] Round not found in stats.open_rounds');
            toast({
                title: '❌ Round Not Found',
                description: 'Could not find this round in open rounds. Please refresh the page.',
                variant: 'destructive',
            });
            return;
        }

        const poolOverride = manualPools[roundId] ? parseFloat(manualPools[roundId]) : undefined;

        // Calculate expected pool amount
        const exchangeRate = 0.1; // TODO: Fetch from global_game_settings
        const expectedPool = poolOverride || (Number(round.total_diamonds || 0) * exchangeRate);

        console.log('[handleProcessRound] Pool calculation:', { poolOverride, expectedPool, diamonds: round.total_diamonds, exchangeRate });

        // Check treasury balance
        try {
            const balanceCheck = await checkTreasuryBalance(expectedPool);
            console.log('[handleProcessRound] Balance check result:', balanceCheck);

            if (!balanceCheck.sufficient) {
                toast({
                    title: '⚠️ Treasury Balance Low',
                    description: `Treasury has ${balanceCheck.balance.toFixed(2)} WLD but needs ${expectedPool.toFixed(2)} WLD. Please load the treasury wallet before finalizing.`,
                    variant: 'destructive',
                    duration: 8000,
                });
                return;
            }
        } catch (balanceError: any) {
            console.error('[handleProcessRound] Balance check error:', balanceError);
            toast({
                title: '⚠️ Balance Check Failed',
                description: `Could not verify treasury balance: ${balanceError.message}. Proceeding anyway.`,
                duration: 5000,
            });
            // Continue anyway
        }

        const msg = poolOverride
            ? `Close round with MANUAL POOL of ${poolOverride} WLD? Standard revenue logic will be bypassed.`
            : 'Are you sure you want to CLOSE this round and calculate payouts? This cannot be undone.';

        if (!confirm(msg)) {
            console.log('[handleProcessRound] User cancelled confirmation');
            toast({
                title: 'Cancelled',
                description: 'Round finalization cancelled.',
            });
            return;
        }

        setProcessingId(roundId);
        console.log('[handleProcessRound] Processing round...');

        const result = await processCashoutRound(roundId, accessKey, poolOverride);
        console.log('[handleProcessRound] Success:', result);

        toast({
            title: '✅ Round Processed',
            description: `Calculated payouts for ${result.total_diamonds} diamonds. Pool: ${result.payout_pool} WLD.`,
            className: 'glow-green',
        });
        setManualPools(prev => {
            const next = { ...prev };
            delete next[roundId];
            return next;
        });
        onRefresh();
    } catch (err: any) {
        console.error('[handleProcessRound] Error:', err);
        toast({
            title: '❌ Processing Failed',
            description: err.message || 'An unknown error occurred',
            variant: 'destructive',
        });
    } finally {
        setProcessingId(null);
    }
};
