
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdmin, requireAdminKey } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'GET') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const userId = await requireUserId(req);
        await requireAdmin(userId);
        requireAdminKey(req);

        const admin = getAdminClient();

        // Fetch open rounds
        const { data: openRounds } = await admin
            .from('cashout_rounds')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        // Fetch closed rounds with pending payouts
        // We want rounds where there is at least one pending payout
        // This is hard to do in one query without join filtering support on inner tables which Supabase has but complex to type here.
        // simpler: fetch recent closed rounds and check for pending payouts content.

        // Actually, let's just fetch rounds that are NOT 'open' and see if they have pending payouts.
        // Or better, fetch all pending payouts and group by round.

        const { data: pendingPayouts } = await admin
            .from('cashout_payouts')
            .select('*, profiles(wallet_address)')
            .eq('status', 'pending');

        // Group payouts by round_id
        const payoutsByRound: Record<string, any[]> = {};
        if (pendingPayouts) {
            for (const p of pendingPayouts) {
                if (!payoutsByRound[p.round_id]) payoutsByRound[p.round_id] = [];
                payoutsByRound[p.round_id].push(p);
            }
        }

        // Fetch details for rounds that have pending payouts
        const roundIds = Object.keys(payoutsByRound);
        let pendingExecutionRounds: any[] = [];
        if (roundIds.length > 0) {
            const { data: rounds } = await admin
                .from('cashout_rounds')
                .select('*')
                .in('id', roundIds);
            pendingExecutionRounds = rounds || [];
        }

        // Attach payouts to rounds
        const executionRounds = pendingExecutionRounds.map(r => ({
            ...r,
            payouts: payoutsByRound[r.id]
        }));

        return new Response(JSON.stringify({
            open_rounds: openRounds || [],
            execution_rounds: executionRounds,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
