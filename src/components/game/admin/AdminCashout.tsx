import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchTable, updateTableRow } from '@/lib/backend';
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock, Wallet, Gem, Filter } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export const AdminCashout = ({ accessKey }: { accessKey: string }) => {
    const { toast } = useToast();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('pending');

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await fetchTable('cashout_requests', accessKey);
            // Join with profiles if needed, but for MVP let's just show raw list
            // We can add join logic here if we want wallet addresses
            setRequests(data.sort((a: any, b: any) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()));
        } catch (err: any) {
            toast({ title: 'Fetch Failed', description: err.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRequests(); }, [accessKey]);

    const handleAction = async (id: string, newStatus: string) => {
        try {
            await updateTableRow('cashout_requests', id, { status: newStatus, processed_at: new Date().toISOString() }, accessKey);
            toast({ title: 'Request Updated', description: `Status changed to ${newStatus}` });
            await loadRequests();
        } catch (err: any) {
            toast({ title: 'Operation Failed', description: err.message, variant: 'destructive' });
        }
    };

    const filtered = requests.filter(r => filter === 'all' || r.status === filter);
    const totalDiamonds = filtered.reduce((sum, r) => sum + Number(r.diamonds_submitted || 0), 0);

    return (
        <div className="space-y-4 animate-fade-in px-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="bg-primary/5 border-primary/20 backdrop-blur-md">
                    <CardContent className="p-4 py-3">
                        <div className="text-[10px] text-muted-foreground uppercase mb-1">Total in Scope</div>
                        <div className="text-xl font-bold flex items-center gap-2 text-game-diamond">
                            <Gem className="w-4 h-4" />
                            {formatCompactNumber(totalDiamonds)}
                        </div>
                    </CardContent>
                </Card>
                <Button variant="outline" onClick={loadRequests} disabled={loading} className="h-full rounded-2xl bg-white/5 border-white/10">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                </Button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 gap-1 shrink-0">
                    {['all', 'pending', 'approved', 'paid', 'rejected'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={cn(
                                "px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all",
                                filter === f ? "bg-primary text-black" : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {loading && requests.length === 0 ? (
                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-[10px] uppercase">Retrieving Requests...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                        <Clock className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-xs uppercase tracking-widest">No requests localized.</p>
                    </div>
                ) : (
                    filtered.map((req) => (
                        <Card key={req.id} className="bg-white/5 border-white/5 backdrop-blur-md overflow-hidden relative group">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2">
                                            <span className="text-[10px] font-mono opacity-40 break-all">#{req.id.slice(0, 8)}</span>
                                            <StatusBadge status={req.status} />
                                        </div>
                                        <div className="text-[10px] font-mono opacity-60 break-all">USR: {req.user_id}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-lg font-bold text-game-diamond flex items-center justify-end gap-1">
                                            {req.diamonds_submitted} <Gem className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="text-[9px] opacity-50">{new Date(req.requested_at).toLocaleString()}</div>
                                    </div>
                                </div>

                                {req.status === 'pending' && (
                                    <div className="pt-3 border-t border-white/5 flex flex-col sm:grid sm:grid-cols-2 gap-3">
                                        <Button
                                            size="sm"
                                            onClick={() => handleAction(req.id, 'approved')}
                                            className="bg-primary/20 text-primary hover:bg-primary/40 text-[10px] uppercase tracking-widest font-bold h-10 rounded-xl border border-primary/20 w-full"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5 mr-2" /> Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleAction(req.id, 'rejected')}
                                            className="text-red-500 hover:bg-red-500/10 text-[10px] uppercase tracking-widest font-bold h-10 rounded-xl border border-red-500/10 w-full"
                                        >
                                            <XCircle className="w-3.5 h-3.5 mr-2" /> Reject
                                        </Button>
                                    </div>
                                )}

                                {req.status === 'approved' && (
                                    <Button
                                        size="sm"
                                        onClick={() => handleAction(req.id, 'paid')}
                                        className="w-full bg-green-500/20 text-green-500 hover:bg-green-500/40 text-[10px] uppercase tracking-widest font-bold h-10 rounded-xl border border-green-500/20 mt-2"
                                    >
                                        <Wallet className="w-3.5 h-3.5 mr-2" /> Mark as Paid
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
        pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        approved: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        paid: "bg-green-500/10 text-green-500 border-green-500/20",
        rejected: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return (
        <div className={cn("text-[9px] px-2 py-0.5 rounded uppercase font-bold border", styles[status])}>
            {status}
        </div>
    );
};
