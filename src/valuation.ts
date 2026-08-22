import { TokenBalance } from "alchemy-sdk";
import { TokenPrice, PriceError } from "./prices";

export interface ValuedToken {
  network: string;
  contractAddress: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  balanceFormatted: number;
  price: number | null;
  value: number | null;
  priceError?: string;
}

export interface ChainValuation {
  network: string;
  tokens: ValuedToken[];
  total: number | null;
  hasMissingPrices: boolean;
  missingPriceTokens: string[];
  networkError?: string;
}

export interface PortfolioValuation {
  chains: ChainValuation[];
  overallTotal: number | null;
  isComplete: boolean;
  warnings: string[];
}

function convertBalance(balance: string, decimals: number): number {
  const divisor = Math.pow(10, decimals);
  return parseInt(balance, 10) / divisor;
}

function matchPrice(
  token: TokenBalance,
  prices: TokenPrice[]
): { price: number | null; error?: string } {
  const matched = prices.find(
    (p) =>
      p.network === token.network &&
      p.contractAddress.toLowerCase() === token.contractAddress.toLowerCase()
  );

  if (!matched) {
    return { price: null, error: "No price data found" };
  }

  if (matched.error) {
    return { price: null, error: matched.error };
  }

  return { price: matched.price };
}

export function calculateValuation(
  networkTokens: Array<{ network: string; tokens: TokenBalance[]; error?: { network: string; code: string; message: string } }>,
  prices: TokenPrice[]
): PortfolioValuation {
  const chains: ChainValuation[] = [];
  const warnings: string[] = [];
  let overallTotal = 0;
  let isComplete = true;

  for (const networkData of networkTokens) {
    const { network, tokens, error } = networkData;

    if (error) {
      chains.push({
        network,
        tokens: [],
        total: null,
        hasMissingPrices: false,
        missingPriceTokens: [],
        networkError: error.message,
      });
      warnings.push(`❌ Network data unavailable: ${network} - ${error.message}`);
      isComplete = false;
      continue;
    }

    const valuedTokens: ValuedToken[] = [];
    let chainTotal = 0;
    let hasMissingPrices = false;
    const missingPriceTokens: string[] = [];

    for (const token of tokens) {
      const { price, error: priceError } = matchPrice(token, prices);
      const balanceFormatted = convertBalance(token.tokenBalance, token.decimals);
      const value = price !== null ? balanceFormatted * price : null;

      if (price !== null) {
        chainTotal += value;
      } else {
        hasMissingPrices = true;
        missingPriceTokens.push(`${token.symbol} (${token.contractAddress.slice(0, 8)}...)`);
        warnings.push(
          `⚠️ Price unavailable for ${token.symbol} on ${network}. ` +
          `${token.symbol} was excluded from the calculated total.`
        );
      }

      valuedTokens.push({
        network,
        contractAddress: token.contractAddress,
        symbol: token.symbol,
        name: token.name,
        balance: token.tokenBalance,
        decimals: token.decimals,
        balanceFormatted,
        price,
        value,
        priceError,
      });
    }

    chains.push({
      network,
      tokens: valuedTokens,
      total: hasMissingPrices && valuedTokens.length === missingPriceTokens.length ? null : chainTotal,
      hasMissingPrices,
      missingPriceTokens,
    });

    if (!hasMissingPrices || valuedTokens.length > missingPriceTokens.length) {
      overallTotal += chainTotal;
    } else {
      isComplete = false;
    }
  }

  if (!isComplete) {
    warnings.push(
      "⚠️ PORTFOLIO INCOMPLETE: Some network/token data could not be priced or retrieved."
    );
  }

  return {
    chains,
    overallTotal: isComplete ? overallTotal : null,
    isComplete,
    warnings,
  };
}