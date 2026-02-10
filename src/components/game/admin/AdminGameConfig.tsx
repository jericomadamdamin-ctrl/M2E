import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchTable, updateTableRow, updateGlobalSetting, updateConfig } from '@/lib/backend';
import { Settings, Loader2, Save } from 'lucide-react';
import { GameConfig } from '@/types/game';

interface AdminGameConfigProps {
    accessKey: string;
    config: GameConfig | null;
}

export const AdminGameConfig = ({ accessKey, config }: AdminGameConfigProps) => {
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Section 3: Machine Tiers Editor */}
            <MachineTiersEditor accessKey={accessKey} />

            {/* Section 4: Mineral Configs Editor */}
            <MineralConfigsEditor accessKey={accessKey} />

            {/* Section 5: Global Game Settings */}
            <GlobalSettings accessKey={accessKey} />

            {/* Config Editor */}
            {config && <ConfigEditor config={config} accessKey={accessKey} />}
        </div>
    );
};

const MachineTiersEditor = ({ accessKey }: { accessKey: string }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [tiers, setTiers] = useState<any[]>([]);

    const loadTiers = async () => {
        try {
            const data = await fetchTable('machine_tiers', accessKey);
            setTiers(data.sort((a: any, b: any) => a.cost_wld - b.cost_wld));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadTiers(); }, []);

    const handleUpdate = async (id: string, updates: any) => {
        setLoading(true);
        try {
            await updateTableRow('machine_tiers', id, updates, accessKey);
            toast({ title: 'Tier Updated', description: `Saved changes for ${id}`, className: 'glow-green' });
            await loadTiers();
        } catch (err: any) {
            toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                <Settings className="w-4 h-4" /> Machine Tiers (WLD Pricing)
            </h3>
            <div className="grid gap-4">
                {tiers.map((tier) => (
                    <Card key={tier.id} className="bg-secondary/20 border-border/50">
                        <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm font-bold capitalize">{tier.name || tier.id}</CardTitle>
                            <div className="text-[10px] text-muted-foreground font-mono uppercase">{tier.id}</div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground font-bold uppercase">WLD Cost</label>
                                    <Input
                                        type="number"
                                        defaultValue={tier.cost_wld}
                                        onBlur={(e) => handleUpdate(tier.id, { cost_wld: parseFloat(e.target.value) })}
                                        className="h-8 text-sm bg-black/40"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground font-bold uppercase">Speed (Actions/hr)</label>
                                    <Input
                                        type="number"
                                        defaultValue={tier.speed_actions_per_hour}
                                        onBlur={(e) => handleUpdate(tier.id, { speed_actions_per_hour: parseFloat(e.target.value) })}
                                        className="h-8 text-sm bg-black/40"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground font-bold uppercase">Fuel Burn/hr</label>
                                    <Input
                                        type="number"
                                        defaultValue={tier.oil_burn_per_hour}
                                        onBlur={(e) => handleUpdate(tier.id, { oil_burn_per_hour: parseFloat(e.target.value) })}
                                        className="h-8 text-sm bg-black/40"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground font-bold uppercase">Tank Capacity</label>
                                    <Input
                                        type="number"
                                        defaultValue={tier.tank_capacity}
                                        onBlur={(e) => handleUpdate(tier.id, { tank_capacity: parseFloat(e.target.value) })}
                                        className="h-8 text-sm bg-black/40"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const MineralConfigsEditor = ({ accessKey }: { accessKey: string }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [minerals, setMinerals] = useState<any[]>([]);

    const loadMinerals = async () => {
        try {
            const data = await fetchTable('mineral_configs', accessKey);
            setMinerals(data.sort((a: any, b: any) => a.oil_value - b.oil_value));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadMinerals(); }, []);

    const handleUpdate = async (id: string, updates: any) => {
        setLoading(true);
        try {
            await updateTableRow('mineral_configs', id, updates, accessKey);
            toast({ title: 'Mineral Updated', description: `Saved changes for ${id}`, className: 'glow-green' });
            await loadMinerals();
        } catch (err: any) {
            toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                <Settings className="w-4 h-4" /> Mineral Rewards & Rates
            </h3>
            <div className="grid grid-cols-2 gap-3">
                {minerals.map((m) => (
                    <Card key={m.id} className="bg-secondary/20 border-border/50">
                        <CardHeader className="p-3 pb-0">
                            <CardTitle className="text-[10px] font-bold uppercase opacity-60 tracking-widest">{m.name || m.id}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 space-y-2">
                            <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase italic">OIL Value</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    defaultValue={m.oil_value}
                                    onBlur={(e) => handleUpdate(m.id, { oil_value: parseFloat(e.target.value) })}
                                    className="h-7 text-xs bg-black/40 border-primary/20"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase italic">Drop Rate (0-1)</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    defaultValue={m.drop_rate}
                                    onBlur={(e) => handleUpdate(m.id, { drop_rate: parseFloat(e.target.value) })}
                                    className="h-7 text-xs bg-black/40 border-primary/20"
                                />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const GlobalSettings = ({ accessKey }: { accessKey: string }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<any[]>([]);

    const loadSettings = async () => {
        try {
            const data = await fetchTable('global_game_settings', accessKey);
            setSettings(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { loadSettings(); }, []);

    const handleUpdate = async (key: string, value: number) => {
        setLoading(true);
        try {
            await updateGlobalSetting(key, value, accessKey);
            toast({ title: 'Setting Updated', description: `${key} saved.`, className: 'glow-green' });
            await loadSettings();
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

    return (
        <div className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                <Settings className="w-4 h-4" /> Global Economy Rules
            </h3>
            <Card className="bg-secondary/20 border-border/50 overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-black/20">
                    <CardTitle className="text-sm text-primary uppercase tracking-wider">Dynamic Multipliers</CardTitle>
                    <CardDescription className="text-[10px]">Changes take effect for all players immediately.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid gap-3">
                        {settings.map((s) => (
                            <div key={s.key} className="flex items-center justify-between gap-4 p-2 rounded bg-black/10 border border-white/5">
                                <div className="flex-1">
                                    <div className="text-[10px] font-bold uppercase text-muted-foreground">{s.key.replace(/_/g, ' ')}</div>
                                    <div className="text-[9px] opacity-40 italic">{s.description}</div>
                                </div>
                                <div className="w-24">
                                    <Input
                                        type="number"
                                        step="0.001"
                                        defaultValue={s.value}
                                        onBlur={(e) => handleUpdate(s.key, parseFloat(e.target.value))}
                                        className="h-7 text-xs bg-black/40 border-primary/10 text-right font-mono"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

        </div>
    );
};

const ConfigEditor = ({ config, accessKey }: { config: GameConfig, accessKey: string }) => {
    const { toast } = useToast();
    const [oilPerWld, setOilPerWld] = useState(config?.pricing.oil_per_wld || 0);
    const [oilPerUsdc, setOilPerUsdc] = useState(config?.pricing.oil_per_usdc || 0);
    const [diamondDrop, setDiamondDrop] = useState(config?.mining.action_rewards.diamond.drop_rate_per_action || 0);
    const [dailyDiamondCap, setDailyDiamondCap] = useState(config?.diamond_controls.daily_cap_per_user || 0);
    const [treasuryPct, setTreasuryPct] = useState(config?.treasury.payout_percentage || 0);
    const [cashoutCooldown, setCashoutCooldown] = useState(config?.cashout.cooldown_days || 0);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!config) return;
        setOilPerWld(config.pricing.oil_per_wld);
        setOilPerUsdc(config.pricing.oil_per_usdc);
        setDiamondDrop(config.mining.action_rewards.diamond.drop_rate_per_action);
        setDailyDiamondCap(config.diamond_controls.daily_cap_per_user);
        setTreasuryPct(config.treasury.payout_percentage);
        setCashoutCooldown(config.cashout.cooldown_days);
    }, [config]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateConfig({
                'pricing.oil_per_wld': oilPerWld,
                'pricing.oil_per_usdc': oilPerUsdc,
                'mining.action_rewards.diamond.drop_rate_per_action': diamondDrop,
                'diamond_controls.daily_cap_per_user': dailyDiamondCap,
                'treasury.payout_percentage': treasuryPct,
                'cashout.cooldown_days': cashoutCooldown,
            });
            toast({ title: 'Config updated', description: 'Live pricing and controls saved.' });
        } catch (err) {
            toast({
                title: 'Update failed',
                description: err instanceof Error ? err.message : 'Unable to save admin settings',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                <Settings className="w-4 h-4" /> Live Game Config
            </h3>
            <Card className="bg-secondary/20 border-border/50">
                <CardHeader className="p-4 pb-2 bg-black/20">
                    <CardTitle className="text-sm text-primary uppercase tracking-wider">Base Configuration</CardTitle>
                    <CardDescription className="text-[10px]">Updates `game_config` json blob (cached)</CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">OIL per WLD</label>
                            <Input type="number" value={oilPerWld} onChange={(e) => setOilPerWld(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">OIL per USDC</label>
                            <Input type="number" value={oilPerUsdc} onChange={(e) => setOilPerUsdc(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">Diamond Drop Rate</label>
                            <Input type="number" step="0.001" value={diamondDrop} onChange={(e) => setDiamondDrop(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">Daily Diamond Cap</label>
                            <Input type="number" value={dailyDiamondCap} onChange={(e) => setDailyDiamondCap(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">Treasury %</label>
                            <Input type="number" step="0.01" value={treasuryPct} onChange={(e) => setTreasuryPct(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground font-bold uppercase">Cashout Cooldown (Days)</label>
                            <Input type="number" value={cashoutCooldown} onChange={(e) => setCashoutCooldown(Number(e.target.value))} className="h-8 text-sm bg-black/40" />
                        </div>
                    </div>
                    <Button className="w-full glow-green mt-4" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Live Config
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
