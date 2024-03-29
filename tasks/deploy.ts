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
const FLOW_SUPPLY = toBN(1_000_000_000).mul(UNIT);
const XFL_SUPPLY = toBN(10_000_000_000).mul(UNIT);
const FLUR_SUPPLY = toBN(3_000_000_000).mul(UNIT);

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

task("deployGowlDescriptor", "Deploy Gowl descriptor contract")
  .addFlag("verify", "verify contracts on etherscan")
  .setAction(async (args, { ethers, run }) => {
    const signer1 = (await ethers.getSigners())[0];

    const gowlDescriptor = await deployContract(
      "GowlDescriptor",
      await ethers.getContractFactory("GowlDescriptor"),
      signer1
    );

    // verify etherscan
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await gowlDescriptor.deployTransaction.wait(5);
      await run("verify:verify", {
        address: gowlDescriptor.address,
        contract: "contracts/nfts/GowlDescriptor.sol:GowlDescriptor"
      });
    }

    return gowlDescriptor;
  });

  task("deployGowls", "Deploy Gowls contract")
    .addFlag("verify", "verify contracts on etherscan")
    .addParam("descriptor", "descriptor address")
    .setAction(async (args, { ethers, run }) => {
      const signer1 = (await ethers.getSigners())[0];

      const constructorArgs = [args.descriptor];

      const gowls = await deployContract(
        "Gowls",
        await ethers.getContractFactory("Gowls"),
        signer1,
        constructorArgs
      );

      // verify etherscan
      if (args.verify) {
        // console.log('Verifying source on etherscan');
        await gowls.deployTransaction.wait(5);
        await run("verify:verify", {
          address: gowls.address,
          contract: "contracts/nfts/Gowls.sol:Gowls",
          constructorArguments: constructorArgs
        });
      }

      return gowls;
    });

task("deployFlurToken", "Deploy Flur token contract")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("admin", "admin address")
  .setAction(async (args, { ethers, run }) => {
    const signer1 = (await ethers.getSigners())[0];

    const tokenArgs = [args.admin, FLUR_SUPPLY.toString()];

    const flurToken = await deployContract(
      "FlurToken",
      await ethers.getContractFactory("FlurToken"),
      signer1,
      tokenArgs
    );

    // verify etherscan
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await flurToken.deployTransaction.wait(5);
      await run("verify:verify", {
        address: flurToken.address,
        contract: "contracts/token/FlurToken.sol:FlurToken",
        constructorArguments: tokenArgs
      });
    }

    return flurToken;
  });

task("deployFlowToken", "Deploy Flow token contract")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("admin", "admin address")
  .setAction(async (args, { ethers, run }) => {
    const signer1 = (await ethers.getSigners())[0];

    const tokenArgs = [args.admin, FLOW_SUPPLY.toString()];

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

  task("deployXFLToken", "Deploy XFL token contract")
    .addFlag("verify", "verify contracts on etherscan")
    .addParam("admin", "admin address")
    .setAction(async (args, { ethers, run }) => {
      const signer1 = (await ethers.getSigners())[0];

      const tokenArgs = [args.admin, XFL_SUPPLY.toString()];

      const xflToken = await deployContract(
        "XFLToken",
        await ethers.getContractFactory("XFLToken"),
        signer1,
        tokenArgs
      );

      // verify etherscan
      if (args.verify) {
        // console.log('Verifying source on etherscan');
        await xflToken.deployTransaction.wait(5);
        await run("verify:verify", {
          address: xflToken.address,
          contract: "contracts/token/XFLToken.sol:XFLToken",
          constructorArguments: tokenArgs
        });
      }

      return xflToken;
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

task("deployFlowMatchExecutor", "Deploy")
  .addFlag("verify", "verify contracts on etherscan")
  .addParam("exchange", "exchange address")
  .addParam("initiator", "initiator address")
  .addParam("weth", "weth address")
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const matchExecutor = await deployContract(
      "FlowMatchExecutor",
      await ethers.getContractFactory("FlowMatchExecutor"),
      signer1,
      [args.exchange, args.initiator, args.weth]
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await matchExecutor.deployTransaction.wait(5);
      await run("verify:verify", {
        address: matchExecutor.address,
        contract: "contracts/core/FlowMatchExecutor.sol:FlowMatchExecutor",
        constructorArguments: [args.exchange, args.initiator, args.weth]
      });
    }
    return matchExecutor;
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
  .addParam("token", "flow token address")
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

  task("deployXFLStaker", "Deploy")
    .addFlag("verify", "verify contracts on etherscan")
    .addParam("token", "xfl token address")
    .addParam("unlockblock", "unlockblock number")
    .setAction(async (args, { ethers, run, network }) => {
      const signer1 = (await ethers.getSigners())[0];
      const staker = await deployContract(
        "XFLStaker",
        await ethers.getContractFactory("XFLStaker"),
        signer1,
        [args.token, args.unlockblock]
      );

      // verify source
      if (args.verify) {
        // console.log('Verifying source on etherscan');
        await staker.deployTransaction.wait(5);
        await run("verify:verify", {
          address: staker.address,
          contract: "contracts/staking/XFLStaker.sol:XFLStaker",
          constructorArguments: [args.token, args.unlockblock]
        });
      }
      return staker;
    });
