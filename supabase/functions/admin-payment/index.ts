
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdminOrKey } from '../_shared/supabase.ts';
import { getGameConfig } from '../_shared/mining.ts';

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

        const { action, type, id } = await req.json();
        const admin = getAdminClient();

        if (action === 'fetch_pending') {
            // Fetch pending oil purchases
            const { data: oilPurchases, error: oilError } = await admin
                .from('oil_purchases')
                .select('*, profiles(player_name, wallet_address)')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (oilError) throw oilError;

            // Fetch pending machine purchases
            const { data: machinePurchases, error: machineError } = await admin
                .from('machine_purchases')
                .select('*, profiles(player_name, wallet_address)')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (machineError) throw machineError;

            return new Response(JSON.stringify({
                oil: oilPurchases,
                machines: machinePurchases
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'verify' || action === 'reject') {
            if (!id || !type) throw new Error('Missing id or type');

            const table = type === 'oil' ? 'oil_purchases' : 'machine_purchases';

            if (action === 'reject') {
                const { error } = await admin
                    .from(table)
                    .update({ status: 'failed', metadata: { reason: 'Admin rejected' } })
                    .eq('id', id);
                if (error) throw error;
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // Verify Logic
            // 1. Mark purchase as confirmed
            const { data: purchase, error: fetchError } = await admin
                .from(table)
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !purchase) throw new Error('Purchase not found');
            if (purchase.status !== 'pending') throw new Error('Purchase is not pending');

            // 2. Grant rewards
            if (type === 'oil') {
                const { data: state } = await admin
                    .from('player_state')
                    .select('oil_balance')
                    .eq('user_id', purchase.user_id)
                    .single();

                const newOil = Number(state?.oil_balance || 0) + Number(purchase.amount_oil);

                await admin.from('player_state').update({ oil_balance: newOil }).eq('user_id', purchase.user_id);

                // Referral bonus check (simplified from oil-purchase-confirm)
                const { data: profile } = await admin.from('profiles').select('referred_by, referral_bonus_paid').eq('id', purchase.user_id).single();
                if (profile?.referred_by && !profile.referral_bonus_paid) {
                    const config = await getGameConfig();
                    const bonusAmount = config.referrals?.bonus_diamonds ?? 0.5;

                    // Get referrer state
                    const { data: refState } = await admin.from('player_state').select('diamond_balance').eq('user_id', profile.referred_by).single();
                    if (refState) {
                        await admin.from('player_state').update({ diamond_balance: refState.diamond_balance + bonusAmount }).eq('user_id', profile.referred_by);
                        await admin.from('referral_bonuses').insert({
                            referrer_id: profile.referred_by,
                            referred_id: purchase.user_id,
                            diamonds_awarded: bonusAmount
                        });
                        await admin.from('profiles').update({ referral_bonus_paid: true }).eq('id', purchase.user_id);
                    }
                }

            } else if (type === 'machine') {
                // Grant machine
                await admin.from('machines').insert({
                    user_id: purchase.user_id,
                    type: purchase.machine_type,
                    level: 1,
                    fuel_oil: 0,
                    is_active: false,
                    last_processed_at: new Date().toISOString()
                });

                // Keep track of total slots if needed, but machine-purchase-confirm didn't seem to update purchased_slots, 
                // it just checked limits. The limit check was done at initiate.
            }

            // 3. Update status
            const { error: updateError } = await admin
                .from(table)
                .update({ status: 'confirmed', metadata: { method: 'admin_manual_verify' } })
                .eq('id', id);

            if (updateError) throw updateError;

            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        throw new Error('Invalid action');

    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
