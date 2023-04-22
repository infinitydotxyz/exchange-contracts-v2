const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployContract, NULL_ADDRESS } = require("../tasks/utils");
const { approveERC20 } = require("../helpers/orders");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("New_Staker", function () {
  let signers,
    signer1,
    signer2,
    token,
    flowStaker;

  let signer1Balance = toBN(0);
  let flowStakerBalance = toBN(0);

  const MINUTE = 60;
  const HOUR = MINUTE * 60;
  const DAY = HOUR * 24;
  const UNIT = toBN(1e18);
  const INITIAL_SUPPLY = toBN(500_000_000).mul(UNIT);

  const unlockBlock = 17778462;

  const amountStaked = toBN(ethers.utils.parseEther("7000"));
  const amountStaked2 = toBN(ethers.utils.parseEther("43000"));
  let totalStaked = toBN(0);

  function toBN(val) {
    return ethers.BigNumber.from(val.toString());
  }

  before(async () => {
    // reset state
    await network.provider.request({
      method: "hardhat_reset",
      params: []
    });

    // signers
    signers = await ethers.getSigners();
    signer1 = signers[0];
    signer2 = signers[1];
    // token
    const tokenArgs = [signer1.address, INITIAL_SUPPLY.toString()];
    token = await deployContract(
      "FlowToken",
      await ethers.getContractFactory("FlowToken"),
      signers[0],
      tokenArgs
    );

    // Infinity Staker
    flowStaker = await deployContract(
      "FlowStaker",
      await ethers.getContractFactory("FlowStaker"),
      signer1,
      [token.address, unlockBlock]
    );

    // send assets
    await token.transfer(signer2.address, INITIAL_SUPPLY.div(2).toString());
  });

  describe("Setup", () => {
    it("Should init properly", async function () {
      expect(await token.name()).to.equal("Flow");
      expect(await token.symbol()).to.equal("FLOW");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);

      expect(await token.balanceOf(signer1.address)).to.equal(INITIAL_SUPPLY.div(2));
      expect(await token.balanceOf(signer2.address)).to.equal(INITIAL_SUPPLY.div(2));
      signer1Balance = INITIAL_SUPPLY.div(2);
    });
  });

  describe("Stake tokens to none level", () => {
    it("Should stake", async function () {
      // approve erc20
      await approveERC20(signer1.address, token.address, amountStaked, signer1, flowStaker.address);
      await flowStaker.connect(signer1).stake(amountStaked);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);
      expect(await token.balanceOf(signer1.address)).to.equal(
        INITIAL_SUPPLY.div(2).sub(amountStaked)
      );
      expect(await token.balanceOf(flowStaker.address)).to.equal(amountStaked);
      signer1Balance = signer1Balance.sub(amountStaked);
      flowStakerBalance = amountStaked;
      totalStaked = totalStaked.add(amountStaked);
    });
  });

  describe("Stake tokens to silver level", () => {
    it("Should stake", async function () {
      // approve erc20
      await approveERC20(
        signer1.address,
        token.address,
        amountStaked2,
        signer1,
        flowStaker.address
      );
      await flowStaker.connect(signer1).stake(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(
        flowStakerBalance.add(amountStaked2)
      );
      signer1Balance = signer1Balance.sub(amountStaked2);
      flowStakerBalance = flowStakerBalance.add(amountStaked2);
      totalStaked = totalStaked.add(amountStaked2);
    });
  });

  describe("Unstake tests", () => {
    it("Should not succeed before unlock", async function () {
      await expect(flowStaker.unstake(amountStaked2)).to.be.revertedWith(
        "too early"
      );

      expect(await flowStaker.userStakedAmounts(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
    });

    it("Should not succeed unstaking more than balance", async function () {
      // try unstaking a large amount
      await expect(flowStaker.unstake(amountStaked2.mul(5))).to.be.revertedWith(
        "insufficient balance to unstake"
      );

      expect(await flowStaker.userStakedAmounts(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
    });

    it("Should succeed after unlock", async function () {
      // increase time by 4 months
      // console.log('++++++++++++++++++++++++++++++++++ evm increase time ++++++++++++++++++++++++++++++++++++++');
      let currentBlock = await ethers.provider.getBlockNumber();
      console.log("CurrentBlock before mining:", currentBlock, "Unlock Block:", unlockBlock);
      const numBlocksToMine = unlockBlock - currentBlock;
      console.log("Mining", numBlocksToMine - 2, "blocks");
      await mine(numBlocksToMine - 2);
      currentBlock = await ethers.provider.getBlockNumber();
      console.log("CurrentBlock after mining:", currentBlock, "Unlock Block:", unlockBlock);

      //should still fail close to unlock block
      await expect(flowStaker.unstake(amountStaked2)).to.be.revertedWith("too early");

      // mine one more block
      await mine(1);

      // should succeed
      await flowStaker.unstake(amountStaked);
      expect(await flowStaker.userStakedAmounts(signer1.address)).to.equal(
        totalStaked.sub(amountStaked)
      );
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(1); // bronze
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountStaked));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked.sub(amountStaked));
      totalStaked = totalStaked.sub(amountStaked);
      signer1Balance = signer1Balance.add(amountStaked);

      // mine a few more
      await mine(100);
      // should succeed
      await flowStaker.unstake(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0); // none
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked.sub(amountStaked2));
      totalStaked = totalStaked.sub(amountStaked2);
      signer1Balance = signer1Balance.add(amountStaked2);
    });
  });

  describe("Admin tests", () => {
    it("Should not allow non admin to update unlock block", async function () {
      await expect(flowStaker.connect(signer2).updateUnlockBlock(123)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      expect(await flowStaker.unlockBlock()).to.equal(unlockBlock);
    });

    it("Should allow admin to update unlock block", async function () {
      const newUnlockBlock = 100;
      await flowStaker.connect(signer1).updateUnlockBlock(newUnlockBlock);
      expect(await flowStaker.unlockBlock()).to.equal(newUnlockBlock);
    });

    it("Should allow admin to update stake threshold", async function () {
      const goldThreshold = toBN(ethers.utils.parseEther("100000"));
      const newGoldThreshold = toBN(ethers.utils.parseEther("150000"));
      expect(await flowStaker.goldStakeThreshold()).to.equal(goldThreshold);
      await flowStaker.connect(signer1).updateStakeLevelThreshold(3, newGoldThreshold);
      expect(await flowStaker.goldStakeThreshold()).to.equal(newGoldThreshold);
    });
  });
});
