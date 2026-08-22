import { TokenHolding, PortfolioError, PartialError, NetworkTokens } from "./types";
export { TokenHolding, PortfolioError, PartialError, NetworkTokens };

const NETWORKS = [
  "eth-mainnet",
  "base-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
  "bnb-mainnet",
];

const NETWORK_NAMES: Record<string, string> = {
  "eth-mainnet": "Ethereum",
  "base-mainnet": "Base",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "bnb-mainnet": "BNB Chain",
};

interface PortfolioApiResponse {
  data?: {
    tokens: PortfolioToken[];
  };
  error?: {
    code: string;
    message: string;
    partialErrors?: Array<{
      network: string;
      code: string;
      message: string;
    }>;
  };
}

interface PortfolioToken {
  contractAddress: string;
  balance: string;
  decimals: number;
  symbol: string;
  name: string;
  network: string;
  logo?: string;
}

export class PortfolioClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.g.alchemy.com/v1/portfolio";
  }

  async fetchMultiChainHoldings(address: string): Promise<NetworkTokens[]> {
    const results: NetworkTokens[] = [];

    const networksParam = NETWORKS.join(",");
    const url = `${this.baseUrl}/${address}?networks=${networksParam}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Portfolio API HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PortfolioApiResponse;

    if (data.error) {
      const topLevelError = this.parseError(data.error);
      if (topLevelError.partialErrors && topLevelError.partialErrors.length > 0) {
        for (const network of NETWORKS) {
          const networkName = NETWORK_NAMES[network];
          const partialError = topLevelError.partialErrors.find(
            (pe) => pe.network === networkName
          );

          if (partialError) {
            results.push({
              network: networkName,
              tokens: [],
              error: partialError,
            });
          } else {
            const networkTokens = await this.fetchSingleNetwork(address, network);
            results.push({
              network: networkName,
              tokens: networkTokens,
            });
          }
        }
      } else {
        throw new Error(`Portfolio API error: ${topLevelError.message}`);
      }
    } else if (data.data?.tokens) {
      for (const network of NETWORKS) {
        const networkName = NETWORK_NAMES[network];
        const networkTokens = data.data.tokens
          .filter((t) => t.network === network)
          .map((t) => this.convertToTokenHolding(t));
        results.push({
          network: networkName,
          tokens: networkTokens,
        });
      }
    } else {
      for (const network of NETWORKS) {
        const networkName = NETWORK_NAMES[network];
        results.push({
          network: networkName,
          tokens: [],
        });
      }
    }

    return results;
  }

  private async fetchSingleNetwork(address: string, network: string): Promise<TokenHolding[]> {
    const url = `${this.baseUrl}/${address}?networks=${network}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${NETWORK_NAMES[network]}: ${response.statusText}`);
    }

    const data = (await response.json()) as PortfolioApiResponse;

    if (data.error) {
      throw new Error(`Failed to fetch ${NETWORK_NAMES[network]}: ${data.error.message}`);
    }

    if (data.data?.tokens) {
      return data.data.tokens
        .filter((t) => t.network === network)
        .map((t) => this.convertToTokenHolding(t));
    }

    return [];
  }

  private parseError(error: PortfolioApiResponse["error"]): PortfolioError {
    return {
      code: error?.code || "UNKNOWN_ERROR",
      message: error?.message || "Unknown error",
      partialErrors: error?.partialErrors?.map((pe) => ({
        network: pe.network,
        code: pe.code,
        message: pe.message,
      })),
    };
  }

  private convertToTokenHolding(token: PortfolioToken): TokenHolding {
    return {
      contractAddress: token.contractAddress,
      tokenBalance: token.balance,
      decimals: token.decimals,
      symbol: token.symbol,
      name: token.name,
      network: token.network,
      logo: token.logo || "",
    };
  }
}

export function createPortfolioClient(apiKey: string): PortfolioClient {
  return new PortfolioClient(apiKey);
}