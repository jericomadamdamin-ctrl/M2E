import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminStats } from '@/types/admin';
import { Users, Droplets, Gem, Layers, Clock } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';

interface AdminDashboardProps {
    stats: AdminStats | null;
}

export const AdminDashboard = ({ stats }: AdminDashboardProps) => {
    return (
        <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold">{formatCompactNumber(stats?.total_users || 0)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Oil</CardTitle>
                        <Droplets className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-orange-500">{formatCompactNumber(stats?.total_oil || 0)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Diamonds</CardTitle>
                        <Gem className="h-4 w-4 text-cyan-400" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-cyan-400">{formatCompactNumber(stats?.total_diamonds || 0)}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Open Rounds</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold">{stats?.open_rounds?.length || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-border/50">
                    <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Execution</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-yellow-500">{stats?.execution_rounds?.length || 0}</div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
