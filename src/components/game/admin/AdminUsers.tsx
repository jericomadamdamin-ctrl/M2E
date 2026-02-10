
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { fetchUsers, fetchTable } from '@/lib/backend';
import { Loader2, Search, RefreshCw, User } from 'lucide-react';
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

            const joinedData: UserData[] = (profiles as any[]).map((p: any) => ({
                id: p.id,
                player_name: p.player_name || 'Anonymous',
                wallet_address: p.wallet_address || '',
                created_at: p.created_at,
                oil_balance: stateMap.get(p.id)?.oil_balance || 0,
                diamond_balance: stateMap.get(p.id)?.diamond_balance || 0,
            }));

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
        <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search users..."
                        className="pl-9 h-9 bg-secondary/20 border-border/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button size="sm" variant="outline" onClick={loadUsers} disabled={loading} className="h-9">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
            </div>

            <Card className="bg-secondary/10 border-border/50">
                <CardContent className="p-0">
                    <div className="rounded-md border border-border/50 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-secondary/20">
                                <TableRow>
                                    <TableHead className="w-[100px]">Joined</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Wallet</TableHead>
                                    <TableHead className="text-right">Oil</TableHead>
                                    <TableHead className="text-right">Diamonds</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No users found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.slice(0, 50).map((user) => (
                                        <TableRow key={user.id} className="hover:bg-secondary/20 border-border/50">
                                            <TableCell className="text-xs text-muted-foreground font-mono">
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                                        {(user.player_name || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{user.player_name}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono opacity-50">{user.id.slice(0, 8)}...</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {user.wallet_address ? (
                                                    <span title={user.wallet_address}>{user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}</span>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatCompactNumber(user.oil_balance)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-game-diamond">
                                                {formatCompactNumber(user.diamond_balance)} 💎
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-2 text-xs text-center text-muted-foreground bg-secondary/20 border-t border-border/50">
                        Showing {filteredUsers.slice(0, 50).length} of {filteredUsers.length} users
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
