import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdmin, requireAdminOrKey } from '../_shared/supabase.ts';
import { ethers } from 'https://esm.sh/ethers@6.11.1';

// World Chain Constants
const DEFAULT_RPC_URL = 'https://worldchain-mainnet.g.alchemy.com/public';
const DEFAULT_WLD_ADDRESS = '0x2cfc85d8e48f8eab294be644d9e25c3030863003';

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

        // Allow admin-key-only auth for CLI/script calls
        const adminKey = req.headers.get('x-admin-key');
        const requiredKey = Deno.env.get('ADMIN_ACCESS_KEY');

        if (adminKey && requiredKey && adminKey === requiredKey) {
            // Admin key auth — no session token needed
            console.log('Admin key auth accepted for cashout-execute');
        } else {
            // Normal auth flow
            const userId = await requireUserId(req);
            await requireAdminOrKey(req, userId);
        }

        const { round_id } = await req.json();
        if (!round_id) throw new Error('Missing round_id');

        const admin = getAdminClient();

        // Fetch pending payouts for the round
        const { data: payouts } = await admin
            .from('cashout_payouts')
            .select('*, profiles!user_id(wallet_address)')
            .eq('round_id', round_id)
            .eq('status', 'pending');

        if (!payouts || payouts.length === 0) {
            throw new Error('No pending payouts for this round');
        }

        const privateKey = Deno.env.get('PAYOUT_PRIVATE_KEY');
        // Use environment variables if set, otherwise fallback to World Chain defaults
        const rpcUrl = Deno.env.get('JSON_RPC_URL') || DEFAULT_RPC_URL;
        const wldContractAddress = Deno.env.get('WLD_CONTRACT_ADDRESS') || DEFAULT_WLD_ADDRESS;

        if (!privateKey) throw new Error('Missing PAYOUT_PRIVATE_KEY');

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const results = [];

        // Process payouts
        for (const payout of payouts) {
            try {
                // Safe casting to access joined profile data
                const profile = (payout as any).profiles;
                const recipientAddress = profile?.wallet_address;
                const amountWld = payout.payout_wld;

                if (!recipientAddress || !ethers.isAddress(recipientAddress)) {
                    results.push({ id: payout.id, status: 'failed', error: 'Invalid wallet address' });
                    continue;
                }

                if (amountWld <= 0) {
                    results.push({ id: payout.id, status: 'skipped', error: 'Amount is zero' });
                    continue;
                }

                // Processing WLD (ERC20) Transfer on World Chain
                // Note: The backend wallet must hold ETH for gas fees on World Chain (unless sponsored)
                // and WLD tokens for the payout.

                let tx;

                if (wldContractAddress) {
                    console.log(`Setting up WLD contract at ${wldContractAddress}`);
                    // ERC20 Transfer
                    const abi = [
                        "function transfer(address to, uint256 value) returns (bool)"
                    ];
                    const contract = new ethers.Contract(wldContractAddress, abi, wallet);

                    // In ethers v6, we can use getFunction for more reliability in some environments
                    const transferFn = contract.getFunction("transfer");
                    if (!transferFn) {
                        throw new Error("Transfer function not found on contract interface");
                    }

                    const amountWei = ethers.parseUnits(amountWld.toString(), 18);
                    console.log(`Sending ${amountWld} WLD (${amountWei}) to ${recipientAddress}`);

                    // Send transaction
                    tx = await transferFn(recipientAddress, amountWei);
                    console.log(`Transaction sent: ${tx.hash}`);
                } else {
                    throw new Error("WLD_CONTRACT_ADDRESS not configured");
                }

                await tx.wait(1); // Wait for 1 confirmation

                // Update database
                await admin
                    .from('cashout_payouts')
                    .update({
                        status: 'paid',
                        tx_hash: tx.hash,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payout.id);

                results.push({ id: payout.id, status: 'paid', tx: tx.hash });

            } catch (err) {
                console.error(`Payout failed for ${payout.id}:`, err);
                results.push({ id: payout.id, status: 'failed', error: (err as Error).message });
            }
        }

        return new Response(JSON.stringify({ ok: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
