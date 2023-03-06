import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Common from "@reservoir0x/sdk/dist/common";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { getChainId, setupNFTs, setupTokens } from "../utils/reservoirUtils";
import { FlowExchangeConfig, setupFlowExchange } from "../utils/setupFlowExchange";
import { MatchExecutorConfig, setupMatchExecutor } from "../utils/setupMatchExecutor";
import { MockERC20Config, setupMockERC20 } from "../utils/setupMockERC20";

let matchExecutor: MatchExecutorConfig<Contract>;
let flowExchange: FlowExchangeConfig;

describe("Owner_Functions", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;
  let owner: SignerWithAddress;
  let initiator: SignerWithAddress;

  let erc20: MockERC20Config;

  beforeEach(async () => {
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

    [deployer, alice, bob, ted, carol, owner, initiator] = await ethers.getSigners();

    erc20 = await setupMockERC20(ethers.getContractFactory, deployer);

    flowExchange = await setupFlowExchange(
      ethers.getContractFactory,
      owner,
      Common.Addresses.Weth[chainId],
      deployer
    );

    matchExecutor = await setupMatchExecutor(
      ethers.getContractFactory,
      owner,
      initiator,
      flowExchange.contract
    );

    await flowExchange.contract.connect(owner).updateMatchExecutor(matchExecutor.contract.address);
  });

  it("owner should be able to withdraw ETH from flow exchange", async () => {
    const ownerBalanceBefore = await owner.getBalance();
    const contractBalanceBefore = await ethers.provider.getBalance(flowExchange.contract.address);

    await owner.sendTransaction({
      to: flowExchange.contract.address,
      value: parseEther("100")
    });
    expect(await ethers.provider.getBalance(flowExchange.contract.address)).to.equal(
      parseEther("100").add(contractBalanceBefore)
    );

    await flowExchange.contract.connect(owner).withdrawETH(owner.address);
    const contractBalanceAfter = await ethers.provider.getBalance(flowExchange.contract.address);
    expect(contractBalanceAfter).to.equal(contractBalanceBefore);

    const ownerBalanceAfter = await owner.getBalance();
    expect(ownerBalanceBefore.sub(ownerBalanceAfter)).to.be.lessThan(parseEther("0.1")); // to account for gas
  });

  it("non-owner should not be able to withdraw ETH from flow exchange", async () => {
    await expect(flowExchange.contract.connect(alice).withdrawETH(ted.address)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("owner should be able to withdraw ETH from flow match executor", async () => {
    const ownerBalanceBefore = await owner.getBalance();
    const contractBalanceBefore = await ethers.provider.getBalance(matchExecutor.contract.address);

    await owner.sendTransaction({
      to: matchExecutor.contract.address,
      value: parseEther("100")
    });
    expect(await ethers.provider.getBalance(matchExecutor.contract.address)).to.equal(
      parseEther("100").add(contractBalanceBefore)
    );

    await matchExecutor.contract.connect(owner).withdrawETH(owner.address);
    const contractBalanceAfter = await ethers.provider.getBalance(matchExecutor.contract.address);
    expect(contractBalanceAfter).to.equal(contractBalanceBefore);

    const ownerBalanceAfter = await owner.getBalance();
    expect(ownerBalanceBefore.sub(ownerBalanceAfter)).to.be.lessThan(parseEther("0.1")); // to account for gas
  });

  it("non-owner should not be able to withdraw ETH from flow match executor", async () => {
    await expect(matchExecutor.contract.connect(alice).withdrawETH(ted.address)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("owner should be able to withdraw ERC20 from flow exchange", async () => {
    const deployerBalanceBefore = await erc20.contract.balanceOf(deployer.address);
    const contractBalanceBefore = await erc20.contract.balanceOf(flowExchange.contract.address);

    const transferAmount = parseEther("100");
    await erc20.contract.connect(deployer).transfer(flowExchange.contract.address, transferAmount);
    expect(await erc20.contract.balanceOf(flowExchange.contract.address)).to.equal(
      transferAmount.add(contractBalanceBefore)
    );

    await flowExchange.contract
      .connect(owner)
      .withdrawTokens(deployer.address, erc20.contract.address, transferAmount);
    const contractBalanceAfter = await erc20.contract.balanceOf(flowExchange.contract.address);
    expect(contractBalanceAfter).to.equal(contractBalanceBefore);

    const deployerBalanceAfter = await erc20.contract.balanceOf(deployer.address);
    expect(deployerBalanceBefore.sub(deployerBalanceAfter)).to.be.lessThan(parseEther("0.1")); // to account for gas
  });

  it("non-owner should not be able to withdraw ERC20 from flow exchange", async () => {
    const transferAmount = parseEther("100");
    await expect(
      flowExchange.contract
        .connect(alice)
        .withdrawTokens(ted.address, erc20.contract.address, transferAmount)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner should be able to withdraw ERC20 from match executor", async () => {
    const deployerBalanceBefore = await erc20.contract.balanceOf(deployer.address);
    const contractBalanceBefore = await erc20.contract.balanceOf(matchExecutor.contract.address);

    const transferAmount = parseEther("100");
    await erc20.contract.connect(deployer).transfer(matchExecutor.contract.address, transferAmount);
    expect(await erc20.contract.balanceOf(matchExecutor.contract.address)).to.equal(
      transferAmount.add(contractBalanceBefore)
    );

    await matchExecutor.contract
      .connect(owner)
      .withdrawTokens(deployer.address, erc20.contract.address, transferAmount);
    const contractBalanceAfter = await erc20.contract.balanceOf(matchExecutor.contract.address);
    expect(contractBalanceAfter).to.equal(contractBalanceBefore);

    const deployerBalanceAfter = await erc20.contract.balanceOf(deployer.address);
    expect(deployerBalanceBefore.sub(deployerBalanceAfter)).to.be.lessThan(parseEther("0.1")); // to account for gas
  });

  it("non-owner should not be able to withdraw ERC20 from match executor", async () => {
    const transferAmount = parseEther("100");
    await expect(
      matchExecutor.contract
        .connect(alice)
        .withdrawTokens(ted.address, erc20.contract.address, transferAmount)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner should be able to update the match executor", async () => {
    await flowExchange.contract.connect(owner).updateMatchExecutor(matchExecutor.contract.address);
    expect(await flowExchange.contract.matchExecutor()).to.equal(matchExecutor.contract.address);
  });

  it("non-owner should not be able to update the match executor", async () => {
    await expect(
      flowExchange.contract.connect(alice).updateMatchExecutor(ted.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner should be able to pause/unpause the flow exchange", async () => {
    await flowExchange.contract.connect(owner).pause();
    expect(await flowExchange.contract.paused()).to.equal(true);

    await flowExchange.contract.connect(owner).unpause();
    expect(await flowExchange.contract.paused()).to.equal(false);
  });

  it("non-owner should not be able to pause/unpause the flow exchange", async () => {
    await expect(flowExchange.contract.connect(alice).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    await expect(flowExchange.contract.connect(alice).unpause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("owner should be able to pause/unpause the match executor", async () => {
    await matchExecutor.contract.connect(owner).pause();
    expect(await matchExecutor.contract.paused()).to.equal(true);

    await matchExecutor.contract.connect(owner).unpause();
    expect(await matchExecutor.contract.paused()).to.equal(false);
  });

  it("non-owner should not be able to pause/unpause the match executor", async () => {
    await expect(matchExecutor.contract.connect(alice).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    await expect(matchExecutor.contract.connect(alice).unpause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("owner should be able to update initiator on the match executor", async () => {
    await matchExecutor.contract.connect(owner).updateInitiator(bob.address);
    expect(await matchExecutor.contract.initiator()).to.equal(bob.address);
  });

  it("non-owner should not be able to update initiator on the match executor", async () => {
    await expect(
      matchExecutor.contract.connect(alice).updateInitiator(alice.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner should be able to set fees on the flow exchange", async () => {
    await flowExchange.contract.connect(owner).updateProtocolFee(500);
    expect(await flowExchange.contract.protocolFeeBps()).to.equal(500);
  });

  it("non-owner should not be able to set fees on the flow exchange", async () => {
    await expect(flowExchange.contract.connect(alice).updateProtocolFee(0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("owner should be able to add/remove enabled currencies to the complication", async () => {
    await flowExchange.obComplication.connect(owner).addCurrency(erc20.contract.address);
    expect(await flowExchange.obComplication.isValidCurrency(erc20.contract.address)).to.equal(
      true
    );

    await flowExchange.obComplication.connect(owner).removeCurrency(erc20.contract.address);
    expect(await flowExchange.obComplication.isValidCurrency(erc20.contract.address)).to.equal(
      false
    );
  });

  it("non-owner should not be able to add/remove enabled currencies to the complication", async () => {
    await expect(
      flowExchange.obComplication.connect(alice).addCurrency(erc20.contract.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      flowExchange.obComplication.connect(alice).removeCurrency(erc20.contract.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner should be able to set trusted exec status on the complication", async () => {
    await flowExchange.obComplication.connect(owner).setTrustedExecStatus(true);
    expect(await flowExchange.obComplication.trustedExecEnabled()).to.equal(true);
  });

  it("non-owner should not be able to set trusted exec status on the complication", async () => {
    await expect(
      flowExchange.obComplication.connect(alice).setTrustedExecStatus(true)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
