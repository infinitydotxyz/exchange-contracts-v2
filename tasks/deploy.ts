import { task } from 'hardhat/config';
import { deployContract } from './utils';
import { Contract, ethers } from 'ethers';
require('dotenv').config();

// mainnet
// const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
// polygon
// const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
// goerli
const WETH_ADDRESS = '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6';

// other vars
let infinityToken: Contract, infinityTreasurer: string;

const UNIT = toBN(1e18);
const INITIAL_SUPPLY = toBN(1_000_000_000).mul(UNIT);

function toBN(val: any) {
  return ethers.BigNumber.from(val.toString());
}

task('deployAll', 'Deploy all contracts')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const signer2 = (await ethers.getSigners())[1];

    infinityToken = await run('deployInfinityToken', {
      verify: args.verify
    });

    await run('deployInfinityExchange', {
      verify: args.verify,
      wethaddress: WETH_ADDRESS,
      matchexecutor: signer2.address
    });

    await run('deployInfinityOrderBookComplication', {
      verify: args.verify,
      wethaddress: WETH_ADDRESS
    });

    infinityTreasurer = signer1.address;

    await run('deployInfinityStaker', {
      verify: args.verify,
      token: infinityToken.address,
      treasurer: infinityTreasurer
    });
  });

task('deployInfinityToken', 'Deploy Infinity token contract')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('admin', 'admin address')
  .setAction(async (args, { ethers, run }) => {
    const signer1 = (await ethers.getSigners())[0];

    const tokenArgs = [args.admin, INITIAL_SUPPLY.toString()];

    const infinityToken = await deployContract(
      'InfinityToken',
      await ethers.getContractFactory('InfinityToken'),
      signer1,
      tokenArgs
    );

    // verify etherscan
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await infinityToken.deployTransaction.wait(5);
      await run('verify:verify', {
        address: infinityToken.address,
        contract: 'contracts/token/InfinityToken.sol:InfinityToken',
        constructorArguments: tokenArgs
      });
    }

    return infinityToken;
  });

task('deployInfinityExchange', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('wethaddress', 'weth address')
  .addParam('matchexecutor', 'matchexecutor address')
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const infinityExchange = await deployContract(
      'InfinityExchange',
      await ethers.getContractFactory('InfinityExchange'),
      signer1,
      [args.wethaddress, args.matchexecutor]
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await infinityExchange.deployTransaction.wait(5);
      await run('verify:verify', {
        address: infinityExchange.address,
        contract: 'contracts/core/InfinityExchange.sol:InfinityExchange',
        constructorArguments: [args.wethaddress, args.matchexecutor]
      });
    }
    return infinityExchange;
  });

task('deployInfinityOrderBookComplication', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const obComplication = await deployContract(
      'InfinityOrderBookComplication',
      await ethers.getContractFactory('InfinityOrderBookComplication'),
      signer1
    );

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await obComplication.deployTransaction.wait(5);
      await run('verify:verify', {
        address: obComplication.address,
      });
    }
    return obComplication;
  });

task('deployInfinityStaker', 'Deploy')
  .addFlag('verify', 'verify contracts on etherscan')
  .addParam('token', 'infinity token address')
  .addParam('treasurer', 'treasurer address')
  .setAction(async (args, { ethers, run, network }) => {
    const signer1 = (await ethers.getSigners())[0];
    const staker = await deployContract('InfinityStaker', await ethers.getContractFactory('InfinityStaker'), signer1, [
      args.token,
      args.treasurer
    ]);

    // verify source
    if (args.verify) {
      // console.log('Verifying source on etherscan');
      await staker.deployTransaction.wait(5);
      await run('verify:verify', {
        address: staker.address,
        contract: 'contracts/staking/InfinityStaker.sol:InfinityStaker',
        constructorArguments: [args.token, args.treasurer]
      });
    }
    return staker;
  });
