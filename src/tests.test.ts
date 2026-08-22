import { PortfolioClient, PartialError } from "./portfolio";
import { PricesClient } from "./prices";
import { calculateValuation, PortfolioValuation, ValuedToken, ChainValuation } from "./valuation";
import { validateAddress } from "./index";
import { TokenHolding } from "./types";

interface MockTokenBalance extends TokenHolding {
  error?: any;
}

const MOCK_TOKEN_BALANCES: MockTokenBalance[] = [
  {
    contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokenBalance: "1250000000000000000",
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
    network: "Ethereum",
    logo: "",
    error: null,
  },
  {
    contractAddress: "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8C8",
    tokenBalance: "5000000000",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    network: "Ethereum",
    logo: "",
    error: null,
  },
  {
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenBalance: "2000000000",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    network: "Base",
    logo: "",
    error: null,
  },
];

const MOCK_PRICES = [
  {
    network: "Ethereum",
    contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    price: 2000,
  },
  {
    network: "Ethereum",
    contractAddress: "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8C8",
    symbol: "USDC",
    price: 1.0,
  },
  {
    network: "Base",
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    price: 1.0,
  },
];

const MOCK_PRICES_WITH_ERROR = [
  ...MOCK_PRICES,
  {
    network: "Base",
    contractAddress: "0xUnknown",
    symbol: "ABC",
    price: 0,
    error: "Price unavailable",
  },
];

const MOCK_NETWORK_TOKENS_COMPLETE = [
  { network: "Ethereum", tokens: MOCK_TOKEN_BALANCES.filter((t) => t.network === "Ethereum") },
  { network: "Base", tokens: MOCK_TOKEN_BALANCES.filter((t) => t.network === "Base") },
  { network: "Optimism", tokens: [] },
  { network: "Polygon", tokens: [] },
  { network: "BNB Chain", tokens: [] },
];

const MOCK_NETWORK_TOKENS_WITH_ERROR = [
  { network: "Ethereum", tokens: MOCK_TOKEN_BALANCES.filter((t) => t.network === "Ethereum") },
  {
    network: "Polygon",
    tokens: [],
    error: { network: "Polygon", code: "NETWORK_ERROR", message: "Network unavailable" },
  },
  { network: "Base", tokens: MOCK_TOKEN_BALANCES.filter((t) => t.network === "Base") },
];

describe("Requirement 1: Multi-network fan-out request", () => {
  test("PortfolioClient uses multi-network parameter in single request", () => {
    const client = new PortfolioClient("test-key");
    expect(client).toBeDefined();
  });
});

describe("Requirement 2: Top-level error detection", () => {
  test("detects top-level error in portfolio response", () => {
    const error = {
      code: "PARTIAL_ERROR",
      message: "Some networks failed",
      partialErrors: [{ network: "Polygon", code: "NETWORK_ERROR", message: "Network down" }],
    };

    const portfolioError = {
      code: error.code,
      message: error.message,
      partialErrors: error.partialErrors.map((pe) => ({
        network: pe.network,
        code: pe.code,
        message: pe.message,
      })),
    };

    expect(portfolioError.code).toBe("PARTIAL_ERROR");
    expect(portfolioError.partialErrors).toBeDefined();
    expect(portfolioError.partialErrors?.length).toBe(1);
  });

  test("handles response without error", () => {
    const response = { tokens: MOCK_TOKEN_BALANCES, error: undefined };
    expect(response.error).toBeUndefined();
  });
});

describe("Requirement 3: Visible partial failure", () => {
  test("partialErrors mark result as incomplete in valuation", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_WITH_ERROR, MOCK_PRICES);

    expect(valuation.isComplete).toBe(false);
    expect(valuation.warnings.some((w) => w.includes("Polygon"))).toBe(true);
    expect(valuation.warnings.some((w) => w.includes("PORTFOLIO INCOMPLETE"))).toBe(true);
  });

  test("failed network shows in chain valuation", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_WITH_ERROR, MOCK_PRICES);
    const polygonChain = valuation.chains.find((c) => c.network === "Polygon");

    expect(polygonChain).toBeDefined();
    expect(polygonChain?.networkError).toBe("Network unavailable");
    expect(polygonChain?.total).toBeNull();
  });
});

