 import { useState, useEffect } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { Trophy, Crown, Medal, Clock } from 'lucide-react';
 import { MineralIcon } from './MineralIcon';
 import { Skeleton } from '@/components/ui/skeleton';
 
 interface LeaderboardEntry {
   rank: number;
   player_name: string;
   diamonds_collected: number;
   user_id: string;
 }
 
 interface Season {
   id: string;
   start_time: string;
   end_time: string;
 }
 
 interface LeaderboardTabProps {
   currentUserId: string;
 }
 
 export const LeaderboardTab = ({ currentUserId }: LeaderboardTabProps) => {
   const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
   const [season, setSeason] = useState<Season | null>(null);
   const [loading, setLoading] = useState(true);
   const [timeRemaining, setTimeRemaining] = useState('');
 
   useEffect(() => {
     fetchLeaderboard();
   }, []);
 
   useEffect(() => {
     if (!season) return;
     
     const updateTimer = () => {
       const endTime = new Date(season.end_time).getTime();
       const now = Date.now();
       const diff = endTime - now;
 
       if (diff <= 0) {
         setTimeRemaining('Season ended');
         return;
       }
 
       const days = Math.floor(diff / (1000 * 60 * 60 * 24));
       const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
       const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
 
       setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
     };
 
     updateTimer();
     const interval = setInterval(updateTimer, 60000);
     return () => clearInterval(interval);
   }, [season]);
 
   const fetchLeaderboard = async () => {
     try {
       // Get active season
       const { data: seasonData } = await supabase
         .from('seasons')
         .select('*')
         .eq('is_active', true)
         .single();
 
       if (seasonData) {
         setSeason(seasonData);
 
         // Get leaderboard for this season
         const { data: entries } = await supabase
           .from('seasonal_leaderboard')
           .select(`
             user_id,
             diamonds_collected,
             profiles!inner(player_name)
           `)
           .eq('season_id', seasonData.id)
           .order('diamonds_collected', { ascending: false })
           .limit(20);
 
         if (entries) {
           const formattedEntries: LeaderboardEntry[] = entries.map((entry: any, index: number) => ({
             rank: index + 1,
             player_name: entry.profiles?.player_name || 'Unknown',
             diamonds_collected: entry.diamonds_collected,
             user_id: entry.user_id,
           }));
           setLeaderboard(formattedEntries);
         }
       }
     } catch (error) {
       console.error('Error fetching leaderboard:', error);
     } finally {
       setLoading(false);
     }
   };
 
   const getRankIcon = (rank: number) => {
     switch (rank) {
       case 1:
        return <Crown className="w-5 h-5 text-game-gold" />;
       case 2:
        return <Medal className="w-5 h-5 text-game-silver" />;
       case 3:
        return <Medal className="w-5 h-5 text-game-bronze" />;
       default:
         return <span className="w-5 text-center font-bold text-muted-foreground">{rank}</span>;
     }
   };
 
   if (loading) {
     return (
       <div className="space-y-4 pb-4">
         <Skeleton className="h-20 w-full" />
         {[...Array(5)].map((_, i) => (
           <Skeleton key={i} className="h-14 w-full" />
         ))}
       </div>
     );
   }
 
   return (
     <div className="space-y-4 pb-4">
       {/* Header */}
       <div className="flex items-center justify-between px-1">
         <h2 className="font-pixel text-xs text-primary text-glow flex items-center gap-2">
           <Trophy className="w-4 h-4" /> Diamond Leaderboard
         </h2>
       </div>
 
       {/* Season Info */}
       <div className="card-game rounded-xl p-4">
         <div className="flex items-center justify-between">
           <div>
             <h3 className="font-bold text-sm flex items-center gap-2">
               <MineralIcon icon="diamond" size="sm" /> Season Rankings
             </h3>
             <p className="text-xs text-muted-foreground mt-1">
               Top 20 diamond collectors this season
             </p>
           </div>
           <div className="text-right">
             <div className="flex items-center gap-1 text-xs text-muted-foreground">
               <Clock className="w-3 h-3" /> Ends in
             </div>
             <div className="font-bold text-primary text-sm">{timeRemaining}</div>
           </div>
         </div>
       </div>
 
       {/* Leaderboard List */}
       <div className="space-y-2">
         {leaderboard.length === 0 ? (
           <div className="card-game rounded-xl p-6 text-center">
             <MineralIcon icon="diamond" size="lg" className="mx-auto mb-3" />
             <p className="text-muted-foreground text-sm">
               No diamonds collected yet this season.
             </p>
             <p className="text-xs text-muted-foreground mt-1">
               Be the first to mine diamonds with the Mega Machine!
             </p>
           </div>
         ) : (
           leaderboard.map((entry) => (
             <div
               key={entry.user_id}
               className={`card-game rounded-xl p-3 flex items-center gap-3 ${
                 entry.user_id === currentUserId ? 'border-primary/50 glow-diamond' : ''
               } ${entry.rank <= 3 ? 'bg-gradient-to-r from-secondary/50 to-transparent' : ''}`}
             >
               <div className="w-8 flex justify-center">{getRankIcon(entry.rank)}</div>
               <div className="flex-1 min-w-0">
                 <p className={`font-bold text-sm truncate ${
                   entry.user_id === currentUserId ? 'text-primary' : ''
                 }`}>
                   {entry.player_name}
                   {entry.user_id === currentUserId && (
                     <span className="text-xs text-muted-foreground ml-2">(You)</span>
                   )}
                 </p>
               </div>
               <div className="flex items-center gap-1">
                 <MineralIcon icon="diamond" size="sm" />
                 <span className="font-bold text-game-diamond">
                   {entry.diamonds_collected.toFixed(3)}
                 </span>
               </div>
             </div>
           ))
         )}
       </div>
 
       {/* Info */}
       <p className="text-xs text-muted-foreground text-center px-4">
         Season resets every 30 days (720 hours). Only diamonds mined with the Mega Machine count!
       </p>
     </div>
   );
 };