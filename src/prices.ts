import { TokenPrice } from "./types";

const NETWORK_SLUGS: Record<string, string> = {
  Ethereum: "eth-mainnet",
  Base: "base-mainnet",
  Optimism: "opt-mainnet",
  Polygon: "polygon-mainnet",
  "BNB Chain": "bnb-mainnet",
};

interface PricesApiResponse {
  data?: Array<{
    network?: string;
    address?: string;
    symbol?: string;
    prices?: Array<{
      currency: string;
      value: string;
    }>;
    error?: string;
  }>;
  error?: string;
}

export class PricesClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.g.alchemy.com/prices/v1";
  }

  async fetchPrices(
    tokens: Array<{ network: string; contractAddress: string; symbol: string }>
  ): Promise<TokenPrice[]> {
    const results: TokenPrice[] = [];
    if (tokens.length === 0) return results;

    const contractTokens = tokens.filter(
      (t) =>
        t.contractAddress &&
        t.contractAddress !== "0x0000000000000000000000000000000000000000" &&
        t.contractAddress.toLowerCase() !== "native"
    );
    const nativeTokens = tokens.filter(
      (t) =>
        !t.contractAddress ||
        t.contractAddress === "0x0000000000000000000000000000000000000000" ||
        t.contractAddress.toLowerCase() === "native"
    );

    const priceMap = new Map<string, { price: number; error?: string }>();

    if (contractTokens.length > 0) {
      const addressesPayload = contractTokens.map((t) => ({
        network: NETWORK_SLUGS[t.network] || t.network,
        address: t.contractAddress,
      }));

      const chunks = [];
      for (let i = 0; i < addressesPayload.length; i += 20) {
        chunks.push(addressesPayload.slice(i, i + 20));
      }

      for (const chunk of chunks) {
        try {
          const response = await fetch(`${this.baseUrl}/${this.apiKey}/tokens/by-address`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({ addresses: chunk }),
          });

          if (response.ok) {
            const data = (await response.json()) as PricesApiResponse;
            if (data.data) {
              for (const item of data.data) {
                const key = `${item.network}:${item.address?.toLowerCase()}`;
                if (item.prices && item.prices.length > 0 && item.prices[0].value) {
                  priceMap.set(key, { price: parseFloat(item.prices[0].value) });
                } else if (item.error) {
                  priceMap.set(key, { price: 0, error: item.error });
                }
              }
            }
          }
        } catch {
          // ignore chunk error
        }
      }
    }

    if (nativeTokens.length > 0) {
      try {
        const symbols = [...new Set(nativeTokens.map((t) => t.symbol))].join(",");
        const response = await fetch(
          `${this.baseUrl}/${this.apiKey}/tokens/by-symbol?symbols=${encodeURIComponent(symbols)}`
        );
        if (response.ok) {
          const data = (await response.json()) as PricesApiResponse;
          if (data.data) {
            for (const item of data.data) {
              if (item.symbol && item.prices && item.prices.length > 0 && item.prices[0].value) {
                priceMap.set(`symbol:${item.symbol}`, { price: parseFloat(item.prices[0].value) });
              }
            }
          }
        }
      } catch {
        // ignore symbol error
      }
    }

    for (const token of tokens) {
      const slug = NETWORK_SLUGS[token.network] || token.network;
      const key = `${slug}:${token.contractAddress.toLowerCase()}`;
      const found = priceMap.get(key) || priceMap.get(`symbol:${token.symbol}`);

      if (found) {
        if (found.error) {
          results.push({
            network: token.network,
            contractAddress: token.contractAddress,
            symbol: token.symbol,
            price: 0,
            error: found.error,
          });
        } else {
          results.push({
            network: token.network,
            contractAddress: token.contractAddress,
            symbol: token.symbol,
            price: found.price,
          });
        }
      } else {
        results.push({
          network: token.network,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          price: 0,
          error: "Price unavailable",
        });
      }
    }

    return results;
  }
}

export function createPricesClient(apiKey: string): PricesClient {
  return new PricesClient(apiKey);
}