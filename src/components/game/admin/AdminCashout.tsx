import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchTable, updateTableRow } from '@/lib/backend';
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock, Wallet, Gem, Filter } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AdminPagination, paginate } from './AdminPagination';

export const AdminCashout = ({ accessKey }: { accessKey: string }) => {
    const { toast } = useToast();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('pending');
    const [currentPage, setCurrentPage] = useState(1);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await fetchTable('cashout_requests', accessKey);
            setRequests(data.sort((a: any, b: any) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()));
        } catch (err: any) {
            toast({ title: 'Fetch Failed', description: err.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadRequests(); }, [accessKey]);

    // Reset to page 1 on filter change
    useEffect(() => { setCurrentPage(1); }, [filter]);

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
    const paginatedItems = paginate(filtered, currentPage);

    return (
        <div className="space-y-4 animate-fade-in px-1 pb-6">
            {/* Summary + Refresh */}
            <div className="flex items-center gap-3">
                <Card className="flex-1 bg-primary/5 border-primary/20 backdrop-blur-md">
                    <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-game-diamond shrink-0">
                            <Gem className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Scope Total</div>
                            <div className="text-lg font-bold text-game-diamond leading-tight">{formatCompactNumber(totalDiamonds)}</div>
                        </div>
                        <div className="ml-auto text-right">
                            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Requests</div>
                            <div className="text-sm font-bold font-mono leading-tight">{filtered.length}</div>
                        </div>
                    </CardContent>
                </Card>
                <Button
                    size="icon"
                    variant="outline"
                    onClick={loadRequests}
                    disabled={loading}
                    className="h-[60px] w-11 rounded-2xl bg-white/5 border-white/10 shrink-0"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 gap-0.5 shrink-0">
                    {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                filter === f ? "bg-primary text-black" : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Request List */}
            <div className="space-y-3">
                {loading && requests.length === 0 ? (
                    <div className="text-center py-20 opacity-30 flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-[10px] uppercase">Retrieving Requests...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10 opacity-50">
                        <Clock className="w-7 h-7 mx-auto mb-2" />
                        <p className="text-[10px] uppercase tracking-widest">No {filter === 'all' ? '' : filter} requests found</p>
                    </div>
                ) : (
                    <>
                        {paginatedItems.map((req) => (
                            <Card key={req.id} className="bg-white/5 border-white/5 backdrop-blur-md overflow-hidden relative group">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex items-center flex-wrap gap-1.5">
                                                <span className="text-[9px] font-mono opacity-40 break-all">#{req.id.slice(0, 8)}</span>
                                                <StatusBadge status={req.status} />
                                            </div>
                                            <div className="text-[9px] font-mono opacity-50 truncate">USR: {req.user_id}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-base font-bold text-game-diamond flex items-center justify-end gap-1">
                                                {formatCompactNumber(req.diamonds_submitted)} <Gem className="w-3 h-3" />
                                            </div>
                                            <div className="text-[8px] opacity-40">{new Date(req.requested_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>

                                    {req.status === 'pending' && (
                                        <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleAction(req.id, 'approved')}
                                                className="bg-primary/20 text-primary hover:bg-primary/40 text-[9px] uppercase tracking-widest font-bold h-9 rounded-xl border border-primary/20 w-full"
                                            >
                                                <CheckCircle className="w-3 h-3 mr-1.5" /> Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleAction(req.id, 'rejected')}
                                                className="text-red-500 hover:bg-red-500/10 text-[9px] uppercase tracking-widest font-bold h-9 rounded-xl border border-red-500/10 w-full"
                                            >
                                                <XCircle className="w-3 h-3 mr-1.5" /> Reject
                                            </Button>
                                        </div>
                                    )}

                                    {req.status === 'approved' && (
                                        <Button
                                            size="sm"
                                            onClick={() => handleAction(req.id, 'paid')}
                                            className="w-full bg-green-500/20 text-green-500 hover:bg-green-500/40 text-[9px] uppercase tracking-widest font-bold h-9 rounded-xl border border-green-500/20 mt-1"
                                        >
                                            <Wallet className="w-3 h-3 mr-1.5" /> Mark as Paid
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}

                        <AdminPagination
                            currentPage={currentPage}
                            totalItems={filtered.length}
                            onPageChange={setCurrentPage}
                            label={`${filtered.length} request${filtered.length !== 1 ? 's' : ''}`}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
        pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        approved: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        paid: "bg-green-500/10 text-green-500 border-green-500/20",
        rejected: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return (
        <div className={cn("text-[8px] px-1.5 py-0.5 rounded uppercase font-bold border leading-tight", styles[status] || '')}>
            {status}
        </div>
    );
};
