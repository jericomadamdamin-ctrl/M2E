import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { processCashoutRound, executeCashoutPayouts, fetchPendingTransactions, verifyTransaction, rejectTransaction } from '@/lib/backend';
import { Loader2, Play, DollarSign, CheckCircle, CreditCard } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';
import { AdminStats } from '@/types/admin';

interface AdminFinancialsProps {
    stats: AdminStats | null;
    accessKey: string;
    onRefresh: () => void;
}

export const AdminFinancials = ({ stats, accessKey, onRefresh }: AdminFinancialsProps) => {
    const { toast } = useToast();
    const [pendingOil, setPendingOil] = useState<any[]>([]);
    const [pendingMachines, setPendingMachines] = useState<any[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

    const loadPending = async () => {
        setLoadingPending(true);
        try {
            const data = await fetchPendingTransactions(accessKey);
            setPendingOil(data.oil);
            setPendingMachines(data.machines);
        } catch (err: any) {
            console.error("Failed to load pending transactions", err);
        } finally {
            setLoadingPending(false);
        }
    };

    // Load pending on mount and when refresh is called
    // We can assume onRefresh (passed from parent) might not trigger this if we don't hook into it, 
    // but for now let's just use an effect or call it. 
    // Actually, onRefresh from parent just refreshes stats. We should expose a refresh all.
    // precise: let's add an effect that runs when 'stats' changes (as a signal) or just on mount.
    // The parent 'Refresh' button re-runs fetchAdminStats. We can hook into that if we want, or just add a refresh button here.
    // Let's add a `useEffect` to load when component mounts.
    useEffect(() => {
        loadPending();
    }, [accessKey]);

    const handleVerify = async (type: 'oil' | 'machine', id: string) => {
        if (!confirm(`Are you sure you want to MANUALLY CONFIRM this ${type} purchase? This will grant items immediately.`)) return;
        setProcessingId(id);
        try {
            await verifyTransaction(type, id, accessKey);
            toast({
                title: 'Transaction Verified',
                description: 'User has been credited.',
                className: 'glow-green',
            });
            loadPending();
        } catch (err: any) {
            toast({
                title: 'Verification Failed',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (type: 'oil' | 'machine', id: string) => {
        if (!confirm(`Are you sure you want to REJECT this purchase? It will be marked as failed.`)) return;
        setProcessingId(id);
        try {
            await rejectTransaction(type, id, accessKey);
            toast({
                title: 'Transaction Rejected',
                description: 'Marked as failed.',
            });
            loadPending();
        } catch (err: any) {
            toast({
                title: 'Rejection Failed',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setProcessingId(null);
        }
    };


    const [processingId, setProcessingId] = useState<string | null>(null);

    const handleProcessRound = async (roundId: string) => {
        if (!confirm('Are you sure you want to CLOSE this round and calculate payouts? This cannot be undone.')) return;

        setProcessingId(roundId);
        try {
            const result = await processCashoutRound(roundId, accessKey);
            toast({
                title: 'Round Processed',
                description: `Calculated payouts for ${result.total_diamonds} diamonds. Pool: ${result.payout_pool} WLD.`,
                className: 'glow-green',
            });
            onRefresh();
        } catch (err: any) {
            toast({
                title: 'Processing Failed',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setProcessingId(null);
        }
    };

    const handleExecutePayouts = async (roundId: string) => {
        if (!confirm('Are you sure you want to EXECUTE these payouts? This will send WLD from the backend wallet.')) return;

        setProcessingId(roundId);
        try {
            const result = await executeCashoutPayouts(roundId, accessKey);
            const paid = result.results.filter((r: any) => r.status === 'paid').length;
            const failed = result.results.filter((r: any) => r.status === 'failed').length;

            toast({
                title: 'Execution Complete',
                description: `Paid: ${paid}, Failed: ${failed}. Check logs for details.`,
                className: paid > 0 ? 'glow-green' : 'destructive',
            });
            onRefresh();
        } catch (err: any) {
            toast({
                title: 'Execution Failed',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                    <CreditCard className="w-4 h-4" /> Pending Transactions
                </h3>
                <Button size="sm" variant="outline" onClick={loadPending} disabled={loadingPending} className="h-7 text-xs">
                    {loadingPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh Tx'}
                </Button>
            </div>

            {/* Pending Oil */}
            <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Oil Purchases</div>
                {pendingOil.length === 0 ? (
                    <div className="text-center p-4 bg-secondary/10 rounded-lg border border-dashed border-border/50 text-muted-foreground text-xs opacity-50">
                        No pending oil purchases.
                    </div>
                ) : (
                    pendingOil.map((tx) => (
                        <Card key={tx.id} className="bg-secondary/20 border-border/50 overflow-hidden">
                            <CardContent className="p-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                                        <span>{formatCompactNumber(tx.amount_oil)} OIL</span>
                                        <span className="text-muted-foreground font-normal">for</span>
                                        <span className="text-white">{tx.amount_token} {tx.token}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate font-mono mt-1">
                                        User: {tx.profiles?.player_name || 'Unknown'} <br />
                                        <span className="opacity-50">{tx.user_id}</span>
                                    </div>
                                    <div className="text-[9px] text-muted-foreground mt-1 opacity-50">
                                        Ref: {tx.reference}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button
                                        size="sm"
                                        className="h-6 text-[10px] bg-green-900/50 hover:bg-green-800 text-green-100 border border-green-500/30"
                                        onClick={() => handleVerify('oil', tx.id)}
                                        disabled={!!processingId}
                                    >
                                        {processingId === tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Verify'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] border-red-500/20 text-red-400 hover:bg-red-950/30"
                                        onClick={() => handleReject('oil', tx.id)}
                                        disabled={!!processingId}
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Pending Machines */}
            <div className="space-y-2 mt-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Machine Purchases</div>
                {pendingMachines.length === 0 ? (
                    <div className="text-center p-4 bg-secondary/10 rounded-lg border border-dashed border-border/50 text-muted-foreground text-xs opacity-50">
                        No pending machine purchases.
                    </div>
                ) : (
                    pendingMachines.map((tx) => (
                        <Card key={tx.id} className="bg-secondary/20 border-border/50 overflow-hidden">
                            <CardContent className="p-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                                        <span>{tx.machine_type}</span>
                                        <span className="text-muted-foreground font-normal">for</span>
                                        <span className="text-white">{tx.amount_wld} WLD</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate font-mono mt-1">
                                        User: {tx.profiles?.player_name || 'Unknown'} <br />
                                        <span className="opacity-50">{tx.user_id}</span>
                                    </div>
                                    <div className="text-[9px] text-muted-foreground mt-1 opacity-50">
                                        Ref: {tx.reference}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button
                                        size="sm"
                                        className="h-6 text-[10px] bg-green-900/50 hover:bg-green-800 text-green-100 border border-green-500/30"
                                        onClick={() => handleVerify('machine', tx.id)}
                                        disabled={!!processingId}
                                    >
                                        {processingId === tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Verify'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] border-red-500/20 text-red-400 hover:bg-red-950/30"
                                        onClick={() => handleReject('machine', tx.id)}
                                        disabled={!!processingId}
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <div className="my-6 border-t border-white/5" />

            {/* Section 1: Process Rounds */}
            <div className="space-y-3">
                <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                    <Play className="w-4 h-4" /> Process Rounds (Step 1)
                </h3>

                {stats?.open_rounds?.length === 0 ? (
                    <div className="text-center p-6 bg-secondary/10 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm">
                        No open rounds found.
                    </div>
                ) : (
                    stats?.open_rounds?.map((round) => (
                        <Card key={round.id} className="bg-secondary/20 border-primary/20">
                            <CardHeader className="p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-base text-primary">Round: {round.round_date}</CardTitle>
                                        <CardDescription className="text-xs">Created: {new Date(round.created_at).toLocaleString()}</CardDescription>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-white">{formatCompactNumber(round.payout_pool_wld)} WLD</div>
                                        <div className="text-xs text-muted-foreground">Pool Size</div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="flex justify-between items-center mb-4 text-xs bg-black/20 p-2 rounded">
                                    <span>Diamonds Submitted:</span>
                                    <span className="font-bold text-game-diamond">{formatCompactNumber(round.total_diamonds)} 💎</span>
                                </div>

                                <Button
                                    className="w-full"
                                    onClick={() => handleProcessRound(round.id)}
                                    disabled={!!processingId}
                                >
                                    {processingId === round.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                    )}
                                    Close Round & Calc Payouts
                                </Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Section 2: Execute Payouts */}
            <div className="space-y-3">
                <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                    <DollarSign className="w-4 h-4" /> Execute Payouts (Step 2)
                </h3>

                {stats?.execution_rounds?.length === 0 ? (
                    <div className="text-center p-6 bg-secondary/10 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm">
                        No pending payouts.
                    </div>
                ) : (
                    stats?.execution_rounds?.map((round) => (
                        <Card key={round.id} className="bg-yellow-500/5 border-yellow-500/20">
                            <CardHeader className="p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-base text-yellow-500">Round: {round.round_date}</CardTitle>
                                        <CardDescription className="text-xs">Ready for Execution</CardDescription>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-white">{round.payouts?.length || 0}</div>
                                        <div className="text-xs text-muted-foreground">Pending Payouts</div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xs text-muted-foreground mb-4">
                                    This will initiate blockchain transactions to send WLD to all users in this round. Ensure wallet is funded.
                                </div>

                                <Button
                                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                                    onClick={() => handleExecutePayouts(round.id)}
                                    disabled={!!processingId}
                                >
                                    {processingId === round.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <DollarSign className="w-4 h-4 mr-2" />
                                    )}
                                    Execute {round.payouts?.length} Payouts
                                </Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};
