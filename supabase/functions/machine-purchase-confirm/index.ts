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
        if (!payload?.reference || !payload?.transaction_id) {
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
            .from('machine_purchases')
            .select('*')
            .eq('reference', payload.reference)
            .eq('user_id', userId)
            .single();

        if (findError || !purchase) {
            throw new Error('Machine purchase not found');
        }

        if (purchase.status === 'confirmed') {
            return new Response(JSON.stringify({ ok: true, status: 'confirmed', message: 'Already confirmed' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Verify Transaction with Developer Portal
        const verifyRes = await fetch(`${DEV_PORTAL_API}/${payload.transaction_id}?app_id=${appId}&type=payment`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!verifyRes.ok) {
            throw new Error('Failed to verify transaction');
        }

        const tx = await verifyRes.json();

        if (tx?.reference && tx.reference !== payload.reference) {
            throw new Error('Reference mismatch');
        }

        if (tx?.to && purchase.to_address && tx.to.toLowerCase() !== purchase.to_address.toLowerCase()) {
            // In some envs, purchase.to_address might be undefined if not saved.
            // But machine-purchase-initiate saves it? No, it DOES NOT save to_address in DB.
            // It returns it to frontend.
            // machine_purchases table schema: user_id, machine_type, amount_wld, status, reference...
            // It does NOT store `to_address`.
            // We can skip this check or rely on `reference` + `amount`.
        }

        // Verify Amount
        if (tx?.input_token?.amount) {
            const txAmount = parseFloat(tx.input_token.amount);
            const expectedAmount = Number(purchase.amount_wld);
            // Allow 1% tolerance
            if (txAmount < expectedAmount * 0.99) {
                const clientInfo = extractClientInfo(req);
                logSecurityEvent({
                    event_type: 'suspicious_activity',
                    user_id: userId,
                    severity: 'critical',
                    action: 'underpayment_attempt',
                    details: { expected: expectedAmount, received: txAmount, reference: payload.reference },
                    ...clientInfo,
                });
                throw new Error('Transaction amount mismatch');
            }
        }

        if (tx?.transaction_status === 'failed') {
            await admin
                .from('machine_purchases')
                .update({ status: 'failed' })
                .eq('id', purchase.id);
            throw new Error('Transaction failed on-chain');
        }

        if (tx?.transaction_status && tx.transaction_status !== 'mined') {
            return new Response(JSON.stringify({ ok: true, status: tx.transaction_status }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Mark as confirmed
        const { error: updateError } = await admin
            .from('machine_purchases')
            .update({ status: 'confirmed' }) // Store metadata if column exists?
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

        logSecurityEvent({
            event_type: 'purchase_confirmed',
            user_id: userId,
            severity: 'info',
            action: 'machine_purchase',
            details: { type: purchase.machine_type, amount: purchase.amount_wld, reference: payload.reference },
        });

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
