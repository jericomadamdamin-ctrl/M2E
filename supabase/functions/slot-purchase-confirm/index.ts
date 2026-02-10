import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';

import { logSecurityEvent, extractClientInfo } from '../_shared/security.ts';

const DEV_PORTAL_API = 'https://developer.worldcoin.org/api/v2/minikit/transaction';

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

        const { payload } = await req.json();
        // Fallback for old requests (though we are fixing it now)
        const reference = payload?.reference;

        if (!reference || !payload?.transaction_id) {
            throw new Error('Missing payment payload');
        }

        const appId = Deno.env.get('WORLD_APP_ID') || Deno.env.get('APP_ID');
        const apiKey = Deno.env.get('DEV_PORTAL_API_KEY') || Deno.env.get('WORLD_ID_API_KEY');
        if (!appId || !apiKey) {
            throw new Error('Missing developer portal credentials');
        }

        const admin = getAdminClient();

        // Find pending purchase
        const { data: purchase, error: findError } = await admin
            .from('slot_purchases')
            .select('*')
            .eq('reference', reference)
            .eq('user_id', userId)
            .single();

        if (findError || !purchase) {
            throw new Error('Slot purchase not found');
        }

        if (purchase.status === 'confirmed') {
            return new Response(JSON.stringify({ ok: true, status: 'confirmed', message: 'Already confirmed' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Eagerly store transaction_id so the batch verifier can pick it up later
        if (payload.transaction_id && !purchase.transaction_id) {
            await admin
                .from('slot_purchases')
                .update({ transaction_id: payload.transaction_id })
                .eq('id', purchase.id)
                .eq('status', 'pending');
        }

        // Verify Transaction
        const verifyRes = await fetch(`${DEV_PORTAL_API}/${payload.transaction_id}?app_id=${appId}&type=payment`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!verifyRes.ok) {
            throw new Error('Failed to verify transaction');
        }

        const tx = await verifyRes.json();

        if (tx?.reference && tx.reference !== reference) {
            throw new Error('Reference mismatch');
        }

        // Validation: Amount
        if (tx?.input_token?.amount) {
            const txAmount = parseFloat(tx.input_token.amount);
            const expectedAmount = Number(purchase.amount_wld);
            if (txAmount < expectedAmount * 0.99) {
                const clientInfo = extractClientInfo(req);
                logSecurityEvent({
                    event_type: 'suspicious_activity',
                    user_id: userId,
                    severity: 'critical',
                    action: 'underpayment_attempt',
                    details: { expected: expectedAmount, received: txAmount, reference },
                    ...clientInfo,
                });
                throw new Error('Transaction amount mismatch');
            }
        }

        if (tx?.transaction_status === 'failed') {
            await admin
                .from('slot_purchases')
                .update({ status: 'failed' })
                .eq('id', purchase.id);
            throw new Error('Transaction failed on-chain');
        }

        const status = tx?.transaction_status;
        const minedStatuses = ['mined', 'completed', 'confirmed', 'success'];

        if (status && !minedStatuses.includes(status)) {
            return new Response(JSON.stringify({ ok: true, status: tx.transaction_status }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
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

        logSecurityEvent({
            event_type: 'purchase_confirmed',
            user_id: userId,
            severity: 'info',
            action: 'slot_purchase',
            details: { slots: purchase.slots_purchased, amount: purchase.amount_wld, reference },
        });

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
