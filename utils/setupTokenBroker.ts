import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";
import { MockVaultConfig } from "./setupMockVault";

export interface TokenBrokerConfig<T extends SignerWithAddress | Contract> {
  contract: Contract;
  intermediary: SignerWithAddress;
  initiator: T;
  owner: SignerWithAddress;
  vault: MockVaultConfig;
}

export async function setupTokenBroker<T extends SignerWithAddress | Contract>(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress,
  intermediary: SignerWithAddress,
  initiator: T,
  mockVault: MockVaultConfig
): Promise<TokenBrokerConfig<T>> {
  const TokenBroker = await getContractFactory("TokenBroker");
  let tokenBroker = await TokenBroker.connect(owner).deploy(
    intermediary.address,
    initiator.address,
    mockVault.contract.address
  );

  return {
    contract: tokenBroker,
    owner,
    intermediary: intermediary,
    initiator: initiator,
    vault: mockVault,
  };
}
