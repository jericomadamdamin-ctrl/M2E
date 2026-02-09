import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';

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
        await requireHuman(userId);

        const { reference } = await req.json();
        if (!reference) {
            throw new Error('Missing reference');
        }

        const admin = getAdminClient();

        // Find pending purchase
        const { data: purchase, error: findError } = await admin
            .from('machine_purchases')
            .select('*')
            .eq('reference', reference)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .single();

        if (findError || !purchase) {
            throw new Error('Machine purchase not found or already processed');
        }

        // Mark as confirmed
        const { error: updateError } = await admin
            .from('machine_purchases')
            .update({ status: 'confirmed' })
            .eq('id', purchase.id);

        if (updateError) {
            throw new Error('Failed to confirm purchase record');
        }

        // Award the machine to the player
        const { data: machine, error: machineError } = await admin
            .from('player_machines')
            .insert({
                user_id: userId,
                type: purchase.machine_type,
                level: 1,
                fuel_oil: 0,
                is_active: false,
                last_processed_at: null,
            })
            .select('*')
            .single();

        if (machineError) {
            throw new Error('Failed to award machine: ' + machineError.message);
        }

        return new Response(JSON.stringify({
            ok: true,
            machine,
            message: `Congratulations! Your new ${purchase.machine_type} machine is ready.`,
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
