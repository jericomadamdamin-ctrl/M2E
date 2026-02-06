import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Globe } from 'lucide-react';
import miningBg from '@/assets/mining-bg.jpg';
import { MiniKit } from '@worldcoin/minikit-js';
import { completeWalletAuth, getAuthNonce } from '@/lib/backend';
import { useSession } from '@/hooks/useSession';

const Auth = () => {
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setSession } = useSession();

  const handleWalletAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!MiniKit.isInstalled()) {
      toast({
        title: 'World App required',
        description: 'Open this mini app inside World App to sign in.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { nonce } = await getAuthNonce();

      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce,
        statement: 'Sign in to Mine to Earn',
      });

      if (finalPayload.status !== 'success') {
        throw new Error('Wallet auth cancelled');
      }

      let username: string | undefined;
      try {
        const user = await MiniKit.getUserByAddress(finalPayload.address);
        username = user?.username;
      } catch {
        // optional
      }

      const result = await completeWalletAuth(finalPayload, nonce, playerName.trim() || undefined, username);

      setSession({
        token: result.session.token,
        userId: result.session.user_id,
        playerName: result.session.player_name,
        isAdmin: result.session.is_admin,
        isHumanVerified: result.session.is_human_verified,
      });

      toast({
        title: `Welcome${playerName ? `, ${playerName}` : ''}!`,
        description: 'Your mining adventure begins now!',
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const suggestedNames = [
    'DiamondHunter',
    'GoldDigger',
    'CryptoMiner',
    'DeepDriller',
    'OreSeeker',
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundImage: `linear-gradient(to bottom, hsl(120 10% 4% / 0.9), hsl(120 10% 4% / 0.95)), url(${miningBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo/Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl animate-float">⛏️</div>
          <h1 className="font-pixel text-xl text-primary text-glow">Mine to Earn</h1>
          <p className="text-muted-foreground text-sm">
            Start your mining journey
          </p>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleWalletAuth} className="card-game rounded-xl p-6 space-y-4">
          {/* Player Name */}
          <div className="space-y-2">
            <Label htmlFor="playerName" className="text-sm flex items-center gap-2">
              <User className="w-4 h-4" /> Player Name (optional)
            </Label>
            <Input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your miner name"
              maxLength={20}
              className="bg-secondary/50"
            />
          </div>

          {/* Suggested Names */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Suggestions</Label>
            <div className="flex flex-wrap gap-2">
              {suggestedNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPlayerName(name + Math.floor(Math.random() * 1000))}
                  className="text-xs bg-secondary/50 hover:bg-secondary px-2 py-1 rounded transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full glow-green" disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Globe className="w-4 h-4 mr-2" />
            )}
            Sign in with World App
          </Button>
        </form>

        {/* Info */}
        <div className="text-center text-xs text-muted-foreground">
          <p>World App Wallet Auth is required to play.</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
