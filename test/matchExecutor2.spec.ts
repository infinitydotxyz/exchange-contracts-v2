import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { ethers, network } from "hardhat";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { SeaportExchangeConfig, setupSeaportExchange } from "../utils/setupSeaportExchange";
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
import { Interface, parseEther, verifyTypedData, _TypedDataEncoder } from "ethers/lib/utils";
import { SingleTokenBuilder } from "@reservoir0x/sdk/dist/seaport/builders/single-token";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/seaport/builders/base";
import { ORDER_EIP712_TYPES } from "@reservoir0x/sdk/dist/seaport/order";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
  amount?: BigNumberish;
}

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

import { Provider } from "@ethersproject/abstract-provider";
import { bn, getCurrentTimestamp, s } from "@reservoir0x/sdk/dist/utils";
import { Seaport } from "@reservoir0x/sdk";
import { Types } from "@reservoir0x/sdk/dist/seaport";

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

    it("snipe a seaport listing", async () => {
      const tokenId = "2";
      const orderItems: OrderItem[] = [
        {
          collection: mock721.contract.address,
          tokens: [{ tokenId, numTokens: "1" }]
        }
      ];
      /**
       * generate the seaport listing
       */
      const seaportSingleTokenBuilder = new SingleTokenBuilder(31337);
      const buildParams: BuildParams = {
        offerer: mock721.minter.address,
        price: ethers.utils.parseEther("1"),
        paymentToken: AddressZero,
        tokenKind: "erc721",
        tokenId,
        contract: mock721.contract.address,
        side: "sell",
        counter: 1
      };
      const seaportListing = seaportSingleTokenBuilder.build(buildParams);
      console.log(mock721.minter.address, mock721.minter._isSigner);

      const EIP712_DOMAIN = (chainId: number) => ({
        name: "Seaport",
        version: "1.1",
        chainId,
        verifyingContract: seaportExchange.contract.address
      });
      const signature = await mock721.minter._signTypedData(
        EIP712_DOMAIN(seaportListing.chainId),
        ORDER_EIP712_TYPES,
        seaportListing.params
      );
      console.log("signature", signature);

      seaportListing.params = {
        ...seaportListing.params,
        signature
      };

      const checkSignature = async (provider?: Provider) => {
        const EIP712_DOMAIN = (chainId: number) => ({
          name: "Seaport",
          version: "1.1",
          chainId,
          verifyingContract: seaportExchange.contract.address
        });
        try {
          const signer = verifyTypedData(
            EIP712_DOMAIN(31337),
            ORDER_EIP712_TYPES,
            seaportListing.params,
            seaportListing.params.signature!
          );

          if (trimLowerCase(seaportListing.params.offerer) !== trimLowerCase(signer)) {
            throw new Error("Invalid signature");
          }
        } catch {
          if (!provider) {
            throw new Error("Invalid signature");
          }

          const eip712Hash = _TypedDataEncoder.hash(
            EIP712_DOMAIN(seaportListing.chainId),
            ORDER_EIP712_TYPES,
            seaportListing.params
          );

          const iface = new Interface([
            "function isValidSignature(bytes32 digest, bytes signature) view returns (bytes4)"
          ]);

          const result = await new Contract(
            seaportListing.params.offerer,
            iface,
            provider
          ).isValidSignature(eip712Hash, seaportListing.params.signature!);
          if (result !== iface.getSighash("isValidSignature")) {
            throw new Error("Invalid signature");
          }
        }
      };

      await checkSignature();

      const initialOwner = trimLowerCase(await mock721.contract.ownerOf(buildParams.tokenId));
      expect(initialOwner).to.equal(trimLowerCase(mock721.minter.address));

      await mock721.contract
        .connect(mock721.minter)
        .setApprovalForAll(seaportExchange.contract.address, true);
      const isApproved = await mock721.contract.isApprovedForAll(
        mock721.minter.address,
        seaportExchange.contract.address
      );
      expect(isApproved).to.be.true;

      /**
       * generate the intermediary infinity listing
       */

      await mock721.contract
        .connect(intermediary)
        .setApprovalForAll(infinityExchange.contract.address, true);
      const isApprovedIntermediary = await mock721.contract.isApprovedForAll(
        intermediary.address,
        infinityExchange.contract.address
      );
      expect(isApprovedIntermediary).to.be.true;

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
      const approveWETH = mock20.contract.interface.getFunction("approve");
      const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
        infinityExchange.contract.address,
        ethers.constants.MaxUint256
      ]);
      const offer = await orderClientBySigner.get(mock20.minter)!.createOffer(orderItems);
      const signedOffer = await offer.prepare();

      /**
       * generate the calldata for the function call that will:
       *
       * purchase the nft from external MP
       */

      //const info = seaportListing.getInfo()!;

      const side = "sell";
      const isDynamic = false;
      let taker = AddressZero;
      const offerItem = seaportListing.params.offer[0];
      // The offer item is the sold token
      const tokenKind = offerItem.itemType === Types.ItemType.ERC721 ? "erc721" : "erc1155";
      const contract = offerItem.token;
      const amount = offerItem.startAmount;

      // Ensure all consideration items match (with the exception of the
      // last one which can match the offer item if the listing is meant
      // to be fillable only by a specific taker - eg. private)
      const fees: {
        recipient: string;
        amount: BigNumberish;
        endAmount?: BigNumberish;
      }[] = [];

      const c = seaportListing.params.consideration;

      const paymentToken = c[0].token;
      const price = bn(c[0].startAmount);
      const endPrice = bn(c[0].endAmount);
      for (let i = 1; i < c.length; i++) {
        // Seaport private listings have the last consideration item match the offer item
        if (
          i === c.length - 1 &&
          c[i].token === offerItem.token &&
          c[i].identifierOrCriteria === offerItem.identifierOrCriteria
        ) {
          taker = c[i].recipient;
        } else if (c[i].token !== paymentToken) {
          throw new Error("Invalid consideration");
        } else {
          fees.push({
            recipient: c[i].recipient,
            amount: c[i].startAmount,
            endAmount: c[i].endAmount
          });
        }
      }

      const info = {
        tokenKind,
        side,
        contract,
        tokenId,
        amount,
        paymentToken,
        price: s(price),
        endPrice: s(endPrice),
        fees,
        isDynamic,
        taker
      };

      const txData = {
        considerationToken: info.paymentToken,
        considerationIdentifier: "0",
        considerationAmount: info.price,
        offerer: seaportListing.params.offerer,
        zone: seaportListing.params.zone,
        offerToken: info.contract,
        offerIdentifier: info.tokenId,
        offerAmount: info.amount,
        basicOrderType:
          Types.BasicOrderType.ETH_TO_ERC721_FULL_OPEN + seaportListing.params.orderType,
        startTime: seaportListing.params.startTime,
        endTime: seaportListing.params.endTime,
        zoneHash: seaportListing.params.zoneHash,
        salt: seaportListing.params.salt,
        offererConduitKey: seaportListing.params.conduitKey,
        fulfillerConduitKey: HashZero,
        totalOriginalAdditionalRecipients: seaportListing.params.consideration.length - 1,
        additionalRecipients: [
          ...seaportListing.params.consideration.slice(1).map(({ startAmount, recipient }) => ({
            amount: startAmount,
            recipient
          })),
          []
        ],
        signature: seaportListing.params.signature!
      };

      const functionCall = seaportExchange.contract.interface.getFunction("fulfillBasicOrder");
      const functionArgs = [txData];
      console.log("Encoding function data");
      const functionData = seaportExchange.contract.interface.encodeFunctionData(
        functionCall,
        functionArgs
      );

      console.log("Encoding external fulfillments");
      const fulfillments: ExternalFulfillments = {
        calls: [
          {
            data: approveWETHData,
            value: 0,
            to: mock20.contract.address,
            isPayable: false
          },
          {
            data: functionData,
            value: 0,
            to: seaportExchange.contract.address,
            isPayable: false
          }
        ],
        nftsToTransfer: orderItems
      };

      /**
       * complete the call by calling the infinity exchange
       */

      const matchOrders: MatchOrders = {
        buys: [signedOffer!],
        sells: [signedIntermediaryListing!],
        constructs: [],
        matchType: MatchOrdersTypes.OneToOneSpecific
      };

      const batch: Batch = {
        matches: [matchOrders],
        externalFulfillments: fulfillments
      };

      console.log("executing matches");

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
