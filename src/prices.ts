import { Alchemy, Network } from "alchemy-sdk";
import { TokenPrice } from "./types";

const NETWORK_TO_ALCHEMY: Record<string, Network> = {
  Ethereum: Network.ETH_MAINNET,
  Base: Network.BASE_MAINNET,
  Optimism: Network.OPT_MAINNET,
  Polygon: Network.MATIC_MAINNET,
  "BNB Chain": Network.ARB_MAINNET,
};

export class PricesClient {
  private alchemy: Alchemy;

  constructor(apiKey: string) {
    this.alchemy = new Alchemy({ apiKey });
  }

  async fetchPrices(tokens: Array<{ network: string; contractAddress: string; symbol: string }>): Promise<TokenPrice[]> {
    const results: TokenPrice[] = [];

    for (const token of tokens) {
      const alchemyNetwork = NETWORK_TO_ALCHEMY[token.network];
      if (!alchemyNetwork) {
        results.push({
          network: token.network,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          price: 0,
          error: `Unsupported network: ${token.network}`,
        });
        continue;
      }

      try {
        const priceResponse = await (this.alchemy.core as any).getTokenPriceByAddress(
          alchemyNetwork,
          token.contractAddress
        );

        if (priceResponse.data && priceResponse.data.length > 0) {
          const priceData = priceResponse.data[0];
          if (priceData.price !== null && priceData.price !== undefined) {
            results.push({
              network: token.network,
              contractAddress: token.contractAddress,
              symbol: token.symbol,
              price: priceData.price,
            });
          } else {
            results.push({
              network: token.network,
              contractAddress: token.contractAddress,
              symbol: token.symbol,
              price: 0,
              error: "Price unavailable",
            });
          }
        } else {
          results.push({
            network: token.network,
            contractAddress: token.contractAddress,
            symbol: token.symbol,
            price: 0,
            error: "No price data returned",
          });
        }
      } catch (error) {
        results.push({
          network: token.network,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          price: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }
}

export function createPricesClient(apiKey: string): PricesClient {
  return new PricesClient(apiKey);
}