import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Shield } from 'lucide-react';
import { MiniKit, VerificationLevel, type ISuccessResult } from '@worldcoin/minikit-js';
import { supabase } from '@/integrations/supabase/client';
import { getSession, getSessionToken } from '@/lib/session';
import { ensureMiniKit, getMiniKitErrorMessage } from '@/lib/minikit';

interface HumanGateProps {
  onVerified: () => void;
}

export const HumanGate = ({ onVerified }: HumanGateProps) => {
  const { toast } = useToast();

  const handleVerify = async () => {
    try {
      const miniKit = ensureMiniKit();
      if (!miniKit.ok) {
        toast({
          title: 'World App required',
          description: getMiniKitErrorMessage(miniKit.reason),
          variant: 'destructive',
        });
        return;
      }

      const action =
        import.meta.env.VITE_WORLD_ID_ACTION_VERIFY ||
        import.meta.env.NEXT_PUBLIC_ACTION_VERIFY ||
        'verify-human';

      const session = getSession();
      const signal = session?.userId;

      const requestedLevel = import.meta.env.VITE_WORLD_ID_LEVEL?.toLowerCase();
      const verificationLevel =
        requestedLevel === 'orb'
          ? VerificationLevel.Orb
          : requestedLevel === 'device'
            ? VerificationLevel.Device
            : undefined;

      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action,
        signal,
        ...(verificationLevel ? { verification_level: verificationLevel } : {}),
      });

      if (finalPayload.status !== 'success') {
        throw new Error('Verification cancelled');
      }

      await supabase.functions.invoke('worldid-verify', {
        headers: { Authorization: `Bearer ${getSessionToken()}` },
        body: { payload: finalPayload as ISuccessResult, action, signal },
      });

      toast({
        title: 'Verification complete',
        description: 'You are verified to play.',
      });
      onVerified();
    } catch (err) {
      toast({
        title: 'Verification failed',
        description: err instanceof Error ? err.message : 'Unable to verify',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-game rounded-xl p-6 text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <h2 className="font-bold text-lg">Human Verification Required</h2>
        <p className="text-sm text-muted-foreground">
          This game is only for verified humans. Please verify with World ID to continue.
        </p>
        <Button
          className="w-full glow-green"
          onClick={handleVerify}
        >
          Verify with World ID
        </Button>
      </div>
    </div>
  );
};
