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
  "matic-mainnet": "Polygon",
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
  contractAddress?: string | null;
  tokenAddress?: string | null;
  balance?: string;
  tokenBalance?: string;
  decimals?: number;
  symbol?: string;
  name?: string;
  network: string;
  logo?: string;
  tokenMetadata?: {
    decimals?: number;
    symbol?: string;
    name?: string;
    logo?: string;
  };
}

export class PortfolioClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.g.alchemy.com/data/v1";
  }

  async fetchMultiChainHoldings(address: string): Promise<NetworkTokens[]> {
    const results: NetworkTokens[] = [];
    const safeEndpointPath = "/data/v1/assets/tokens/balances/by-address";
    const url = `${this.baseUrl}/${this.apiKey}/assets/tokens/balances/by-address`;

    const requestBody = {
      addresses: [
        {
          address,
          networks: NETWORKS,
        },
      ],
      includeNativeTokens: true,
      includeErc20Tokens: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`[Portfolio API Error] Status: ${response.status}, Path: ${safeEndpointPath}, Body: ${responseText}`);
      throw new Error(`Portfolio API HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PortfolioApiResponse;

    if (data.error) {
      const topLevelError = this.parseError(data.error);
      if (topLevelError.partialErrors && topLevelError.partialErrors.length > 0) {
        for (const network of NETWORKS) {
          const networkName = NETWORK_NAMES[network] || network;
          const partialError = topLevelError.partialErrors.find(
            (pe) => pe.network === networkName || pe.network === network
          );

          if (partialError) {
            results.push({
              network: networkName,
              tokens: [],
              error: partialError,
            });
          } else {
            const networkTokens = (data.data?.tokens || [])
              .filter(
                (t) =>
                  (t.network === network || NETWORK_NAMES[t.network] === networkName) &&
                  this.hasNonZeroBalance(t)
              )
              .map((t) => this.convertToTokenHolding(t));
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
        const networkName = NETWORK_NAMES[network] || network;
        const networkTokens = data.data.tokens
          .filter(
            (t) =>
              (t.network === network || NETWORK_NAMES[t.network] === networkName) &&
              this.hasNonZeroBalance(t)
          )
          .map((t) => this.convertToTokenHolding(t));
        results.push({
          network: networkName,
          tokens: networkTokens,
        });
      }
    } else {
      for (const network of NETWORKS) {
        const networkName = NETWORK_NAMES[network] || network;
        results.push({
          network: networkName,
          tokens: [],
        });
      }
    }

    return results;
  }

  private hasNonZeroBalance(token: PortfolioToken): boolean {
    const rawBalance = token.tokenBalance || token.balance || "0";
    if (rawBalance === "0" || rawBalance === "0x0" || rawBalance === "0x00") return false;
    try {
      if (rawBalance.startsWith("0x") || rawBalance.startsWith("0X")) {
        return BigInt(rawBalance) > 0n;
      }
      return BigInt(rawBalance) > 0n;
    } catch {
      return false;
    }
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
    const contractAddress =
      token.contractAddress || token.tokenAddress || "0x0000000000000000000000000000000000000000";
    const networkName = NETWORK_NAMES[token.network] || token.network;

    let symbol = token.symbol || token.tokenMetadata?.symbol || "";
    let name = token.name || token.tokenMetadata?.name || "";
    let decimals = token.decimals ?? token.tokenMetadata?.decimals ?? 18;

    if (!symbol) {
      if (
        token.network === "eth-mainnet" ||
        token.network === "base-mainnet" ||
        token.network === "opt-mainnet"
      ) {
        symbol = "ETH";
        name = "Ethereum";
      } else if (
        token.network === "polygon-mainnet" ||
        token.network === "matic-mainnet"
      ) {
        symbol = "POL";
        name = "Polygon";
      } else if (token.network === "bnb-mainnet") {
        symbol = "BNB";
        name = "BNB Chain";
      } else {
        symbol = contractAddress === "0x0000000000000000000000000000000000000000" ? "NATIVE" : "TOKEN";
        name = symbol;
      }
    }

    return {
      contractAddress,
      tokenBalance: token.tokenBalance || token.balance || "0",
      decimals,
      symbol,
      name,
      network: networkName,
      logo: token.logo || token.tokenMetadata?.logo || "",
    };
  }
}

export function createPortfolioClient(apiKey: string): PortfolioClient {
  return new PortfolioClient(apiKey);
}