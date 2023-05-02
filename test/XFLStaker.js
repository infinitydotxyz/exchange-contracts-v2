const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployContract, NULL_ADDRESS } = require("../tasks/utils");
const { approveERC20 } = require("../helpers/orders");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("XFL_Staker", function () {
  let signers,
    signer1,
    signer2,
    token,
    xflStaker;

  let signer1Balance = toBN(0);
  let xflStakerBalance = toBN(0);

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
      "XFLToken",
      await ethers.getContractFactory("XFLToken"),
      signers[0],
      tokenArgs
    );

    // Infinity Staker
    xflStaker = await deployContract(
      "XFLStaker",
      await ethers.getContractFactory("XFLStaker"),
      signer1,
      [token.address, unlockBlock]
    );

    // send assets
    await token.transfer(signer2.address, INITIAL_SUPPLY.div(2).toString());
  });

  describe("Setup", () => {
    it("Should init properly", async function () {
      expect(await token.name()).to.equal("XFL Token");
      expect(await token.symbol()).to.equal("XFL");
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
      await approveERC20(signer1.address, token.address, amountStaked, signer1, xflStaker.address);
      await xflStaker.connect(signer1).stake(amountStaked);
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(0);
      expect(await token.balanceOf(signer1.address)).to.equal(
        INITIAL_SUPPLY.div(2).sub(amountStaked)
      );
      expect(await token.balanceOf(xflStaker.address)).to.equal(amountStaked);
      signer1Balance = signer1Balance.sub(amountStaked);
      xflStakerBalance = amountStaked;
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
        xflStaker.address
      );
      await xflStaker.connect(signer1).stake(amountStaked2);
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(xflStaker.address)).to.equal(
        xflStakerBalance.add(amountStaked2)
      );
      signer1Balance = signer1Balance.sub(amountStaked2);
      xflStakerBalance = xflStakerBalance.add(amountStaked2);
      totalStaked = totalStaked.add(amountStaked2);
    });
  });

  describe("Unstake tests", () => {
    it("Should not succeed before unlock", async function () {
      await expect(xflStaker.unstake(amountStaked2)).to.be.revertedWith(
        "too early"
      );

      expect(await xflStaker.userStakedAmounts(signer1.address)).to.equal(totalStaked);
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(xflStaker.address)).to.equal(totalStaked);
    });

    it("Should not succeed unstaking more than balance", async function () {
      // try unstaking a large amount
      await expect(xflStaker.unstake(amountStaked2.mul(5))).to.be.revertedWith(
        "insufficient balance to unstake"
      );

      expect(await xflStaker.userStakedAmounts(signer1.address)).to.equal(totalStaked);
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(xflStaker.address)).to.equal(totalStaked);
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
      await expect(xflStaker.unstake(amountStaked2)).to.be.revertedWith("too early");

      // mine one more block
      await mine(1);

      // should succeed
      await xflStaker.unstake(amountStaked);
      expect(await xflStaker.userStakedAmounts(signer1.address)).to.equal(
        totalStaked.sub(amountStaked)
      );
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(1); // bronze
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountStaked));
      expect(await token.balanceOf(xflStaker.address)).to.equal(totalStaked.sub(amountStaked));
      totalStaked = totalStaked.sub(amountStaked);
      signer1Balance = signer1Balance.add(amountStaked);

      // mine a few more
      await mine(100);
      // should succeed
      await xflStaker.unstake(amountStaked2);
      expect(await xflStaker.getUserStakeLevel(signer1.address)).to.equal(0); // none
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountStaked2));
      expect(await token.balanceOf(xflStaker.address)).to.equal(totalStaked.sub(amountStaked2));
      totalStaked = totalStaked.sub(amountStaked2);
      signer1Balance = signer1Balance.add(amountStaked2);
    });
  });

  describe("Admin tests", () => {
    it("Should not allow non admin to update unlock block", async function () {
      await expect(xflStaker.connect(signer2).updateUnlockBlock(123)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      expect(await xflStaker.unlockBlock()).to.equal(unlockBlock);
    });

    it("Should allow admin to update unlock block", async function () {
      const newUnlockBlock = 100;
      await xflStaker.connect(signer1).updateUnlockBlock(newUnlockBlock);
      expect(await xflStaker.unlockBlock()).to.equal(newUnlockBlock);
    });

    it("Should allow admin to update stake threshold", async function () {
      const goldThreshold = toBN(ethers.utils.parseEther("100000"));
      const newGoldThreshold = toBN(ethers.utils.parseEther("150000"));
      expect(await xflStaker.goldStakeThreshold()).to.equal(goldThreshold);
      await xflStaker.connect(signer1).updateStakeLevelThreshold(3, newGoldThreshold);
      expect(await xflStaker.goldStakeThreshold()).to.equal(newGoldThreshold);
    });
  });
});
