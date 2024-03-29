const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployContract, nowSeconds, NULL_ADDRESS } = require("../tasks/utils");
const {
  prepareOBOrder,
  getCurrentSignedOrderPrice,
  signFormattedOrder
} = require("../helpers/orders");
const { erc721Abi } = require("../abi/erc721");

describe("Exchange_Maker_Sell_Taker_Buy_ETH", function () {
  let signers,
    signer1,
    signer2,
    signer3,
    token,
    flowExchange,
    mock721Contract1,
    mock721Contract2,
    mock721Contract3,
    obComplication;

  const sellOrders = [];

  let signer1EthBalance = 0;
  let signer2EthBalance = 0;
  let totalProtocolFees = toBN(0);
  let orderNonce = 0;
  let numTakeOrders = -1;

  const FEE_BPS = 250;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const UNIT = toBN(1e18);
  const INITIAL_SUPPLY = toBN(1_000_000).mul(UNIT);

  const totalNFTSupply = 100;
  const numNFTsToTransfer = 50;
  const numNFTsLeft = totalNFTSupply - numNFTsToTransfer;

  function toBN(val) {
    return ethers.BigNumber.from(val.toString());
  }

  before(async () => {
    // reset state
    await network.provider.request({
      method: "hardhat_reset",
      params: []
    });

    // signers
    signers = await ethers.getSigners();
    signer1 = signers[0];
    signer2 = signers[1];
    signer3 = signers[2];
    // token
    token = await deployContract(
      "MockERC20",
      await ethers.getContractFactory("MockERC20"),
      signers[0]
    );

    // NFT contracts
    mock721Contract1 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 1", "MCKNFT1"]
    );
    mock721Contract2 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 2", "MCKNFT2"]
    );
    mock721Contract3 = await deployContract(
      "MockERC721",
      await ethers.getContractFactory("MockERC721"),
      signer1,
      ["Mock NFT 3", "MCKNFT3"]
    );

    // Exchange
    flowExchange = await deployContract(
      "FlowExchange",
      await ethers.getContractFactory("FlowExchange"),
      signer1,
      [token.address, signer3.address]
    );

    // OB complication
    obComplication = await deployContract(
      "FlowOrderBookComplication",
      await ethers.getContractFactory("FlowOrderBookComplication"),
      signer1,
      [token.address]
    );

    // add currencies to registry
    // await flowExchange.addCurrency(token.address);
    // await flowExchange.addCurrency(NULL_ADDRESS);
    await obComplication.addCurrency(token.address);

    // add complications to registry
    // await flowExchange.addCurrency(token.address);

    // send assets
    await token.transfer(signer2.address, INITIAL_SUPPLY.div(2).toString());
    for (let i = 0; i < numNFTsToTransfer; i++) {
      await mock721Contract1.transferFrom(signer1.address, signer2.address, i);
      await mock721Contract2.transferFrom(signer1.address, signer2.address, i);
      await mock721Contract3.transferFrom(signer1.address, signer2.address, i);
    }
  });

  describe("Setup", () => {
    it("Should init properly", async function () {
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);

      expect(await token.balanceOf(signer1.address)).to.equal(INITIAL_SUPPLY.div(2));
      expect(await token.balanceOf(signer2.address)).to.equal(INITIAL_SUPPLY.div(2));

      expect(await mock721Contract1.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract1.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);

      expect(await mock721Contract2.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract2.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);

      expect(await mock721Contract3.balanceOf(signer1.address)).to.equal(numNFTsLeft);
      expect(await mock721Contract3.balanceOf(signer2.address)).to.equal(numNFTsToTransfer);
    });
  });

  // ================================================== MAKE SELL ORDERS ==================================================

  // one specific collection, one specific token, min price
  describe("OneCollectionOneTokenSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: [{ tokenId: 0, numTokens: 1 }]
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
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
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // one specific collection, multiple specific tokens, min aggregate price
  describe("OneCollectionMultipleTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: [
            { tokenId: 1, numTokens: 1 },
            { tokenId: 2, numTokens: 1 },
            { tokenId: 3, numTokens: 1 }
          ]
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
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
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // one specific collection, any one of multiple specific tokens, min price
  describe("OneCollectionAnyOneOfMultipleTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: [
            { tokenId: 12, numTokens: 1 },
            { tokenId: 13, numTokens: 1 },
            { tokenId: 14, numTokens: 1 }
          ]
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      let numItems = 1;
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems,
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // one specific collection, any one token, min price
  describe("OneCollectionAnyOneTokenSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: []
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems: 1,
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // one specific collection, any multiple tokens, min aggregate price, max number of tokens
  describe("OneCollectionAnyMultipleTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: []
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems: 4,
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // multiple specific collections, multiple specific tokens per collection, min aggregate price
  describe("MultipleCollectionsMultipleTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: [{ tokenId: 11, numTokens: 1 }]
        },
        {
          collection: mock721Contract2.address,
          tokens: [
            { tokenId: 0, numTokens: 1 },
            { tokenId: 1, numTokens: 1 }
          ]
        },
        {
          collection: mock721Contract3.address,
          tokens: [
            { tokenId: 0, numTokens: 1 },
            { tokenId: 1, numTokens: 1 },
            { tokenId: 2, numTokens: 1 }
          ]
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
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
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // multiple specific collections, any multiple tokens per collection, min aggregate price, max aggregate number of tokens
  describe("MultipleCollectionsAnyTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [
        {
          collection: mock721Contract1.address,
          tokens: []
        },
        {
          collection: mock721Contract2.address,
          tokens: []
        },
        {
          collection: mock721Contract3.address,
          tokens: []
        }
      ];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems: 5,
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // any collection, any one token, min price
  describe("AnyCollectionAnyOneTokenSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems: 1,
        startPrice: ethers.utils.parseEther("1"),
        endPrice: ethers.utils.parseEther("1"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // any collection, any multiple tokens, min aggregate price, max aggregate number of tokens
  describe("AnyCollectionAnyMultipleTokensSell", () => {
    it("Signed order should be valid", async function () {
      const user = {
        address: signer2.address
      };
      const chainId = network.config.chainId ?? 31337;
      const nfts = [];
      const execParams = {
        complicationAddress: obComplication.address,
        currencyAddress: ZERO_ADDRESS
      };
      const extraParams = {};
      const nonce = ++orderNonce;
      const orderId = ethers.utils.solidityKeccak256(
        ["address", "uint256", "uint256"],
        [user.address, nonce, chainId]
      );
      const order = {
        id: orderId,
        chainId,
        isSellOrder: true,
        signerAddress: user.address,
        numItems: 12,
        startPrice: ethers.utils.parseEther("5"),
        endPrice: ethers.utils.parseEther("5"),
        startTime: nowSeconds(),
        endTime: nowSeconds().add(10 * 60),
        nonce,
        nfts,
        execParams,
        extraParams
      };
      const signedOrder = await prepareOBOrder(
        user,
        chainId,
        signer2,
        order,
        flowExchange,
        obComplication
      );
      expect(signedOrder).to.not.be.undefined;
      sellOrders.push(signedOrder);
    });
  });

  // ================================================== TAKE SELL ORDERS ===================================================

  describe("Take_OneCollectionOneTokenSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const nfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      const salePrice = getCurrentSignedOrderPrice(sellOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // balance before sale
      signer1EthBalance = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      signer2EthBalance = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );

      // perform exchange
      const options = {
        value: salePrice
      };
      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
      // expect(signer2EthBalanceAfter).to.equal(signer2EthBalance);
    });
  });

  describe("Take_OneCollectionMultipleTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const nfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // approve currency
      const salePrice = getCurrentSignedOrderPrice(sellOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_OneCollectionAnyOneOfMultipleTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const sellOrderNfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      for (const sellOrderNft of sellOrderNfts) {
        const collection = sellOrderNft.collection;
        const nft = {
          collection,
          tokens: [
            {
              tokenId: 12,
              numTokens: 1
            }
          ]
        };
        nfts.push(nft);
      }

      // approve currency
      const salePrice = getCurrentSignedOrderPrice(sellOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_OneCollectionAnyOneTokenSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const sellOrderNfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      for (const buyOrderNft of sellOrderNfts) {
        const collection = buyOrderNft.collection;
        const nft = {
          collection,
          tokens: [
            {
              tokenId: 4,
              numTokens: 1
            }
          ]
        };
        nfts.push(nft);
      }

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_OneCollectionAnyMultipleTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const sellOrderNfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      for (const sellOrderNft of sellOrderNfts) {
        const collection = sellOrderNft.collection;
        const nft = {
          collection,
          tokens: [
            {
              tokenId: 5,
              numTokens: 1
            },
            {
              tokenId: 6,
              numTokens: 1
            },
            {
              tokenId: 7,
              numTokens: 1
            },
            {
              tokenId: 8,
              numTokens: 1
            }
          ]
        };
        nfts.push(nft);
      }

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_MultipleCollectionsMultipleTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const nfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_MultipleCollectionsAnyTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const sellOrderNfts = sellOrder.nfts;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      let i = 0;
      for (const buyOrderNft of sellOrderNfts) {
        ++i;
        const collection = buyOrderNft.collection;
        let nft;
        if (i === 1) {
          nft = {
            collection,
            tokens: [
              {
                tokenId: 20,
                numTokens: 1
              },
              {
                tokenId: 21,
                numTokens: 1
              }
            ]
          };
        } else if (i === 2) {
          nft = {
            collection,
            tokens: [
              {
                tokenId: 10,
                numTokens: 1
              }
            ]
          };
        } else {
          nft = {
            collection,
            tokens: [
              {
                tokenId: 10,
                numTokens: 1
              },
              {
                tokenId: 11,
                numTokens: 1
              }
            ]
          };
        }

        nfts.push(nft);
      }

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_AnyCollectionAnyOneTokenSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      const collection = mock721Contract3.address;
      const nft = {
        collection,
        tokens: [
          {
            tokenId: 15,
            numTokens: 1
          }
        ]
      };
      nfts.push(nft);

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });

  describe("Take_AnyCollectionAnyMultipleTokensSell", () => {
    it("Should take valid order", async function () {
      const sellOrder = sellOrders[++numTakeOrders];
      const chainId = network.config.chainId ?? 31337;
      const contractAddress = flowExchange.address;
      const isSellOrder = false;

      const constraints = sellOrder.constraints;
      const execParams = sellOrder.execParams;
      const extraParams = sellOrder.extraParams;

      // form matching nfts
      const nfts = [];
      const nft1 = {
        collection: mock721Contract1.address,
        tokens: [
          {
            tokenId: 30,
            numTokens: 1
          },
          {
            tokenId: 31,
            numTokens: 1
          },
          {
            tokenId: 32,
            numTokens: 1
          }
        ]
      };
      const nft2 = {
        collection: mock721Contract2.address,
        tokens: [
          {
            tokenId: 35,
            numTokens: 1
          },
          {
            tokenId: 36,
            numTokens: 1
          },
          {
            tokenId: 37,
            numTokens: 1
          },
          {
            tokenId: 38,
            numTokens: 1
          },
          {
            tokenId: 39,
            numTokens: 1
          }
        ]
      };
      const nft3 = {
        collection: mock721Contract3.address,
        tokens: [
          {
            tokenId: 20,
            numTokens: 1
          },
          {
            tokenId: 21,
            numTokens: 1
          },
          {
            tokenId: 22,
            numTokens: 1
          },
          {
            tokenId: 23,
            numTokens: 1
          }
        ]
      };

      nfts.push(nft1);
      nfts.push(nft2);
      nfts.push(nft3);

      // sign order
      const buyOrder = {
        isSellOrder,
        signer: signer1.address,
        extraParams,
        nfts,
        constraints,
        execParams,
        sig: ""
      };
      buyOrder.sig = await signFormattedOrder(chainId, contractAddress, buyOrder, signer1);

      // const isSigValid = await flowExchange.verifyOrderSig(buyOrder);
      // expect(isSigValid).to.equal(true);
      // owners before sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer2.address);
        }
      }

      // sale price
      const salePrice = getCurrentSignedOrderPrice(buyOrder);
      const salePriceInEth = parseFloat(ethers.utils.formatEther(salePrice));

      // perform exchange
      const options = {
        value: salePrice
      };

      // estimate gas
      const numTokens = buyOrder.nfts.reduce((acc, nft) => {
        return (
          acc +
          nft.tokens.reduce((acc, token) => {
            return acc + token.numTokens;
          }, 0)
        );
      }, 0);
      console.log("total numTokens in order", numTokens);
      const gasEstimate = await flowExchange
        .connect(signer1)
        .estimateGas.takeOrders([sellOrder], [buyOrder.nfts], options);
      console.log("gasEstimate", gasEstimate.toNumber());
      console.log("gasEstimate per token", gasEstimate / numTokens);

      await flowExchange.connect(signer1).takeOrders([sellOrder], [buyOrder.nfts], options);

      // owners after sale
      for (const item of nfts) {
        const collection = item.collection;
        const contract = new ethers.Contract(collection, erc721Abi, signer1);
        for (const token of item.tokens) {
          const tokenId = token.tokenId;
          expect(await contract.ownerOf(tokenId)).to.equal(signer1.address);
        }
      }

      // balance after sale
      const fee = salePrice.mul(FEE_BPS).div(10000);
      const feeInEth = parseFloat(ethers.utils.formatEther(fee));
      totalProtocolFees = totalProtocolFees.add(fee);
      expect(await ethers.provider.getBalance(flowExchange.address)).to.equal(totalProtocolFees);
      signer1EthBalance = signer1EthBalance - salePriceInEth;
      signer2EthBalance = signer2EthBalance + (salePriceInEth - feeInEth);
      const signer1EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer1.address))
      );
      const signer2EthBalanceAfter = parseFloat(
        ethers.utils.formatEther(await ethers.provider.getBalance(signer2.address))
      );
      expect(signer1EthBalanceAfter).to.be.lessThan(signer1EthBalance); // to account for gas
    });
  });
});
