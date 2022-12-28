// import { Contract } from "@ethersproject/contracts";
// import { JsonRpcSigner } from "@ethersproject/providers";
// import { parseEther } from "@ethersproject/units";
// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
// import {
//   Blur,
//   CryptoPunks,
//   Element,
//   Forward,
//   Foundation,
//   Infinity,
//   LooksRare,
//   Manifold,
//   Rarible,
//   Universe,
//   X2Y2,
//   ZeroExV4,
//   Zora
// } from "@reservoir0x/sdk";
// import * as Common from "@reservoir0x/sdk/dist/common";
// import { Exchange } from "@reservoir0x/sdk/dist/infinity";
// import * as Seaport from "@reservoir0x/sdk/dist/seaport";
// import { expect } from "chai";
// import { BigNumberish as ethersBigNumberish } from "ethers";
// import { ethers, network } from "hardhat";
// import { ExecParams, ExtraParams, OBOrder, OrderItem, prepareOBOrder } from "../helpers/orders";
// import { nowSeconds } from "../tasks/utils";
// import {
//   Batch,
//   ExternalFulfillments,
//   MatchOrders,
//   MatchOrdersTypes
// } from "../utils/matchExecutorTypes";
// import {
//   bn,
//   getChainId,
//   getCurrentTimestamp,
//   setupNFTs,
//   setupTokens
// } from "../utils/reservoirUtils";
// import { InfinityExchangeConfig, setupInfinityExchange } from "../utils/setupInfinityExchange";
// import { MatchExecutorConfig, setupMatchExecutor } from "../utils/setupMatchExecutor";

// let matchExecutor: MatchExecutorConfig<Contract>;
// // let infinityExchange: InfinityExchangeConfig;
// let infinityExchange: Exchange;
// let orderClientBySigner: Map<
//   SignerWithAddress,
//   ReturnType<typeof getInfinityOrderClient>
// > = new Map();

// const getInfinityOrderClient = (signer: SignerWithAddress, signingFor?: string) => {
//   const chainId = getChainId();
//   const userAddress = signingFor ?? signer.address;
//   let orderNonce = 1;
//   const obComplicationMainnetAddress = "0xbaDa5555fe632ace2C90Fee8C060703369c25f1c";
//   const obComplContract = new ethers.Contract(obComplicationMainnetAddress, [], signer);

//   const _createOrder = async (
//     isSellOrder: boolean,
//     nfts: OrderItem[],
//     numItems = 1,
//     execParams: ExecParams,
//     startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
//     endPrice: ethersBigNumberish = startPrice,
//     startTime: ethersBigNumberish = -1,
//     endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
//     extraParams: ExtraParams = {}
//   ) => {
//     if (startTime === -1) {
//       startTime = await getCurrentTimestamp(ethers.provider);
//     }
//     const orderId = ethers.utils.solidityKeccak256(
//       ["address", "uint256", "uint256"],
//       [userAddress, orderNonce, chainId]
//     );
//     const order: OBOrder = {
//       id: orderId,
//       chainId,
//       isSellOrder,
//       signerAddress: userAddress,
//       nonce: `${orderNonce}`,
//       numItems: numItems,
//       nfts,
//       startPrice,
//       endPrice,
//       startTime,
//       endTime,
//       execParams,
//       extraParams
//     };

//     const prepare = () => {
//       return prepareOBOrder(
//         { address: order.signerAddress },
//         chainId,
//         signer as any as JsonRpcSigner,
//         order,
//         infinityExchange.contract,
//         obComplContract,
//         true
//       );
//     };

//     orderNonce += 1;

//     return { order, prepare };
//   };

//   const createListing = async (
//     nfts: OrderItem[],
//     execParams: ExecParams = {
//       complicationAddress: obComplicationMainnetAddress,
//       currencyAddress: Common.Addresses.Eth[chainId]
//     },
//     numItems = 1,
//     startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
//     endPrice: ethersBigNumberish = startPrice,
//     startTime: ethersBigNumberish = -1,
//     endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
//     extraParams: ExtraParams = {}
//   ) => {
//     return await _createOrder(
//       true,
//       nfts,
//       numItems,
//       execParams,
//       startPrice,
//       endPrice,
//       startTime,
//       endTime,
//       extraParams
//     );
//   };

