export interface TokenHolding {
  contractAddress: string;
  tokenBalance: string;
  decimals: number;
  symbol: string;
  name: string;
  network: string;
  logo?: string;
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
  tokens: TokenHolding[];
  error?: PartialError;
}

export interface TokenPrice {
  network: string;
  contractAddress: string;
  symbol: string;
  price: number;
  error?: string;
}

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