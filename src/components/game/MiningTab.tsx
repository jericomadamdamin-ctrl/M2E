import { Machine, GameConfig, MachineType } from '@/types/game';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Square, Droplet, Plus } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import miningMachineIcon from '@/assets/machines/mining-machine.png';
import heavyMachineIcon from '@/assets/machines/heavy-machine.png';
import lightMachineIcon from '@/assets/machines/light-machine.png';
import miniMachineIcon from '@/assets/machines/mini-machine.png';
import { formatCompactNumber } from '@/lib/format';

interface MiningTabProps {
  userMachines: Machine[];
  config: GameConfig;
  oilBalance: number;
  maxSlots: number;
  onFuel: (id: string, amount?: number) => void;
  onStart: (id: string) => void;
  onStop?: (id: string) => void;
  onUpgrade?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onBuySlots?: () => void;
}

// Deprecated: used as fallback
const DEFAULT_MACHINE_NAMES: Record<string, string> = {
  mini: 'Mini Machine',
  light: 'Light Machine',
  heavy: 'Heavy Machine',
  mega: 'Mega Machine',
};

const getMachineIcon = (type: string, config?: GameConfig) => {
  if (config?.machines[type]?.image_url) {
    // If it's a relative path starting with /, use origin. Otherwise assume full URL or require proper handling.
    // For now, assuming these are /assets/... paths or full URLs.
    return config.machines[type].image_url;
  }
  switch (type) {
    case 'mini':
      return miniMachineIcon;
    case 'heavy':
      return heavyMachineIcon;
    case 'light':
      return lightMachineIcon;
    default:
      return miningMachineIcon;
  }
};

const getMultiplier = (base: number, level: number, perLevel: number) => {
  return base * (1 + Math.max(0, level - 1) * perLevel);
};

