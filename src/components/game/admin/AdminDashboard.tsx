import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminStats } from '@/types/admin';
import { Users, Droplets, Gem, Layers, Clock, TrendingUp } from 'lucide-react';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface AdminDashboardProps {
    stats: AdminStats | null;
}

export const AdminDashboard = ({ stats }: AdminDashboardProps) => {
    return (
        <div className="space-y-6 animate-fade-in px-1">
            <div className="grid grid-cols-2 gap-4">
                <StatCard
                    title="Total Players"
                    value={formatCompactNumber(stats?.total_users || 0)}
                    icon={<Users className="w-4 h-4" />}
                    color="primary"
                />
                <StatCard
                    title="Global Oil"
                    value={formatCompactNumber(stats?.total_oil || 0)}
                    icon={<Droplets className="w-4 h-4" />}
                    color="orange"
                />
                <StatCard
                    title="Diamond Supply"
                    value={formatCompactNumber(stats?.total_diamonds || 0)}
                    icon={<Gem className="w-4 h-4" />}
                    color="cyan"
                    className="col-span-2"
                />
            </div>

            <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-1">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Network Activity</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Card className="bg-white/5 border-white/5 backdrop-blur-sm">
                        <CardContent className="p-4 py-3">
                            <div className="text-[10px] text-muted-foreground uppercase mb-1">Open Rounds</div>
                            <div className="text-xl font-bold flex items-center gap-2">
                                <Layers className="w-4 h-4 text-primary/50" />
                                {stats?.open_rounds?.length || 0}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/5 border-white/5 backdrop-blur-sm">
                        <CardContent className="p-4 py-3">
                            <div className="text-[10px] text-muted-foreground uppercase mb-1">Execution</div>
                            <div className="text-xl font-bold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-yellow-500/50" />
                                {stats?.execution_rounds?.length || 0}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: 'primary' | 'orange' | 'cyan';
    className?: string;
}

const StatCard = ({ title, value, icon, color, className }: StatCardProps) => {
    const colorClasses = {
        primary: "text-primary border-primary/20 bg-primary/5 shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]",
        orange: "text-orange-500 border-orange-500/20 bg-orange-500/5 shadow-[0_0_20px_rgba(249,115,22,0.05)]",
        cyan: "text-cyan-400 border-cyan-400/20 bg-cyan-400/5 shadow-[0_0_20px_rgba(34,211,238,0.05)]",
    };

    return (
        <Card className={cn("overflow-hidden border group backdrop-blur-md", colorClasses[color], className)}>
            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                {icon}
            </div>
            <CardHeader className="p-4 pb-0">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1">
                <div className="text-3xl font-bold tracking-tight">{value}</div>
            </CardContent>
            {/* Gloss effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        </Card>
    );
};
