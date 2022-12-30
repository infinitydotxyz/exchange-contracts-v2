import { Contract } from "@ethersproject/contracts";
import { JsonRpcSigner } from "@ethersproject/providers";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  Blur,
  CryptoPunks,
  Element,
  Forward,
  Foundation,
  Infinity,
  LooksRare,
  Manifold,
  Rarible,
  Universe,
  X2Y2,
  ZeroExV4,
  Zora
} from "@reservoir0x/sdk";
import * as Common from "@reservoir0x/sdk/dist/common";
import * as Seaport from "@reservoir0x/sdk/dist/seaport";
import axios from "axios";
import { expect } from "chai";
import { BigNumberish as ethersBigNumberish } from "ethers";
import { ethers, network } from "hardhat";
import { batchPrepareOBOrders, prepareOBOrder } from "../helpers/orders";
import { ExecParams, ExtraParams, OBOrder, OrderItem } from "../helpers/orderTypes";
import { nowSeconds } from "../tasks/utils";
import {
  Batch,
  ExternalFulfillments,
  MatchOrders,
  MatchOrdersTypes
} from "../utils/matchExecutorTypes";
import {
  bn,
  getChainId,
  getCurrentTimestamp,
  lc,
  setupNFTs,
  setupTokens
} from "../utils/reservoirUtils";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { MatchExecutorConfig, setupMatchExecutor } from "../utils/setupMatchExecutor";

let matchExecutor: MatchExecutorConfig<Contract>;
let infinityExchange: InfinityExchangeConfig;
let orderClientBySigner: Map<
  SignerWithAddress,
  ReturnType<typeof getInfinityOrderClient>
> = new Map();

