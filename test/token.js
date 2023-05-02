const { expect } = require("chai");
const { parseEther, formatEther } = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");

describe("XFL_Token", function () {
  let signers, signer1, signer2, token;
  const UNIT = toBN(1e18);
  const MAX_SUPPLY = toBN(10_000_000_000).mul(UNIT);

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
    const XFLToken = await ethers.getContractFactory("XFLToken");
    token = await XFLToken.deploy(signers[0].address, MAX_SUPPLY.toString());
    await token.deployed();
  });

  describe("Setup", () => {
    it("Should init properly", async function () {
      expect(await token.name()).to.equal("XFL Token");
      expect(await token.symbol()).to.equal("XFL");
      expect(await token.decimals()).to.equal(18);
      expect(await token.admin()).to.equal(signers[0].address);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await token.balanceOf(signers[0].address)).to.equal(MAX_SUPPLY);
    });
  });

  describe("Admin", () => {
    it("Default admin", async function () {
      expect(await token.admin()).to.equal(signer1.address);
    });
    it("Should not allow changing admin by a non-admin", async function () {
      await expect(token.connect(signer2).changeAdmin(signer2.address)).to.be.revertedWith(
        "only admin"
      );
    });
    it("Should allow changing admin by admin", async function () {
      await token.changeAdmin(signer2.address);
      expect(await token.admin()).to.equal(signer2.address);
    });
  });
});
