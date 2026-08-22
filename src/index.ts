import "dotenv/config";
import { createPortfolioClient } from "./portfolio";
import { createPricesClient } from "./prices";
import { calculateValuation, PortfolioValuation, ValuedToken, ChainValuation } from "./valuation";
import { TokenBalance } from "alchemy-sdk";

function validateAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function formatValue(value: number | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function printToken(token: ValuedToken): void {
  console.log(`  ${token.symbol}`);
  console.log(`    Balance: ${token.balanceFormatted.toLocaleString()}`);
  if (token.price !== null) {
    console.log(`    Price: $${token.price.toLocaleString()}`);
    console.log(`    Value: ${formatValue(token.value)}`);
  } else {
    console.log(`    Price: ⚠️ Unavailable`);
    console.log(`    Value: ⚠️ Unknown`);
  }
}

function printChain(chain: ChainValuation): void {
  console.log(`\n${chain.network}`);

  if (chain.networkError) {
    console.log(`  ⚠️ DATA UNAVAILABLE: ${chain.networkError}`);
    return;
  }

  if (chain.tokens.length === 0) {
    console.log("  (no tokens)");
    return;
  }

  for (const token of chain.tokens) {
    printToken(token);
  }

  if (chain.hasMissingPrices) {
    console.log(`  ⚠️ Some tokens missing prices: ${chain.missingPriceTokens.join(", ")}`);
  }

  console.log(`  Chain Total: ${formatValue(chain.total)}`);
}

function printPortfolio(valuation: PortfolioValuation): void {
  console.log("\n========================================");
  console.log("MULTI-CHAIN PORTFOLIO");
  console.log("========================================\n");

  for (const chain of valuation.chains) {
    printChain(chain);
  }

  console.log("\n========================================");
  console.log("TOTAL");
  console.log("========================================\n");

  console.log(`${formatValue(valuation.overallTotal)}`);

  if (valuation.warnings.length > 0) {
    console.log("");
    for (const warning of valuation.warnings) {
      console.log(warning);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm start -- <wallet-address>");
    console.log("Example: npm start -- 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    process.exit(0);
  }

  const walletAddress = args[0];

  if (!validateAddress(walletAddress)) {
    console.error("❌ Invalid Ethereum address format");
    process.exit(1);
  }

  const apiKey = process.env.ALCHEMY_API_KEY;

  if (!apiKey || apiKey === "your_alchemy_api_key_here") {
    console.error("❌ ALCHEMY_API_KEY not set. Please create a .env file with your API key.");
    console.error("   See .env.example for format.");
    process.exit(1);
  }

  console.log(`Fetching portfolio for ${walletAddress}...\n`);

  try {
    const portfolioClient = createPortfolioClient(apiKey);
    const networkTokens = await portfolioClient.fetchMultiChainHoldings(walletAddress);

    const allTokens: TokenBalance[] = [];
    for (const nt of networkTokens) {
      if (!nt.error) {
        allTokens.push(...nt.tokens);
      }
    }

    const uniqueTokens = allTokens.filter(
      (token, index, self) =>
        index === self.findIndex(
          (t) => t.network === token.network && t.contractAddress.toLowerCase() === token.contractAddress.toLowerCase()
        )
    );

    const priceTokens = uniqueTokens.map((token) => ({
      network: token.network,
      contractAddress: token.contractAddress,
      symbol: token.symbol,
    }));

    const pricesClient = createPricesClient(apiKey);
    const prices = await pricesClient.fetchPrices(priceTokens);

    const valuation = calculateValuation(networkTokens, prices);
    printPortfolio(valuation);
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

main();