export const MiningTab = ({
  userMachines,
  config,
  oilBalance,
  onFuel,
  onStart,
  onStop,
  onUpgrade,
  onDiscard,
  maxSlots,
  onBuySlots
}: MiningTabProps) => {
  const machineStats = useMemo(() => {
    return userMachines.map(machine => {
      const def = config.machines[machine.type];
      const speed = getMultiplier(def.speed_actions_per_hour, machine.level, config.progression.level_speed_multiplier);
      const burn = getMultiplier(def.oil_burn_per_hour, machine.level, config.progression.level_oil_burn_multiplier);
      const capacity = getMultiplier(def.tank_capacity, machine.level, config.progression.level_capacity_multiplier);
      return { machine, speed, burn, capacity };
    });
  }, [userMachines, config]);

  const atSlotLimit = userMachines.length >= maxSlots;
  const slotConfig = config.slots ?? { base_slots: 10, max_total_slots: 30, slot_pack_price_wld: 1, slot_pack_size: 5 };
  const canBuyMoreSlots = maxSlots < slotConfig.max_total_slots && onBuySlots;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-pixel text-xs text-primary text-glow">Your Machines</h2>
        <div className="flex items-center gap-2">
          {atSlotLimit && (
            <div className="flex items-center gap-1 bg-destructive/20 text-destructive px-2 py-1 rounded-full text-xs animate-pulse">
              <span>🔧</span>
              <span className="font-bold">{userMachines.length}/{maxSlots}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-secondary/50 px-3 py-1.5 rounded-full">
            <span className="text-game-oil">🛢️</span>
            <span className="text-sm font-bold tabular-nums max-w-[100px] truncate">{formatCompactNumber(Math.floor(oilBalance))}</span>
          </div>
        </div>
      </div>

      {atSlotLimit && (
        <div className="card-game rounded-xl p-3 border-2 border-destructive/50 bg-destructive/5 mb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-destructive">Slot Limit Reached!</p>
              <p className="text-[10px] text-muted-foreground">Expand capacity to mine more.</p>
            </div>
            {canBuyMoreSlots && (
              <Button onClick={onBuySlots} size="sm" className="h-8 text-xs glow-green shrink-0">
                <Plus className="w-3 h-3 mr-1" />
                Buy +{slotConfig.slot_pack_size} Slots
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Render Machines */}
      {machineStats.map(({ machine, speed, burn, capacity }) => {
        const fuelPercent = capacity > 0 ? Math.min(100, (machine.fuelOil / capacity) * 100) : 0;
        const canFuel = machine.fuelOil < capacity && oilBalance > 0;

        return (
          <div
            key={machine.id}
            className={`card-game rounded-xl p-4 ${machine.isActive ? 'glow-green' : ''}`}
          >
            <div className="flex gap-4">
              {/* Machine Icon & Status */}
              <div className="flex flex-col items-center">
                <div className={`relative w-12 h-12 flex items-center justify-center ${machine.isActive ? 'animate-mining' : ''}`}>
                  <img src={getMachineIcon(machine.type, config)} alt={machine.type} className="w-full h-full object-contain" />
                </div>
                <div className={`mt-2 px-2 py-0.5 rounded text-xs font-bold ${machine.isActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
                  }`}>
                  {machine.isActive ? 'MINING' : 'IDLE'}
                </div>
              </div>

              {/* Machine Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm truncate">{config.machines[machine.type]?.name || DEFAULT_MACHINE_NAMES[machine.type] || machine.type}</h3>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">
                    Lv.{machine.level}/{config.machines[machine.type].max_level}
                  </span>
                </div>

                {/* Fuel Progress */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Droplet className="w-3 h-3" /> Fuel
                    </span>
                    <span className="text-muted-foreground">
                      {machine.fuelOil.toFixed(1)} / {capacity.toFixed(1)} OIL
                    </span>
                  </div>
                  <Progress value={fuelPercent} className="h-2" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-secondary/30 rounded px-2 py-1">
                    <span className="text-muted-foreground">Speed:</span>
                    <span className="ml-1 text-primary font-bold">{speed.toFixed(1)}/hr</span>
                  </div>
                  <div className="bg-secondary/30 rounded px-2 py-1">
                    <span className="text-muted-foreground">Burn:</span>
                    <span className="ml-1 text-accent font-bold">{burn.toFixed(1)}/hr</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {machine.isActive ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-8 text-xs transition-transform active:scale-95"
                      onClick={() => onStop?.(machine.id)}
                    >
                      <Square className="w-3 h-3 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 h-8 text-xs glow-green transition-transform active:scale-95"
                      onClick={() => onStart(machine.id)}
                      disabled={machine.fuelOil <= 0}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Start
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs transition-transform active:scale-95"
                    onClick={() => onFuel(machine.id)}
                    disabled={!canFuel}
                  >
                    <Droplet className="w-3 h-3 mr-1" />
                    Fuel
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 text-xs border-accent text-accent hover:bg-accent/20 font-bold"
                    onClick={() => onUpgrade?.(machine.id)}
                    disabled={machine.level >= config.machines[machine.type].max_level}
                    title="Upgrade"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>

                  {/* Discard Button */}
                  {onDiscard && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 text-xs border-destructive text-destructive hover:bg-destructive/20"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to DISCARD this machine? You will NOT get any refund. This action cannot be undone.')) {
                          onDiscard(machine.id);
                        }
                      }}
                      title="Discard Machine (No Refund)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Render Empty Slot Skeletons */}
      {Array.from({ length: Math.max(0, maxSlots - userMachines.length) }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeletons based on length
          key={`empty-slot-${i}`}
          className="card-game rounded-xl p-4 border-dashed border-2 border-white/5 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
          onClick={onBuySlots}
        >
          <div className="flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center">
              <Plus className="w-6 h-6 text-white/20" />
            </div>
            <div className="flex-1">
              <div className="h-4 w-24 bg-white/10 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
            <div className="text-[10px] font-pixel text-primary/50 group-hover:text-primary transition-colors">
              +{slotConfig.slot_pack_size} SLOTS
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
