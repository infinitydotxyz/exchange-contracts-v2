import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "./tasks/utils";
import "./tasks/deploy";
import { HardhatUserConfig } from "hardhat/config";
import { parseUnits } from "ethers/lib/utils";

require("dotenv").config();
require("hardhat-contract-sizer");

export default {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 10000000,
      chainId: 1,
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/" + process.env.ALCHEMY_MAINNET_KEY,
        blockNumber: 16620600
      }
    },
    goerli: {
      url: "https://eth-goerli.alchemyapi.io/v2/" + process.env.ALCHEMY_GOERLI_KEY,
      accounts: [process.env.ETH_GOERLI_PRIV_KEY, process.env.ETH_GOERLI_PRIV_KEY_2]
    },
    mainnet: {
      url: "https://eth-mainnet.alchemyapi.io/v2/" + process.env.ALCHEMY_MAINNET_KEY,
      accounts: [process.env.ETH_MAINNET_PRIV_KEY, process.env.ETH_MAINNET_PRIV_KEY_2],
      gasPrice: parseUnits('50', 'gwei').toNumber()
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.14",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 99999999
          }
        }
      }
    ]
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter: {
    enabled: true,
    currency: "USD"
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false
  }
} as HardhatUserConfig;
