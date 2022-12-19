import { AddressZero, HashZero } from "@ethersproject/constants";
import { JsonRpcSigner } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Types } from "@reservoir0x/sdk/dist/seaport";
import { bn, getCurrentTimestamp } from "@reservoir0x/sdk/dist/utils";
import { expect } from "chai";
import { BigNumber, BigNumberish as ethersBigNumberish, Contract, utils, Wallet } from "ethers";
import { getAddress, keccak256, recoverAddress, toUtf8Bytes } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import {
  Batch, ExternalFulfillments,
  Loans,
  MatchOrders,
  MatchOrdersTypes
} from "../utils/matchExecutorTypes";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { MatchExecutorConfig, setupMatchExecutor } from "../utils/setupMatchExecutor";
import { MockERC20Config, setupMockERC20 } from "../utils/setupMockERC20";
import { MockERC721Config, setupMockERC721 } from "../utils/setupMockERC721";
import { MockVaultConfig, setupMockVault } from "../utils/setupMockVault";
import { SeaportExchangeConfig, setupSeaportExchange } from "../utils/setupSeaportExchange";

import { randomBytes as nodeRandomBytes } from "crypto";

export type BigNumberish = string | BigNumber | number | boolean;

export type AdditionalRecipient = {
  amount: BigNumber;
  recipient: string;
};

export type FulfillmentComponent = {
  orderIndex: number;
  itemIndex: number;
};

export type CriteriaResolver = {
  orderIndex: number;
  side: 0 | 1;
  index: number;
  identifier: BigNumber;
  criteriaProof: string[];
};

export type BasicOrderParameters = {
  considerationToken: string;
  considerationIdentifier: BigNumber;
  considerationAmount: BigNumber;
  offerer: string;
  zone: string;
  offerToken: string;
  offerIdentifier: BigNumber;
  offerAmount: BigNumber;
  basicOrderType: number;
  startTime: string | BigNumber | number;
  endTime: string | BigNumber | number;
  zoneHash: string;
  salt: string;
  offererConduitKey: string;
  fulfillerConduitKey: string;
  totalOriginalAdditionalRecipients: BigNumber;
  additionalRecipients: AdditionalRecipient[];
  signature: string;
};

export type OfferItem = {
  itemType: number;
  token: string;
  identifierOrCriteria: BigNumber;
  startAmount: BigNumber;
  endAmount: BigNumber;
};
export type ConsiderationItem = {
  itemType: number;
  token: string;
  identifierOrCriteria: BigNumber;
  startAmount: BigNumber;
  endAmount: BigNumber;
  recipient: string;
};

export type OrderParameters = {
  offerer: string;
  zone: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: number;
  startTime: string | BigNumber | number;
  endTime: string | BigNumber | number;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: string | BigNumber | number;
};

export type OrderComponents = Omit<OrderParameters, "totalOriginalConsiderationItems"> & {
  counter: BigNumber;
};

export type Order = {
  parameters: OrderParameters;
  signature: string;
};

export type AdvancedOrder = {
  parameters: OrderParameters;
  numerator: string | BigNumber | number;
  denominator: string | BigNumber | number;
  signature: string;
  extraData: string;
};

export const convertSignatureToEIP2098 = (signature: string) => {
  if (signature.length === 130) {
    return signature;
  }

  if (signature.length !== 132) {
    throw Error("invalid signature length (must be 64 or 65 bytes)");
  }

  return utils.splitSignature(signature).compact;
};

