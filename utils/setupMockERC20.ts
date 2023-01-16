import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumberish, Contract } from "ethers";

export interface MockERC20Config {
  contract: Contract;
  minter: SignerWithAddress;
  minterInitialBalance: BigNumberish;
}

export async function setupMockERC20(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  signer: SignerWithAddress
) {
  const ERC20 = await getContractFactory("MockERC20");
  const mockERC20 = await ERC20.connect(signer).deploy();
  const signerBalance = await mockERC20.balanceOf(signer.address);
  return {
    contract: mockERC20,
    minter: signer,
    minterInitialBalance: signerBalance,
  };
}
