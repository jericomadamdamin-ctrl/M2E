import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { fetchAdminStats, processCashoutRound, executeCashoutPayouts } from '@/lib/backend';
import { Loader2, AlertTriangle, CheckCircle, Play, DollarSign, Lock } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';

interface Round {
    id: string;
    round_date: string;
    revenue_wld: number;
    payout_pool_wld: number;
    total_diamonds: number;
    status: string;
    created_at: string;
    payouts?: any[];
}

interface AdminStats {
    open_rounds: Round[];
    execution_rounds: Round[];
}

export const AdminTab = () => {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [accessKey, setAccessKey] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const { toast } = useToast();

    const handleLogin = async () => {
        if (!accessKey) return;
        setLoading(true);
        try {
            const data = await fetchAdminStats(accessKey);
            setStats(data);
            setIsAuthenticated(true);
        } catch (err: any) {
            toast({
                title: 'Access Denied',
                description: err.message || 'Invalid Access Key',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const data = await fetchAdminStats(accessKey);
            setStats(data);
        } catch (err: any) {
            toast({
                title: 'Failed to load stats',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            loadStats();
        }
    }, [isAuthenticated]);

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
            loadStats();
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
            loadStats();
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

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 animate-fade-in min-h-[50vh]">
                <Lock className="w-12 h-12 text-muted-foreground mb-4" />
                <h2 className="font-pixel text-xl text-primary text-glow">Game Master Access</h2>
                <Card className="w-full max-w-sm bg-secondary/20 border-border/50">
                    <CardHeader>
                        <CardDescription className="text-center">Enter your secure access key to proceed.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input
                            type="password"
                            placeholder="Access Key"
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        />
                        <Button className="w-full" onClick={handleLogin} disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enter Dashboard'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading && !stats) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            <div className="flex items-center justify-between">
                <h2 className="font-pixel text-xl text-primary text-glow">Game Master Dashboard</h2>
                <Button size="sm" variant="outline" onClick={loadStats} disabled={loading}>
                    Refresh
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Open Rounds</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold">{stats?.open_rounds.length || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Execution</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-yellow-500">{stats?.execution_rounds.length || 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Section 1: Process Rounds */}
            <div className="space-y-3">
                <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                    <Play className="w-4 h-4" /> Process Rounds (Step 1)
                </h3>

                {stats?.open_rounds.length === 0 ? (
                    <div className="text-center p-6 bg-secondary/10 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm">
                        No open rounds found.
                    </div>
                ) : (
                    stats?.open_rounds.map((round) => (
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

                {stats?.execution_rounds.length === 0 ? (
                    <div className="text-center p-6 bg-secondary/10 rounded-xl border border-dashed border-border/50 text-muted-foreground text-sm">
                        No pending payouts.
                    </div>
                ) : (
                    stats?.execution_rounds.map((round) => (
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
