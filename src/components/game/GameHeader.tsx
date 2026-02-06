import { Machine, PlayerState } from '@/types/game';
import { Pickaxe } from 'lucide-react';

interface GameHeaderProps {
  player: PlayerState;
  machines?: Machine[];
}

export const GameHeader = ({ player, machines = [] }: GameHeaderProps) => {
  const runningMachines = machines.filter(m => m.isActive).length;

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-b from-background via-background to-transparent pb-4">
      <div className="flex items-center justify-between py-3 px-1">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center glow-green">
            <Pickaxe className="w-6 h-6 text-primary animate-mining" />
          </div>
          <div>
            <h1 className="font-pixel text-xs text-primary text-glow leading-tight">
              MINE TO
            </h1>
            <h1 className="font-pixel text-xs text-accent leading-tight">
              EARN
            </h1>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-secondary/50 px-2.5 py-1.5 rounded-lg text-xs">
            <span>🛢️</span>
            <span className="font-bold">{Math.floor(player.oilBalance)}</span>
          </div>
          <div className="flex items-center gap-1 bg-game-diamond/10 px-2.5 py-1.5 rounded-lg text-xs">
            <span>💎</span>
            <span className="font-bold text-game-diamond">{player.diamondBalance.toFixed(2)}</span>
          </div>
          {runningMachines > 0 && (
            <div className="flex items-center gap-1 bg-primary/20 px-2.5 py-1.5 rounded-lg text-xs animate-pulse-glow">
              <span>⚡</span>
              <span className="font-bold text-primary">{runningMachines}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
