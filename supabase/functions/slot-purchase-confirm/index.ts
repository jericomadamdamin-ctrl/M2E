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
            .from('slot_purchases')
            .select('*')
            .eq('reference', reference)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .single();

        if (findError || !purchase) {
            throw new Error('Slot purchase not found or already processed');
        }

        // Mark as confirmed
        const { error: updateError } = await admin
            .from('slot_purchases')
            .update({ status: 'confirmed' })
            .eq('id', purchase.id);

        if (updateError) {
            throw new Error('Failed to confirm purchase');
        }

        // Increment purchased_slots in player_state using the RPC
        const { error: stateError } = await admin.rpc('increment_slots', {
            user_id_param: userId,
            slots_add: purchase.slots_purchased,
        });

        if (stateError) {
            console.error('RPC Error:', stateError);
            throw new Error(`Failed to update player state: ${stateError.message}`);
        }

        return new Response(JSON.stringify({
            ok: true,
            slots_added: purchase.slots_purchased,
            message: `Successfully added ${purchase.slots_purchased} machine slots!`,
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