//   const createOffer = async (
//     nfts: OrderItem[],
//     execParams: ExecParams = {
//       complicationAddress: obComplicationMainnetAddress,
//       currencyAddress: Common.Addresses.Weth[chainId]
//     },
//     numItems = 1,
//     startPrice: ethersBigNumberish = ethers.utils.parseEther("1"),
//     endPrice: ethersBigNumberish = startPrice,
//     startTime: ethersBigNumberish = -1,
//     endTime: ethersBigNumberish = nowSeconds().add(10 * 60),
//     extraParams: ExtraParams = {}
//   ) => {
//     return _createOrder(
//       false,
//       nfts,
//       numItems,
//       execParams,
//       startPrice,
//       endPrice,
//       startTime,
//       endTime,
//       extraParams
//     );
//   };

//   return {
//     createListing,
//     createOffer
//   };
// };

// describe("Match_Executor", () => {
//   const chainId = getChainId();

//   let deployer: SignerWithAddress;
//   let alice: SignerWithAddress;
//   let bob: SignerWithAddress;
//   let owner: SignerWithAddress;

//   let erc20: Contract;
//   let erc721: Contract;

//   beforeEach(async () => {
//     await network.provider.request({
//       method: "hardhat_reset",
//       params: [
//         {
//           forking: {
//             jsonRpcUrl: (network.config as any).forking.url,
//             blockNumber: (network.config as any).forking.blockNumber
//           }
//         }
//       ]
//     });

//     [deployer, alice, bob, owner] = await ethers.getSigners();

//     ({ erc20 } = await setupTokens(deployer));
//     ({ erc721 } = await setupNFTs(deployer));

//     // infinityExchange = await setupInfinityExchange(
//     //   ethers.getContractFactory,
//     //   owner,
//     //   Common.Addresses.Weth[chainId],
//     //   deployer
//     // );

//     infinityExchange = new Infinity.Exchange(chainId);

//     matchExecutor = await setupMatchExecutor(
//       ethers.getContractFactory,
//       owner,
//       infinityExchange.contract
//     );

//     console.log("Match Executor Address: ", matchExecutor.contract.address);

//     const infinityMainnetOwner = "0xB81819ef1e84f04B6eb7ad210677936688Ba3123";
//     const impersonatedInfinityMainnetOwner = await ethers.getImpersonatedSigner(
//       infinityMainnetOwner
//     );
//     // send some ETH to impersonatedInfinityMainnetOwner so it has balance
//     await owner.sendTransaction({
//       to: infinityMainnetOwner,
//       value: ethers.utils.parseEther("1")
//     });
//     await infinityExchange.contract
//       .connect(impersonatedInfinityMainnetOwner)
//       .updateMatchExecutor(matchExecutor.contract.address);

//     // add enabled exchanges
//     await matchExecutor.contract.addEnabledExchange(Infinity.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Seaport.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(CryptoPunks.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Blur.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(LooksRare.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(X2Y2.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Element.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Foundation.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Forward.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Rarible.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Manifold.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Universe.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(ZeroExV4.Addresses.Exchange[chainId]);
//     await matchExecutor.contract.addEnabledExchange(Zora.Addresses.Exchange[chainId]);

//     orderClientBySigner.set(bob, getInfinityOrderClient(bob));
//     orderClientBySigner.set(owner, getInfinityOrderClient(owner, matchExecutor.contract.address));
//     orderClientBySigner.set(alice, getInfinityOrderClient(alice));
//   });

//   it("snipes a ETH <=> ERC721 single token native listing", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the infinity exchange
//     await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const infinityListing = await orderClientBySigner
//       .get(seller)!
//       .createListing(infinityOrderItems);
//     const signedInfinityListing = await infinityListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedInfinityListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     console.log("Executing native matches");
//     try {
//       await matchExecutor.contract.connect(owner).executeNativeMatches([matchOrders]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token infinity listing", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1").toString();
//     const tokenId = "1";

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the exchange
//     await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

//     const infinityExchange = new Infinity.Exchange(chainId);
//     const builder = new Infinity.Builders.SingleToken(chainId);
//     const infinitySellOrder = builder.build({
//       isSellOrder: true,
//       collection: erc721.address,
//       signer: seller.address,
//       startPrice: price,
//       endPrice: price,
//       startTime: await getCurrentTimestamp(ethers.provider),
//       endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
//       nonce: "1",
//       maxGasPrice: "100000000000",
//       currency: Common.Addresses.Eth[chainId],
//       tokenId,
//       numTokens: 1
//     });

//     // Sign the order
//     await infinitySellOrder.sign(seller);
//     await infinitySellOrder.checkFillability(ethers.provider);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems);
//     const signedIntermediaryListing = await intermediaryListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, bn(price).mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     console.log("Encoding external fulfillments");
//     const txData = infinityExchange.takeMultipleOneOrdersTx(matchExecutor.contract.address, [
//       infinitySellOrder
//     ]);
//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData.data,
//           value: txData.value ?? 0,
//           to: txData.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedIntermediaryListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: txData.value ?? 0
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token seaport listing", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the seaport exchange
//     await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);