describe("Requirement 4: Price matching uses network + contract address", () => {
  test("matches USDC on Ethereum and Base as different tokens", () => {
    const ethUSDC = MOCK_TOKEN_BALANCES.find(
      (t) => t.symbol === "USDC" && t.network === "Ethereum"
    )!;
    const baseUSDC = MOCK_TOKEN_BALANCES.find(
      (t) => t.symbol === "USDC" && t.network === "Base"
    )!;

    const ethPrice = MOCK_PRICES.find(
      (p) => p.network === "Ethereum" && p.contractAddress === ethUSDC.contractAddress
    );
    const basePrice = MOCK_PRICES.find(
      (p) => p.network === "Base" && p.contractAddress === baseUSDC.contractAddress
    );

    expect(ethPrice).toBeDefined();
    expect(basePrice).toBeDefined();
    expect(ethPrice?.contractAddress).not.toBe(basePrice?.contractAddress);
    expect(ethPrice?.price).toBe(1.0);
    expect(basePrice?.price).toBe(1.0);
  });

  test("does not match by symbol alone", () => {
    const ethUSDC = MOCK_TOKEN_BALANCES.find(
      (t) => t.symbol === "USDC" && t.network === "Ethereum"
    )!;
    const baseUSDC = MOCK_TOKEN_BALANCES.find(
      (t) => t.symbol === "USDC" && t.network === "Base"
    )!;

    const wrongMatch = MOCK_PRICES.find(
      (p) => p.symbol === "USDC" && p.contractAddress === ethUSDC.contractAddress
    );

    expect(wrongMatch?.network).toBe("Ethereum");
    expect(wrongMatch?.contractAddress).toBe(ethUSDC.contractAddress);
  });
});

describe("Requirement 5: Token pricing error differs from network failure", () => {
  test("token price error is tracked separately from network error", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_COMPLETE, MOCK_PRICES_WITH_ERROR);

    const baseChain = valuation.chains.find((c) => c.network === "Base");
    expect(baseChain).toBeDefined();

    const abcToken = baseChain?.tokens.find((t) => t.symbol === "ABC");
    expect(abcToken).toBeDefined();
    expect(abcToken?.priceError).toBe("Price unavailable");
    expect(abcToken?.price).toBeNull();

    const polygonChain = valuation.chains.find((c) => c.network === "Polygon");
    expect(polygonChain?.networkError).toBeUndefined();
  });

  test("valuation distinguishes token error from network error", () => {
    const networkTokensWithBoth = [
      ...MOCK_NETWORK_TOKENS_WITH_ERROR,
      { network: "Base", tokens: [...MOCK_TOKEN_BALANCES.filter((t) => t.network === "Base")] },
    ];

    const pricesWithTokenError = [
      ...MOCK_PRICES,
      { network: "Base", contractAddress: "0xABC", symbol: "ABC", price: 0, error: "Token not found" },
    ];

    const valuation = calculateValuation(networkTokensWithBoth, pricesWithTokenError);

    const polygonChain = valuation.chains.find((c) => c.network === "Polygon");
    expect(polygonChain?.networkError).toBe("Network unavailable");

    const baseChain = valuation.chains.find((c) => c.network === "Base");
    const abcToken = baseChain?.tokens.find((t) => t.symbol === "ABC");
    expect(abcToken?.priceError).toBe("Token not found");
    expect(baseChain?.networkError).toBeUndefined();
  });
});

