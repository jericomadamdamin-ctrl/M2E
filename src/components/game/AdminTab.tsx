import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { fetchAdminStats } from '@/lib/backend';
import { Loader2, AlertTriangle, Lock, LayoutDashboard, Settings, User, CreditCard, Activity } from 'lucide-react';
import { GameConfig } from '@/types/game';
import { AdminStats } from '@/types/admin';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminGameConfig } from './admin/AdminGameConfig';
import { AdminUsers } from './admin/AdminUsers';
import { AdminFinancials } from './admin/AdminFinancials';

interface AdminTabProps {
    config: GameConfig | null;
}

const isMiniKitEnviroment = () => {
    return typeof window !== 'undefined' && (window as any).MiniKit?.isInstalled();
};

export const AdminTab = ({ config }: AdminTabProps) => {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(false);
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
                description: `Error: ${err.message}. Ensure your key matches the backend secret.`,
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

    if (!isMiniKitEnviroment() && process.env.NODE_ENV === 'production') {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 animate-fade-in min-h-[50vh] text-center">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
                <h2 className="font-pixel text-xl text-primary text-glow">Security Restriction</h2>
                <p className="text-muted-foreground max-w-xs">
                    The Game Master dashboard can only be accessed from within the World App (MiniKit).
                </p>
                <div className="text-[10px] opacity-30 mt-8 font-mono">
                    ENV_RESTRICTION: MINIKIT_ONLY
                </div>
            </div>
        );
    }

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

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            <div className="relative flex items-center justify-center mb-6">
                <h2 className="font-pixel text-2xl text-primary text-glow text-center">Game Master Dashboard</h2>
                <div className="absolute right-0">
                    <Button size="sm" variant="outline" onClick={loadStats} disabled={loading}>
                        Refresh
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8 bg-black/40">
                    <TabsTrigger value="dashboard"><LayoutDashboard className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Overview</span></TabsTrigger>
                    <TabsTrigger value="users"><User className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Users</span></TabsTrigger>
                    <TabsTrigger value="financials"><CreditCard className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Financials</span></TabsTrigger>
                    <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">Config</span></TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard">
                    <AdminDashboard stats={stats} />
                </TabsContent>

                <TabsContent value="users">
                    <AdminUsers accessKey={accessKey} />
                </TabsContent>

                <TabsContent value="financials">
                    <AdminFinancials stats={stats} accessKey={accessKey} onRefresh={loadStats} />
                </TabsContent>

                <TabsContent value="config">
                    <AdminGameConfig accessKey={accessKey} config={config} />
                </TabsContent>
            </Tabs>
        </div>
    );
};