//     const seaportExchange = new Seaport.Exchange(chainId);
//     const builder = new Seaport.Builders.SingleToken(chainId);
//     const seaportSellOrder = builder.build({
//       side: "sell",
//       tokenKind: "erc721",
//       offerer: seller.address,
//       contract: erc721.address,
//       tokenId,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       counter: 0,
//       startTime: await getCurrentTimestamp(ethers.provider),
//       endTime: (await getCurrentTimestamp(ethers.provider)) + 60
//     });

//     // Sign the order
//     await seaportSellOrder.sign(seller);
//     await seaportSellOrder.checkFillability(ethers.provider);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems);
//     const signedIntermediaryListing = await intermediaryListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams = seaportSellOrder.buildMatching();
//     const txData = seaportExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       seaportSellOrder,
//       matchParams
//     );
//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData.data,
//           value: txData.value ?? 0,
//           to: txData.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedIntermediaryListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: txData.value ?? 0
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token blur listing non bulk signed", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the blur exchange
//     await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

//     const blurExchange = new Blur.Exchange(chainId);
//     const builder = new Blur.Builders.SingleToken(chainId);
//     const blurSellOrder = builder.build({
//       side: "sell",
//       trader: seller.address,
//       collection: erc721.address,
//       tokenId,
//       amount: 1,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       listingTime: await getCurrentTimestamp(ethers.provider),
//       matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
//       nonce: 0,
//       expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
//       fees: [],
//       salt: 0,
//       extraParams: "0x"
//     });

//     // Sign the order
//     await blurSellOrder.sign(seller);
//     await blurSellOrder.checkFillability(ethers.provider);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems);
//     const signedIntermediaryListing = await intermediaryListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams = blurSellOrder.buildMatching({ trader: matchExecutor.contract.address });
//     const txData = blurExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       blurSellOrder,
//       matchParams
//     );
//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData.data,
//           value: txData.value ?? 0,
//           to: txData.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedIntermediaryListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: txData.value ?? 0
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token blur listings bulk signed", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId1 = 0;
//     const tokenId2 = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId1);
//     await erc721.connect(seller).mint(tokenId2);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the blur exchange
//     await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

//     const blurExchange = new Blur.Exchange(chainId);
//     const builder = new Blur.Builders.SingleToken(chainId);
//     const blurSellOrder1 = builder.build({
//       side: "sell",
//       trader: seller.address,
//       collection: erc721.address,
//       tokenId: tokenId1,
//       amount: 1,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       listingTime: await getCurrentTimestamp(ethers.provider),
//       matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
//       nonce: 0,
//       expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
//       fees: [],
//       salt: 0,
//       extraParams: "0x"
//     });

//     const blurSellOrder2 = builder.build({
//       side: "sell",
//       trader: seller.address,
//       collection: erc721.address,
//       tokenId: tokenId2,
//       amount: 1,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       listingTime: await getCurrentTimestamp(ethers.provider),
//       matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
//       nonce: 0,
//       expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
//       fees: [],
//       salt: 0,
//       extraParams: "0x"
//     });

//     // Sign the order
//     await Blur.Order.signBulk([blurSellOrder1, blurSellOrder2], seller);
//     await blurSellOrder1.checkFillability(ethers.provider);
//     await blurSellOrder2.checkFillability(ethers.provider);

//     const ownerBefore1 = await nft.getOwner(tokenId1);
//     const ownerBefore2 = await nft.getOwner(tokenId2);
//     expect(ownerBefore1).to.eq(seller.address);
//     expect(ownerBefore2).to.eq(seller.address);

//     // create infinity listings
//     const infinityOrderItems1: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId: tokenId1, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing1 = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems1);
//     const signedIntermediaryListing1 = await intermediaryListing1.prepare();

//     const infinityOrderItems2: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId: tokenId2, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing2 = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems2);
//     const signedIntermediaryListing2 = await intermediaryListing2.prepare();

//     // create infinity offers
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(4)); // multiply for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);

//     const infinityOffer1 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems1);
//     const signedInfinityOffer1 = await infinityOffer1.prepare();
//     const infinityOffer2 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems2);
//     const signedInfinityOffer2 = await infinityOffer2.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams1 = blurSellOrder1.buildMatching({ trader: matchExecutor.contract.address });
//     const matchParams2 = blurSellOrder2.buildMatching({ trader: matchExecutor.contract.address });
//     const txData1 = blurExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       blurSellOrder1,
//       matchParams1
//     );
//     const txData2 = blurExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       blurSellOrder2,
//       matchParams2
//     );

