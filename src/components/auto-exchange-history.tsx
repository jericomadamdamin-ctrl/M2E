"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExchangeOrder {
  id: string;
  order_id: string;
  diamonds_amount: number;
  min_wld_amount: number;
  wld_amount?: number;
  status: "pending" | "executed" | "failed";
  transaction_hash?: string;
  failure_reason?: string;
  created_at: string;
  executed_at?: string;
  failed_at?: string;
}

interface FallbackRequest {
  id: string;
  original_order_id: string;
  fallback_id: string;
  diamonds_amount: number;
  status: "pending" | "completed";
  reason: string;
  created_at: string;
}

interface ExchangeHistoryProps {
  worldId: string;
  onRefresh?: () => void;
}

export function AutoExchangeHistory({ worldId, onRefresh }: ExchangeHistoryProps) {
  const [exchanges, setExchanges] = useState<ExchangeOrder[]>([]);
  const [fallbacks, setFallbacks] = useState<FallbackRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "failed">(
    "all"
  );

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [worldId]);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/auto-exchange-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch exchange history");
      }

      const data = await response.json();
      setExchanges(data.auto_exchange_orders || []);
      setFallbacks(data.fallback_orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "executed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case "executed":
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredExchanges = exchanges.filter((ex) => {
    if (filter === "all") return true;
    if (filter === "pending") return ex.status === "pending";
    if (filter === "completed") return ex.status === "executed";
    if (filter === "failed") return ex.status === "failed";
    return true;
  });

  const filteredFallbacks = fallbacks.filter((fb) => {
    if (filter === "all") return true;
    if (filter === "pending") return fb.status === "pending";
    if (filter === "completed") return fb.status === "completed";
    return true;
  });

  const allItems = [
    ...filteredExchanges.map((ex) => ({ type: "exchange", data: ex })),
    ...filteredFallbacks.map((fb) => ({ type: "fallback", data: fb })),
  ];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={fetchHistory}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Exchange History</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchHistory}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {(["all", "pending", "completed", "failed"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {isLoading && allItems.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No exchanges found
          </div>
        ) : (
          <div className="space-y-3">
            {allItems.map((item, idx) => {
              if (item.type === "exchange") {
                const ex = item.data as ExchangeOrder;
                return (
                  <div
                    key={`ex-${idx}`}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(ex.status)}
                      <div className="flex-1">
                        <div className="font-medium">
                          {ex.diamonds_amount} Diamonds → {ex.wld_amount?.toFixed(6) || ex.min_wld_amount.toFixed(6)} WLD
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(ex.created_at)}
                        </div>
                        {ex.failure_reason && (
                          <div className="text-xs text-red-600 mt-1">
                            {ex.failure_reason}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ex.status)}
                      {ex.transaction_hash && (
                        <a
                          href={`https://etherscan.io/tx/${ex.transaction_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              } else {
                const fb = item.data as FallbackRequest;
                return (
                  <div
                    key={`fb-${idx}`}
                    className="flex items-center justify-between border border-amber-200 rounded-lg p-3 bg-amber-50 hover:bg-amber-100/50 transition"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(fb.status)}
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          Fallback: {fb.diamonds_amount} Diamonds (Manual Withdrawal)
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(fb.created_at)} • {fb.reason}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(fb.status)}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