const getInfinityOrderClient = (
  signer: SignerWithAddress,
  infinityExchange: InfinityExchangeConfig,
  signingFor?: string
) => {
  const chainId = getChainId();
  const userAddress = signingFor ?? signer.address;
  let orderNonce = 1;

  const _createOrder = async (
    isSellOrder: boolean,
    nfts: OrderItem[],
    numItems = 1,
    execParams: ExecParams,
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    if (startTime === -1) {
      startTime = await getCurrentTimestamp(ethers.provider);
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
        infinityExchange.obComplication,
        true
      );
    };

    orderNonce += 1;

    return { order, prepare };
  };

  const _batchCreateOrders = async (
    isSellOrder: boolean,
    nfts: OrderItem[],
    numItems = 1,
    execParams: ExecParams,
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    if (startTime === -1) {
      startTime = await getCurrentTimestamp(ethers.provider);
    }
    const orderId = ethers.utils.solidityKeccak256(
      ["address", "uint256", "uint256"],
      [userAddress, orderNonce, chainId]
    );

    const orders: OBOrder[] = [];
    for (let i = 0; i < nfts.length; i++) {
      const nft = nfts[i];
      const collection = nft.collection;
      for (let j = 0; j < nft.tokens.length; j++) {
        const tokenId = nft.tokens[j].tokenId;
        const numTokens = nft.tokens[j].numTokens;
        const order: OBOrder = {
          id: orderId,
          chainId,
          isSellOrder,
          signerAddress: userAddress,
          nonce: `${orderNonce}`,
          numItems: numItems,
          nfts: [{ collection, tokens: [{ tokenId, numTokens }] }],
          startPrice,
          endPrice,
          startTime,
          endTime,
          execParams,
          extraParams
        };
        orders.push(order);
        orderNonce += 1;
      }
    }

    const batchPrepare = () => {
      return batchPrepareOBOrders(
        { address: orders[0].signerAddress },
        chainId,
        signer as any as JsonRpcSigner,
        orders,
        infinityExchange.contract,
        infinityExchange.obComplication,
        true
      );
    };

    return { orders, batchPrepare };
  };

  const createListing = async (
    nfts: OrderItem[],
    execParams: ExecParams = {
      complicationAddress: infinityExchange.obComplication.address,
      currencyAddress: Common.Addresses.Eth[chainId]
    },
    numItems = 1,
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
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

  const batchCreateListings = async (
    nfts: OrderItem[],
    execParams: ExecParams = {
      complicationAddress: infinityExchange.obComplication.address,
      currencyAddress: Common.Addresses.Eth[chainId]
    },
    numItems = 1,
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    return await _batchCreateOrders(
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
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
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

  const batchCreateOffers = async (
    nfts: OrderItem[],
    execParams: ExecParams = {
      complicationAddress: infinityExchange.obComplication.address,
      currencyAddress: infinityExchange.WETH
    },
    numItems = 1,
    startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
    endPrice: ethersBigNumberish = startPrice,
    startTime: ethersBigNumberish = -1,
    endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
    extraParams: ExtraParams = {}
  ) => {
    return _batchCreateOrders(
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
    batchCreateListings,
    createOffer,
    batchCreateOffers
  };
};

describe("Match_Executor", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;
  let owner: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;

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

    [deployer, alice, bob, ted, carol, owner] = await ethers.getSigners();

    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));

    infinityExchange = await setupInfinityExchange(
      ethers.getContractFactory,
      owner,
      Common.Addresses.Weth[chainId],
      deployer
    );

    matchExecutor = await setupMatchExecutor(
      ethers.getContractFactory,
      owner,
      infinityExchange.contract
    );

    await infinityExchange.contract
      .connect(owner)
      .updateMatchExecutor(matchExecutor.contract.address);

    // add enabled exchanges
    await matchExecutor.contract.addEnabledExchange(Infinity.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Seaport.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(CryptoPunks.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Blur.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(LooksRare.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(X2Y2.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Element.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Foundation.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Forward.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Rarible.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Manifold.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Universe.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(ZeroExV4.Addresses.Exchange[chainId]);
    await matchExecutor.contract.addEnabledExchange(Zora.Addresses.Exchange[chainId]);

    orderClientBySigner.set(bob, getInfinityOrderClient(bob, infinityExchange));
    orderClientBySigner.set(
      owner,
      getInfinityOrderClient(owner, infinityExchange, matchExecutor.contract.address)
    );
    orderClientBySigner.set(alice, getInfinityOrderClient(alice, infinityExchange));
  });

  it("snipes a ETH <=> ERC721 single token native listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the infinity exchange
    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const infinityListing = await orderClientBySigner
      .get(seller)!
      .createListing(infinityOrderItems);
    const signedInfinityListing = await infinityListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedInfinityListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    console.log("Executing native matches");
    try {
      await matchExecutor.contract.connect(owner).executeNativeMatches([matchOrders]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token bulk signed native listings", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId1 = 1;
    const tokenId2 = 2;
    const tokenId3 = 3;
    const tokenId4 = 4;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId1);
    await erc721.connect(seller).mint(tokenId2);
    await erc721.connect(seller).mint(tokenId3);
    await erc721.connect(seller).mint(tokenId4);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the infinity exchange
    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

    const ownerBefore1 = await nft.getOwner(tokenId1);
    expect(ownerBefore1).to.eq(seller.address);
    const ownerBefore2 = await nft.getOwner(tokenId2);
    expect(ownerBefore2).to.eq(seller.address);
    const ownerBefore3 = await nft.getOwner(tokenId3);
    expect(ownerBefore3).to.eq(seller.address);
    const ownerBefore4 = await nft.getOwner(tokenId4);
    expect(ownerBefore4).to.eq(seller.address);

    // create infinity listings
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [
          { tokenId: tokenId1, numTokens: "1" },
          { tokenId: tokenId2, numTokens: "1" },
          { tokenId: tokenId3, numTokens: "1" },
          { tokenId: tokenId4, numTokens: "1" }
        ]
      }
    ];
    const infinityListings = await orderClientBySigner
      .get(seller)!
      .batchCreateListings(infinityOrderItems);
    const signedInfinityListings = await infinityListings.batchPrepare();

    // create infinity offers
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(100)); // multiply for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffers = await orderClientBySigner
      .get(buyer)!
      .batchCreateOffers(infinityOrderItems);
    const signedInfinityOffers = await infinityOffers.batchPrepare();

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: signedInfinityOffers!,
      sells: signedInfinityListings!,
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    console.log("Executing bulk signed native matches");
    try {
      await matchExecutor.contract.connect(owner).executeNativeMatches([matchOrders]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter1 = await nft.getOwner(tokenId1);
    expect(ownerAfter1).to.eq(buyer.address);
    const ownerAfter2 = await nft.getOwner(tokenId2);
    expect(ownerAfter2).to.eq(buyer.address);
    const ownerAfter3 = await nft.getOwner(tokenId3);
    expect(ownerAfter3).to.eq(buyer.address);
    const ownerAfter4 = await nft.getOwner(tokenId4);
    expect(ownerAfter4).to.eq(buyer.address);
  });

  it("batch snipes ETH <=> ERC721 single token listings from infinity, seaport, looksrare and blur", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1").toString();
    const tokenId1 = 1;
    const tokenId2 = 2;
    const tokenId3 = 3;
    const tokenId4 = 4;
    const tokenId5 = 5;
    const tokenId6 = 6;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId1);
    await erc721.connect(seller).mint(tokenId2);
    await erc721.connect(seller).mint(tokenId3);
    await erc721.connect(seller).mint(tokenId4);
    await erc721.connect(seller).mint(tokenId5);
    await erc721.connect(seller).mint(tokenId6);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const ownerBefore1 = await nft.getOwner(tokenId1);
    expect(ownerBefore1).to.eq(seller.address);
    const ownerBefore2 = await nft.getOwner(tokenId2);
    expect(ownerBefore2).to.eq(seller.address);
    const ownerBefore3 = await nft.getOwner(tokenId3);
    expect(ownerBefore3).to.eq(seller.address);
    const ownerBefore4 = await nft.getOwner(tokenId4);
    expect(ownerBefore4).to.eq(seller.address);
    const ownerBefore5 = await nft.getOwner(tokenId5);
    expect(ownerBefore5).to.eq(seller.address);
    const ownerBefore6 = await nft.getOwner(tokenId6);
    expect(ownerBefore6).to.eq(seller.address);

    // infinity listing
    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);
    const infinityExchange = new Infinity.Exchange(chainId);
    const infnityBuilder = new Infinity.Builders.SingleToken(chainId);
    const infinitySellOrder = infnityBuilder.build({
      isSellOrder: true,
      collection: erc721.address,
      signer: seller.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Eth[chainId],
      tokenId: tokenId1.toString(),
      numTokens: 1
    });
    await infinitySellOrder.sign(seller);
    await infinitySellOrder.checkFillability(ethers.provider);

    // seaport listing
    await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);
    const seaportExchange = new Seaport.Exchange(chainId);
    const seaPortBuilder = new Seaport.Builders.SingleToken(chainId);
    const seaportSellOrder = seaPortBuilder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId: tokenId2,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60
    });
    await seaportSellOrder.sign(seller);
    await seaportSellOrder.checkFillability(ethers.provider);

    // blur listings
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);
    const blurExchange = new Blur.Exchange(chainId);
    const blurBuilder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder = blurBuilder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId3,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });
    const blurSellOrder1 = blurBuilder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId4,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });
    const blurSellOrder2 = blurBuilder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId5,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });
    await blurSellOrder.sign(seller);
    await blurSellOrder.checkFillability(ethers.provider);
    await Blur.Order.signBulk([blurSellOrder1, blurSellOrder2], seller);
    await blurSellOrder1.checkFillability(ethers.provider);
    await blurSellOrder2.checkFillability(ethers.provider);

    // looksrare listing
    await nft.approve(seller, LooksRare.Addresses.TransferManagerErc721[chainId]);
    const looksrareExchange = new LooksRare.Exchange(chainId);
    const lrBuilder = new LooksRare.Builders.SingleToken(chainId);
    const lrSellOrder = lrBuilder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: erc721.address,
      tokenId: tokenId6,
      // LooksRare sell orders are in WETH
      currency: Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await looksrareExchange.getNonce(ethers.provider, seller.address)
    });
    await lrSellOrder.sign(seller);
    await lrSellOrder.checkFillability(ethers.provider);

    // create infinity listings
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [
          { tokenId: tokenId1, numTokens: "1" },
          { tokenId: tokenId2, numTokens: "1" },
          { tokenId: tokenId3, numTokens: "1" },
          { tokenId: tokenId4, numTokens: "1" },
          { tokenId: tokenId5, numTokens: "1" },
          { tokenId: tokenId6, numTokens: "1" }
        ]
      }
    ];
    const infinityListings = await orderClientBySigner
      .get(owner)!
      .batchCreateListings(infinityOrderItems);
    const signedInfinityListings = await infinityListings.batchPrepare();

    // create infinity offers
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, bn(price).mul(100)); // multiply for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffers = await orderClientBySigner
      .get(buyer)!
      .batchCreateOffers(infinityOrderItems);
    const signedInfinityOffers = await infinityOffers.batchPrepare();

    console.log("Encoding external fulfillments");
    const infinityTxData = infinityExchange.takeMultipleOneOrdersTx(
      matchExecutor.contract.address,
      [infinitySellOrder]
    );
    const seaportTxData = seaportExchange.fillOrderTx(
      matchExecutor.contract.address,
      seaportSellOrder,
      seaportSellOrder.buildMatching()
    );
    const blurTxData = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder,
      blurSellOrder.buildMatching({ trader: matchExecutor.contract.address })
    );
    const blurTxData1 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder1,
      blurSellOrder1.buildMatching({ trader: matchExecutor.contract.address })
    );
    const blurTxData2 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder2,
      blurSellOrder2.buildMatching({ trader: matchExecutor.contract.address })
    );
    const lrTxData = looksrareExchange.fillOrderTx(
      matchExecutor.contract.address,
      lrSellOrder,
      lrSellOrder.buildMatching(matchExecutor.contract.address)
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: infinityTxData.data,
          value: infinityTxData.value ?? 0,
          to: infinityTxData.to,
          isPayable: true
        },
        {
          data: seaportTxData.data,
          value: seaportTxData.value ?? 0,
          to: seaportTxData.to,
          isPayable: true
        },
        {
          data: blurTxData.data,
          value: blurTxData.value ?? 0,
          to: blurTxData.to,
          isPayable: true
        },
        {
          data: blurTxData1.data,
          value: blurTxData1.value ?? 0,
          to: blurTxData1.to,
          isPayable: true
        },
        {
          data: blurTxData2.data,
          value: blurTxData2.value ?? 0,
          to: blurTxData2.to,
          isPayable: true
        },
        {
          data: lrTxData.data,
          value: lrTxData.value ?? 0,
          to: lrTxData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: signedInfinityOffers!,
      sells: signedInfinityListings!,
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: parseEther("100")
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter1 = await nft.getOwner(tokenId1);
    expect(ownerAfter1).to.eq(buyer.address);
    const ownerAfter2 = await nft.getOwner(tokenId2);
    expect(ownerAfter2).to.eq(buyer.address);
    const ownerAfter3 = await nft.getOwner(tokenId3);
    expect(ownerAfter3).to.eq(buyer.address);
    const ownerAfter4 = await nft.getOwner(tokenId4);
    expect(ownerAfter4).to.eq(buyer.address);
    const ownerAfter5 = await nft.getOwner(tokenId5);
    expect(ownerAfter5).to.eq(buyer.address);
    const ownerAfter6 = await nft.getOwner(tokenId6);
    expect(ownerAfter6).to.eq(buyer.address);
  });

  it("variation - batch snipes ETH <=> ERC721 single token listings from infinity, seaport, looksrare and blur", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1").toString();
    const tokenId1 = 1;
    const tokenId2 = 2;
    const tokenId3 = 3;
    const tokenId4 = 4;
    const tokenId5 = 5;
    const tokenId6 = 6;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId1);
    await erc721.connect(seller).mint(tokenId2);
    await erc721.connect(seller).mint(tokenId3);
    await erc721.connect(seller).mint(tokenId4);
    await erc721.connect(seller).mint(tokenId5);
    await erc721.connect(seller).mint(tokenId6);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const ownerBefore1 = await nft.getOwner(tokenId1);
    expect(ownerBefore1).to.eq(seller.address);
    const ownerBefore2 = await nft.getOwner(tokenId2);
    expect(ownerBefore2).to.eq(seller.address);
    const ownerBefore3 = await nft.getOwner(tokenId3);
    expect(ownerBefore3).to.eq(seller.address);
    const ownerBefore4 = await nft.getOwner(tokenId4);
    expect(ownerBefore4).to.eq(seller.address);
    const ownerBefore5 = await nft.getOwner(tokenId5);
    expect(ownerBefore5).to.eq(seller.address);
    const ownerBefore6 = await nft.getOwner(tokenId6);
    expect(ownerBefore6).to.eq(seller.address);

    // infinity listing
    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);
    const infinityExchange = new Infinity.Exchange(chainId);
    const infnityBuilder = new Infinity.Builders.SingleToken(chainId);
    const infinitySellOrder = infnityBuilder.build({
      isSellOrder: true,
      collection: erc721.address,
      signer: seller.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Eth[chainId],
      tokenId: tokenId1.toString(),
      numTokens: 1
    });
    await infinitySellOrder.sign(seller);
    await infinitySellOrder.checkFillability(ethers.provider);

    // seaport listing
    await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);
    const seaportExchange = new Seaport.Exchange(chainId);
    const seaPortBuilder = new Seaport.Builders.SingleToken(chainId);
    const seaportSellOrder = seaPortBuilder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId: tokenId2,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60
    });
    await seaportSellOrder.sign(seller);
    await seaportSellOrder.checkFillability(ethers.provider);

    // blur listings
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);
    const blurExchange = new Blur.Exchange(chainId);
    const blurBuilder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder = blurBuilder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId3,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });
    await blurSellOrder.sign(seller);
    await blurSellOrder.checkFillability(ethers.provider);

    // looksrare listing
    await nft.approve(seller, LooksRare.Addresses.TransferManagerErc721[chainId]);
    const looksrareExchange = new LooksRare.Exchange(chainId);
    const lrBuilder = new LooksRare.Builders.SingleToken(chainId);
    const lrSellOrder = lrBuilder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: erc721.address,
      tokenId: tokenId4,
      // LooksRare sell orders are in WETH
      currency: Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await looksrareExchange.getNonce(ethers.provider, seller.address)
    });
    await lrSellOrder.sign(seller);
    await lrSellOrder.checkFillability(ethers.provider);

    // native bulk signed listings
    const infinityNativeBulkSellOrders = await orderClientBySigner.get(seller)!.batchCreateListings([
      {
        collection: erc721.address,
        tokens: [
          { tokenId: tokenId5, numTokens: "1" },
          { tokenId: tokenId6, numTokens: "1" }
        ]
      }
    ]);
    const signedInfinityNativeBulkSellOrders = await infinityNativeBulkSellOrders.batchPrepare();

    // create infinity listings
    const infinityOrderItems123: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [
          { tokenId: tokenId1, numTokens: "1" },
          { tokenId: tokenId2, numTokens: "1" },
          { tokenId: tokenId3, numTokens: "1" }
        ]
      }
    ];
    const intermediaryListings123 = await orderClientBySigner
      .get(owner)!
      .batchCreateListings(infinityOrderItems123);
    const signedIntermediaryListings123 = await intermediaryListings123.batchPrepare();

    const infinityOrderItems4: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId4, numTokens: "1" }]
      }
    ];
    const intermediaryListing4 = await orderClientBySigner.get(owner)!.createListing([
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId4, numTokens: "1" }]
      }
    ]);
    const signedIntermediaryListing4 = await intermediaryListing4.prepare();

    const infinityOrderItems5: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId5, numTokens: "1" }]
      }
    ];

    const infinityOrderItems6: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId6, numTokens: "1" }]
      }
    ];


    const signedIntermediaryListings1234 = signedIntermediaryListings123!.concat(signedIntermediaryListing4!);

    // create infinity offers
    const allInfinityOrderItems = infinityOrderItems123.concat(
      infinityOrderItems4,
      infinityOrderItems5,
      infinityOrderItems6
    );
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, bn(price).mul(100)); // multiply for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const batchedInfinityOffers = await orderClientBySigner
      .get(buyer)!
      .batchCreateOffers(allInfinityOrderItems);
    const allBatchSignedInfinityOffers = await batchedInfinityOffers.batchPrepare();

    console.log("Encoding external fulfillments");
    const infinityTxData = infinityExchange.takeMultipleOneOrdersTx(
      matchExecutor.contract.address,
      [infinitySellOrder]
    );
    const seaportTxData = seaportExchange.fillOrderTx(
      matchExecutor.contract.address,
      seaportSellOrder,
      seaportSellOrder.buildMatching()
    );
    const blurTxData = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder,
      blurSellOrder.buildMatching({ trader: matchExecutor.contract.address })
    );
    const lrTxData = looksrareExchange.fillOrderTx(
      matchExecutor.contract.address,
      lrSellOrder,
      lrSellOrder.buildMatching(matchExecutor.contract.address)
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: infinityTxData.data,
          value: infinityTxData.value ?? 0,
          to: infinityTxData.to,
          isPayable: true
        },
        {
          data: seaportTxData.data,
          value: seaportTxData.value ?? 0,
          to: seaportTxData.to,
          isPayable: true
        },
        {
          data: blurTxData.data,
          value: blurTxData.value ?? 0,
          to: blurTxData.to,
          isPayable: true
        },
        {
          data: lrTxData.data,
          value: lrTxData.value ?? 0,
          to: lrTxData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems123.concat(infinityOrderItems4)
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrdersExternal: MatchOrders = {
      buys: [
        allBatchSignedInfinityOffers![0],
        allBatchSignedInfinityOffers![1],
        allBatchSignedInfinityOffers![2],
        allBatchSignedInfinityOffers![3]
      ],
      sells: signedIntermediaryListings1234!,
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrdersExternal],
      externalFulfillments: fulfillments
    };

    const matchOrdersNative: MatchOrders = {
      buys: [allBatchSignedInfinityOffers![4], allBatchSignedInfinityOffers![5]],
      sells: signedInfinityNativeBulkSellOrders!,
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: parseEther("100")
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
      await matchExecutor.contract.connect(owner).executeNativeMatches([matchOrdersNative]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter1 = await nft.getOwner(tokenId1);
    expect(ownerAfter1).to.eq(buyer.address);
    const ownerAfter2 = await nft.getOwner(tokenId2);
    expect(ownerAfter2).to.eq(buyer.address);
    const ownerAfter3 = await nft.getOwner(tokenId3);
    expect(ownerAfter3).to.eq(buyer.address);
    const ownerAfter4 = await nft.getOwner(tokenId4);
    expect(ownerAfter4).to.eq(buyer.address);
    const ownerAfter5 = await nft.getOwner(tokenId5);
    expect(ownerAfter5).to.eq(buyer.address);
    const ownerAfter6 = await nft.getOwner(tokenId6);
    expect(ownerAfter6).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token infinity listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1").toString();
    const tokenId = "1";

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

    const infinityExchange = new Infinity.Exchange(chainId);
    const builder = new Infinity.Builders.SingleToken(chainId);
    const infinitySellOrder = builder.build({
      isSellOrder: true,
      collection: erc721.address,
      signer: seller.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Eth[chainId],
      tokenId,
      numTokens: 1
    });

    // Sign the order
    await infinitySellOrder.sign(seller);
    await infinitySellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, bn(price).mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const txData = infinityExchange.takeMultipleOneOrdersTx(matchExecutor.contract.address, [
      infinitySellOrder
    ]);
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token seaport listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);

    const seaportExchange = new Seaport.Exchange(chainId);
    const builder = new Seaport.Builders.SingleToken(chainId);
    const seaportSellOrder = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60
    });

    // Sign the order
    await seaportSellOrder.sign(seller);
    await seaportSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = seaportSellOrder.buildMatching();
    const txData = seaportExchange.fillOrderTx(
      matchExecutor.contract.address,
      seaportSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token seaport listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const feeRecipient1 = ted;
    const fee1 = parseEther("0.025");
    const feeRecipient2 = carol;
    const fee2 = parseEther("0.05");

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);

    const seaportExchange = new Seaport.Exchange(chainId);
    const builder = new Seaport.Builders.SingleToken(chainId);
    const seaportSellOrder = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      fees: [
        {
          amount: fee1,
          recipient: feeRecipient1.address
        },
        {
          amount: fee2,
          recipient: feeRecipient2.address
        }
      ],
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60
    });

    // Sign the order
    await seaportSellOrder.sign(seller);
    await seaportSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = seaportSellOrder.buildMatching();
    const txData = seaportExchange.fillOrderTx(
      matchExecutor.contract.address,
      seaportSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
    const feeRecipient1EthBalanceBefore = await ethers.provider.getBalance(feeRecipient1.address);
    const feeRecipient2EthBalanceBefore = await ethers.provider.getBalance(feeRecipient2.address);

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
    const feeRecipient1EthBalanceAfter = await ethers.provider.getBalance(feeRecipient1.address);
    const feeRecipient2EthBalanceAfter = await ethers.provider.getBalance(feeRecipient2.address);
    const ownerAfter = await nft.getOwner(tokenId);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.lt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(feeRecipient1EthBalanceAfter.sub(feeRecipient1EthBalanceBefore)).to.eq(fee1);
    expect(feeRecipient2EthBalanceAfter.sub(feeRecipient2EthBalanceBefore)).to.eq(fee2);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token non-bulk signed blur listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the blur exchange
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    const blurExchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });

    // Sign the order
    await blurSellOrder.sign(seller);
    await blurSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = blurSellOrder.buildMatching({ trader: matchExecutor.contract.address });
    const txData = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token non-bulk signed blur listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the blur exchange
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    const blurExchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [
        {
          recipient: carol.address,
          rate: 100
        },
        {
          recipient: ted.address,
          rate: 200
        }
      ],
      salt: 0,
      extraParams: "0x"
    });

    // Sign the order
    await blurSellOrder.sign(seller);
    await blurSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = blurSellOrder.buildMatching({ trader: matchExecutor.contract.address });
    const txData = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token bulk signed blur listings", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId1 = 0;
    const tokenId2 = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId1);
    await erc721.connect(seller).mint(tokenId2);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the blur exchange
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    const blurExchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder1 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId1,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });

    const blurSellOrder2 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId2,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });

    // Sign the order
    await Blur.Order.signBulk([blurSellOrder1, blurSellOrder2], seller);
    await blurSellOrder1.checkFillability(ethers.provider);
    await blurSellOrder2.checkFillability(ethers.provider);

    const ownerBefore1 = await nft.getOwner(tokenId1);
    const ownerBefore2 = await nft.getOwner(tokenId2);
    expect(ownerBefore1).to.eq(seller.address);
    expect(ownerBefore2).to.eq(seller.address);

    // create infinity listings
    const infinityOrderItems1: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId1, numTokens: "1" }]
      }
    ];
    const intermediaryListing1 = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems1);
    const signedIntermediaryListing1 = await intermediaryListing1.prepare();

    const infinityOrderItems2: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId2, numTokens: "1" }]
      }
    ];
    const intermediaryListing2 = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems2);
    const signedIntermediaryListing2 = await intermediaryListing2.prepare();

    // create infinity offers
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(4)); // multiply for buffer
    await weth.approve(buyer, infinityExchange.contract.address);

    const infinityOffer1 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems1);
    const signedInfinityOffer1 = await infinityOffer1.prepare();
    const infinityOffer2 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems2);
    const signedInfinityOffer2 = await infinityOffer2.prepare();

    console.log("Encoding external fulfillments");
    const matchParams1 = blurSellOrder1.buildMatching({ trader: matchExecutor.contract.address });
    const matchParams2 = blurSellOrder2.buildMatching({ trader: matchExecutor.contract.address });
    const txData1 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder1,
      matchParams1
    );
    const txData2 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder2,
      matchParams2
    );

    const fulfillments1: ExternalFulfillments = {
      calls: [
        {
          data: txData1.data,
          value: txData1.value ?? 0,
          to: txData1.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems1
    };

    const fulfillments2: ExternalFulfillments = {
      calls: [
        {
          data: txData2.data,
          value: txData2.value ?? 0,
          to: txData2.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems2
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders1: MatchOrders = {
      buys: [signedInfinityOffer1!],
      sells: [signedIntermediaryListing1!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };
    const matchOrders2: MatchOrders = {
      buys: [signedInfinityOffer2!],
      sells: [signedIntermediaryListing2!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch1: Batch = {
      matches: [matchOrders1],
      externalFulfillments: fulfillments1
    };
    const batch2: Batch = {
      matches: [matchOrders2],
      externalFulfillments: fulfillments2
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: bn(txData1.value ?? 0).add(txData2.value ?? 0)
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch1]);
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch2]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter1 = await nft.getOwner(tokenId1);
    const ownerAfter2 = await nft.getOwner(tokenId2);
    expect(ownerAfter1).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token blur listings bulk signed and with optimized infinity orders", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId1 = 0;
    const tokenId2 = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId1);
    await erc721.connect(seller).mint(tokenId2);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the blur exchange
    await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    const blurExchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const blurSellOrder1 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId1,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });

    const blurSellOrder2 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: tokenId2,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      salt: 0,
      extraParams: "0x"
    });

    // Sign the order
    await Blur.Order.signBulk([blurSellOrder1, blurSellOrder2], seller);
    await blurSellOrder1.checkFillability(ethers.provider);
    await blurSellOrder2.checkFillability(ethers.provider);

    const ownerBefore1 = await nft.getOwner(tokenId1);
    const ownerBefore2 = await nft.getOwner(tokenId2);
    expect(ownerBefore1).to.eq(seller.address);
    expect(ownerBefore2).to.eq(seller.address);

    // create infinity listings
    const infinityOrderItems1: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId1, numTokens: "1" }]
      }
    ];
    const intermediaryListing1 = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems1);
    const signedIntermediaryListing1 = await intermediaryListing1.prepare();

    const infinityOrderItems2: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId: tokenId2, numTokens: "1" }]
      }
    ];
    const intermediaryListing2 = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems2);
    const signedIntermediaryListing2 = await intermediaryListing2.prepare();

    // create infinity offers
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(4)); // multiply for buffer
    await weth.approve(buyer, infinityExchange.contract.address);

    const infinityOffer1 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems1);
    const signedInfinityOffer1 = await infinityOffer1.prepare();
    const infinityOffer2 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems2);
    const signedInfinityOffer2 = await infinityOffer2.prepare();

    console.log("Encoding external fulfillments");
    const matchParams1 = blurSellOrder1.buildMatching({ trader: matchExecutor.contract.address });
    const matchParams2 = blurSellOrder2.buildMatching({ trader: matchExecutor.contract.address });
    const txData1 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder1,
      matchParams1
    );
    const txData2 = blurExchange.fillOrderTx(
      matchExecutor.contract.address,
      blurSellOrder2,
      matchParams2
    );

    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData1.data,
          value: txData1.value ?? 0,
          to: txData1.to,
          isPayable: true
        },
        {
          data: txData2.data,
          value: txData2.value ?? 0,
          to: txData2.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems1.concat(infinityOrderItems2)
    };

    /**
     * complete the call by calling the infinity exchange
     */
    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer1!, signedInfinityOffer2!],
      sells: [signedIntermediaryListing1!, signedIntermediaryListing2!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };
    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: bn(txData1.value ?? 0).add(txData2.value ?? 0)
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter1 = await nft.getOwner(tokenId1);
    const ownerAfter2 = await nft.getOwner(tokenId2);
    expect(ownerAfter1).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token looksrare listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await nft.approve(seller, LooksRare.Addresses.TransferManagerErc721[chainId]);

    const looksrareExchange = new LooksRare.Exchange(chainId);
    const builder = new LooksRare.Builders.SingleToken(chainId);
    const lrSellOrder = builder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: erc721.address,
      tokenId,
      // LooksRare sell orders are in WETH
      currency: Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await looksrareExchange.getNonce(ethers.provider, seller.address)
    });

    // Sign the order
    await lrSellOrder.sign(seller);
    await lrSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = lrSellOrder.buildMatching(matchExecutor.contract.address);
    const txData = looksrareExchange.fillOrderTx(
      matchExecutor.contract.address,
      lrSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token element listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    const elementExchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const elementSellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Element.Addresses.Eth[chainId],
      price,
      hashNonce: 0,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 100
    });

    // Sign the order
    await elementSellOrder.sign(seller);
    await elementSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = elementSellOrder.buildMatching();
    const txData = elementExchange.fillOrderTx(
      matchExecutor.contract.address,
      elementSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token element listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    const elementExchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.SingleToken(chainId);
    const elementSellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Element.Addresses.Eth[chainId],
      price,
      hashNonce: 0,
      fees: [
        {
          recipient: carol.address,
          amount: parseEther("0.1")
        },
        {
          recipient: ted.address,
          amount: parseEther("0.05")
        }
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 100
    });

    // Sign the order
    await elementSellOrder.sign(seller);
    await elementSellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const carolBalanceBefore = await ethers.provider.getBalance(carol.address);
    const tedBalanceBefore = await ethers.provider.getBalance(ted.address);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = elementSellOrder.buildMatching();
    const txData = elementExchange.fillOrderTx(
      matchExecutor.contract.address,
      elementSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const carolBalanceAfter = await ethers.provider.getBalance(carol.address);
    const tedBalanceAfter = await ethers.provider.getBalance(ted.address);
    const ownerAfter = await nft.getOwner(tokenId);

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price.add(parseEther("0.15")));
    expect(carolBalanceAfter.sub(carolBalanceBefore)).to.eq(parseEther("0.1"));
    expect(tedBalanceAfter.sub(tedBalanceBefore)).to.eq(parseEther("0.05"));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token element batch signed listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    const elementExchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.BatchSignedToken(chainId);
    const elementSellOrder = builder.build({
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Element.Addresses.Eth[chainId],
      price,
      hashNonce: 0,
      listingTime: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
      startNonce: Date.now()
    });

    // Sign the order
    await elementSellOrder.sign(seller);
    await elementSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = elementSellOrder.buildMatching();
    const txData = elementExchange.fillOrderTx(
      matchExecutor.contract.address,
      elementSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token element batch listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    const elementExchange = new Element.Exchange(chainId);
    const builder = new Element.Builders.BatchSignedToken(chainId);
    const elementSellOrder = builder.build({
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: Element.Addresses.Eth[chainId],
      price,
      hashNonce: 0,
      listingTime: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
      startNonce: Date.now(),
      platformFeeRecipient: carol.address,
      platformFee: 1000,
      royaltyFeeRecipient: ted.address,
      royaltyFee: 500
    });

    // Sign the order
    await elementSellOrder.sign(seller);
    await elementSellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const carolBalanceBefore = await ethers.provider.getBalance(carol.address);
    const tedBalanceBefore = await ethers.provider.getBalance(ted.address);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const matchParams = elementSellOrder.buildMatching();
    const txData = elementExchange.fillOrderTx(
      matchExecutor.contract.address,
      elementSellOrder,
      matchParams
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const carolBalanceAfter = await ethers.provider.getBalance(carol.address);
    const tedBalanceAfter = await ethers.provider.getBalance(ted.address);
    const ownerAfter = await nft.getOwner(tokenId);

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price);
    expect(carolBalanceAfter.sub(carolBalanceBefore)).to.eq(parseEther("0.1"));
    expect(tedBalanceAfter.sub(tedBalanceBefore)).to.eq(parseEther("0.05"));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price).sub(parseEther("0.15")));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token foundation listing", async () => {
    const buyer = alice;
    const seller = bob;
    const referrer = carol;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the exchange
    await erc721.connect(seller).setApprovalForAll(Foundation.Addresses.Exchange[chainId], true);

    const fndExchange = new Foundation.Exchange(chainId);
    const fndSellOrder = new Foundation.Order(chainId, {
      maker: seller.address,
      contract: erc721.address,
      tokenId: tokenId.toString(),
      price: price.toString()
    });

    // create order
    await fndExchange.createOrder(seller, fndSellOrder);
    // Foundation escrows the NFT when creating sell orders.
    expect(await erc721.ownerOf(tokenId), fndExchange.contract.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const txData = fndExchange.fillOrderTx(matchExecutor.contract.address, fndSellOrder, {
      source: "infinity",
      nativeReferrerAddress: referrer.address
    });
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    const sellerEthBalanceBefore = await seller.getBalance();
    const referrerEthBalanceBefore = await referrer.getBalance();

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const sellerEthBalanceAfter = await seller.getBalance();
    const referrerEthBalanceAfter = await referrer.getBalance();
    const ownerAfter = await nft.getOwner(tokenId);

    // The protocol fee is 5% of the price (minus the referrer fee).
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(price.mul(9500).div(10000));
    // The referrer (if set) gets 20% of the protocol fee.
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(price.mul(100).div(10000));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token universe listing", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const universeExchange = new Universe.Exchange(chainId);
    const builder = new Universe.Builders.SingleToken(chainId);
    const universeSellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: tokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: ethers.constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: []
    });

    // Sign the order
    await universeSellOrder.sign(seller);
    await universeSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const txData = await universeExchange.fillOrderTx(
      matchExecutor.contract.address,
      universeSellOrder
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token universe listing with rev split", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const revenueSplitBpsA = "1000";
    const revenueSplitBpsB = "1500";
    const universeExchange = new Universe.Exchange(chainId);
    const builder = new Universe.Builders.SingleToken(chainId);
    const universeSellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: tokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: ethers.constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [`${ted.address}:${revenueSplitBpsA}`, `${carol.address}:${revenueSplitBpsB}`]
    });

    // Sign the order
    await universeSellOrder.sign(seller);
    await universeSellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const txData = await universeExchange.fillOrderTx(
      matchExecutor.contract.address,
      universeSellOrder
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token zeroexv4 listing with no fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, ZeroExV4.Addresses.Exchange[chainId]);

    const zrxV4Exchange = new ZeroExV4.Exchange(chainId);
    const builder = new ZeroExV4.Builders.SingleToken(chainId);
    const zrxV4SellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: ZeroExV4.Addresses.Eth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60
    });

    // Sign the order
    await zrxV4SellOrder.sign(seller);
    await zrxV4SellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const buyOrder = zrxV4SellOrder.buildMatching();
    const txData = await zrxV4Exchange.fillOrderTx(
      matchExecutor.contract.address,
      zrxV4SellOrder,
      buyOrder
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token zeroexv4 listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    // Approve the seaport exchange
    await nft.approve(seller, ZeroExV4.Addresses.Exchange[chainId]);

    const zrxV4Exchange = new ZeroExV4.Exchange(chainId);
    const builder = new ZeroExV4.Builders.SingleToken(chainId);
    const zrxV4SellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId,
      paymentToken: ZeroExV4.Addresses.Eth[chainId],
      price,
      fees: [
        {
          recipient: carol.address,
          amount: parseEther("0.1")
        },
        {
          recipient: ted.address,
          amount: parseEther("0.05")
        }
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60
    });

    // Sign the order
    await zrxV4SellOrder.sign(seller);
    await zrxV4SellOrder.checkFillability(ethers.provider);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const buyOrder = zrxV4SellOrder.buildMatching();
    const txData = await zrxV4Exchange.fillOrderTx(
      matchExecutor.contract.address,
      zrxV4SellOrder,
      buyOrder
    );
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("snipes a ETH <=> ERC721 single token zora listing with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = "1";

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    const moduleManager = new Zora.ModuleManager(chainId);
    await moduleManager.setApprovalForModule(seller, Zora.Addresses.Exchange[chainId], true);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Zora.Addresses.Erc721TransferHelper[chainId], true);

    const zoraExchange = new Zora.Exchange(chainId);
    const zoraSellOrder = new Zora.Order(chainId, {
      tokenContract: erc721.address,
      tokenId,
      askPrice: price.toString(),
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: seller.address,
      findersFeeBps: 0
    });

    await zoraExchange.createOrder(seller, zoraSellOrder);

    const ownerBefore = await nft.getOwner(tokenId);
    expect(ownerBefore).to.eq(seller.address);

    // create infinity listing
    const infinityOrderItems: OrderItem[] = [
      {
        collection: erc721.address,
        tokens: [{ tokenId, numTokens: "1" }]
      }
    ];
    const intermediaryListing = await orderClientBySigner
      .get(owner)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
    const txData = zoraExchange.fillOrderTx(matchExecutor.contract.address, zoraSellOrder);
    const fulfillments: ExternalFulfillments = {
      calls: [
        {
          data: txData.data,
          value: txData.value ?? 0,
          to: txData.to,
          isPayable: true
        }
      ],
      nftsToTransfer: infinityOrderItems
    };

    /**
     * complete the call by calling the infinity exchange
     */

    const matchOrders: MatchOrders = {
      buys: [signedInfinityOffer!],
      sells: [signedIntermediaryListing!],
      constructs: [],
      matchType: MatchOrdersTypes.OneToOneSpecific
    };

    const batch: Batch = {
      matches: [matchOrders],
      externalFulfillments: fulfillments
    };

    console.log("Executing matches");
    // console.log("Batch", JSON.stringify(batch, null, 2));
    try {
      // send some ETH to matchExecutor so it has balance to buy from external MP
      await owner.sendTransaction({
        to: matchExecutor.contract.address,
        value: txData.value ?? 0
      });
      await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });

  // it("snipes a ETH <=> ERC721 single token x2y2 listing", async () => {
  //   const buyer = alice;
  //   const seller = bob;
  //   const price = parseEther("1");
  //   const tokenId = 1;
  //   console.log("x2y2 key", process.env.X2Y2_API_KEY);
  //   const orders = await axios.get("https://api.x2y2.org/v1/orders?limit=10&status=open", {
  //     headers: {
  //       "Content-Type": "application/json",
  //       "X-Api-Key": String(process.env.X2Y2_API_KEY)
  //     }
  //   });
  //   const orderData = orders.data.data[1];
  //   console.log("x2y2 order data", JSON.stringify(orderData, null, 2));
  //   const x2y2Order = new X2Y2.Order(chainId, {
  //     kind: "single-token",
  //     id: orderData.id,
  //     type: orderData.type,
  //     currency: orderData.currency,
  //     price: orderData.price,
  //     maker: orderData.maker,
  //     taker: orderData.taker,
  //     deadline: orderData.end_at,
  //     itemHash: orderData.item_hash,
  //     royalty_fee: orderData.royalty_fee,
  //     nft: {
  //       token: orderData.token.contract,
  //       tokenId: orderData.token.token_id
  //     }
  //   });
  //   console.log("x2y2 order", x2y2Order);

  //   const nft = new Common.Helpers.Erc721(ethers.provider, x2y2Order.params.nft.token);
  //   const ownerBefore = await nft.getOwner(x2y2Order.params.nft.tokenId!);

  //   //`expect(lc(ownerBefore)).to.eq(lc(x2y2Order.params.maker));
  //   const x2y2Exchange = new X2Y2.Exchange(chainId, String(process.env.X2Y2_API_KEY));

  //   // create infinity listing
  //   const infinityOrderItems: OrderItem[] = [
  //     {
  //       collection: erc721.address,
  //       tokens: [{ tokenId, numTokens: "1" }]
  //     }
  //   ];
  //   const intermediaryListing = await orderClientBySigner
  //     .get(owner)!
  //     .createListing(infinityOrderItems);
  //   const signedIntermediaryListing = await intermediaryListing.prepare();

  //   // create infinity offer
  //   const weth = new Common.Helpers.Weth(ethers.provider, chainId);
  //   // Mint weth to buyer and approve infinity exchange
  //   await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
  //   await weth.approve(buyer, infinityExchange.contract.address);
  //   const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
  //   const signedInfinityOffer = await infinityOffer.prepare();

  //   console.log("Encoding external fulfillments");
  //   const txData = await x2y2Exchange.fillOrderTx(
  //     matchExecutor.contract.address,
  //     x2y2Order
  //   );
  //   const fulfillments: ExternalFulfillments = {
  //     calls: [
  //       {
  //         data: txData.data,
  //         value: txData.value ?? 0,
  //         to: txData.to,
  //         isPayable: true
  //       }
  //     ],
  //     nftsToTransfer: infinityOrderItems
  //   };

  //   /**
  //    * complete the call by calling the infinity exchange
  //    */

  //   const matchOrders: MatchOrders = {
  //     buys: [signedInfinityOffer!],
  //     sells: [signedIntermediaryListing!],
  //     constructs: [],
  //     matchType: MatchOrdersTypes.OneToOneSpecific
  //   };

  //   const batch: Batch = {
  //     matches: [matchOrders],
  //     externalFulfillments: fulfillments
  //   };

  //   console.log("Executing matches");
  //   // console.log("Batch", JSON.stringify(batch, null, 2));
  //   try {
  //     // send some ETH to matchExecutor so it has balance to buy from external MP
  //     await owner.sendTransaction({
  //       to: matchExecutor.contract.address,
  //       value: txData.value ?? 0
  //     });
  //     await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
  //   } catch (err) {
  //     console.error(err);
  //   }

  //   const ownerAfter = await nft.getOwner(tokenId);
  //   expect(ownerAfter).to.eq(buyer.address);
  // });

  // it("snipes a wrapped punk listing from cryptopunks market", async () => {
  //   const buyer = alice;
  //   const seller = bob;
  //   const price = parseEther("1");
  //   const tokenId = 7326;
  //   const punksExchange = new CryptoPunks.Exchange(chainId);

  //   const wrappedPunksAddress = "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6";
  //   await network.provider.request({
  //     method: "hardhat_impersonateAccount",
  //     params: [wrappedPunksAddress]
  //   });
  //   await network.provider.request({
  //     method: "hardhat_setBalance",
  //     params: [wrappedPunksAddress, "0x1000000000000000000"]
  //   });

  //   // mint punk to seller
  //   const wrappedPunks = await ethers.getSigner(wrappedPunksAddress);
  //   await punksExchange.contract.connect(wrappedPunks).transferPunk(seller.address, tokenId);

  //   const punksSellOrder = new CryptoPunks.Order(chainId, {
  //     maker: seller.address,
  //     side: "sell",
  //     tokenId,
  //     price
  //   });
  //   await punksExchange.createListing(seller, punksSellOrder);

  //   // create infinity listing
  //   const infinityOrderItems: OrderItem[] = [
  //     {
  //       collection: wrappedPunksAddress,
  //       tokens: [{ tokenId, numTokens: "1" }]
  //     }
  //   ];
  //   const intermediaryListing = await orderClientBySigner
  //     .get(owner)!
  //     .createListing(infinityOrderItems);
  //   const signedIntermediaryListing = await intermediaryListing.prepare();

  //   // create infinity offer
  //   const weth = new Common.Helpers.Weth(ethers.provider, chainId);
  //   // Mint weth to buyer and approve infinity exchange
  //   await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
  //   await weth.approve(buyer, infinityExchange.contract.address);
  //   const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
  //   const signedInfinityOffer = await infinityOffer.prepare();

  //   console.log("Encoding external fulfillments");
  //   const txData = punksExchange.fillListingTx(matchExecutor.contract.address, punksSellOrder);
  //   const fulfillments: ExternalFulfillments = {
  //     calls: [
  //       {
  //         data: txData.data,
  //         value: txData.value ?? 0,
  //         to: txData.to,
  //         isPayable: true
  //       }
  //     ],
  //     nftsToTransfer: infinityOrderItems
  //   };

  //   /**
  //    * complete the call by calling the infinity exchange
  //    */

  //   const matchOrders: MatchOrders = {
  //     buys: [signedInfinityOffer!],
  //     sells: [signedIntermediaryListing!],
  //     constructs: [],
  //     matchType: MatchOrdersTypes.OneToOneSpecific
  //   };

  //   const batch: Batch = {
  //     matches: [matchOrders],
  //     externalFulfillments: fulfillments
  //   };

  //   console.log("Executing matches");
  //   // console.log("Batch", JSON.stringify(batch, null, 2));
  //   try {
  //     // send some ETH to matchExecutor so it has balance to buy from external MP
  //     await owner.sendTransaction({
  //       to: matchExecutor.contract.address,
  //       value: txData.value ?? 0
  //     });
  //     await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
  //   } catch (err) {
  //     console.error(err);
  //   }

  //   expect(await punksExchange.contract.connect(ethers.provider).punkIndexToAddress(tokenId)).to.eq(
  //     buyer.address
  //   );
  //   expect(
  //     await punksExchange.contract.connect(ethers.provider).pendingWithdrawals(seller.address)
  //   ).to.eq(price);
  // });
});