//     const fulfillments1: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData1.data,
//           value: txData1.value ?? 0,
//           to: txData1.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems1
//     };

//     const fulfillments2: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData2.data,
//           value: txData2.value ?? 0,
//           to: txData2.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems2
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders1: MatchOrders = {
//       buys: [signedInfinityOffer1!],
//       sells: [signedIntermediaryListing1!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };
//     const matchOrders2: MatchOrders = {
//       buys: [signedInfinityOffer2!],
//       sells: [signedIntermediaryListing2!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch1: Batch = {
//       matches: [matchOrders1],
//       externalFulfillments: fulfillments1
//     };
//     const batch2: Batch = {
//       matches: [matchOrders2],
//       externalFulfillments: fulfillments2
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: bn(txData1.value ?? 0).add(txData2.value ?? 0)
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch1]);
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch2]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter1 = await nft.getOwner(tokenId1);
//     const ownerAfter2 = await nft.getOwner(tokenId2);
//     expect(ownerAfter1).to.eq(buyer.address);
//     expect(ownerAfter2).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token blur listings bulk signed and with optimized infinity orders", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId1 = 0;
//     const tokenId2 = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId1);
//     await erc721.connect(seller).mint(tokenId2);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the blur exchange
//     await erc721.connect(seller).setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

//     const blurExchange = new Blur.Exchange(chainId);
//     const builder = new Blur.Builders.SingleToken(chainId);
//     const blurSellOrder1 = builder.build({
//       side: "sell",
//       trader: seller.address,
//       collection: erc721.address,
//       tokenId: tokenId1,
//       amount: 1,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       listingTime: await getCurrentTimestamp(ethers.provider),
//       matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
//       nonce: 0,
//       expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
//       fees: [],
//       salt: 0,
//       extraParams: "0x"
//     });

//     const blurSellOrder2 = builder.build({
//       side: "sell",
//       trader: seller.address,
//       collection: erc721.address,
//       tokenId: tokenId2,
//       amount: 1,
//       paymentToken: Common.Addresses.Eth[chainId],
//       price,
//       listingTime: await getCurrentTimestamp(ethers.provider),
//       matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
//       nonce: 0,
//       expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
//       fees: [],
//       salt: 0,
//       extraParams: "0x"
//     });

//     // Sign the order
//     await Blur.Order.signBulk([blurSellOrder1, blurSellOrder2], seller);
//     await blurSellOrder1.checkFillability(ethers.provider);
//     await blurSellOrder2.checkFillability(ethers.provider);

//     const ownerBefore1 = await nft.getOwner(tokenId1);
//     const ownerBefore2 = await nft.getOwner(tokenId2);
//     expect(ownerBefore1).to.eq(seller.address);
//     expect(ownerBefore2).to.eq(seller.address);

//     // create infinity listings
//     const infinityOrderItems1: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId: tokenId1, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing1 = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems1);
//     const signedIntermediaryListing1 = await intermediaryListing1.prepare();

//     const infinityOrderItems2: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId: tokenId2, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing2 = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems2);
//     const signedIntermediaryListing2 = await intermediaryListing2.prepare();

//     // create infinity offers
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(4)); // multiply for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);

//     const infinityOffer1 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems1);
//     const signedInfinityOffer1 = await infinityOffer1.prepare();
//     const infinityOffer2 = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems2);
//     const signedInfinityOffer2 = await infinityOffer2.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams1 = blurSellOrder1.buildMatching({ trader: matchExecutor.contract.address });
//     const matchParams2 = blurSellOrder2.buildMatching({ trader: matchExecutor.contract.address });
//     const txData1 = blurExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       blurSellOrder1,
//       matchParams1
//     );
//     const txData2 = blurExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       blurSellOrder2,
//       matchParams2
//     );

//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData1.data,
//           value: txData1.value ?? 0,
//           to: txData1.to,
//           isPayable: true
//         },
//         {
//           data: txData2.data,
//           value: txData2.value ?? 0,
//           to: txData2.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems1.concat(infinityOrderItems2)
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */
//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer1!, signedInfinityOffer2!],
//       sells: [signedIntermediaryListing1!, signedIntermediaryListing2!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };
//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: bn(txData1.value ?? 0).add(txData2.value ?? 0)
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter1 = await nft.getOwner(tokenId1);
//     const ownerAfter2 = await nft.getOwner(tokenId2);
//     expect(ownerAfter1).to.eq(buyer.address);
//     expect(ownerAfter2).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token looksrare listing", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the exchange
//     await nft.approve(seller, LooksRare.Addresses.TransferManagerErc721[chainId]);

