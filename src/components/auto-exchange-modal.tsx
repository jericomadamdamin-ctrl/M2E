"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AutoExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerDiamonds: number;
  currentWldPrice: number;
  onExchangeSubmit: (
    diamondAmount: number,
    minWldAmount: number,
    walletAddress: string
  ) => Promise<void>;
}

export function AutoExchangeModal({
  open,
  onOpenChange,
  playerDiamonds,
  currentWldPrice,
  onExchangeSubmit,
}: AutoExchangeModalProps) {
  const { toast } = useToast();
  const [diamondAmount, setDiamondAmount] = useState("");
  const [minWldAmount, setMinWldAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [slippage, setSlippage] = useState(2); // 2% default slippage
  const [step, setStep] = useState<"input" | "confirm" | "success">("input");

  const handleDiamondAmountChange = (value: string) => {
    setDiamondAmount(value);

    // Auto-calculate min WLD amount based on current price and slippage
    if (value) {
      const diamonds = parseFloat(value);
      if (!isNaN(diamonds)) {
        const estimatedWld = diamonds * currentWldPrice;
        const minWld = estimatedWld * (1 - slippage / 100);
        setMinWldAmount(minWld.toFixed(6));
      }
    }
  };

  const handleSlippageChange = (value: string) => {
    const newSlippage = parseFloat(value);
    if (!isNaN(newSlippage) && newSlippage >= 0 && newSlippage <= 50) {
      setSlippage(newSlippage);

      // Recalculate min WLD with new slippage
      if (diamondAmount) {
        const diamonds = parseFloat(diamondAmount);
        if (!isNaN(diamonds)) {
          const estimatedWld = diamonds * currentWldPrice;
          const minWld = estimatedWld * (1 - newSlippage / 100);
          setMinWldAmount(minWld.toFixed(6));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "input") {
      // Validate inputs
      const diamonds = parseFloat(diamondAmount);
      const minWld = parseFloat(minWldAmount);

      if (!diamondAmount || isNaN(diamonds)) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid diamond amount",
          variant: "destructive",
        });
        return;
      }

      if (diamonds > playerDiamonds) {
        toast({
          title: "Insufficient Diamonds",
          description: `You only have ${playerDiamonds} diamonds`,
          variant: "destructive",
        });
        return;
      }

      if (diamonds < 1) {
        toast({
          title: "Minimum Amount",
          description: "Minimum exchange is 1 diamond",
          variant: "destructive",
        });
        return;
      }

      if (!walletAddress || walletAddress.trim().length === 0) {
        toast({
          title: "Wallet Address Required",
          description: "Please enter your WLD wallet address",
          variant: "destructive",
        });
        return;
      }

      if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        toast({
          title: "Invalid Wallet Address",
          description: "Please enter a valid Ethereum address (0x...)",
          variant: "destructive",
        });
        return;
      }

      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      setIsLoading(true);
      try {
        await onExchangeSubmit(
          parseFloat(diamondAmount),
          parseFloat(minWldAmount),
          walletAddress
        );
        setStep("success");
        
        // Reset form after a delay
        setTimeout(() => {
          setStep("input");
          setDiamondAmount("");
          setMinWldAmount("");
          setWalletAddress("");
          setSlippage(2);
          onOpenChange(false);
        }, 3000);
      } catch (error) {
        toast({
          title: "Exchange Failed",
          description:
            error instanceof Error ? error.message : "Failed to initiate exchange",
          variant: "destructive",
        });
        setStep("input");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const estimatedWld = diamondAmount
    ? (parseFloat(diamondAmount) * currentWldPrice).toFixed(6)
    : "0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Automatic Diamond Exchange</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="diamonds">Diamonds to Exchange</Label>
              <div className="flex gap-2">
                <Input
                  id="diamonds"
                  type="number"
                  min="1"
                  max={playerDiamonds}
                  step="0.01"
                  placeholder="Enter amount"
                  value={diamondAmount}
                  onChange={(e) => handleDiamondAmountChange(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDiamondAmountChange(playerDiamonds.toString())}
                  disabled={isLoading}
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {playerDiamonds.toFixed(2)} diamonds
              </p>
            </div>

            <div className="rounded-lg bg-muted p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated WLD:</span>
                <span className="font-semibold">{estimatedWld} WLD</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Minimum WLD (with slippage):</span>
                <span className="font-semibold text-blue-600">
                  {minWldAmount || "0"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slippage">Slippage Tolerance (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="slippage"
                  type="number"
                  min="0.01"
                  max="50"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => handleSlippageChange(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSlippageChange("1")}
                  disabled={isLoading}
                >
                  1%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSlippageChange("2")}
                  disabled={isLoading}
                >
                  2%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSlippageChange("5")}
                  disabled={isLoading}
                >
                  5%
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet">WLD Wallet Address</Label>
              <Input
                id="wallet"
                type="text"
                placeholder="0x..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Your WLD tokens will be sent to this address
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                If the automatic exchange fails, your diamonds will be automatically converted through manual withdrawal as a fallback.
              </AlertDescription>
            </Alert>

            <Button
              type="submit"
              className="w-full"
              disabled={!diamondAmount || !walletAddress || isLoading}
            >
              Review Exchange
            </Button>
          </form>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground">Diamonds:</span>
                <span className="font-semibold">{diamondAmount}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground">Minimum WLD:</span>
                <span className="font-semibold text-blue-600">{minWldAmount}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground">Slippage:</span>
                <span className="font-semibold">{slippage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Wallet:</span>
                <span className="font-mono text-xs">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please review the details carefully. This transaction cannot be reversed.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("input")}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading}
                onClick={handleSubmit}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Exchange
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Exchange Initiated!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your automatic exchange has been submitted. You will receive {minWldAmount}{" "}
                WLD to your wallet.
              </p>
            </div>
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800 text-sm">
                Track your exchange status in the History tab
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
