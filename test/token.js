const { expect } = require('chai');
const { parseEther, formatEther } = require('ethers/lib/utils');
const { ethers, network } = require('hardhat');

describe('Infinity_Token', function () {
  let signers, signer1, signer2, token;
  const MINUTE = 60;
  const HOUR = MINUTE * 60;
  const DAY = HOUR * 24;
  const MONTH = DAY * 30;
  const UNIT = toBN(1e18);
  const INFLATION = toBN(250_000_000).mul(UNIT);
  const CLIFF = toBN(6);
  const CLIFF_PERIOD = CLIFF.mul(MONTH);
  const EPOCH_DURATION = CLIFF_PERIOD.toNumber();
  const MAX_EPOCHS = 4;
  const INITIAL_SUPPLY = toBN(1_000_000_000).mul(UNIT);

  let epochsSinceLastAdvance = 0;

  function toBN(val) {
    return ethers.BigNumber.from(val.toString());
  }

  before(async () => {
    // reset state
    await network.provider.request({
      method: 'hardhat_reset',
      params: []
    });

    // signers
    signers = await ethers.getSigners();
    signer1 = signers[0];
    signer2 = signers[1];
    const InfinityToken = await ethers.getContractFactory('InfinityToken');
    token = await InfinityToken.deploy(signers[0].address, INITIAL_SUPPLY.toString());
    await token.deployed();
  });

  describe('Setup', () => {
    it('Should init properly', async function () {
      expect(await token.name()).to.equal('Infinity');
      expect(await token.symbol()).to.equal('INFT');
      expect(await token.decimals()).to.equal(18);
      expect(await token.admin()).to.equal(signers[0].address);
      expect(await token.EPOCH_INFLATION()).to.equal(INFLATION);
      expect(await token.EPOCH_CLIFF()).to.equal(CLIFF_PERIOD);
      expect(await token.MAX_EPOCHS()).to.equal(MAX_EPOCHS);
      expect(await token.EPOCH_DURATION()).to.equal(EPOCH_DURATION);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(signers[0].address)).to.equal(INITIAL_SUPPLY);
    });
  });

  describe('Pre-cliff', () => {
    it('Should not allow advancing directly after deployment', async function () {
      await expect(token.advanceEpoch()).to.be.revertedWith('cliff not passed');
    });
    it('Should not allow advancing even if very close to the cliff', async function () {
      await network.provider.send('evm_increaseTime', [CLIFF_PERIOD.sub(5 * MINUTE).toNumber()]);
      await expect(token.advanceEpoch()).to.be.revertedWith('cliff not passed');
    });
  });

  describe('Post-cliff', () => {
    it('Should allow advancing after cliff is passed', async function () {
      await network.provider.send('evm_increaseTime', [5 * MINUTE]);
      await token.advanceEpoch();
      epochsSinceLastAdvance++;
      expect((await token.balanceOf(signers[0].address)).toString()).to.equal(
        INITIAL_SUPPLY.add(INFLATION.mul(epochsSinceLastAdvance)).toString()
      );
    });
    it('Should not allow advancing again before epoch period has passed', async function () {
      await network.provider.send('evm_increaseTime', [EPOCH_DURATION - 5 * MINUTE]);
      await expect(token.advanceEpoch()).to.be.revertedWith('not ready to advance');
    });
    it('Should allow advancing after epoch period has passed', async function () {
      await network.provider.send('evm_increaseTime', [5 * MINUTE]);
      await token.advanceEpoch();
      epochsSinceLastAdvance++;
      expect((await token.balanceOf(signers[0].address)).toString()).to.equal(
        INITIAL_SUPPLY.add(INFLATION.mul(epochsSinceLastAdvance)).toString()
      );
    });
    it('Should not allow advancing again before epoch period has passed', async function () {
      await network.provider.send('evm_increaseTime', [EPOCH_DURATION - 5 * MINUTE]);
      await expect(token.advanceEpoch()).to.be.revertedWith('not ready to advance');
    });
    it('Should vest full amount if an epoch is missed', async function () {
      await network.provider.send('evm_increaseTime', [EPOCH_DURATION * 2]);
      await token.advanceEpoch();
      epochsSinceLastAdvance += 2;
      expect((await token.balanceOf(signers[0].address)).toString()).to.equal(
        INITIAL_SUPPLY.add(INFLATION.mul(epochsSinceLastAdvance)).toString()
      );
    });
    it('Should vest the full amount after all epochs have passed', async function () {
      for (let i = await token.currentEpoch(); i < MAX_EPOCHS; i++) {
        await network.provider.send('evm_increaseTime', [EPOCH_DURATION]);
        await token.advanceEpoch();
        expect((await token.balanceOf(signers[0].address)).toString()).to.equal(
          INITIAL_SUPPLY.add(toBN(i).add(toBN(1)).mul(INFLATION)).toString()
        );
      }
      expect((await token.balanceOf(signers[0].address)).toString()).to.equal(
        INITIAL_SUPPLY.add(toBN(MAX_EPOCHS).mul(INFLATION)).toString()
      );
      console.log('Final balance:', formatEther(await token.balanceOf(signers[0].address)));
    });
    it('Should not allow advancing past epoch limit', async function () {
      await network.provider.send('evm_increaseTime', [EPOCH_DURATION]);
      await expect(token.advanceEpoch()).to.be.revertedWith('no epochs left');
    });
  });

  describe('Admin', () => {
    it('Default admin', async function () {
      expect(await token.admin()).to.equal(signer1.address);
    });
    it('Should not allow changing admin by a non-admin', async function () {
      await expect(token.connect(signer2).changeAdmin(signer2.address)).to.be.revertedWith('only admin');
    });
    it('Should allow changing admin by admin', async function () {
      await token.changeAdmin(signer2.address);
      expect(await token.admin()).to.equal(signer2.address);
    });
  });
});
