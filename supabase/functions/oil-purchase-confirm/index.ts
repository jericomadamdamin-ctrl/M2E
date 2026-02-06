import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';

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

    const { data: purchase } = await admin
      .from('oil_purchases')
      .select('*')
      .eq('reference', payload.reference)
      .eq('user_id', userId)
      .single();

    if (!purchase) {
      throw new Error('Purchase not found');
    }

    if (purchase.status === 'confirmed') {
      return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      throw new Error('Treasury address mismatch');
    }

    if (tx?.transaction_status && tx.transaction_status === 'failed') {
      await admin
        .from('oil_purchases')
        .update({ status: 'failed', transaction_id: payload.transaction_id, metadata: tx })
        .eq('id', purchase.id);
      throw new Error('Transaction failed');
    }

    if (tx?.transaction_status && tx.transaction_status !== 'mined') {
      return new Response(JSON.stringify({ ok: true, status: tx.transaction_status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit OIL
    const { data: state } = await admin
      .from('player_state')
      .select('oil_balance')
      .eq('user_id', userId)
      .single();

    const newOil = Number(state?.oil_balance || 0) + Number(purchase.amount_oil || 0);

    await admin
      .from('player_state')
      .update({ oil_balance: newOil })
      .eq('user_id', userId);

    await admin
      .from('oil_purchases')
      .update({ status: 'confirmed', transaction_id: payload.transaction_id, metadata: tx })
      .eq('id', purchase.id);

    return new Response(JSON.stringify({ ok: true, status: 'confirmed', oil_balance: newOil }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
