import { Contract } from "@ethersproject/contracts";
import { JsonRpcSigner } from "@ethersproject/providers";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Common from "@reservoir0x/sdk/dist/common";
import * as Seaport from "@reservoir0x/sdk/dist/seaport";
import { expect } from "chai";
import { BigNumberish as ethersBigNumberish } from "ethers";
import { ethers, network } from "hardhat";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds } from "../tasks/utils";
import {
  Batch,
  ExternalFulfillments,
  MatchOrders,
  MatchOrdersTypes
} from "../utils/matchExecutorTypes";
import {
  getChainId,
  getCurrentTimestamp,
  reset,
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
  infinityExchange: InfinityExchangeConfig
) => {
  const chainId = getChainId();
  const userAddress = signer.address;
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

describe("Match_Executor", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let owner: SignerWithAddress;
  let intermediary: SignerWithAddress;

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

    [deployer, alice, bob, owner, intermediary] = await ethers.getSigners();

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
      intermediary,
      infinityExchange.contract
    );

    await infinityExchange.contract
      .connect(owner)
      .updateMatchExecutor(matchExecutor.contract.address);

    await matchExecutor.contract.addEnabledExchange(Seaport.Addresses.Exchange[chainId]);

    orderClientBySigner.set(intermediary, getInfinityOrderClient(intermediary, infinityExchange));
    orderClientBySigner.set(alice, getInfinityOrderClient(alice, infinityExchange));
    orderClientBySigner.set(bob, getInfinityOrderClient(bob, infinityExchange));
  });

  it("Build and fill sell order", async () => {
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
      tokenId: tokenId,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60
    });

    // Sign the order
    await seaportSellOrder.sign(seller);
    await seaportSellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = seaportSellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
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
      .get(intermediary)!
      .createListing(infinityOrderItems);
    const signedIntermediaryListing = await intermediaryListing.prepare();
    await erc721.connect(intermediary).setApprovalForAll(infinityExchange.contract.address, true);

    // create infinity offer
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);
    // Mint weth to buyer and approve infinity exchange
    await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
    await weth.approve(buyer, infinityExchange.contract.address);
    const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
    const signedInfinityOffer = await infinityOffer.prepare();

    console.log("Encoding external fulfillments");
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
      await matchExecutor.contract.connect(owner).executeMatches([batch], txData.value);
    } catch (err) {
      console.error(err);
    }

    const ownerAfter = await nft.getOwner(tokenId);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
