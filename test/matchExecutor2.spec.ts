import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { ethers, network } from "hardhat";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import { JsonRpcSigner } from "@ethersproject/providers";
import {
  Batch,
  Call,
  ExternalFulfillments,
  Loans,
  MatchOrders,
  MatchOrdersTypes
} from "../utils/matchExecutorTypes";
import { MockERC20Config, setupMockERC20 } from "../utils/setupMockERC20";
import { MockERC721Config, setupMockERC721 } from "../utils/setupMockERC721";
import { MockVaultConfig, setupMockVault } from "../utils/setupMockVault";
import { MatchExecutorConfig, setupMatchExecutor } from "../utils/setupMatchExecutor";
import { parseEther } from "ethers/lib/utils";

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
    if (startTime === -1) {
      startTime = (await infinityExchange.contract.provider.getBlock("latest")).timestamp - 15;
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
      extraParams
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
      currencyAddress: infinityExchange.WETH
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
      currencyAddress: infinityExchange.WETH
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
    createOffer
  };
};

describe("Match_Executor2", () => {
  let mock20: MockERC20Config;
  let mock721: MockERC721Config;
  let mockVault: MockVaultConfig;
  let matchExecutor: MatchExecutorConfig<Contract>;
  let infinityExchange: InfinityExchangeConfig;
  let owner = {} as SignerWithAddress;
  let emptyMatch = {} as MatchOrders;
  let emptyFulfillments = {} as ExternalFulfillments;
  let emptyLoans = {} as Loans;
  let emptyBatch = {} as Batch;

  let orderClientBySigner: Map<SignerWithAddress, ReturnType<typeof getOrderClient>> = new Map();

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: []
    });
    const signers = await ethers.getSigners();
    mock20 = await setupMockERC20(ethers.getContractFactory, signers.pop() as SignerWithAddress);
    mock721 = await setupMockERC721(ethers.getContractFactory, signers.pop() as SignerWithAddress);
    mockVault = await setupMockVault(ethers.getContractFactory, signers.pop() as SignerWithAddress);
    owner = signers.pop() as SignerWithAddress;

    emptyMatch = {
      buys: [],
      sells: [],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneUnspecific
    };

    emptyFulfillments = {
      calls: [],
      nftsToTransfer: []
    };

    emptyBatch = {
      matches: [emptyMatch],
      externalFulfillments: emptyFulfillments
    };

    emptyLoans = {
      tokens: [],
      amounts: []
    };

    infinityExchange = await setupInfinityExchange(
      ethers.getContractFactory,
      owner,
      mock20.contract.address,
      signers.pop() as SignerWithAddress
    );

    matchExecutor = await setupMatchExecutor(
      ethers.getContractFactory,
      owner,
      signers.pop() as SignerWithAddress,
      infinityExchange.contract,
      mockVault
    );

    await infinityExchange.contract
      .connect(owner)
      .updateMatchExecutor(matchExecutor.contract.address);

    orderClientBySigner.set(mock20.minter, getOrderClient(mock20.minter, infinityExchange));
    orderClientBySigner.set(mock721.minter, getOrderClient(mock721.minter, infinityExchange));
  });

  describe("matchExecutor", () => {
    // it("snipe an infinity listing", async () => {
    //   /**
    //    * generate the listing
    //    */
    //   const tokenId = "2";
    //   const orderItems: OrderItem[] = [
    //     {
    //       collection: mock721.contract.address,
    //       tokens: [{ tokenId, numTokens: "1" }]
    //     }
    //   ];

    //   const initialOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
    //   expect(initialOwner).to.equal(trimLowerCase(mock721.minter.address));

    //   await mock721.contract
    //     .connect(mock721.minter)
    //     .setApprovalForAll(infinityExchange.contract.address, true);
    //   const isApproved = await mock721.contract.isApprovedForAll(
    //     mock721.minter.address,
    //     infinityExchange.contract.address
    //   );
    //   expect(isApproved).to.be.true;

    //   const listing = await orderClientBySigner.get(mock721.minter)!.createListing(orderItems);
    //   const signedListing = await listing.prepare();

    //   /**
    //    * generate the call data for the call that will:
    //    *
    //    * set approval for the infinity exchange to transfer the mock erc20
    //    */
    //   const approveWETH = mock20.contract.interface.getFunction("approve");
    //   const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
    //     infinityExchange.contract.address,
    //     ethers.constants.MaxUint256
    //   ]);

    //   // create offer
    //   const offer = await orderClientBySigner.get(mock20.minter)!.createOffer(orderItems);
    //   const signedOffer = await offer.prepare();

    //   /**
    //    * generate the calldata for the matchOneToOneOrders call that will:
    //    *
    //    * purchase the nft
    //    */
    //   const matchOrdersArgs = [[signedListing], [signedOffer]];
    //   const matchOneToOneOrders =
    //     infinityExchange.contract.interface.getFunction("matchOneToOneOrders");
    //   const matchOrdersData = infinityExchange.contract.interface.encodeFunctionData(
    //     matchOneToOneOrders,
    //     matchOrdersArgs
    //   );

    //   const fulfillments: ExternalFulfillments = {
    //     calls: [
    //       {
    //         data: approveWETHData,
    //         value: 0,
    //         to: mock20.contract.address,
    //         isPayable: false
    //       },
    //       {
    //         data: matchOrdersData,
    //         value: 0,
    //         to: infinityExchange.contract.address,
    //         isPayable: false
    //       }
    //     ],
    //     nftsToTransfer: orderItems
    //   };

    //   const matchOrders: MatchOrders = {
    //     buys: [signedOffer!],
    //     sells: [signedListing!],
    //     constructs: [],
    //     matchType: MatchOrdersTypes.OneToOneSpecific
    //   };

    //   const batch: Batch = {
    //     matches: [matchOrders],
    //     externalFulfillments: fulfillments
    //   };

    //   try {
    //     await matchExecutor.contract.executeMatches([batch], emptyLoans);
    //   } catch (err) {
    //     console.error(err);
    //   }

    //   const nftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
    //   expect(nftOwner).to.equal(trimLowerCase(mock20.minter.address));
    // });

    it("snipe a seaport listing", async () => {
      /**
       * generate the seaport listing
       */
      const tokenId = "2";
      const orderItems: OrderItem[] = [
        {
          collection: mock721.contract.address,
          tokens: [{ tokenId, numTokens: "1" }]
        }
      ];

      const initialOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      expect(initialOwner).to.equal(trimLowerCase(mock721.minter.address));

      await mock721.contract
        .connect(mock721.minter)
        .setApprovalForAll(infinityExchange.contract.address, true);
      const isApproved = await mock721.contract.isApprovedForAll(
        mock721.minter.address,
        infinityExchange.contract.address
      );
      expect(isApproved).to.be.true;

      const listing = await orderClientBySigner.get(mock721.minter)!.createListing(orderItems);
      const signedListing = await listing.prepare();

      /**
       * generate the call data for the call that will:
       *
       * set approval for the infinity exchange to transfer the mock erc20
       */
      const approveWETH = mock20.contract.interface.getFunction("approve");
      const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
        infinityExchange.contract.address,
        ethers.constants.MaxUint256
      ]);

      // create offer
      const offer = await orderClientBySigner.get(mock20.minter)!.createOffer(orderItems);
      const signedOffer = await offer.prepare();

      /**
       * generate the calldata for the matchOneToOneOrders call that will:
       *
       * purchase the nft
       */
      const matchOrdersArgs = [[signedListing], [signedOffer]];
      const matchOneToOneOrders =
        infinityExchange.contract.interface.getFunction("matchOneToOneOrders");
      const matchOrdersData = infinityExchange.contract.interface.encodeFunctionData(
        matchOneToOneOrders,
        matchOrdersArgs
      );

      const fulfillments: ExternalFulfillments = {
        calls: [
          {
            data: approveWETHData,
            value: 0,
            to: mock20.contract.address,
            isPayable: false
          },
          {
            data: matchOrdersData,
            value: 0,
            to: infinityExchange.contract.address,
            isPayable: false
          }
        ],
        nftsToTransfer: orderItems
      };

      const matchOrders: MatchOrders = {
        buys: [signedOffer!],
        sells: [signedListing!],
        constructs: [],
        matchType: MatchOrdersTypes.OneToOneSpecific
      };

      const batch: Batch = {
        matches: [matchOrders],
        externalFulfillments: fulfillments
      };

      try {
        await matchExecutor.contract.executeMatches([batch], emptyLoans);
      } catch (err) {
        console.error(err);
      }

      const nftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      expect(nftOwner).to.equal(trimLowerCase(mock20.minter.address));
    });
  });
});
