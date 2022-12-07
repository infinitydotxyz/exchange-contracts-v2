import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deployContract } from "../tasks/utils";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";

export type InfinityExchangeConfig = {
  contract: Contract;
  obComplication: Contract;
  WETH: string;
  owner: SignerWithAddress;
  matchExecutor: SignerWithAddress;
};

export async function setupInfinityExchange(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress,
  wethAddress: string,
  matchExecutor: SignerWithAddress
) {
  const infinityExchange = await deployContract(
    "InfinityExchange",
    await getContractFactory("InfinityExchange"),
    owner,
    [wethAddress, matchExecutor.address]
  );

  const obComplication = await deployContract(
    "InfinityOrderBookComplication",
    await getContractFactory("InfinityOrderBookComplication"),
    owner,
    [wethAddress]
  );

  return {
    contract: infinityExchange,
    obComplication,
    owner,
    WETH: wethAddress,
    matchExecutor: matchExecutor,
  };
}
