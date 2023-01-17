import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumberish, Contract } from "ethers";

export interface MockERC721Config {
  contract: Contract;
  name: string;
  symbol: string;
  minter: SignerWithAddress;
  minterInitialBalance: BigNumberish;
  minterTokens: string[];
}

export async function setupMockERC721(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  signer: SignerWithAddress,
  name = "Mock NFT",
  symbol = "MNFT"
): Promise<MockERC721Config> {
  const ERC721 = await getContractFactory("MockERC721");
  const mockERC721 = await ERC721.connect(signer).deploy(name, symbol);
  return {
    contract: mockERC721,
    name,
    symbol,
    minter: signer,
    minterInitialBalance: 100, // hard coded into the mock contract
    minterTokens: Array.from(Array(100)).map((item, index) => index.toString()),
  };
}
