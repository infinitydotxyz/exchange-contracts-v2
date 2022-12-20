import { AddressZero, HashZero } from "@ethersproject/constants";
import { JsonRpcSigner } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Types } from "@reservoir0x/sdk/dist/seaport";
import { bn, getCurrentTimestamp } from "@reservoir0x/sdk/dist/utils";
import { expect } from "chai";
import { BigNumber, BigNumberish as ethersBigNumberish, Contract, Wallet } from "ethers";
import { keccak256, recoverAddress } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import { ConsiderationItem, CriteriaResolver, OfferItem, OrderComponents } from "../types/seaport";
import {
  Batch,
  ExternalFulfillments,
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
import {
  calculateOrderHash,
  convertSignatureToEIP2098,
  getBasicOrderParameters,
  orderType
} from "../utils/seaport";

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

const createSeaportListing = async (tokenId: string, price: BigNumber) => {
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
            x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : bn(0)
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

  return { basicOrderParameters, orderHash, value };
};

describe("Match_Executor", () => {
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
    it("snipes a seaport basic listing ERC721 <=> ETH", async () => {
      // listing data
      const tokenId = "2";
      const price = ethers.utils.parseEther("1");
      const orderItems: OrderItem[] = [
        {
          collection: mock721.contract.address,
          tokens: [{ tokenId, numTokens: "1" }]
        }
      ];

      // create seaport listing
      const { basicOrderParameters, value } = await createSeaportListing(tokenId, price);
      const initialOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      expect(initialOwner).to.equal(trimLowerCase(mock721.minter.address));

      // create infinity listing
      const intermediaryListing = await orderClientBySigner
        .get(intermediary)!
        .createListing(orderItems);
      const signedIntermediaryListing = await intermediaryListing.prepare();
      await mock721.contract
        .connect(intermediary)
        .setApprovalForAll(infinityExchange.contract.address, true);

      // create infinity offer
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

      // const loans: Loans = {
      //   tokens: [AddressZero],
      //   amounts: [value]
      // };

      // /**
      //  * transfer some ETH to the vault so it has balance to lend out
      //  */
      // await owner.sendTransaction({
      //   to: matchExecutor.vault.contract.address,
      //   value
      // });

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
        await owner.sendTransaction({
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
