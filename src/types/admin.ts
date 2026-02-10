export interface Round {
    id: string;
    round_date: string;
    revenue_wld: number;
    payout_pool_wld: number;
    total_diamonds: number;
    status: string;
    created_at: string;
    payouts?: any[];
}

export interface AdminStats {
    open_rounds: Round[];
    execution_rounds: Round[];
    total_users?: number;
    total_oil?: number;
    total_diamonds?: number;
}
