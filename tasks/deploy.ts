import { task } from "hardhat/config";
import { deployContract } from "./utils";
import { Contract, ethers } from "ethers";
require("dotenv").config();

// mainnet
// const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
// polygon
// const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
// goerli
const WETH_ADDRESS = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";

// other vars
let flowToken: Contract, infinityTreasurer: string;

const UNIT = toBN(1e18);
const INITIAL_SUPPLY = toBN(1_000_000_000).mul(UNIT);

function toBN(val: any) {
  return ethers.BigNumber.from(val.toString());
}

task("deployAll", "Deploy all contracts")
  .addFlag("verify", "verify contracts on etherscan")
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const signer2 = (await ethers.getSigners())[1];

    flowToken = await run("deployFlowToken", {
      verify: args.verify
    });

    await run("deployFlowExchange", {
      verify: args.verify,
      wethaddress: WETH_ADDRESS,
      matchexecutor: signer2.address
    });

    await run("deployFlowOrderBookComplication", {
      verify: args.verify,
      wethaddress: WETH_ADDRESS
    });

    infinityTreasurer = signer1.address;

    await run("deployFlowStaker", {
      verify: args.verify,
      token: flowToken.address,
      treasurer: infinityTreasurer
    });
  });

task("deployFlowToken", "Deploy Infinity token contract")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("admin", "admin address")
  .setAction(async (args, { ethers, run }) => {
    const signer1 = (await ethers.getSigners())[0];

    const tokenArgs = [args.admin, INITIAL_SUPPLY.toString()];

    const flowToken = await deployContract(
      "FlowToken",
      await ethers.getContractFactory("FlowToken"),
      signer1,
      tokenArgs
    );

    // verify etherscan
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await flowToken.deployTransaction.wait(5);
      await run("verify:verify", {
        address: flowToken.address,
        contract: "contracts/token/FlowToken.sol:FlowToken",
        constructorArguments: tokenArgs
      });
    }

    return flowToken;
  });

task("deployFlowExchange", "Deploy")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("wethaddress", "weth address")
  .addParam("matchexecutor", "matchexecutor address")
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const flowExchange = await deployContract(
      "FlowExchange",
      await ethers.getContractFactory("FlowExchange"),
      signer1,
      [args.wethaddress, args.matchexecutor]
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await flowExchange.deployTransaction.wait(5);
      await run("verify:verify", {
        address: flowExchange.address,
        contract: "contracts/core/FlowExchange.sol:FlowExchange",
        constructorArguments: [args.wethaddress, args.matchexecutor]
      });
    }
    return flowExchange;
  });

task("deployFlowOrderBookComplication", "Deploy")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("wethaddress", "weth address")
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const obComplication = await deployContract(
      "FlowOrderBookComplication",
      await ethers.getContractFactory("FlowOrderBookComplication"),
      signer1,
      [args.wethaddress]
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await obComplication.deployTransaction.wait(5);
      await run("verify:verify", {
        address: obComplication.address,
        contract: "contracts/core/FlowOrderBookComplication.sol:FlowOrderBookComplication",
        constructorArguments: [args.wethaddress]
      });
    }
    return obComplication;
  });

task("deployFlowStaker", "Deploy")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("token", "infinity token address")
  .addParam("treasurer", "treasurer address")
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const staker = await deployContract(
      "FlowStaker",
      await ethers.getContractFactory("FlowStaker"),
      signer1,
      [args.token, args.treasurer]
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await staker.deployTransaction.wait(5);
      await run("verify:verify", {
        address: staker.address,
        contract: "contracts/staking/FlowStaker.sol:FlowStaker",
        constructorArguments: [args.token, args.treasurer]
      });
    }
    return staker;
  });
