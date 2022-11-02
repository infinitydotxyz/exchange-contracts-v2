import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { OrderItem } from '../helpers/orders';
import { trimLowerCase } from "../tasks/utils";

describe("Token_Broker", () => {
  let tokenBroker: {
    contract: Contract;
    intermediary: SignerWithAddress;
    initiator: SignerWithAddress;
    owner: SignerWithAddress;
  };

  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;

  let mock721Contract: Contract;
  let mock20Contract: Contract;

  let infinityExchange: InfinityExchangeConfig;

  before(async () => {
    // signers
    const [_signer1, _signer2] = await ethers.getSigners();
    signer1 = _signer1;
    signer2 = _signer2;
    const TokenBroker = await ethers.getContractFactory("TokenBroker");
    const ERC721 = await ethers.getContractFactory("MockERC721");
    const ERC20 = await ethers.getContractFactory("MockERC20");

    const intermediary = signer1;
    const initiator = signer2;
    const tokenBrokerOwner = initiator;

    mock721Contract = await ERC721.connect(signer2).deploy("Mock NFT", "MCKNFT");
    mock20Contract = await ERC20.connect(signer2).deploy();
    const tokenBrokerContract = await TokenBroker.connect(tokenBrokerOwner).deploy(
      intermediary.address,
      initiator.address
    );
    await tokenBrokerContract.deployed();

    tokenBroker = {
      contract: tokenBrokerContract,
      intermediary: intermediary,
      initiator: initiator,
      owner: tokenBrokerOwner,
    };

    infinityExchange = await setupInfinityExchange(
      ethers.getContractFactory,
      signer1,
      mock20Contract.address,
      signer2
    );
  });

  describe("broker", () => {
    it("is only callable by the initiator", async () => {
      const emptyBrokerage = {
        calls: [],
        nftsToTransfer: [],
      };

      const invalidBrokerage = tokenBroker.contract
        .connect(tokenBroker.intermediary)
        .broker(emptyBrokerage);
      await expect(invalidBrokerage).to.be.revertedWith(
        "only the initiator can initiate the brokerage process"
      );

      const validBrokerage = tokenBroker.contract
        .connect(tokenBroker.initiator)
        .broker(emptyBrokerage);
      try {
        await validBrokerage;
      } catch (err) {
        expect(true).to.be.false;
      }
    });

    it("can call another contract", async () => {
      const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
      const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
        infinityExchange.matchExecutor.address,
        0,
      ]);

      const call = {
        data: data,
        value: 0,
        to: infinityExchange.contract.address,
        isPayable: false,
      };

      const brokerage = {
        calls: [call],
        nftsToTransfer: [],
      };

      const validBrokerage = tokenBroker.contract.connect(tokenBroker.initiator).broker(brokerage);

      try {
        await validBrokerage;
        expect(true).to.be.true;
      } catch (err) {
        expect(true).to.be.false;
      }
    });

    it("cannot call contract that is not payable with value", async () => {
      const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
      const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
        infinityExchange.matchExecutor.address,
        0,
      ]);
      const contract = infinityExchange.contract.address;

      /**
       * ensure the contract is not payable
       */
      const isPayable = await tokenBroker.contract.payableContracts(contract);
      expect(isPayable).to.be.false;

      const call = {
        data: data,
        value: 1,
        to: contract,
        isPayable: true,
      };

      const brokerage = {
        calls: [call],
        nftsToTransfer: [],
      };

      /**
       * attempt to broker a call to the non-payable contract with value
       */
      const invalidBrokerage = tokenBroker.contract.connect(tokenBroker.initiator).broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith('contract is not payable');
    });

    it("cannot have a mismatch between isPayable and value", async () => {
      const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
      const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
        infinityExchange.matchExecutor.address,
        0,
      ]);

      /**
       * note that the value is `1` but `isPayable` is `false`
       */
      const call = {
        data: data,
        value: 1,
        to: infinityExchange.contract.address,
        isPayable: false,
      };

      const brokerage = {
        calls: [call],
        nftsToTransfer: [],
      };

      const invalidBrokerage = tokenBroker.contract.connect(tokenBroker.initiator).broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith('value must be zero in a non-payable call');
    });

    it("can transfer an erc721", async () => {
      const tokenId = '1';
      const nftToTransfer: OrderItem = {
        collection: mock721Contract.address,
        tokens: [
          {tokenId, numTokens: '1' }
        ]
      };

      const brokerage = {
        calls: [],
        nftsToTransfer: [nftToTransfer],
      };

      /**
       * attempting to transfer before the token broker is the owner of the token 
       * should fail 
       */
      const invalidBrokerage = tokenBroker.contract.connect(tokenBroker.initiator).broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');

      /**
       * transfer the nft to the token broker
       */
      await mock721Contract.connect(tokenBroker.initiator).transferFrom(tokenBroker.initiator.address, tokenBroker.contract.address, tokenId);
      const owner = trimLowerCase(await mock721Contract.ownerOf(tokenId));
      const intermediary = trimLowerCase(tokenBroker.intermediary.address);
      const tokenBrokerAddress = trimLowerCase(tokenBroker.contract.address);
      expect(owner).to.equal(tokenBrokerAddress);
      expect(owner).not.to.equal(intermediary);


      /**
       * transfer the nft to the intermediary via broker
       */
      await tokenBroker.contract.connect(tokenBroker.initiator).broker(brokerage);
      const newOwner = trimLowerCase(await mock721Contract.ownerOf(tokenId));
      expect(newOwner).to.equal(intermediary);
    });
  });
});
