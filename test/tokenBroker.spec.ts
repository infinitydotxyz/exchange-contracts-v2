import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { ethers, network } from "hardhat";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import { JsonRpcSigner } from "@ethersproject/providers";

const getOrderClient = (signer: SignerWithAddress, infinityExchange: InfinityExchangeConfig) => {
  const userAddress = signer.address;
  let orderNonce = 1;
  const chainId = network.config.chainId ?? 31337;

  const _createOrder = async (
    isSellOrder: boolean,
    nfts: OrderItem[],
    numItems = 1,
    execParams: ExecParams,
    startPrice: BigNumberish = ethers.utils.parseEther("1"),
    endPrice: BigNumberish = startPrice,
    startTime: BigNumberish = -1,
    endTime: BigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    if(startTime === -1) {
      startTime = (await infinityExchange.contract.provider.getBlock('latest')).timestamp - 15
    }
    const orderId = ethers.utils.solidityKeccak256(
      ["address", "uint256", "uint256"],
      [userAddress, orderNonce, chainId]
    );
    const order: OBOrder = {
      id: orderId,
      chainId,
      isSellOrder,
      signerAddress: userAddress,
      nonce: `${orderNonce}`,
      numItems: numItems,
      nfts,
      startPrice,
      endPrice,
      startTime,
      endTime,
      execParams,
      extraParams,
    };

    const prepare = () => {
      return prepareOBOrder(
        { address: order.signerAddress },
        chainId,
        signer as any as JsonRpcSigner,
        order,
        infinityExchange.contract,
        infinityExchange.obComplication
      );
    };

    orderNonce += 1;

    return { order, prepare };
  };

  const createListing = async (
    nfts: OrderItem[],
    execParams: ExecParams = {
      complicationAddress: infinityExchange.obComplication.address,
      currencyAddress: infinityExchange.WETH,
    },
    numItems = 1,
    startPrice: BigNumberish = ethers.utils.parseEther("1"),
    endPrice: BigNumberish = startPrice,
    startTime: BigNumberish = -1,
    endTime: BigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {

    return await _createOrder(
      true,
      nfts,
      numItems,
      execParams,
      startPrice,
      endPrice,
      startTime,
      endTime,
      extraParams
    );
  };

  const createOffer = async (
    nfts: OrderItem[],
    execParams: ExecParams = {
      complicationAddress: infinityExchange.obComplication.address,
      currencyAddress: infinityExchange.WETH,
    },
    numItems = 1,
    startPrice: BigNumberish = ethers.utils.parseEther("1"),
    endPrice: BigNumberish = startPrice,
    startTime: BigNumberish = -1,
    endTime: BigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    return _createOrder(
      false,
      nfts,
      numItems,
      execParams,
      startPrice,
      endPrice,
      startTime,
      endTime,
      extraParams
    );
  };

  return {
    createListing,
    createOffer,
  };
};

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
  let orderClientBySigner: Map<SignerWithAddress, ReturnType<typeof getOrderClient>> = new Map();

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    // signers
    const [_signer1, _signer2] = await ethers.getSigners();
    signer1 = _signer1;
    signer2 = _signer2;

    /**
     * mock tokens
     */
    const ERC721 = await ethers.getContractFactory("MockERC721");
    const ERC20 = await ethers.getContractFactory("MockERC20");
    mock721Contract = await ERC721.connect(signer2).deploy("Mock NFT", "MCKNFT");
    mock20Contract = await ERC20.connect(signer2).deploy();

    // token broker
    const TokenBroker = await ethers.getContractFactory("TokenBroker");
    const intermediary = signer1;
    const initiator = signer2;
    const tokenBrokerOwner = initiator;
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
      signer2,
      tokenBroker.contract.address
    );

    orderClientBySigner.set(signer1, getOrderClient(signer1, infinityExchange));
    orderClientBySigner.set(signer2, getOrderClient(signer2, infinityExchange));
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
      const invalidBrokerage = tokenBroker.contract
        .connect(tokenBroker.initiator)
        .broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith("contract is not payable");
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

      const invalidBrokerage = tokenBroker.contract
        .connect(tokenBroker.initiator)
        .broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith("value must be zero in a non-payable call");
    });

    it("can transfer an erc721", async () => {
      const tokenId = "1";
      const nftToTransfer: OrderItem = {
        collection: mock721Contract.address,
        tokens: [{ tokenId, numTokens: "1" }],
      };

      const brokerage = {
        calls: [],
        nftsToTransfer: [nftToTransfer],
      };

      /**
       * attempting to transfer before the token broker is the owner of the token
       * should fail
       */
      const invalidBrokerage = tokenBroker.contract
        .connect(tokenBroker.initiator)
        .broker(brokerage);
      await expect(invalidBrokerage).to.be.revertedWith(
        "ERC721: transfer caller is not owner nor approved"
      );

      /**
       * transfer the nft to the token broker
       */
      await mock721Contract
        .connect(tokenBroker.initiator)
        .transferFrom(tokenBroker.initiator.address, tokenBroker.contract.address, tokenId);
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

    it("can broker a listing on the infinity exchange", async () => {
      /**
       * generate the listing
       */
      const tokenId = "2";
      const orderItems = [
        {
          collection: mock721Contract.address,
          tokens: [{ tokenId, numTokens: "1" }],
        },
      ];


      const initialOwner = trimLowerCase(await mock721Contract.ownerOf(tokenId));
      expect(initialOwner).to.equal(trimLowerCase(tokenBroker.initiator.address));

      await mock721Contract.connect(tokenBroker.initiator).setApprovalForAll(infinityExchange.contract.address, true);
      const isApproved = await mock721Contract.isApprovedForAll(tokenBroker.initiator.address, infinityExchange.contract.address);
      expect(isApproved).to.be.true;

      const listing = await orderClientBySigner.get(tokenBroker.initiator)!.createListing(orderItems);
      const signedListing = await listing.prepare();

      const price = listing.order.startPrice;
      expect(trimLowerCase(listing.order.execParams.currencyAddress)).to.equal(trimLowerCase(mock20Contract.address));

      await mock20Contract
        .connect(tokenBroker.initiator)
        .transfer(tokenBroker.contract.address, price);

      /**
       * generate the call data for the call that will:
       * 
       * set approval for the infinity exchange to transfer the mock erc20
       */
      const approveWETH = mock20Contract.interface.getFunction("approve");
      const approveWETHData = mock20Contract.interface.encodeFunctionData(approveWETH, [
        infinityExchange.contract.address,
        price
      ]);

      /**
       * generate the calldata for the takeOrders call that will: 
       * 
       * purchase the nft
       */
      const takeOrdersArgs = [[signedListing], [orderItems]];
      const takeOrders = infinityExchange.contract.interface.getFunction("takeOrders");
      const takeOrdersData = infinityExchange.contract.interface.encodeFunctionData(
        takeOrders,
        takeOrdersArgs
      );

      const brokerage = {
        calls: [
          {
            data: approveWETHData,
            value: 0,
            to: mock20Contract.address,
            isPayable: false,
          },
          {
            data: takeOrdersData,
            value: 0,
            to: infinityExchange.contract.address,
            isPayable: false,
          },
        ],
        nftsToTransfer: orderItems, 
      };

      try {
        await tokenBroker.contract.broker(brokerage);
      } catch (err) {
        console.error(err);
      }

      const owner = trimLowerCase(await mock721Contract.ownerOf(tokenId));
      expect(owner).to.equal(trimLowerCase(tokenBroker.intermediary.address));
    });
  });
});