export const calculateOrderHash = (orderComponents: OrderComponents) => {
  const offerItemTypeString =
    "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)";
  const considerationItemTypeString =
    "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)";
  const orderComponentsPartialTypeString =
    "OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)";
  const orderTypeString = `${orderComponentsPartialTypeString}${considerationItemTypeString}${offerItemTypeString}`;

  const offerItemTypeHash = keccak256(toUtf8Bytes(offerItemTypeString));
  const considerationItemTypeHash = keccak256(toUtf8Bytes(considerationItemTypeString));
  const orderTypeHash = keccak256(toUtf8Bytes(orderTypeString));

  const offerHash = keccak256(
    "0x" +
      orderComponents.offer
        .map((offerItem) => {
          return keccak256(
            "0x" +
              [
                offerItemTypeHash.slice(2),
                offerItem.itemType.toString().padStart(64, "0"),
                offerItem.token.slice(2).padStart(64, "0"),
                bn(offerItem.identifierOrCriteria).toHexString().slice(2).padStart(64, "0"),
                bn(offerItem.startAmount).toHexString().slice(2).padStart(64, "0"),
                bn(offerItem.endAmount).toHexString().slice(2).padStart(64, "0")
              ].join("")
          ).slice(2);
        })
        .join("")
  );

  const considerationHash = keccak256(
    "0x" +
      orderComponents.consideration
        .map((considerationItem) => {
          return keccak256(
            "0x" +
              [
                considerationItemTypeHash.slice(2),
                considerationItem.itemType.toString().padStart(64, "0"),
                considerationItem.token.slice(2).padStart(64, "0"),
                bn(considerationItem.identifierOrCriteria).toHexString().slice(2).padStart(64, "0"),
                bn(considerationItem.startAmount).toHexString().slice(2).padStart(64, "0"),
                bn(considerationItem.endAmount).toHexString().slice(2).padStart(64, "0"),
                considerationItem.recipient.slice(2).padStart(64, "0")
              ].join("")
          ).slice(2);
        })
        .join("")
  );

  const derivedOrderHash = keccak256(
    "0x" +
      [
        orderTypeHash.slice(2),
        orderComponents.offerer.slice(2).padStart(64, "0"),
        orderComponents.zone.slice(2).padStart(64, "0"),
        offerHash.slice(2),
        considerationHash.slice(2),
        orderComponents.orderType.toString().padStart(64, "0"),
        bn(orderComponents.startTime).toHexString().slice(2).padStart(64, "0"),
        bn(orderComponents.endTime).toHexString().slice(2).padStart(64, "0"),
        orderComponents.zoneHash.slice(2),
        orderComponents.salt.slice(2).padStart(64, "0"),
        orderComponents.conduitKey.slice(2).padStart(64, "0"),
        bn(orderComponents.counter).toHexString().slice(2).padStart(64, "0")
      ].join("")
  );

  return derivedOrderHash;
};

const orderType = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" }
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" }
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" }
  ]
};

const GAS_REPORT_MODE = process.env.REPORT_GAS;

const randomBytes = (n: number) => nodeRandomBytes(n).toString("hex");

export const randomHex = (bytes = 32) => `0x${randomBytes(bytes)}`;

export const random128 = () => toBN(randomHex(16));

const hexRegex = /[A-Fa-fx]/g;

export const toHex = (n: BigNumberish, numBytes: number = 0) => {
  const asHexString = BigNumber.isBigNumber(n)
    ? n.toHexString().slice(2)
    : typeof n === "string"
    ? hexRegex.test(n)
      ? n.replace(/0x/, "")
      : (+n).toString(16)
    : (+n).toString(16);
  return `0x${asHexString.padStart(numBytes * 2, "0")}`;
};

export const randomBN = (bytes: number = 16) => toBN(randomHex(bytes));

export const toBN = (n: BigNumberish) => BigNumber.from(toHex(n));

export const toAddress = (n: BigNumberish) => getAddress(toHex(n, 20));

export const toKey = (n: BigNumberish) => toHex(n, 32);

export const getBasicOrderParameters = (
  basicOrderRouteType: number,
  order: Order,
  fulfillerConduitKey = false,
  tips = []
): BasicOrderParameters => ({
  offerer: order.parameters.offerer,
  zone: order.parameters.zone,
  basicOrderType: order.parameters.orderType + 4 * basicOrderRouteType,
  offerToken: order.parameters.offer[0].token,
  offerIdentifier: order.parameters.offer[0].identifierOrCriteria,
  offerAmount: order.parameters.offer[0].endAmount,
  considerationToken: order.parameters.consideration[0].token,
  considerationIdentifier: order.parameters.consideration[0].identifierOrCriteria,
  considerationAmount: order.parameters.consideration[0].endAmount,
  startTime: order.parameters.startTime,
  endTime: order.parameters.endTime,
  zoneHash: order.parameters.zoneHash,
  salt: order.parameters.salt,
  totalOriginalAdditionalRecipients: BigNumber.from(order.parameters.consideration.length - 1),
  signature: order.signature,
  offererConduitKey: order.parameters.conduitKey,
  fulfillerConduitKey: toKey(fulfillerConduitKey),
  additionalRecipients: [
    ...order.parameters.consideration
      .slice(1)
      .map(({ endAmount, recipient }) => ({ amount: endAmount, recipient })),
    ...tips
  ]
});

