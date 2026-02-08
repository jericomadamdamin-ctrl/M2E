import { GameConfig, Machine, MachineType } from '@/types/game';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Zap, Clock, Droplet } from 'lucide-react';
import miningMachineIcon from '@/assets/machines/mining-machine.png';
import heavyMachineIcon from '@/assets/machines/heavy-machine.png';
import lightMachineIcon from '@/assets/machines/light-machine.png';
import miniMachineIcon from '@/assets/machines/mini-machine.png';
import { formatCompactNumber } from '@/lib/format';

const getMachineIcon = (type: MachineType) => {
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

interface ShopTabProps {
  config: GameConfig;
  oilBalance: number;
  machines: Machine[];
  onBuy: (type: MachineType) => void;
}

export const ShopTab = ({ config, oilBalance, machines, onBuy }: ShopTabProps) => {
  const getMachineCount = (type: MachineType) => {
    return machines.filter(m => m.type === type).length;
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-pixel text-xs text-primary text-glow">Machine Shop</h2>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-full text-xs">
            <span>🛢️</span>
            <span className="font-bold tabular-nums">{formatCompactNumber(Math.floor(oilBalance))}</span>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs px-1">
        Purchase mining machines to start earning minerals.
      </p>

      <div className="grid gap-4">
        {(Object.keys(config.machines) as MachineType[])
          .sort((a, b) => config.machines[a].cost_oil - config.machines[b].cost_oil)
          .map(type => {
            const template = config.machines[type];
            const owned = getMachineCount(type);
            const canAfford = oilBalance >= template.cost_oil;

            return (
              <div
                key={type}
                className={`card-game rounded-xl p-4 transition-all duration-300 ${canAfford ? 'hover:glow-green' : 'opacity-60'
                  }`}
              >
                <div className="flex gap-4">
                  {/* Machine Icon */}
                  <div className="flex flex-col items-center justify-center">
                    <img src={getMachineIcon(type)} alt={type} className="w-12 h-12 animate-float" />
                    {owned > 0 && (
                      <span className="mt-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                        Owned: {owned}
                      </span>
                    )}
                  </div>

                  {/* Machine Details */}
                  <div className="flex-1">
                    <h3 className="font-bold mb-1 capitalize">{type} machine</h3>
                    <p className="text-muted-foreground text-xs mb-3">
                      Speed, fuel burn, and capacity scale with upgrades.
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="flex items-center gap-1 text-xs bg-secondary/30 rounded px-2 py-1.5">
                        <Zap className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">Speed:</span>
                        <span className="font-bold text-primary ml-auto">{template.speed_actions_per_hour}/hr</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs bg-secondary/30 rounded px-2 py-1.5">
                        <Clock className="w-3 h-3 text-accent" />
                        <span className="text-muted-foreground">Burn:</span>
                        <span className="font-bold text-accent ml-auto">{template.oil_burn_per_hour}/hr</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs bg-secondary/30 rounded px-2 py-1.5">
                        <Droplet className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">Tank:</span>
                        <span className="font-bold text-primary ml-auto">{template.tank_capacity}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs bg-secondary/30 rounded px-2 py-1.5">
                        <span className="text-muted-foreground">Max Lv:</span>
                        <span className="font-bold text-accent ml-auto">{template.max_level}</span>
                      </div>
                    </div>

                    {/* Price & Buy Button */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-game-oil text-lg">🛢️</span>
                        <span className={`font-bold text-lg ${canAfford ? 'text-primary' : 'text-destructive'}`}>
                          {template.cost_oil.toLocaleString()}
                        </span>
                      </div>
                      <Button
                        onClick={() => onBuy(type)}
                        disabled={!canAfford}
                        className={`${canAfford ? 'glow-green' : ''}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Buy Now
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
