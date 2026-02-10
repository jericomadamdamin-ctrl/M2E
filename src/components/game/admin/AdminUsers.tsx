
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { fetchUsers, fetchTable } from '@/lib/backend';
import { Loader2, Search, RefreshCw, User, Droplets, Gem } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';

interface UserData {
    id: string;
    player_name: string;
    wallet_address: string;
    created_at: string;
    oil_balance: number;
    diamond_balance: number;
    machines_count?: number;
}

export const AdminUsers = ({ accessKey }: { accessKey?: string }) => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const loadUsers = async () => {
        if (!accessKey) return;
        setLoading(true);
        try {
            // Fetch profiles
            const profiles = await fetchUsers(accessKey) || [];

            // Fetch player state
            // We use generic fetchTable for this as established in backend.ts
            const playerStates = await fetchTable('player_state', accessKey) || [];

            // Join data
            const stateMap = new Map(playerStates.map((s: any) => [s.user_id, s]));

            const joinedData: UserData[] = (profiles as any[]).map((p: any) => {
                const state = stateMap.get(p.id) as any;
                return {
                    id: p.id,
                    player_name: p.player_name || 'Anonymous',
                    wallet_address: p.wallet_address || '',
                    created_at: p.created_at,
                    oil_balance: state?.oil_balance || 0,
                    diamond_balance: state?.diamond_balance || 0,
                };
            });

            // Sort by created_at desc by default
            joinedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setUsers(joinedData);

        } catch (err) {
            console.error("Failed to load users", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, [accessKey]);

    const filteredUsers = users.filter(user =>
        (user.player_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (user.wallet_address?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (user.id?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in px-1">
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search identity or wallet..."
                        className="pl-9 h-11 bg-white/5 border-white/10 rounded-xl text-xs focus:ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button
                    size="icon"
                    variant="outline"
                    onClick={loadUsers}
                    disabled={loading}
                    className="h-11 w-11 rounded-xl border-white/10 bg-white/5"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
            </div>

            <div className="space-y-4">
                {loading && users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-50">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="text-[10px] uppercase tracking-widest">Accessing records...</span>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <User className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                        <p className="text-xs text-muted-foreground font-medium">No identities localized.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredUsers.slice(0, 50).map((user) => (
                            <Card key={user.id} className="bg-white/5 border-white/5 backdrop-blur-md hover:border-primary/30 transition-all duration-300 group">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                                                <span className="font-pixel text-xs">{(user.player_name || '?').charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold truncate text-glow-sm">{user.player_name}</span>
                                                <span className="text-[9px] text-muted-foreground font-mono opacity-60 truncate">
                                                    ID: {user.id.slice(0, 12)}...
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-[9px] text-muted-foreground uppercase opacity-40 font-bold mb-1">Joined</div>
                                            <div className="text-[10px] font-mono">{new Date(user.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                            <div className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50 mb-1">Oil Reservoir</div>
                                            <div className="text-xs font-mono text-orange-500 flex items-center gap-1">
                                                <Droplets className="w-2.5 h-2.5" />
                                                {formatCompactNumber(user.oil_balance)}
                                            </div>
                                        </div>
                                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                            <div className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50 mb-1">Diamonds</div>
                                            <div className="text-xs font-mono text-game-diamond flex items-center gap-1">
                                                <Gem className="w-2.5 h-2.5" />
                                                {formatCompactNumber(user.diamond_balance)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                                            <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]">
                                                {user.wallet_address ? `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}` : 'WALLET_NOT_LINKED'}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-[9px] uppercase tracking-widest text-primary hover:bg-primary/10"
                                        >
                                            Inspect
                                        </Button>
                                    </div>
                                </CardContent>
                                {/* Bottom accent line */}
                                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <div className="py-8 flex flex-col items-center gap-2 opacity-30">
                <div className="h-[1px] w-12 bg-white/20" />
                <span className="text-[8px] uppercase tracking-[0.3em]">
                    Localized {filteredUsers.slice(0, 50).length} OF {filteredUsers.length} Records
                </span>
            </div>
        </div>
    );
};