//     const looksrareExchange = new LooksRare.Exchange(chainId);
//     const builder = new LooksRare.Builders.SingleToken(chainId);
//     const lrSellOrder = builder.build({
//       isOrderAsk: true,
//       signer: seller.address,
//       collection: erc721.address,
//       tokenId,
//       // LooksRare sell orders are in WETH
//       currency: Common.Addresses.Weth[chainId],
//       price,
//       startTime: await getCurrentTimestamp(ethers.provider),
//       endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
//       nonce: await looksrareExchange.getNonce(ethers.provider, seller.address)
//     });

//     // Sign the order
//     await lrSellOrder.sign(seller);
//     await lrSellOrder.checkFillability(ethers.provider);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems);
//     const signedIntermediaryListing = await intermediaryListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams = lrSellOrder.buildMatching(matchExecutor.contract.address);
//     const txData = looksrareExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       lrSellOrder,
//       matchParams
//     );
//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData.data,
//           value: txData.value ?? 0,
//           to: txData.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedIntermediaryListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: txData.value ?? 0
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });

//   it("snipes a ETH <=> ERC721 single token element listing", async () => {
//     const buyer = alice;
//     const seller = bob;
//     const price = parseEther("1");
//     const tokenId = 1;

//     // Mint erc721 to seller
//     await erc721.connect(seller).mint(tokenId);
//     const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
//     // Approve the exchange
//     await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

//     const elementExchange = new Element.Exchange(chainId);
//     const builder = new Element.Builders.SingleToken(chainId);
//     const elementSellOrder = builder.build({
//       direction: "sell",
//       maker: seller.address,
//       contract: erc721.address,
//       tokenId,
//       paymentToken: Element.Addresses.Eth[chainId],
//       price,
//       hashNonce: 0,
//       expiry: (await getCurrentTimestamp(ethers.provider)) + 100
//     });

//     // Sign the order
//     await elementSellOrder.sign(seller);
//     await elementSellOrder.checkFillability(ethers.provider);

//     const ownerBefore = await nft.getOwner(tokenId);
//     expect(ownerBefore).to.eq(seller.address);

//     // create infinity listing
//     const infinityOrderItems: OrderItem[] = [
//       {
//         collection: erc721.address,
//         tokens: [{ tokenId, numTokens: "1" }]
//       }
//     ];
//     const intermediaryListing = await orderClientBySigner
//       .get(owner)!
//       .createListing(infinityOrderItems);
//     const signedIntermediaryListing = await intermediaryListing.prepare();

//     // create infinity offer
//     const weth = new Common.Helpers.Weth(ethers.provider, chainId);
//     // Mint weth to buyer and approve infinity exchange
//     await weth.deposit(buyer, price.mul(2)); // multiply by 2 for buffer
//     await weth.approve(buyer, infinityExchange.contract.address);
//     const infinityOffer = await orderClientBySigner.get(buyer)!.createOffer(infinityOrderItems);
//     const signedInfinityOffer = await infinityOffer.prepare();

//     console.log("Encoding external fulfillments");
//     const matchParams = elementSellOrder.buildMatching();
//     const txData = elementExchange.fillOrderTx(
//       matchExecutor.contract.address,
//       elementSellOrder,
//       matchParams
//     );
//     const fulfillments: ExternalFulfillments = {
//       calls: [
//         {
//           data: txData.data,
//           value: txData.value ?? 0,
//           to: txData.to,
//           isPayable: true
//         }
//       ],
//       nftsToTransfer: infinityOrderItems
//     };

//     /**
//      * complete the call by calling the infinity exchange
//      */

//     const matchOrders: MatchOrders = {
//       buys: [signedInfinityOffer!],
//       sells: [signedIntermediaryListing!],
//       constructs: [],
//       matchType: MatchOrdersTypes.OneToOneSpecific
//     };

//     const batch: Batch = {
//       matches: [matchOrders],
//       externalFulfillments: fulfillments
//     };

//     console.log("Executing matches");
//     // console.log("Batch", JSON.stringify(batch, null, 2));
//     try {
//       // send some ETH to matchExecutor so it has balance to buy from external MP
//       await owner.sendTransaction({
//         to: matchExecutor.contract.address,
//         value: txData.value ?? 0
//       });
//       await matchExecutor.contract.connect(owner).executeBrokerMatches([batch]);
//     } catch (err) {
//       console.error(err);
//     }

//     const ownerAfter = await nft.getOwner(tokenId);
//     expect(ownerAfter).to.eq(buyer.address);
//   });
// });
