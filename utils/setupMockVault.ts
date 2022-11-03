
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract } from "ethers";

export interface MockVaultConfig {
    contract: Contract,
}

export async function setupMockVault(
    getContractFactory: HardhatEthersHelpers["getContractFactory"],
    signer: SignerWithAddress,
): Promise<MockVaultConfig> {
    const Vault = await getContractFactory("MockBalancerVault");
    const mockVault = await Vault.connect(signer).deploy();
    return {
        contract: mockVault,
    };
}