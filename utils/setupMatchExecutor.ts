import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";

export interface MatchExecutorConfig<T extends SignerWithAddress | Contract> {
  contract: Contract;
  infinityExchange: Contract;
  owner: SignerWithAddress;
}

export async function setupMatchExecutor<T extends SignerWithAddress | Contract>(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress,
  infinityExchange: Contract
): Promise<MatchExecutorConfig<T>> {
  const MatchExecutor = await getContractFactory("MatchExecutor");
  let matchExecutor = await MatchExecutor.connect(owner).deploy(infinityExchange.address);

  return {
    contract: matchExecutor,
    owner,
    infinityExchange: infinityExchange
  };
}
