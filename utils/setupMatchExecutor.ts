import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";
import { MockVaultConfig } from "./setupMockVault";

export interface MatchExecutorConfig<T extends SignerWithAddress | Contract> {
  contract: Contract;
  intermediary: SignerWithAddress;
  infinityExchange: Contract;
  owner: SignerWithAddress;
  vault: MockVaultConfig;
}

export async function setupMatchExecutor<T extends SignerWithAddress | Contract>(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress,
  intermediary: SignerWithAddress,
  infinityExchange: Contract,
  mockVault: MockVaultConfig
): Promise<MatchExecutorConfig<T>> {
  const MatchExecutor = await getContractFactory("MatchExecutor");
  let matchExecutor = await MatchExecutor.connect(owner).deploy(
    intermediary.address,
    mockVault.contract.address,
    infinityExchange.address
  );

  return {
    contract: matchExecutor,
    owner,
    intermediary: intermediary,
    infinityExchange: infinityExchange,
    vault: mockVault,
  };
}