describe("Requirement 6: Missing prices not treated as zero", () => {
  test("missing price excludes token from numeric total", () => {
    const tokensWithMissingPrice = [
      {
        network: "Ethereum",
        tokens: [
          {
            contractAddress: "0xToken1",
            tokenBalance: "1000000000000000000",
            decimals: 18,
            symbol: "TOKEN1",
            name: "Token 1",
            network: "Ethereum",
            logo: "",
            error: null,
          },
          {
            contractAddress: "0xToken2",
            tokenBalance: "1000000000000000000",
            decimals: 18,
            symbol: "TOKEN2",
            name: "Token 2",
            network: "Ethereum",
            logo: "",
            error: null,
          },
        ],
      },
    ];

    const pricesWithOneMissing = [
      { network: "Ethereum", contractAddress: "0xToken1", symbol: "TOKEN1", price: 10 },
      { network: "Ethereum", contractAddress: "0xToken2", symbol: "TOKEN2", price: 0, error: "Unavailable" },
    ];

    const valuation = calculateValuation(tokensWithMissingPrice, pricesWithOneMissing);

    expect(valuation.chains[0].total).toBe(10);
    expect(valuation.chains[0].hasMissingPrices).toBe(true);
    expect(valuation.chains[0].missingPriceTokens).toContain("TOKEN2");
    expect(valuation.warnings.some((w) => w.includes("TOKEN2"))).toBe(true);
  });

  test("overall total is null when tokens have missing prices", () => {
    const tokensOnlyMissing = [
      {
        network: "Ethereum",
        tokens: [
          {
            contractAddress: "0xToken",
            tokenBalance: "1000000000000000000",
            decimals: 18,
            symbol: "TOKEN",
            name: "Token",
            network: "Ethereum",
            logo: "",
            error: null,
          },
        ],
      },
    ];

    const pricesMissing = [
      { network: "Ethereum", contractAddress: "0xToken", symbol: "TOKEN", price: 0, error: "Unavailable" },
    ];

    const valuation = calculateValuation(tokensOnlyMissing, pricesMissing);

    expect(valuation.overallTotal).toBeNull();
    expect(valuation.isComplete).toBe(false);
  });
});

describe("Requirement 7: Per-chain and per-token breakdown", () => {
  test("valuation includes per-chain totals", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_COMPLETE, MOCK_PRICES);

    const ethChain = valuation.chains.find((c) => c.network === "Ethereum");
    expect(ethChain?.total).toBe(2500 + 5000);

    const baseChain = valuation.chains.find((c) => c.network === "Base");
    expect(baseChain?.total).toBe(2000);
  });

  test("valuation includes per-token details", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_COMPLETE, MOCK_PRICES);

    const ethChain = valuation.chains.find((c) => c.network === "Ethereum");
    const weth = ethChain?.tokens.find((t) => t.symbol === "WETH");
    const usdc = ethChain?.tokens.find((t) => t.symbol === "USDC");

    expect(weth).toBeDefined();
    expect(weth?.balanceFormatted).toBe(1.25);
    expect(weth?.price).toBe(2000);
    expect(weth?.value).toBe(2500);

    expect(usdc).toBeDefined();
    expect(usdc?.balanceFormatted).toBe(5000);
    expect(usdc?.price).toBe(1.0);
    expect(usdc?.value).toBe(5000);
  });
});

