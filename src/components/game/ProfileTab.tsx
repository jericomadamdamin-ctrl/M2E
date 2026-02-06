import { Machine, PlayerState, MINERAL_LABELS, MineralType, GameConfig } from '@/types/game';
import { Settings, Gem, User, Shield } from 'lucide-react';
import { MineralIcon } from './MineralIcon';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateConfig } from '@/lib/backend';
import { useToast } from '@/hooks/use-toast';

interface ProfileTabProps {
  player: PlayerState;
  machines: Machine[];
  config: GameConfig | null;
  isAdmin: boolean;
  playerName: string;
}

export const ProfileTab = ({ player, machines, config, isAdmin, playerName }: ProfileTabProps) => {
  const totalMinerals = Object.values(player.minerals).reduce((a, b) => a + b, 0);
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
    if (!isAdmin) return;
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
    <div className="space-y-4 pb-4">
      {/* Profile Header */}
      <div className="card-game rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center glow-green">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg">{playerName}</h2>
            <p className="text-muted-foreground text-xs">
              {machines.length} machine{machines.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Token Balances */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-game rounded-xl p-4 text-center">
          <div className="text-3xl mb-2">🛢️</div>
          <div className="font-bold text-xl text-game-oil">{Math.floor(player.oilBalance)}</div>
          <div className="text-xs text-muted-foreground">OIL Credits</div>
        </div>
        <div className="card-game rounded-xl p-4 text-center glow-diamond">
          <div className="text-3xl mb-2">💎</div>
          <div className="font-bold text-xl text-game-diamond">{player.diamondBalance.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Diamonds (Claim Power)</div>
        </div>
      </div>

      {/* Minerals */}
      <div className="card-game rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gem className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Mineral Collection</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Total: {totalMinerals.toFixed(0)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(player.minerals) as MineralType[]).map(mineral => (
            <div key={mineral} className="text-center">
              <MineralIcon icon={mineral} size="md" className="mb-1 mx-auto" />
              <div className="text-xs font-bold">
                {Math.floor(player.minerals[mineral])}
              </div>
              <div className="text-[10px] text-muted-foreground">{MINERAL_LABELS[mineral]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mining Setup */}
      <div className="card-game rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Mining Setup</span>
        </div>
        {machines.length > 0 ? (
          <div className="space-y-2">
            {machines.map(machine => (
              <div
                key={machine.id}
                className={`flex items-center gap-3 bg-secondary/30 rounded-lg p-2 ${machine.isActive ? 'border border-primary/30' : ''
                  }`}
              >
                <span className="text-2xl">⛏️</span>
                <div className="flex-1">
                  <div className="text-sm font-bold capitalize">{machine.type}</div>
                  <div className="text-xs text-muted-foreground">
                    Level {machine.level}
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-xs font-bold ${machine.isActive
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                  {machine.isActive ? 'ACTIVE' : 'IDLE'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs text-center py-4">
            No machines yet. Visit the Shop!
          </p>
        )}
      </div>

      {/* Admin Controls */}
      {isAdmin && config && (
        <div className="card-game rounded-xl p-4 border border-accent/40">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-accent" />
            <span className="font-bold text-sm text-accent">Admin Controls</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">OIL per WLD</label>
              <Input type="number" value={oilPerWld} onChange={(e) => setOilPerWld(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">OIL per USDC</label>
              <Input type="number" value={oilPerUsdc} onChange={(e) => setOilPerUsdc(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Diamond Drop Rate (per action)</label>
              <Input type="number" step="0.001" value={diamondDrop} onChange={(e) => setDiamondDrop(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Daily Diamond Cap</label>
              <Input type="number" value={dailyDiamondCap} onChange={(e) => setDailyDiamondCap(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Treasury Payout %</label>
              <Input type="number" step="0.01" value={treasuryPct} onChange={(e) => setTreasuryPct(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cashout Cooldown (days)</label>
              <Input type="number" value={cashoutCooldown} onChange={(e) => setCashoutCooldown(Number(e.target.value))} />
            </div>

            <Button className="w-full glow-green" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Admin Settings'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
