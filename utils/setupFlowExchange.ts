import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deployContract } from "../tasks/utils";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";

export type FlowExchangeConfig = {
  contract: Contract;
  obComplication: Contract;
  WETH: string;
  owner: SignerWithAddress;
  matchExecutor: SignerWithAddress;
};

export async function setupFlowExchange(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress,
  wethAddress: string,
  matchExecutor: SignerWithAddress
) {
  const flowExchange = await deployContract(
    "FlowExchange",
    await getContractFactory("FlowExchange"),
    owner,
    [wethAddress, matchExecutor.address]
  );

  const obComplication = await deployContract(
    "FlowOrderBookComplication",
    await getContractFactory("FlowOrderBookComplication"),
    owner,
    [wethAddress]
  );

  return {
    contract: flowExchange,
    obComplication,
    owner,
    WETH: wethAddress,
    matchExecutor: matchExecutor
  };
}
