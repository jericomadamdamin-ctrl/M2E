import { Trophy } from 'lucide-react';

interface LeaderboardTabProps {
  currentUserId: string;
}

export const LeaderboardTab = ({ currentUserId }: LeaderboardTabProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
        <Trophy className="w-20 h-20 text-game-gold relative z-10 animate-float" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="font-pixel text-2xl text-primary text-glow">
          Leaderboard
        </h2>
        <div className="font-pixel text-sm text-muted-foreground tracking-widest uppercase">
          Coming Soon
        </div>
      </div>

      <div className="card-game rounded-xl p-6 text-center max-w-[280px]">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Prepare your mining empire! Global rankings and seasonal rewards are being forged in the depths.
        </p>
      </div>
    </div>
  );
};