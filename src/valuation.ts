import { TokenHolding, TokenPrice, ValuedToken, ChainValuation, PortfolioValuation } from "./types";
export { TokenHolding, TokenPrice, ValuedToken, ChainValuation, PortfolioValuation };

function convertBalance(balance: string, decimals: number): number {
  const divisor = Math.pow(10, decimals);
  if (balance.startsWith("0x") || balance.startsWith("0X")) {
    return Number(BigInt(balance)) / divisor;
  }
  return parseInt(balance, 10) / divisor;
}

function matchPrice(
  token: TokenHolding,
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
  networkTokens: Array<{ network: string; tokens: TokenHolding[]; error?: { network: string; code: string; message: string } }>,
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

      if (value !== null) {
        chainTotal += value;
      } else {
        hasMissingPrices = true;
        missingPriceTokens.push(token.symbol);
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

    const extraErrorPrices = prices.filter(
      (p) =>
        p.network === network &&
        p.error &&
        !valuedTokens.some(
          (vt) => vt.contractAddress.toLowerCase() === p.contractAddress.toLowerCase()
        )
    );

    for (const ep of extraErrorPrices) {
      hasMissingPrices = true;
      if (!missingPriceTokens.includes(ep.symbol)) {
        missingPriceTokens.push(ep.symbol);
      }
      warnings.push(
        `⚠️ Price unavailable for ${ep.symbol} on ${network}. ` +
        `${ep.symbol} was excluded from the calculated total.`
      );
      valuedTokens.push({
        network,
        contractAddress: ep.contractAddress,
        symbol: ep.symbol,
        name: ep.symbol,
        balance: "0",
        decimals: 0,
        balanceFormatted: 0,
        price: null,
        value: null,
        priceError: ep.error,
      });
    }

    if (hasMissingPrices) {
      isComplete = false;
    }

    const allTokensMissingPrices = valuedTokens.length > 0 && valuedTokens.every((t) => t.price === null);

    chains.push({
      network,
      tokens: valuedTokens,
      total: allTokensMissingPrices ? null : chainTotal,
      hasMissingPrices,
      missingPriceTokens,
    });

    overallTotal += chainTotal;
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