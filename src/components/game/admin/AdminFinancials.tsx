import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { processCashoutRound, executeCashoutPayouts, fetchPendingTransactions, verifyTransaction, rejectTransaction } from '@/lib/backend';
import { Loader2, Play, DollarSign, CheckCircle, CreditCard, RefreshCw, Droplets, Layers } from 'lucide-react';
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
    const [pendingSlots, setPendingSlots] = useState<any[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

    const loadPending = async () => {
        setLoadingPending(true);
        try {
            const data = await fetchPendingTransactions(accessKey);
            setPendingOil(data.oil);
            setPendingMachines(data.machines);
            setPendingSlots(data.slots || []);
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

    const handleVerify = async (type: 'oil' | 'machine' | 'slot', id: string) => {
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

    const handleReject = async (type: 'oil' | 'machine' | 'slot', id: string) => {
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
        <div className="space-y-8 animate-fade-in px-1 pb-10">
            <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm tracking-tight">Pending Approval</h3>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Awaiting Verification</p>
                    </div>
                </div>
                <Button size="sm" variant="outline" onClick={loadPending} disabled={loadingPending} className="h-9 rounded-xl border-white/10 bg-black/20">
                    {loadingPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
            </div>

            {/* Pending Sections */}
            <div className="space-y-6">
                {/* Pending Oil */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <Droplets className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Oil Acquisitions ({pendingOil.length})</span>
                    </div>
                    {pendingOil.length === 0 ? (
                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                            <span className="text-[10px] uppercase tracking-widest">No pending oil transfers</span>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {pendingOil.map((tx) => (
                                <TransactionCard
                                    key={tx.id}
                                    tx={tx}
                                    type="oil"
                                    onVerify={handleVerify}
                                    onReject={handleReject}
                                    processing={processingId === tx.id}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Pending Machines */}
                <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 px-1">
                        <Layers className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Machine Purchases ({pendingMachines.length})</span>
                    </div>
                    {pendingMachines.length === 0 ? (
                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                            <span className="text-[10px] uppercase tracking-widest">No pending machine orders</span>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {pendingMachines.map((tx) => (
                                <TransactionCard
                                    key={tx.id}
                                    tx={tx}
                                    type="machine"
                                    onVerify={handleVerify}
                                    onReject={handleReject}
                                    processing={processingId === tx.id}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Pending Slot Purchases */}
                <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 px-1">
                        <Layers className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slot Expansions ({pendingSlots.length})</span>
                    </div>
                    {pendingSlots.length === 0 ? (
                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                            <span className="text-[10px] uppercase tracking-widest">No pending slot purchases</span>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {pendingSlots.map((tx) => (
                                <TransactionCard
                                    key={tx.id}
                                    tx={tx}
                                    type="slot"
                                    onVerify={handleVerify}
                                    onReject={handleReject}
                                    processing={processingId === tx.id}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />

            {/* Payout Infrastructure */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                        <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm tracking-tight text-yellow-500">Payout Protocols</h3>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Round Management</p>
                    </div>
                </div>

                {/* Section 1: Process Rounds */}
                <div className="space-y-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1 italic">Phase 01: Closure</div>
                    {stats?.open_rounds?.length === 0 ? (
                        <div className="text-center p-8 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">All rounds processed</span>
                        </div>
                    ) : (
                        stats?.open_rounds?.map((round) => (
                            <Card key={round.id} className="bg-primary/5 border-primary/20 backdrop-blur-md overflow-hidden group">
                                <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                                    <div>
                                        <CardTitle className="text-sm font-bold text-primary group-hover:text-glow-sm transition-all">Round: {round.round_date}</CardTitle>
                                        <p className="text-[10px] text-muted-foreground opacity-60">ID: {round.id.slice(0, 8)}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white tracking-tighter">{formatCompactNumber(round.payout_pool_wld)} WLD</div>
                                        <div className="text-[8px] uppercase tracking-widest text-primary/60 font-bold">Payout Pool</div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 space-y-4">
                                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
                                        <div>
                                            <div className="text-[8px] text-muted-foreground uppercase font-bold opacity-50">Diamonds</div>
                                            <div className="text-xs font-mono text-game-diamond">{formatCompactNumber(round.total_diamonds)} 💎</div>
                                        </div>
                                        <div>
                                            <div className="text-[8px] text-muted-foreground uppercase font-bold opacity-50">Started</div>
                                            <div className="text-xs font-mono">{new Date(round.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <Button
                                        className="w-full h-11 bg-primary hover:bg-primary/80 text-black font-bold uppercase tracking-widest text-xs rounded-xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                                        onClick={() => handleProcessRound(round.id)}
                                        disabled={!!processingId}
                                    >
                                        {processingId === round.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                        Finalize & Distribute
                                    </Button>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Section 2: Execute Payouts */}
                <div className="space-y-4 pt-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1 italic">Phase 02: Execution</div>
                    {stats?.execution_rounds?.length === 0 ? (
                        <div className="text-center p-8 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">No rounds awaiting execution</span>
                        </div>
                    ) : (
                        stats?.execution_rounds?.map((round) => (
                            <Card key={round.id} className="bg-yellow-500/5 border-yellow-500/20 backdrop-blur-md overflow-hidden">
                                <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                                    <div>
                                        <CardTitle className="text-sm font-bold text-yellow-500">Round: {round.round_date}</CardTitle>
                                        <p className="text-[10px] text-muted-foreground opacity-60 italic">Crypto-payouts Ready</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white tracking-tighter">{round.payouts?.length || 0}</div>
                                        <div className="text-[8px] uppercase tracking-widest text-yellow-500/60 font-bold">Recipients</div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 space-y-4">
                                    <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
                                        <p className="text-[10px] text-yellow-500/80 font-medium">Blockchain broadcast required. Ensure backend liquidity.</p>
                                    </div>
                                    <Button
                                        className="w-full h-11 bg-yellow-600 hover:bg-yellow-700 text-white font-bold uppercase tracking-widest text-xs rounded-xl"
                                        onClick={() => handleExecutePayouts(round.id)}
                                        disabled={!!processingId}
                                    >
                                        {processingId === round.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
                                        Initialize Transactions
                                    </Button>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

interface TransactionCardProps {
    tx: any;
    type: 'oil' | 'machine' | 'slot';
    onVerify: (type: 'oil' | 'machine' | 'slot', id: string) => void;
    onReject: (type: 'oil' | 'machine' | 'slot', id: string) => void;
    processing: boolean;
}

const TransactionCard = ({ tx, type, onVerify, onReject, processing }: TransactionCardProps) => (
    <Card className="bg-white/5 border-white/5 backdrop-blur-sm overflow-hidden border-l-2 border-l-primary/30 group">
        <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-[0.2em] mb-1 opacity-50">Transaction</div>
                    <div className="flex items-center gap-2">
                        {type === 'oil' && <span className="text-sm font-bold text-primary">{formatCompactNumber(tx.amount_oil)} OIL</span>}
                        {type === 'machine' && <span className="text-sm font-bold text-primary uppercase">{tx.machine_type}</span>}
                        {type === 'slot' && <span className="text-sm font-bold text-primary">{tx.slots_purchased} slots</span>}
                        <span className="text-[10px] text-muted-foreground">/</span>
                        <span className="text-sm font-bold text-white">
                            {type === 'oil' ? tx.amount_token : tx.amount_wld} {type === 'oil' ? tx.token : 'WLD'}
                        </span>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[9px] text-muted-foreground uppercase font-bold opacity-40 mb-1">User</div>
                    <div className="text-[11px] font-bold text-glow-sm">{tx.profiles?.player_name || 'N/A'}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                    <div className="text-[8px] text-muted-foreground uppercase font-bold opacity-40 mb-1 tracking-tighter">Reference</div>
                    <div className="text-[9px] font-mono truncate opacity-80">{tx.reference}</div>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                    <div className="text-[8px] text-muted-foreground uppercase font-bold opacity-40 mb-1 tracking-tighter">Identity</div>
                    <div className="text-[9px] font-mono truncate opacity-60">ID: {tx.user_id.slice(0, 10)}...</div>
                </div>
            </div>

            <div className="flex gap-2 pt-1">
                <Button
                    size="sm"
                    className="flex-1 h-10 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl text-[10px] uppercase font-bold tracking-widest"
                    onClick={() => onVerify(type, tx.id)}
                    disabled={processing}
                >
                    {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-2" />}
                    Confirm
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 px-4 text-red-500/60 hover:text-red-400 hover:bg-red-500/5 rounded-xl text-[10px] uppercase font-bold tracking-widest"
                    onClick={() => onReject(type, tx.id)}
                    disabled={processing}
                >
                    Void
                </Button>
            </div>
        </CardContent>
    </Card>
);
