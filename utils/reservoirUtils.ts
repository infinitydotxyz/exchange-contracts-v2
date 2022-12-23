import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as Sdk from "@reservoir0x/sdk/dist";
import { ethers, network } from "hardhat";

// --- Misc ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const lc = (value: string) => value.toLowerCase();

export const getCurrentTimestamp = async (provider: Provider) =>
  provider.getBlock("latest").then((b) => b.timestamp);

export const getRandomBoolean = () => Math.random() < 0.5;

export const getRandomInteger = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getRandomFloat = (min: number, max: number) => Math.random() * (max - min) + min;

// --- Network ---

// Reset forked network state
export const reset = async () => {
  if ((network.config as any).forking) {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: (network.config as any).forking.url,
            blockNumber: (network.config as any).forking.blockNumber
          }
        }
      ]
    });
  }
};

// Retrieve the forked network's chain id
export const getChainId = () => ((network.config as any).forking?.url.includes("goerli") ? 5 : 1);

// --- Deployments ---

// Deploy mock ERC20 contract
export const setupTokens = async (deployer: SignerWithAddress) => {
  const erc20: any = await ethers
    .getContractFactory("MockERC20Reservoir", deployer)
    .then((factory) => factory.deploy());

  return { erc20 };
};

// Deploy mock ERC721/1155 contracts
export const setupNFTs = async (deployer: SignerWithAddress) => {
  const erc721: any = await ethers
    .getContractFactory("MockERC721Reservoir", deployer)
    .then((factory) => factory.deploy());
  const erc1155: any = await ethers
    .getContractFactory("MockERC1155Reservoir", deployer)
    .then((factory) => factory.deploy());

  return { erc721, erc1155 };
};