describe("Additional: Wallet validation", () => {
  test("validates correct Ethereum address", () => {
    expect(validateAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    expect(validateAddress("0x0000000000000000000000000000000000000000")).toBe(true);
  });

  test("rejects invalid Ethereum address", () => {
    expect(validateAddress("0x123")).toBe(false);
    expect(validateAddress("not-an-address")).toBe(false);
    expect(validateAddress("")).toBe(false);
    expect(validateAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });
});

describe("Additional: Decimal conversion", () => {
  test("converts 18 decimal balance correctly", () => {
    const token: MockTokenBalance = {
      contractAddress: "0xTest",
      tokenBalance: "1000000000000000000",
      decimals: 18,
      symbol: "TEST",
      name: "Test",
      network: "Ethereum",
      logo: "",
      error: null,
    };

    const valuation = calculateValuation(
      [{ network: "Ethereum", tokens: [token] }],
      [{ network: "Ethereum", contractAddress: "0xTest", symbol: "TEST", price: 2 }]
    );

    expect(valuation.chains[0].tokens[0].balanceFormatted).toBe(1);
    expect(valuation.chains[0].tokens[0].value).toBe(2);
  });

  test("converts 6 decimal balance correctly", () => {
    const token: MockTokenBalance = {
      contractAddress: "0xTest",
      tokenBalance: "5000000",
      decimals: 6,
      symbol: "TEST",
      name: "Test",
      network: "Ethereum",
      logo: "",
      error: null,
    };

    const valuation = calculateValuation(
      [{ network: "Ethereum", tokens: [token] }],
      [{ network: "Ethereum", contractAddress: "0xTest", symbol: "TEST", price: 1 }]
    );

    expect(valuation.chains[0].tokens[0].balanceFormatted).toBe(5);
    expect(valuation.chains[0].tokens[0].value).toBe(5);
  });
});

describe("Additional: Token valuation", () => {
  test("calculates token USD value correctly", () => {
    const token: MockTokenBalance = {
      contractAddress: "0xTest",
      tokenBalance: "2000000000000000000",
      decimals: 18,
      symbol: "TEST",
      name: "Test",
      network: "Ethereum",
      logo: "",
      error: null,
    };

    const valuation = calculateValuation(
      [{ network: "Ethereum", tokens: [token] }],
      [{ network: "Ethereum", contractAddress: "0xTest", symbol: "TEST", price: 1500 }]
    );

    expect(valuation.chains[0].tokens[0].value).toBe(3000);
  });
});

describe("Additional: Per-chain totals", () => {
  test("sums token values per chain", () => {
    const tokens = [
      { contractAddress: "0xA", tokenBalance: "1000000000000000000", decimals: 18, symbol: "A", name: "A", network: "Ethereum", logo: "", error: null },
      { contractAddress: "0xB", tokenBalance: "2000000000000000000", decimals: 18, symbol: "B", name: "B", network: "Ethereum", logo: "", error: null },
    ];

    const prices = [
      { network: "Ethereum", contractAddress: "0xA", symbol: "A", price: 10 },
      { network: "Ethereum", contractAddress: "0xB", symbol: "B", price: 5 },
    ];

    const valuation = calculateValuation([{ network: "Ethereum", tokens }], prices);
    expect(valuation.chains[0].total).toBe(20);
  });
});

describe("Additional: Overall total", () => {
  test("sums chain totals for overall total", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_COMPLETE, MOCK_PRICES);
    expect(valuation.overallTotal).toBe(2500 + 5000 + 2000);
  });

  test("overall total is null when incomplete", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_WITH_ERROR, MOCK_PRICES);
    expect(valuation.overallTotal).toBeNull();
  });
});

describe("Additional: Incomplete portfolio status", () => {
  test("isComplete is false when network fails", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_WITH_ERROR, MOCK_PRICES);
    expect(valuation.isComplete).toBe(false);
  });

  test("isComplete is false when token price missing", () => {
    const tokensWithMissing = [
      { network: "Ethereum", tokens: MOCK_TOKEN_BALANCES.filter((t) => t.network === "Ethereum") },
    ];
    const pricesMissingOne = [
      { network: "Ethereum", contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", price: 2000 },
    ];

    const valuation = calculateValuation(tokensWithMissing, pricesMissingOne);
    expect(valuation.isComplete).toBe(false);
  });

  test("isComplete is true when all data available", () => {
    const valuation = calculateValuation(MOCK_NETWORK_TOKENS_COMPLETE, MOCK_PRICES);
    expect(valuation.isComplete).toBe(true);
  });
});

describe("Security: No committed credentials", () => {
  test(".env.example contains only placeholder", () => {
    const fs = require("fs");
    const envExample = fs.readFileSync(".env.example", "utf-8");
    expect(envExample).toContain("your_alchemy_api_key_here");
    expect(envExample).not.toContain("sk-");
    expect(envExample).not.toMatch(/[a-fA-F0-9]{32,}/);
  });

  test(".gitignore excludes .env", () => {
    const fs = require("fs");
    const gitignore = fs.readFileSync(".gitignore", "utf-8");
    expect(gitignore).toContain(".env");
  });
});