const getInfinityOrderClient = (
  signer: SignerWithAddress,
  infinityExchange: InfinityExchangeConfig
) => {
  const userAddress = signer.address;
  let orderNonce = 1;
  const chainId = network.config.chainId ?? 31337;

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
        infinityExchange.obComplication,
        true
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
  let seaportExchange: SeaportExchangeConfig;
  let owner = {} as SignerWithAddress;
  let intermediary = {} as SignerWithAddress;
  let emptyMatch = {} as MatchOrders;
  let emptyFulfillments = {} as ExternalFulfillments;
  let emptyLoans = {} as Loans;
  let emptyBatch = {} as Batch;

  let orderClientBySigner: Map<
    SignerWithAddress,
    ReturnType<typeof getInfinityOrderClient>
  > = new Map();

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
    intermediary = signers.pop() as SignerWithAddress;

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
      intermediary,
      infinityExchange.contract,
      mockVault
    );

    await infinityExchange.contract
      .connect(owner)
      .updateMatchExecutor(matchExecutor.contract.address);

    seaportExchange = await setupSeaportExchange(ethers.getContractFactory, owner);

    await matchExecutor.contract.addEnabledExchange(seaportExchange.contract.address);

    orderClientBySigner.set(mock20.minter, getInfinityOrderClient(mock20.minter, infinityExchange));
    orderClientBySigner.set(
      mock721.minter,
      getInfinityOrderClient(mock721.minter, infinityExchange)
    );
    orderClientBySigner.set(intermediary, getInfinityOrderClient(intermediary, infinityExchange));
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

    it("ERC721 <=> ETH (basic, minimal and listed off-chain)", async () => {
      const tokenId = "2";
      const price = "1000000000000000000";
      const orderItems: OrderItem[] = [
        {
          collection: mock721.contract.address,
          tokens: [{ tokenId, numTokens: "1" }]
        }
      ];

      await mock721.contract
        .connect(mock721.minter)
        .setApprovalForAll(seaportExchange.contract.address, true);

      const offer = [
        {
          itemType: Types.ItemType.ERC721,
          token: mock721.contract.address,
          identifierOrCriteria: bn(tokenId),
          startAmount: bn("1"),
          endAmount: bn("1")
        }
      ];

      const consideration = [
        {
          itemType: Types.ItemType.NATIVE,
          token: AddressZero,
          identifierOrCriteria: bn("0"),
          startAmount: bn(price),
          endAmount: bn(price),
          recipient: mock721.minter.address
        }
      ];

      const domainData = {
        name: "Seaport",
        version: "1.1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: seaportExchange.contract.address
      };

      const getAndVerifyOrderHash = async (orderComponents: OrderComponents) => {
        const orderHash = await seaportExchange.contract.getOrderHash(orderComponents as any);
        const derivedOrderHash = calculateOrderHash(orderComponents);
        expect(orderHash).to.equal(derivedOrderHash);
        return orderHash;
      };

      // Returns signature
      const signOrder = async (
        orderComponents: OrderComponents,
        signer: Wallet | SignerWithAddress
      ) => {
        const signature = await signer._signTypedData(domainData, orderType, orderComponents);

        const orderHash = await getAndVerifyOrderHash(orderComponents);

        const { domainSeparator } = await seaportExchange.contract.information();
        const digest = keccak256(`0x1901${domainSeparator.slice(2)}${orderHash.slice(2)}`);
        const recoveredAddress = recoverAddress(digest, signature);

        expect(recoveredAddress).to.equal(signer.address);

        return signature;
      };

      const createOrder = async (
        offerer: Wallet | SignerWithAddress,
        zone: Wallet | undefined | string = undefined,
        offer: OfferItem[],
        consideration: ConsiderationItem[],
        orderType: number,
        criteriaResolvers?: CriteriaResolver[],
        timeFlag?: string | null,
        signer?: Wallet | SignerWithAddress,
        zoneHash = HashZero,
        conduitKey = HashZero,
        extraCheap = false
      ) => {
        const counter = await seaportExchange.contract.getCounter(offerer.address);

        // const salt = !extraCheap ? randomHex() : constants.HashZero;
        const salt = HashZero;
        const startTime = getCurrentTimestamp(-5 * 60);
        const endTime = getCurrentTimestamp(5 * 60);

        const orderParameters = {
          offerer: offerer.address,
          zone: !extraCheap ? (zone as Wallet).address || (zone as string) : AddressZero,
          offer,
          consideration,
          totalOriginalConsiderationItems: consideration.length,
          orderType,
          zoneHash,
          salt,
          conduitKey,
          startTime,
          endTime
        };

        const orderComponents = {
          ...orderParameters,
          counter
        };

        const orderHash = await getAndVerifyOrderHash(orderComponents);

        const { isValidated, isCancelled, totalFilled, totalSize } =
          await seaportExchange.contract.getOrderStatus(orderHash);

        expect(isCancelled).to.equal(false);

        const orderStatus = {
          isValidated,
          isCancelled,
          totalFilled,
          totalSize
        };

        const flatSig = await signOrder(orderComponents, signer || offerer);
        const order = {
          parameters: orderParameters,
          signature: !extraCheap ? flatSig : convertSignatureToEIP2098(flatSig),
          numerator: 1, // only used for advanced orders
          denominator: 1, // only used for advanced orders
          extraData: "0x" // only used for advanced orders
        };

        // How much ether (at most) needs to be supplied when fulfilling the order
        const value = offer
          .map((x) =>
            x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : bn(0)
          )
          .reduce((a, b) => a.add(b), bn(0))
          .add(
            consideration
              .map((x) =>
                x.itemType === 0
                  ? x.endAmount.gt(x.startAmount)
                    ? x.endAmount
                    : x.startAmount
                  : bn(0)
              )
              .reduce((a, b) => a.add(b), bn(0))
          );

        return {
          order,
          orderHash,
          value,
          orderStatus,
          orderComponents
        };
      };

      const { order, orderHash, value } = await createOrder(
        mock721.minter,
        AddressZero,
        offer,
        consideration,
        0, // FULL_OPEN
        [],
        null,
        mock721.minter,
        HashZero,
        HashZero,
        true // extraCheap
      );

      const basicOrderParameters = getBasicOrderParameters(
        0, // EthForERC721
        order
      );

      // console.log("basicOrderParameters", JSON.stringify(basicOrderParameters, null, 2));

      const initialOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      expect(initialOwner).to.equal(trimLowerCase(mock721.minter.address));

      /**
       * generate the intermediary infinity listing
       */

      await mock721.contract
        .connect(intermediary)
        .setApprovalForAll(infinityExchange.contract.address, true);

      const intermediaryListing = await orderClientBySigner
        .get(intermediary)!
        .createListing(orderItems);
      const signedIntermediaryListing = await intermediaryListing.prepare();

      // create offer

      /**
       * generate the call data for the call that will:
       *
       * set approval for the infinity exchange to transfer the mock erc20
       */
      // const approveWETH = mock20.contract.interface.getFunction("approve");
      // const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
      //   infinityExchange.contract.address,
      //   ethers.constants.MaxUint256
      // ]);
      await mock20.contract
        .connect(mock20.minter)
        .approve(infinityExchange.contract.address, ethers.constants.MaxUint256);
      const infinityOffer = await orderClientBySigner.get(mock20.minter)!.createOffer(orderItems);
      const signedInfinityOffer = await infinityOffer.prepare();

      /**
       * generate the calldata for the function call that will:
       *
       * purchase the nft from external MP
       */

      // await seaportExchange.contract
      //   .connect(intermediary)
      //   .fulfillBasicOrder(basicOrderParameters, { value });

      // const newNftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      // expect(newNftOwner).to.equal(trimLowerCase(intermediary.address));

      const functionCall = seaportExchange.contract.interface.getFunction("fulfillBasicOrder");
      const functionArgs = [basicOrderParameters];
      console.log("Encoding function data");
      const functionData = seaportExchange.contract.interface.encodeFunctionData(
        functionCall,
        functionArgs
      );

      console.log("Encoding external fulfillments");
      const fulfillments: ExternalFulfillments = {
        calls: [
          // {
          //   data: approveWETHData,
          //   value: 0,
          //   to: mock20.contract.address,
          //   isPayable: false
          // },
          {
            data: functionData,
            value,
            to: seaportExchange.contract.address,
            isPayable: true
          }
        ],
        nftsToTransfer: orderItems
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
        const transactionHash = await owner.sendTransaction({
          to: matchExecutor.contract.address,
          value
        });
        await matchExecutor.contract.connect(owner).executeMatches([batch], emptyLoans);
      } catch (err) {
        console.error(err);
      }

      const nftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      expect(nftOwner).to.equal(trimLowerCase(mock20.minter.address));
    });
  });
});
