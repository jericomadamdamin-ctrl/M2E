
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, verifyAdmin, requireUserId } from '../_shared/supabase.ts';
import { checkRateLimit } from '../_shared/security.ts';

Deno.serve(async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const userId = await requireUserId(req);
        await verifyAdmin(req);

        const rate = await checkRateLimit(userId, 'admin_stats', 60, 1);
        if (!rate.allowed) {
            throw new Error('Admin rate limit exceeded. Try again in a minute.');
        }

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

        // Global Stats
        const { count: totalUsers } = await admin.from('profiles').select('*', { count: 'exact', head: true });

        // Aggregates: totals and daily revenue (UTC)
        const { data: totalsRow } = await admin
            .from('player_state')
            .select('sum(oil_balance) as total_oil, sum(diamond_balance) as total_diamonds')
            .single();
        const totalOil = Number(totalsRow?.total_oil || 0);
        const totalDiamonds = Number(totalsRow?.total_diamonds || 0);

        const now = new Date();
        const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

        const sumConfirmed = async (table: string, field: string) => {
            const { data } = await admin
                .from(table)
                .select(`sum(${field})`)
                .eq('status', 'confirmed')
                .gte('created_at', startUtc)
                .single();
            return Number((data as any)?.[`sum`] ?? 0);
        };

        const dailyOil = await sumConfirmed('oil_purchases', 'amount_wld');
        const dailyMachines = await sumConfirmed('machine_purchases', 'amount_wld');
        const dailySlots = await sumConfirmed('slot_purchases', 'amount_wld');
        const dailyRevenueWld = dailyOil + dailyMachines + dailySlots;

        return new Response(JSON.stringify({
            open_rounds: openRounds || [],
            execution_rounds: executionRounds,
            total_users: totalUsers || 0,
            total_oil: totalOil,
            total_diamonds: totalDiamonds,
            daily_revenue_wld: dailyRevenueWld,
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
