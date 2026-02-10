
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, verifyAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        await verifyAdmin(req);

        const { table, action, id, updates } = await req.json();

        const allowedTables = ['machine_tiers', 'mineral_configs', 'global_game_settings', 'profiles', 'player_state', 'player_flags', 'oil_purchases', 'machine_purchases', 'slot_purchases', 'cashout_requests', 'cashout_rounds', 'cashout_payouts'];
        if (!table || !allowedTables.includes(table)) {
            throw new Error('Invalid or unauthorized table');
        }

        const admin = getAdminClient();
        let result;

        if (action === 'update' && (id || updates.key)) {
            const pk = table === 'global_game_settings' ? 'key' : 'id';
            const { data, error } = await admin
                .from(table)
                .update(updates)
                .eq(pk, id || updates.key)
                .select()
                .single();
            if (error) throw error;
            result = data;
        } else if (action === 'fetch') {
            const { data, error } = await admin
                .from(table)
                .select('*');
            if (error) throw error;
            result = data;
        } else {
            throw new Error('Invalid action');
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
