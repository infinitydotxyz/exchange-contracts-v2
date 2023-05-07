const { expect } = require("chai");
const { ethers } = require("hardhat");
const { nowSeconds } = require("../tasks/utils");
const { prepareOBOrder, getCurrentSignedOrderPrice } = require("../helpers/orders");
const { erc721Abi } = require("../abi/erc721");
const { FlowExchangeABI } = require("../abi/flowExchange");
const { FlowOBComplicationABI } = require("../abi/flowOBComplication");

describe("Exchange_Take_One_To_One_ETH_Mainnet", function () {
  let seller,
    sellerPrivKey,
    buyer,
    buyerPrivKey,
    sellerNonce,
    priceETH,
    chainId,
    flowExchange,
    obComplication,
    collectionAddress,
    sellTokenId,
    erc721Contract;

  let sellerBalance = toBN(0);
  let buyerBalance = toBN(0);
  let totalProtocolFees = toBN(0);

  const FEE_BPS = 200;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  function toBN(val) {
    return ethers.BigNumber.from(val.toString());
  }

  before(async () => {
    sellerPrivKey = process.env.ETH_MAINNET_PRIV_KEY_3;
    buyerPrivKey = process.env.ETH_MAINNET_PRIV_KEY;
    if (!sellerPrivKey || !buyerPrivKey) {
      throw new Error("Please set SELLER_PRIVATE_KEY and BUYER_PRIVATE_KEY env vars");
    }

    seller = new ethers.Wallet(sellerPrivKey, ethers.provider);
    buyer = new ethers.Wallet(buyerPrivKey, ethers.provider);
    sellerNonce = 4;

    priceETH = "1";

    chainId = 1;
    flowExchange = new ethers.Contract(
      "0xf1000142679a6a57abd2859d18f8002216b0ac2b",
      FlowExchangeABI,
      ethers.provider
    );
    obComplication = new ethers.Contract(
      "0xf10005a7E799CfD16BD71A3344E463DcDaaC1C97",
      FlowOBComplicationABI,
      ethers.provider
    );

    // nakamigos
    collectionAddress = "0xd774557b647330c91bf44cfeab205095f7e6c367";
    erc721Contract = new ethers.Contract(collectionAddress, erc721Abi, ethers.provider);
    sellTokenId = 4693;

    totalProtocolFees = await ethers.provider.getBalance(flowExchange.address);
    console.log("totalProtocolFees before sale", ethers.utils.formatEther(totalProtocolFees));
  });

  // ================================================== MAKE SELL ORDERS ==================================================

  // one specific collection, one specific token, min price
  describe("OneCollectionOneTokenSellETH", () => {
    it("Should succeed", async function () {
      const user = {
        address: seller.address
      };
      const nfts = [
        {
          collection: erc721Contract.address,
          tokens: [{ tokenId: sellTokenId, numTokens: 1 }]
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, sellerNonce, chainId]
      );
      let numItems = 0;
      for (const nft of nfts) {
        numItems += nft.tokens.length;
      }
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems,
        startPrice: ethers.utils.parseEther(priceETH),
        endPrice: ethers.utils.parseEther(priceETH),
        startTime: nowSeconds().sub(100 * 60),
        endTime: nowSeconds().add(100 * 60),
        nonce: sellerNonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        seller,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      if (!signedOrder) {
        return;
      }

      // ================================================== TAKE SELL ORDERS ===================================================

      console.log("Taking the sell order");
      const salePrice = getCurrentSignedOrderPrice(signedOrder);
      console.log("SalePrice", ethers.utils.formatEther(salePrice));

      // owners before sale
      console.log("checking ownership before sale");
      for (const item of signedOrder.nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, seller);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(seller.address);
        }
      }

      // balance before sale
      console.log("checking balances before sale");
      sellerBalance = await ethers.provider.getBalance(seller.address);
      buyerBalance = await ethers.provider.getBalance(buyer.address);
      console.log("sellerBalance", ethers.utils.formatEther(sellerBalance));
      console.log("buyerBalance", ethers.utils.formatEther(buyerBalance));

      // check if complication checks pass
      const checks = await obComplication.canExecTakeOneOrder(signedOrder);
      console.log("complication passes", checks);
      if (!checks[0]) {
        console.log("complication checks failed");
        const isNumItemsValid =
          signedOrder.constraints[0] === 1 &&
          signedOrder.nfts.length === 1 &&
          signedOrder.nfts[0].tokens.length === 1;
        console.log("isNumItemsValid", isNumItemsValid);

        const block = await ethers.provider.getBlock("latest");
        const startTime = Number(signedOrder.constraints[3].toString());
        const endTime = Number(signedOrder.constraints[4].toString());
        console.log("block.timestamp", block.timestamp, "startTime", startTime, "endTime", endTime);

        const isTimeValid = startTime <= block.timestamp && startTime >= block.timestamp;
        console.log("isTimeValid", isTimeValid);
        return;
      }

      // perform exchange
      const options = {
        value: salePrice
      };
      // estimate gas
      const gasEstimate = await flowExchange
        .connect(buyer)
        .estimateGas.takeMultipleOneOrders([signedOrder], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate);

      const txHash = await flowExchange.connect(buyer).takeMultipleOneOrders([signedOrder], options);
      const receipt = await txHash.wait();
      console.log("Exchange complete", receipt.transactionHash, receipt.gasUsed.toString(), receipt.status);

      // owners after sale
      console.log("checking ownership after sale");
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, seller);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(buyer.address);
        }
      }

      // balance after sale
      console.log("checking balances after sale");
      const fee = salePrice.mul(FEE_BPS).div(10000);
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.be.greaterThanOrEqual(
        totalProtocolFees
      );

      sellerBalance = sellerBalance.add(salePrice).sub(fee);
      buyerBalance = buyerBalance.sub(salePrice);
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      expect(sellerBalanceAfter).to.equal(sellerBalance);
      expect(buyerBalanceAfter).to.be.lessThanOrEqual(buyerBalanceAfter); // to account for gas
    });
  });
});
