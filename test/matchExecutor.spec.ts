import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { ethers, network } from "hardhat";
import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import { JsonRpcSigner } from "@ethersproject/providers";
import {
  BrokerageBatch,
  Call,
  ExternalFulfillments,
  Loans,
  MatchOrders,
  MatchOrdersTypes,
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

describe("Match_Executor", () => {
  let mock20: MockERC20Config;
  let mock721: MockERC721Config;
  let mockVault: MockVaultConfig;
  let matchExecutor: MatchExecutorConfig<Contract>;
  let infinityExchange: InfinityExchangeConfig;
  let owner = {} as SignerWithAddress;
  let emptyMatch = {} as MatchOrders;
  let emptyFulfillments = {} as ExternalFulfillments;
  let emptyLoans = {} as Loans;
  let emptyBatch = {} as BrokerageBatch;

  let orderClientBySigner: Map<SignerWithAddress, ReturnType<typeof getOrderClient>> = new Map();

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
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
      matchType: MatchOrdersTypes.OneToOneSpecific,
    };

    emptyFulfillments = {
      calls: [],
      nftsToTransfer: [],
    };

    emptyBatch = {
      matches: [emptyMatch],
      externalFulfillments: emptyFulfillments,
    };

    emptyLoans = {
      tokens: [],
      amounts: [],
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

  describe("broker", () => {
    it("is only callable by the owner", async () => {

      const invalidBrokerage = matchExecutor.contract
        .connect(matchExecutor.intermediary)
        .executeMatches([emptyBatch], emptyLoans);
      await expect(invalidBrokerage).to.be.revertedWith("Ownable: caller is not the owner");

      // const validBrokerage = matchExecutor.contract
      //   .connect(owner)
      //   .executeMatches([emptyBatch], emptyLoans);
      // try {
      //   await validBrokerage;
      // } catch (err) {
      //   console.error(err);
      //   expect(true).to.be.false;
      // }
    });

    it("can call another contract", async () => {
      const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
      const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
        infinityExchange.matchExecutor.address,
        0,
      ]);

      const call: Call = {
        data: data,
        value: 0,
        to: infinityExchange.contract.address,
        isPayable: false,
      };

      const brokerage: ExternalFulfillments = {
        calls: [call],
        nftsToTransfer: [],
      };

      //   const validBrokerage = matchExecutorEOAInitiator.contract
      //     .connect(matchExecutorEOAInitiator.initiator)
      //     .broker(brokerage);

      //   try {
      //     await validBrokerage;
      //     expect(true).to.be.true;
      //   } catch (err) {
      //     expect(true).to.be.false;
      //   }
    });

    // it("cannot call contract that is not payable with value", async () => {
    //   const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
    //   const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
    //     infinityExchange.matchExecutor.address,
    //     0,
    //   ]);
    //   const contract = infinityExchange.contract.address;

    //   /**
    //    * ensure the contract is not payable
    //    */
    //   const isPayable = await matchExecutor.contract.payableContracts(contract);
    //   expect(isPayable).to.be.false;

    //   const call: Call = {
    //     data: data,
    //     value: 1,
    //     to: contract,
    //     isPayable: true,
    //   };

    //   const brokerage: ExternalFulfillments = {
    //     calls: [call],
    //     nftsToTransfer: [],
    //   };
    //   const loans: Loans = {
    //     tokens: [],
    //     amounts: [],
    //   };

    //   /**
    //    * attempt to broker a call to the non-payable contract with value
    //    */
    //     const invalidBrokerage = matchExecutor.contract
    //       .connect(owner)
    //       .executeMatches([emptyBatch], emptyLoans);
    //     await expect(invalidBrokerage).to.be.revertedWith("contract is not payable");
    // });

    // it("cannot have a mismatch between isPayable and value", async () => {
    //   const isNonceValid = infinityExchange.contract.interface.getFunction("isNonceValid");
    //   const data = infinityExchange.contract.interface.encodeFunctionData(isNonceValid, [
    //     infinityExchange.matchExecutor.address,
    //     0,
    //   ]);

    //   /**
    //    * note that the value is `1` but `isPayable` is `false`
    //    */
    //   const call: Call = {
    //     data: data,
    //     value: 1,
    //     to: infinityExchange.contract.address,
    //     isPayable: false,
    //   };

    //   const brokerage: ExternalFulfillments = {
    //     calls: [call],
    //     nftsToTransfer: [],
    //   };

    //     const invalidBrokerage = matchExecutor.contract
    //       .connect(owner)
    //       .executeMatches([emptyBatch], emptyLoans);
    //     await expect(invalidBrokerage).to.be.revertedWith("value must be zero in a non-payable call");
    // });

    it("can transfer an erc721", async () => {
      const tokenId = "1";
      const nftToTransfer: OrderItem = {
        collection: mock721.contract.address,
        tokens: [{ tokenId, numTokens: "1" }],
      };

      const brokerage: ExternalFulfillments = {
        calls: [],
        nftsToTransfer: [nftToTransfer],
      };

      /**
       * attempting to transfer before the match executor is the owner of the token
       * should fail
       */
      //   const invalidBrokerage = matchExecutorEOAInitiator.contract
      //     .connect(matchExecutorEOAInitiator.initiator)
      //     .broker(brokerage);
      //   await expect(invalidBrokerage).to.be.revertedWith(
      //     "ERC721: transfer caller is not owner nor approved"
      //   );

      /**
       * transfer the nft to the match executor
       */
      await mock721.contract
        .connect(mock721.minter)
        .transferFrom(mock721.minter.address, matchExecutor.contract.address, tokenId);
      const nftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      const intermediary = trimLowerCase(matchExecutor.intermediary.address);
      const matchExecutorAddress = trimLowerCase(matchExecutor.contract.address);
      expect(nftOwner).to.equal(matchExecutorAddress);
      expect(nftOwner).not.to.equal(intermediary);

      /**
       * transfer the nft to the intermediary via broker
       */
      //   await matchExecutorEOAInitiator.contract
      //     .connect(matchExecutorEOAInitiator.initiator)
      //     .broker(brokerage);
      // const newNftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      // expect(newNftOwner).to.equal(intermediary);
    });

    it("can broker a listing on the infinity exchange", async () => {
      /**
       * generate the listing
       */
      const tokenId = "2";
      const orderItems: OrderItem[] = [
        {
          collection: mock721.contract.address,
          tokens: [{ tokenId, numTokens: "1" }],
        },
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

      const price = listing.order.startPrice;
      expect(trimLowerCase(listing.order.execParams.currencyAddress)).to.equal(
        trimLowerCase(mock20.contract.address)
      );

      await mock20.contract
        .connect(mock20.minter)
        .transfer(matchExecutor.contract.address, price);

      /**
       * generate the call data for the call that will:
       *
       * set approval for the infinity exchange to transfer the mock erc20
       */
      const approveWETH = mock20.contract.interface.getFunction("approve");
      const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
        infinityExchange.contract.address,
        price,
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

      const brokerage: ExternalFulfillments = {
        calls: [
          {
            data: approveWETHData,
            value: 0,
            to: mock20.contract.address,
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

      //   try {
      //     await matchExecutorEOAInitiator.contract
      //       .connect(matchExecutorEOAInitiator.initiator)
      //       .broker(brokerage);
      //   } catch (err) {
      //     console.error(err);
      //   }

      // const nftOwner = trimLowerCase(await mock721.contract.ownerOf(tokenId));
      // expect(nftOwner).to.equal(trimLowerCase(matchExecutor.intermediary.address));
    });

    it("can execute a flash loan", async () => {
      const gasFees = parseEther("0.01").toString();
      await mock20.contract
        .connect(mock20.minter)
        .transfer(matchExecutor.contract.address, gasFees);
      /**
       * add some allowance to payback the gas fee
       */
      const approveWETH = mock20.contract.interface.getFunction("approve");
      const approveWETHData = mock20.contract.interface.encodeFunctionData(approveWETH, [
        infinityExchange.contract.address,
        ethers.constants.MaxUint256,
      ]);

      const brokerage: ExternalFulfillments = {
        calls: [
          {
            data: approveWETHData,
            value: 0,
            to: mock20.contract.address,
            isPayable: false,
          },
        ],
        nftsToTransfer: [],
      };

      const brokerageBatches: BrokerageBatch[] = [
        {
          externalFulfillments: brokerage,
          /**
           * by not having any matches in the batch, the match executor
           * is responsible for paying back the gas fees
           */
          matches: [],
        },
      ];

      const loanAmount = parseEther("1").toString();
      const loan: Loans = {
        tokens: [mock20.contract.address],
        amounts: [loanAmount],
      };

      /**
       * transfer some tokens to the vault
       */
      await mock20.contract
        .connect(mock20.minter)
        .transfer(matchExecutor.vault.contract.address, loanAmount);

      /**
       * execute the flash loan
       */
      // const txn = await infinityExchange.contract
      //   .connect(infinityExchange.matchExecutor)
      //   .initiateBrokerage(brokerageBatches, loan);
      // const receipt = await matchExecutor.contract.provider.getTransactionReceipt(txn.hash);
      // const logs = receipt.logs;

      // /**
      //  * verify the tokens were loaned out
      //  */
      // const transferToLog = mock20.contract.interface.parseLog(logs[0]);
      // expect(trimLowerCase(transferToLog.args[0])).to.equal(
      //   trimLowerCase(matchExecutor.vault.contract.address)
      // );
      // expect(trimLowerCase(transferToLog.args[1])).to.equal(
      //   trimLowerCase(matchExecutor.contract.address)
      // );
      // expect(BigNumber.from(transferToLog.args[2]).toString()).to.equal(loanAmount);

      // /**
      //  * verify the tokens were payed back
      //  *
      //  * second to last log, the last line is the flash loan completed event
      //  */
      // const transferBackLog = mock20.contract.interface.parseLog(logs[logs.length - 2]);
      // expect(trimLowerCase(transferBackLog.args[0])).to.equal(
      //   trimLowerCase(matchExecutor.contract.address)
      // );
      // expect(trimLowerCase(transferBackLog.args[1])).to.equal(
      //   trimLowerCase(matchExecutor.vault.contract.address)
      // );
      // expect(BigNumber.from(transferBackLog.args[2]).toString()).to.equal(loanAmount);
    });
  });
});
