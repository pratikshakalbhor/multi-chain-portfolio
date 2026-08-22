import { Alchemy, Network, TokenBalance } from "alchemy-sdk";

export interface PortfolioResponse {
  tokens: TokenBalance[];
  error?: PortfolioError;
}

export interface PortfolioError {
  code: string;
  message: string;
  partialErrors?: PartialError[];
}

export interface PartialError {
  network: string;
  code: string;
  message: string;
}

export interface NetworkTokens {
  network: string;
  tokens: TokenBalance[];
  error?: PartialError;
}

const NETWORKS = [
  Network.ETH_MAINNET,
  Network.BASE_MAINNET,
  Network.OPTIMISM_MAINNET,
  Network.MATIC_MAINNET,
  Network.BNB_MAINNET,
];

const NETWORK_NAMES: Record<Network, string> = {
  [Network.ETH_MAINNET]: "Ethereum",
  [Network.BASE_MAINNET]: "Base",
  [Network.OPTIMISM_MAINNET]: "Optimism",
  [Network.MATIC_MAINNET]: "Polygon",
  [Network.BNB_MAINNET]: "BNB Chain",
};

export class PortfolioClient {
  private alchemy: Alchemy;

  constructor(apiKey: string) {
    this.alchemy = new Alchemy({ apiKey });
  }

  async fetchMultiChainHoldings(address: string): Promise<NetworkTokens[]> {
    const results: NetworkTokens[] = [];

    const response = await this.alchemy.core.getTokenBalances(address, NETWORKS);

    if (response.error) {
      const topLevelError = this.parseError(response.error);
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
            const networkResponse = await this.fetchSingleNetwork(address, network);
            results.push({
              network: networkName,
              tokens: networkResponse.tokens,
            });
          }
        }
      } else {
        throw new Error(`Portfolio API error: ${topLevelError.message}`);
      }
    } else {
      for (const network of NETWORKS) {
        const networkName = NETWORK_NAMES[network];
        const networkTokens = response.tokens.filter((t) => t.network === network);
        results.push({
          network: networkName,
          tokens: networkTokens,
        });
      }
    }

    return results;
  }

  private async fetchSingleNetwork(address: string, network: Network): Promise<{ tokens: TokenBalance[] }> {
    const response = await this.alchemy.core.getTokenBalances(address, [network]);
    if (response.error) {
      throw new Error(`Failed to fetch ${NETWORK_NAMES[network]}: ${response.error.message}`);
    }
    return { tokens: response.tokens };
  }

  private parseError(error: { code: string; message: string; partialErrors?: any[] }): PortfolioError {
    return {
      code: error.code,
      message: error.message,
      partialErrors: error.partialErrors?.map((pe) => ({
        network: pe.network,
        code: pe.code,
        message: pe.message,
      })),
    };
  }
}

export function createPortfolioClient(apiKey: string): PortfolioClient {
  return new PortfolioClient(apiKey);
}