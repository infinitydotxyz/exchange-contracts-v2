const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployContract, NULL_ADDRESS } = require("../tasks/utils");
const { approveERC20 } = require("../helpers/orders");

describe("Old_Staker", function () {
  let signers,
    signer1,
    signer2,
    token,
    mock721Contract1,
    mock721Contract2,
    mock721Contract3,
    obComplication,
    infinityTreasury,
    flowStaker;

  let signer1Balance = toBN(0);
  let flowStakerBalance = toBN(0);
  let signer2Balance = toBN(0);

  const MINUTE = 60;
  const HOUR = MINUTE * 60;
  const DAY = HOUR * 24;
  const UNIT = toBN(1e18);
  const INITIAL_SUPPLY = toBN(500_000_000).mul(UNIT);

  const totalNFTSupply = 100;
  const numNFTsToTransfer = 50;
  const numNFTsLeft = totalNFTSupply - numNFTsToTransfer;

  const amountStaked = toBN(ethers.utils.parseEther("700"));
  const amountStaked2 = toBN(ethers.utils.parseEther("5000"));
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

    // NFT contracts
    mock721Contract1 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 1", "MCKNFT1"]
    );
    mock721Contract2 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 2", "MCKNFT2"]
    );
    mock721Contract3 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 3", "MCKNFT3"]
    );

    // OB complication
    obComplication = await deployContract(
      "FlowOrderBookComplication",
      await ethers.getContractFactory("FlowOrderBookComplication"),
      signer1,
      [token.address]
    );

    // Infinity treasury
    infinityTreasury = signer2.address;

    // Infinity Staker
    flowStaker = await deployContract(
      "FlowStakerOld",
      await ethers.getContractFactory("FlowStakerOld"),
      signer1,
      [token.address, infinityTreasury]
    );

    // add currencies to registry
    // await flowExchange.addCurrency(token.address);
    // await flowExchange.addCurrency(NULL_ADDRESS);
    await obComplication.addCurrency(token.address);

    // add complications to registry
    // await flowExchange.addCurrency(token.address);

    // send assets
    await token.transfer(signer2.address, INITIAL_SUPPLY.div(2).toString());
    for (let i = 0; i < numNFTsToTransfer; i++) {
      await mock721Contract1.transferFrom(signer1.address, signer2.address, i);
      await mock721Contract2.transferFrom(signer1.address, signer2.address, i);
      await mock721Contract3.transferFrom(signer1.address, signer2.address, i);
    }
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
      signer2Balance = INITIAL_SUPPLY.div(2);

      expect(await mock721Contract1.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract1.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);

      expect(await mock721Contract2.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract2.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);

      expect(await mock721Contract3.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract3.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);
    });
  });

  describe("Stake tokens to silver level", () => {
    it("Should stake", async function () {
      // approve erc20
      await approveERC20(signer1.address, token.address, amountStaked, signer1, flowStaker.address);
      await flowStaker.connect(signer1).stake(amountStaked, 1);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(1);
      expect(await token.balanceOf(signer1.address)).to.equal(
        INITIAL_SUPPLY.div(2).sub(amountStaked)
      );
      expect(await token.balanceOf(flowStaker.address)).to.equal(amountStaked);
      signer1Balance = signer1Balance.sub(amountStaked);
      flowStakerBalance = amountStaked;
      totalStaked = totalStaked.add(amountStaked);
    });
  });

  describe("Stake tokens to gold level", () => {
    it("Should stake", async function () {
      // approve erc20
      await approveERC20(
        signer1.address,
        token.address,
        amountStaked2,
        signer1,
        flowStaker.address
      );
      await flowStaker.connect(signer1).stake(amountStaked2, 0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(2);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(amountStaked2);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(
        flowStakerBalance.add(amountStaked2)
      );
      signer1Balance = signer1Balance.sub(amountStaked2);
      flowStakerBalance = flowStakerBalance.add(amountStaked2);
      totalStaked = totalStaked.add(amountStaked2);
    });
  });

  describe("Change duration to gold level and overall level to platinum", () => {
    it("Should change duration", async function () {
      await flowStaker.changeDuration(amountStaked2, 0, 1);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(3);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(flowStakerBalance);
    });
  });

  describe("Try changing duration to silver level", () => {
    it("Should not change duration", async function () {
      await expect(flowStaker.changeDuration(amountStaked2, 1, 0)).to.be.revertedWith(
        "new duration must exceed old"
      );
    });
  });

  describe("RageQuit to bronze level", () => {
    it("Should rage quit", async function () {
      const totalVested = await flowStaker.getUserTotalVested(signer1.address);
      expect(totalVested).to.equal(0);
      const unvestedRefund = totalStaked.div(2);
      const totalRefund = unvestedRefund.add(totalVested);
      signer2Balance = signer2Balance.add(flowStakerBalance.sub(totalRefund));

      await flowStaker.rageQuit();
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakePower(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(totalRefund));
      expect(await token.balanceOf(signer2.address)).to.equal(signer2Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(0);

      signer1Balance = signer1Balance.add(totalRefund);
      flowStakerBalance = toBN(0);
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
      await flowStaker.connect(signer1).stake(amountStaked2, 0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(1);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(amountStaked2);
      signer1Balance = signer1Balance.sub(amountStaked2);
      flowStakerBalance = amountStaked2;
    });
  });

  describe("Unstake tokens to bronze level", () => {
    it("Should unstake", async function () {
      await flowStaker.unstake(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(0);
      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(0);
      signer1Balance = signer1Balance.add(amountStaked2);
      flowStakerBalance = toBN(0);
    });
  });

  describe("Stake and unstake tests", () => {
    it("Should succeed", async function () {
      // approve erc20
      await approveERC20(
        signer1.address,
        token.address,
        amountStaked2,
        signer1,
        flowStaker.address
      );

      // stake to no duration
      totalStaked = amountStaked2;
      await flowStaker.connect(signer1).stake(amountStaked2, 0);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(1);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(amountStaked2);
      signer1Balance = signer1Balance.sub(amountStaked2);

      // stake to 3 months
      // console.log('++++++++++++++++++++++++++++++++++ Stake to 3 months ++++++++++++++++++++++++++++++++++++++');
      totalStaked = totalStaked.add(amountStaked2);
      await flowStaker.connect(signer1).stake(amountStaked2, 1);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(3);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.sub(amountStaked2);

      // stake to 6 months
      // console.log('++++++++++++++++++++++++++++++++++ Stake to 6 months ++++++++++++++++++++++++++++++++++++++');
      totalStaked = totalStaked.add(amountStaked2);
      await flowStaker.connect(signer1).stake(amountStaked2, 2);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(amountStaked2);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(4);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.sub(amountStaked2);

      // increase time by 3 months
      // console.log('++++++++++++++++++++++++++++++++++ evm increase time ++++++++++++++++++++++++++++++++++++++');
      await network.provider.send("evm_increaseTime", [91 * DAY]);
      await network.provider.send("evm_mine", []);
      let totalVested = amountStaked2.add(amountStaked2);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(totalVested);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(4);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);

      // try unstaking a large amount
      await expect(flowStaker.unstake(amountStaked2.mul(5))).to.be.revertedWith(
        "insufficient balance to unstake"
      );

      // unstake all vested amount
      await flowStaker.unstake(totalVested);
      totalStaked = totalStaked.sub(totalVested);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(3);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(totalVested));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.add(totalVested);

      // try unstaking
      await expect(flowStaker.unstake(amountStaked2)).to.be.revertedWith(
        "insufficient balance to unstake"
      );

      // increase time
      await network.provider.send("evm_increaseTime", [91 * DAY]);
      await network.provider.send("evm_mine", []);
      totalVested = amountStaked2;
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(totalVested);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(3);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance);
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);

      // unstake some vested amount
      const unstakeAmount = totalVested.div(2);
      const amountLeft = totalVested.sub(unstakeAmount);
      await flowStaker.unstake(unstakeAmount);
      totalStaked = totalStaked.sub(unstakeAmount);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(amountLeft);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(2);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(unstakeAmount));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.add(unstakeAmount);

      // ragequit the remaining amount; there shouldn't be any penalty
      await flowStaker.rageQuit();
      totalStaked = totalStaked.sub(amountLeft);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountLeft));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.add(amountLeft);

      // stake to 12 months
      totalStaked = amountStaked2;
      await flowStaker.connect(signer1).stake(amountStaked2, 3);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(3);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(amountStaked2));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.sub(amountStaked2);

      // ragequit the whole amount; there should be penalty
      await flowStaker.rageQuit();
      let amountRefund = totalStaked.div(4);
      let penaltyAmount = totalStaked.sub(amountRefund);
      totalStaked = toBN(0);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountRefund));
      expect(await token.balanceOf(signer2.address)).to.equal(signer2Balance.add(penaltyAmount));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.add(amountRefund);
      signer2Balance = signer2Balance.add(penaltyAmount);

      // stake to 3 and 6 months
      totalStaked = amountStaked2.mul(2);
      await flowStaker.connect(signer1).stake(amountStaked2, 1);
      await flowStaker.connect(signer1).stake(amountStaked2, 2);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(4);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.sub(totalStaked));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.sub(totalStaked);

      // increase time
      await network.provider.send("evm_increaseTime", [91 * DAY]);
      await network.provider.send("evm_mine", []);
      totalVested = amountStaked2;
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(totalVested);

      // ragequit the whole amount; there should be penalty
      await flowStaker.rageQuit();
      amountRefund = totalVested.add(amountStaked2.div(3));
      penaltyAmount = totalStaked.sub(amountRefund);
      totalStaked = toBN(0);
      expect(await flowStaker.getUserTotalStaked(signer1.address)).to.equal(totalStaked);
      expect(await flowStaker.getUserTotalVested(signer1.address)).to.equal(0);
      expect(await flowStaker.getUserStakeLevel(signer1.address)).to.equal(0);

      expect(await token.balanceOf(signer1.address)).to.equal(signer1Balance.add(amountRefund));
      expect(await token.balanceOf(signer2.address)).to.equal(signer2Balance.add(penaltyAmount));
      expect(await token.balanceOf(flowStaker.address)).to.equal(totalStaked);
      signer1Balance = signer1Balance.add(amountRefund);
      signer2Balance = signer2Balance.add(penaltyAmount);
    });
  });
});
