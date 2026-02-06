import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { requestCashout } from '@/lib/backend';

interface CashoutTabProps {
  diamonds: number;
  minRequired: number;
  cooldownDays: number;
}

export const CashoutTab = ({ diamonds, minRequired, cooldownDays }: CashoutTabProps) => {
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
        <div className="text-xs text-muted-foreground">Cooldown: {cooldownDays} days</div>
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
          max={diamonds}
          onChange={(e) => setAmount(Number(e.target.value))}
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

      <div className="text-xs text-muted-foreground text-center">
        Diamonds represent claim power only. Payouts depend on community revenue and are not guaranteed.
      </div>
    </div>
  );
};
