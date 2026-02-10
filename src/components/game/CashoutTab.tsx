import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { requestCashout } from '@/lib/backend';

interface CashoutTabProps {
  diamonds: number;
  minRequired: number;
  cooldownDays: number;
  lastCashout?: string;
}

const CashoutTimer = ({ lastCashout, cooldownDays }: { lastCashout?: string, cooldownDays: number }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [inCooldown, setInCooldown] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      if (!lastCashout) {
        setInCooldown(false);
        return;
      }

      const lastCashoutTime = new Date(lastCashout).getTime();
      const now = Date.now();
      const nextCashoutTime = lastCashoutTime + (cooldownDays * 24 * 60 * 60 * 1000);
      const diff = nextCashoutTime - now;

      if (diff <= 0) {
        setInCooldown(false);
        setTimeLeft('');
      } else {
        setInCooldown(true);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute is enough for days
    return () => clearInterval(interval);
  }, [lastCashout, cooldownDays]);

  if (!inCooldown) return null;

  return (
    <div className="text-xs text-destructive font-bold bg-destructive/10 px-2 py-1 rounded animate-pulse">
      Cooldown: {timeLeft}
    </div>
  );
};

export const CashoutTab = ({ diamonds, minRequired, cooldownDays, lastCashout }: CashoutTabProps) => {
  const [amount, setAmount] = useState<number>(minRequired);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const canRequest = diamonds >= minRequired && amount > 0 && amount <= diamonds;

  const handleSubmit = async () => {
    if (!canRequest) return;
    setLoading(true);
    try {
      await requestCashout(amount);
      toast({
        title: 'Cashout requested',
        description: 'Your request is queued for the next payout round.',
      });
    } catch (err) {
      toast({
        title: 'Cashout failed',
        description: err instanceof Error ? err.message : 'Unable to request cashout',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-pixel text-xs text-primary text-glow">Cashout</h2>
        <div className="flex items-center gap-2">
          <CashoutTimer lastCashout={lastCashout} cooldownDays={cooldownDays} />
          {!lastCashout && <div className="text-xs text-muted-foreground">Cooldown: {cooldownDays} days</div>}
        </div>
      </div>

      <div className="card-game rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Your Diamonds</div>
            <div className="text-2xl font-bold text-game-diamond">{diamonds.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Min Required</div>
            <div className="text-sm font-bold">{minRequired}</div>
          </div>
        </div>
      </div>

      <div className="card-game rounded-xl p-4 space-y-3">
        <div className="text-sm font-bold">Request Payout</div>
        <Input
          type="number"
          value={amount}
          min={minRequired}
          max={Math.min(diamonds, 1000000)}
          onChange={(e) => {
            const val = Math.floor(Number(e.target.value));
            if (val > 1000000) return;
            setAmount(val);
          }}
          className="bg-secondary/50"
        />
        <Button
          className="w-full glow-green"
          disabled={!canRequest || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Submitting...' : 'Submit Cashout Request'}
        </Button>
        {!canRequest && (
          <p className="text-xs text-muted-foreground">
            You need at least {minRequired} diamonds to request a cashout.
          </p>
        )}
      </div>
    </div>
  );
};
