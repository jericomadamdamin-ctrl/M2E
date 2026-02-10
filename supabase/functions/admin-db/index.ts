
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdminOrKey } from '../_shared/supabase.ts';

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

        const userId = await requireUserId(req);
        await requireAdminOrKey(req, userId);

        const { table, action, id, updates } = await req.json();

        if (!table || !['machine_tiers', 'mineral_configs', 'global_game_settings', 'profiles', 'player_state'].includes(table)) {
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
