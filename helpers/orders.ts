import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { hexConcat } from "@ethersproject/bytes";
import { keccak256 } from "@ethersproject/keccak256";
import { JsonRpcSigner } from "@ethersproject/providers";
import { verifyTypedData } from "@ethersproject/wallet";
import { BigNumber, BigNumberish, BytesLike, constants, Contract } from "ethers";
import {
  defaultAbiCoder,
  recoverAddress,
  solidityKeccak256,
  splitSignature,
  _TypedDataEncoder
} from "ethers/lib/utils";
import { MerkleTree } from "merkletreejs";
import { erc20Abi } from "../abi/erc20";
import { erc721Abi } from "../abi/erc721";
import { nowSeconds, trimLowerCase } from "../tasks/utils";
import { bn, lc } from "../utils/reservoirUtils";
import { OBOrder, OrderItem, ORDER_EIP712_TYPES, SignedOBOrder, User } from "./orderTypes";
import { Flow } from "@reservoir0x/sdk";

// constants
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const getCurrentOrderPrice = (order: OBOrder): BigNumber => {
  const startTime = BigNumber.from(order.startTime);
  const endTime = BigNumber.from(order.endTime);
  const startPrice = BigNumber.from(order.startPrice);
  const endPrice = BigNumber.from(order.endPrice);
  const duration = endTime.sub(startTime);
  let priceDiff = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    priceDiff = startPrice.sub(endPrice);
  } else {
    priceDiff = endPrice.sub(startPrice);
  }
  if (priceDiff.eq(0) || duration.eq(0)) {
    return startPrice;
  }
  const elapsedTime = BigNumber.from(nowSeconds()).sub(startTime);
  const precision = 10000;
  const portion = elapsedTime.gt(duration) ? precision : elapsedTime.mul(precision).div(duration);
  priceDiff = priceDiff.mul(portion).div(precision);
  let currentPrice = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    currentPrice = startPrice.sub(priceDiff);
  } else {
    currentPrice = startPrice.add(priceDiff);
  }
  return currentPrice;
};

export const getCurrentSignedOrderPrice = (order: SignedOBOrder): BigNumber => {
  const startPrice = BigNumber.from(order.constraints[1]);
  const endPrice = BigNumber.from(order.constraints[2]);
  const startTime = BigNumber.from(order.constraints[3]);
  const endTime = BigNumber.from(order.constraints[4]);
  const duration = endTime.sub(startTime);
  let priceDiff = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    priceDiff = startPrice.sub(endPrice);
  } else {
    priceDiff = endPrice.sub(startPrice);
  }
  if (priceDiff.eq(0) || duration.eq(0)) {
    return startPrice;
  }
  const elapsedTime = BigNumber.from(nowSeconds()).sub(startTime);
  const precision = 10000;
  const portion = elapsedTime.gt(duration) ? 1 : elapsedTime.mul(precision).div(duration);
  priceDiff = priceDiff.mul(portion).div(precision);
  let currentPrice = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    currentPrice = startPrice.sub(priceDiff);
  } else {
    currentPrice = startPrice.add(priceDiff);
  }
  return currentPrice;
};

export const calculateSignedOrderPriceAt = (
  timestamp: BigNumber,
  order: SignedOBOrder
): BigNumber => {
  const startPrice = BigNumber.from(order.constraints[1]);
  const endPrice = BigNumber.from(order.constraints[2]);
  const startTime = BigNumber.from(order.constraints[3]);
  const endTime = BigNumber.from(order.constraints[4]);
  const duration = endTime.sub(startTime);
  let priceDiff = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    priceDiff = startPrice.sub(endPrice);
  } else {
    priceDiff = endPrice.sub(startPrice);
  }
  if (priceDiff.eq(0) || duration.eq(0)) {
    return startPrice;
  }
  const elapsedTime = BigNumber.from(timestamp).sub(startTime);

  const precision = 10000;
  const portion = elapsedTime.gt(duration) ? 1 : elapsedTime.mul(precision).div(duration);
  priceDiff = priceDiff.mul(portion).div(precision);
  let currentPrice = BigNumber.from(0);
  if (startPrice.gt(endPrice)) {
    currentPrice = startPrice.sub(priceDiff);
  } else {
    currentPrice = startPrice.add(priceDiff);
  }
  return currentPrice;
};

// Orderbook orders
export async function prepareOBOrder(
  user: User,
  chainId: BigNumberish,
  signer: JsonRpcSigner,
  order: OBOrder,
  flowExchange: Contract,
  obComplication: Contract,
  skipOnChainOwnershipCheck: boolean = false
): Promise<SignedOBOrder | undefined> {
  const validOrder = await isOrderValid(order, flowExchange, signer, skipOnChainOwnershipCheck);
  if (!validOrder) {
    console.log("Order is not valid");
    return undefined;
  }

  // grant approvals
  const approvals = await grantApprovals(order, signer, flowExchange.address);
  if (!approvals) {
    return undefined;
  }

  // sign order
  const signedOBOrder = await signOBOrder(chainId, obComplication.address, order, signer);
  return signedOBOrder;
}

export async function batchPrepareOBOrders(
  user: User,
  chainId: BigNumberish,
  signer: JsonRpcSigner,
  orders: OBOrder[],
  flowExchange: Contract,
  obComplication: Contract,
  skipOnChainOwnershipCheck: boolean = false
): Promise<SignedOBOrder[] | undefined> {
  for (const order of orders) {
    const validOrder = await isOrderValid(order, flowExchange, signer, skipOnChainOwnershipCheck);
    if (!validOrder) {
      return undefined;
    }

    // grant approvals
    const approvals = await grantApprovals(order, signer, flowExchange.address);
    if (!approvals) {
      return undefined;
    }
  }

  // sign orders
  const signedOBOrders = await bulkSignOBOrders(chainId, obComplication.address, orders, signer);
  return signedOBOrders;
}

export async function isOrderValid(
  order: OBOrder,
  flowExchange: Contract,
  signer: JsonRpcSigner,
  skipOnChainOwnershipCheck: boolean = false
): Promise<boolean> {
  // check timestamps
  const startTime = BigNumber.from(order.startTime);
  const endTime = BigNumber.from(order.endTime);
  const now = nowSeconds();
  if (now.gt(endTime)) {
    console.error("Order timestamps are not valid");
    return false;
  }

  // check if nonce is valid
  const signerAddress = await signer.getAddress();
  console.log("Checking nonce for user", signerAddress, "and nonce", order.nonce);
  const isNonceValid = await flowExchange.isNonceValid(signerAddress, order.nonce);

  if (!isNonceValid) {
    console.error("Order nonce is not valid");
    return false;
  }

  // check on chain ownership
  if (order.isSellOrder && !skipOnChainOwnershipCheck) {
    const isCurrentOwner = await checkOnChainOwnership(order, signer);
    if (!isCurrentOwner) {
      console.log("User is not the current owner of the nft");
      return false;
    }
  }

  // default
  return true;
}

export async function grantApprovals(
  order: OBOrder,
  signer: JsonRpcSigner,
  exchange: string
): Promise<boolean> {
  try {
    if (!order.isSellOrder) {
      // approve currencies
      const currentPrice = getCurrentOrderPrice(order);
      await approveERC20(order.execParams.currencyAddress, currentPrice, signer, exchange);
    } else {
      // approve collections
      await approveERC721(order.nfts, signer, exchange);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function approveERC20(
  currencyAddress: string,
  price: BigNumberish,
  signer: JsonRpcSigner,
  grantee: string
) {
  try {
    const signerAddress = await signer.getAddress();
    if (currencyAddress !== ZERO_ADDRESS) {
      const contract = new Contract(currencyAddress, erc20Abi, signer);
      const allowance = BigNumber.from(await contract.allowance(signerAddress, grantee));
      if (allowance.lt(price)) {
        const txHash = await contract.connect(signer).approve(grantee, constants.MaxUint256);
        await txHash.wait();
      } else {
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("Failed granting erc20 approvals");
    throw new Error(e);
  }
}

export async function approveERC721(items: OrderItem[], signer: JsonRpcSigner, exchange: string) {
  try {
    const signerAddress = await signer.getAddress();
    for (const item of items) {
      const collection = item.collection;
      const contract = new Contract(collection, erc721Abi, signer);
      const isApprovedForAll = await contract.isApprovedForAll(signerAddress, exchange);
      if (!isApprovedForAll) {
        const txHash = await contract.connect(signer).setApprovalForAll(exchange, true);
        await txHash.wait();
      } else {
        console.log("ERC721 already approved");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("Failed granting erc721 approvals");
    throw new Error(e);
  }
}

export async function checkOnChainOwnership(
  order: OBOrder,
  signer: JsonRpcSigner
): Promise<boolean> {
  let result = true;
  const signerAddress = await signer.getAddress();
  for (const nft of order.nfts) {
    const collection = nft.collection;
    const contract = new Contract(collection, erc721Abi, signer);
    for (const token of nft.tokens) {
      result = result && (await checkERC721Ownership(signerAddress, contract, token.tokenId));
      if (!result) {
        console.log("Failed on chain ownership check");
        break;
      }
    }
  }
  return result;
}

export async function checkERC721Ownership(
  user: string,
  contract: Contract,
  tokenId: BigNumberish
): Promise<boolean> {
  try {
    console.log("Checking on chain ownership");
    const owner = trimLowerCase(await contract.ownerOf(tokenId));
    if (owner !== trimLowerCase(user)) {
      console.error(`User ${user} is not the owner of the nft`, tokenId, "Owner is ", owner);
      return false;
    }
  } catch (e) {
    console.error("Failed on chain ownership check; is collection ERC721 ?", e);
    return false;
  }
  return true;
}

export async function signFormattedOrder(
  chainId: BigNumberish,
  contractAddress: string,
  order: SignedOBOrder,
  signer: JsonRpcSigner
): Promise<string> {
  const domain = {
    name: "FlowComplication",
    version: "1",
    chainId: chainId,
    verifyingContract: contractAddress
  };

  // remove sig
  const orderToSign = {
    isSellOrder: order.isSellOrder,
    signer: order.signer,
    constraints: order.constraints,
    nfts: order.nfts,
    execParams: order.execParams,
    extraParams: order.extraParams
  };

  // sign order
  try {
    const sig = await signer._signTypedData(domain, ORDER_EIP712_TYPES, orderToSign);
    return sig;
  } catch (e) {
    console.error("Error signing order", e);
  }

  return "";
}

async function signOBOrder(
  chainId: BigNumberish,
  verifyingContractAddress: string,
  order: OBOrder,
  signer: JsonRpcSigner
): Promise<SignedOBOrder | undefined> {
  const domain = {
    name: "FlowComplication",
    version: "1",
    chainId: chainId,
    verifyingContract: verifyingContractAddress
  };

  const constraints = [
    order.numItems,
    order.startPrice,
    order.endPrice,
    order.startTime,
    order.endTime,
    order.nonce,
    100e9
  ];
  if (order.isTrustedExec) {
    constraints.push(1);
  } else {
    constraints.push(0);
  }

  const execParams = [order.execParams.complicationAddress, order.execParams.currencyAddress];
  const extraParams = defaultAbiCoder.encode(
    ["address"],
    [order.extraParams.buyer ?? ZERO_ADDRESS]
  );

  const orderToSign = {
    isSellOrder: order.isSellOrder,
    signer: order.signerAddress,
    constraints,
    nfts: order.nfts,
    execParams,
    extraParams
  };

  // sign order
  try {
    const sig = await signer._signTypedData(domain, ORDER_EIP712_TYPES, orderToSign);
    const signedOrder: SignedOBOrder = { ...orderToSign, sig };
    return signedOrder;
  } catch (e) {
    console.error("Error signing order", e);
  }
}

async function bulkSignOBOrders(
  chainId: BigNumberish,
  verifyingContractAddress: string,
  obOrders: OBOrder[],
  signer: TypedDataSigner
) {
  const signedObOrders: SignedOBOrder[] = obOrders.map((order) => {
    const constraints = [
      order.numItems,
      order.startPrice,
      order.endPrice,
      order.startTime,
      order.endTime,
      order.nonce,
      100e9
    ];
    if (order.isTrustedExec) {
      constraints.push(1);
    }
    const execParams = [order.execParams.complicationAddress, order.execParams.currencyAddress];
    const extraParams = defaultAbiCoder.encode(
      ["address"],
      [order.extraParams.buyer ?? ZERO_ADDRESS]
    );

    const signedObOrder = {
      isSellOrder: order.isSellOrder,
      signer: order.signerAddress,
      constraints,
      nfts: order.nfts,
      execParams,
      extraParams,
      sig: ""
    };
    return signedObOrder;
  });

  const { signatureData, proofs } = getBulkSignatureDataWithProofs(
    chainId,
    verifyingContractAddress,
    signedObOrders
  );

  const signature = await signer._signTypedData(
    signatureData.domain,
    signatureData.types,
    signatureData.value
  );

  signedObOrders.forEach((order, i) => {
    order.sig = hexConcat([
      signature,
      `0x${i.toString(16).padStart(6, "0")}`,
      defaultAbiCoder.encode([`uint256[${proofs[i].length}]`], [proofs[i]])
    ]);
  });

  return signedObOrders;
}

function getBulkSignatureDataWithProofs(
  chainId: BigNumberish,
  verifyingContractAddress: string,
  orders: SignedOBOrder[]
) {
  const domain = {
    name: "FlowComplication",
    version: "1",
    chainId: chainId,
    verifyingContract: verifyingContractAddress
  };

  const height = Math.max(Math.ceil(Math.log2(orders.length)), 1);
  const size = Math.pow(2, height);

  const types = { ...ORDER_EIP712_TYPES };
  (types as any).BulkOrder = [{ name: "tree", type: `Order${`[2]`.repeat(height)}` }];
  const encoder = _TypedDataEncoder.from(types);

  const hashElement = (element: Omit<SignedOBOrder, "sig">) => encoder.hashStruct("Order", element);

  const elements: Omit<SignedOBOrder, "sig">[] = orders.map((o) => {
    const { sig, ...order } = o;
    return order;
  });
  const leaves = elements.map((e) => hashElement(e));

  const defaultElement: Omit<SignedOBOrder, "sig"> = {
    isSellOrder: false,
    signer: ZERO_ADDRESS,
    constraints: [],
    nfts: [],
    execParams: [],
    extraParams: ZERO_HASH
  };
  const defaultLeaf = hashElement(defaultElement);

  // Ensure the tree is complete
  while (elements.length < size) {
    elements.push(defaultElement);
    leaves.push(defaultLeaf);
  }

  const hexToBuffer = (value: string) => Buffer.from(value.slice(2), "hex");
  const bufferKeccak = (value: string) => hexToBuffer(keccak256(value));

  const tree = new MerkleTree(leaves.map(hexToBuffer), bufferKeccak, {
    complete: true,
    sort: false,
    hashLeaves: false,
    fillDefaultHash: hexToBuffer(defaultLeaf)
  });

  let chunks: any[] = [...elements];
  while (chunks.length > 2) {
    const newSize = Math.ceil(chunks.length / 2);
    chunks = Array(newSize)
      .fill(0)
      .map((_, i) => chunks.slice(i * 2, (i + 1) * 2));
  }

  return {
    signatureData: {
      signatureKind: "eip712",
      domain,
      types: types,
      value: { tree: chunks }
    },
    proofs: orders.map((_, i) => tree.getHexProof(leaves[i], i))
  };
}

export async function checkSignature(
  chainId: BigNumberish,
  verifyingContractAddress: string,
  order: SignedOBOrder
) {
  const domain = {
    name: "FlowComplication",
    version: "1",
    chainId: chainId,
    verifyingContract: verifyingContractAddress
  };

  const { sig, ...orderSansSig } = order;
  try {
    // Remove the `0x` prefix and count bytes not characters
    const actualSignatureLength = (sig.length - 2) / 2;

    // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L126-L133
    const isBulkSignature =
      actualSignatureLength < 837 &&
      actualSignatureLength > 98 &&
      (actualSignatureLength - 67) % 32 < 2;
    if (isBulkSignature) {
      // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L146-L220
      const proofAndSignature = order.sig as String;

      const signatureLength = proofAndSignature.length % 2 === 0 ? 130 : 128;
      const signature = proofAndSignature.slice(0, signatureLength + 2);

      const key = bn(
        "0x" + proofAndSignature.slice(2 + signatureLength, 2 + signatureLength + 6)
      ).toNumber();

      const height = Math.floor((proofAndSignature.length - 2 - signatureLength) / 64);

      const proofElements: string[] = [];
      for (let i = 0; i < height; i++) {
        const start = 2 + signatureLength + 6 + i * 64;
        proofElements.push("0x" + proofAndSignature.slice(start, start + 64).padEnd(64, "0"));
      }

      let root = _TypedDataEncoder.hashStruct("Order", ORDER_EIP712_TYPES, orderSansSig);
      for (let i = 0; i < proofElements.length; i++) {
        if ((key >> i) % 2 === 0) {
          root = solidityKeccak256(["bytes"], [root + proofElements[i].slice(2)]);
        } else {
          root = solidityKeccak256(["bytes"], [proofElements[i] + root.slice(2)]);
        }
      }

      const types = { ...ORDER_EIP712_TYPES };
      (types as any).BulkOrder = [{ name: "tree", type: `Order${`[2]`.repeat(height)}` }];
      const encoder = _TypedDataEncoder.from(types);

      const bulkOrderTypeHash = solidityKeccak256(["string"], [encoder.encodeType("BulkOrder")]);
      const bulkOrderHash = solidityKeccak256(["bytes"], [bulkOrderTypeHash + root.slice(2)]);

      const value = solidityKeccak256(
        ["bytes"],
        ["0x1901" + _TypedDataEncoder.hashDomain(domain).slice(2) + bulkOrderHash.slice(2)]
      );

      const signer = recoverAddress(value, signature);
      if (lc(order.signer) !== lc(signer)) {
        throw new Error("Invalid Bulk Signature");
      }
    } else {
      const signer = verifyTypedData(domain, ORDER_EIP712_TYPES, orderSansSig, sig);
      if (lc(order.signer) !== lc(signer)) {
        throw new Error("Invalid Non Bulk Signature");
      }
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
}

// export function checkNonBulkSig(digest: BytesLike, signer: string, sig: BytesLike): boolean {
//   const decodedSig = defaultAbiCoder.decode(["bytes32", "bytes32", "uint8"], sig);
//   const sigObject = {
//     r: decodedSig[0],
//     s: decodedSig[1],
//     v: decodedSig[2]
//   };
//   const recoveredAddress = recoverAddress(digest, sigObject);
//   return lc(recoveredAddress) === lc(signer);
// }

// async function bulkSignOBOrders(
//   chainId: BigNumberish,
//   verifyingContractAddress: string,
//   obOrders: OBOrder[],
//   signer: JsonRpcSigner
// ): Promise<SignedOBOrder[] | undefined> {
//   const domain = {
//     name: "FlowComplication",
//     version: "1",
//     chainId: chainId,
//     verifyingContract: verifyingContractAddress
//   };

//   const signedObOrders: SignedOBOrder[] = obOrders.map((order) => {
//     const constraints = [
//       order.numItems,
//       order.startPrice,
//       order.endPrice,
//       order.startTime,
//       order.endTime,
//       order.nonce,
//       100e9
//     ];
//     if (order.isTrustedExec) {
//       constraints.push(1);
//     }
//     const execParams = [order.execParams.complicationAddress, order.execParams.currencyAddress];
//     const extraParams = defaultAbiCoder.encode(
//       ["address"],
//       [order.extraParams.buyer ?? ZERO_ADDRESS]
//     );

//     const signedObOrder = {
//       isSellOrder: order.isSellOrder,
//       signer: order.signerAddress,
//       constraints,
//       nfts: order.nfts,
//       execParams,
//       extraParams,
//       sig: ""
//     };
//     return signedObOrder;
//   });

//   const { tree, root } = await getOrderTreeRoot(signedObOrders);
//   const sig = await signer._signTypedData(domain, ORDER_ROOT_EIP712_TYPES, { root });
//   const splitSig = splitSignature(sig ?? "");

//   // sign each order
//   for (let index = 0; index < signedObOrders.length; index++) {
//     const order = signedObOrders[index];
//     const hash = orderHash(order);
//     const merkleProof = tree.getHexProof(hash);
//     order.sig = defaultAbiCoder.encode(
//       ["bytes32", "bytes32", "uint8", "bytes32[]"],
//       [splitSig.r, splitSig.s, splitSig.v, merkleProof]
//     );
//   }

//   return signedObOrders;
// }

// export async function getOrderTreeRoot(orders: SignedOBOrder[]) {
//   const leaves = await Promise.all(
//     orders.map(async (order) => {
//       return orderHash(order);
//     })
//   );
//   const tree = new MerkleTree(leaves, keccak256, { sort: true });
//   const root = tree.getHexRoot();
//   return { tree, root };
// }

// export function orderHash(order: SignedOBOrder): string {
//   const fnSign =
//     "Order(bool isSellOrder,address signer,uint256[] constraints,OrderItem[] nfts,address[] execParams,bytes extraParams)OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
//   const orderTypeHash = solidityKeccak256(["string"], [fnSign]);

//   const constraints = order.constraints;
//   const execParams = order.execParams;
//   const extraParams = order.extraParams;

//   const typesArr = [];
//   for (let i = 0; i < constraints.length; i++) {
//     typesArr.push("uint256");
//   }
//   const constraintsHash = keccak256(defaultAbiCoder.encode(typesArr, constraints));

//   const orderItemsHash = nftsHash(order.nfts);
//   const execParamsHash = keccak256(defaultAbiCoder.encode(["address", "address"], execParams));

//   const calcEncode = defaultAbiCoder.encode(
//     ["bytes32", "bool", "address", "bytes32", "bytes32", "bytes32", "bytes32"],
//     [
//       orderTypeHash,
//       order.isSellOrder,
//       order.signer,
//       constraintsHash,
//       orderItemsHash,
//       execParamsHash,
//       keccak256(extraParams)
//     ]
//   );

//   return keccak256(calcEncode);
// }

// export function nftsHash(nfts: OrderItem[]): string {
//   const fnSign =
//     "OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
//   const typeHash = solidityKeccak256(["string"], [fnSign]);

//   const hashes: string[] = [];
//   for (const nft of nfts) {
//     const hash = keccak256(
//       defaultAbiCoder.encode(
//         ["bytes32", "uint256", "bytes32"],
//         [typeHash, nft.collection, tokensHash(nft.tokens)]
//       )
//     );
//     hashes.push(hash);
//   }
//   const encodeTypeArray = hashes.map(() => "bytes32");
//   const nftsHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));

//   return nftsHash;
// }

// export function tokensHash(tokens: OrderItem["tokens"]): string {
//   const fnSign = "TokenInfo(uint256 tokenId,uint256 numTokens)";
//   const typeHash = solidityKeccak256(["string"], [fnSign]);

//   const hashes: string[] = [];
//   for (const token of tokens) {
//     const hash = keccak256(
//       defaultAbiCoder.encode(
//         ["bytes32", "uint256", "uint256"],
//         [typeHash, token.tokenId, token.numTokens]
//       )
//     );
//     hashes.push(hash);
//   }
//   const encodeTypeArray = hashes.map(() => "bytes32");
//   const tokensHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));
//   return tokensHash;
// }

// export function getDigest(
//   chainId: BigNumberish,
//   verifyingContractAddress: BytesLike | string,
//   orderHash: string | BytesLike
// ): string {
//   const domainSeparator = getDomainSeparator(chainId, verifyingContractAddress);
//   return solidityKeccak256(
//     ["string", "bytes32", "bytes32"],
//     ["\x19\x01", domainSeparator, orderHash]
//   );
// }

// export function getDomainSeparator(
//   chainId: BigNumberish,
//   verifyingContractAddress: BytesLike
// ): string {
//   const domainSeparator = keccak256(
//     defaultAbiCoder.encode(
//       ["bytes32", "bytes32", "bytes32", "uint256", "address"],
//       [
//         solidityKeccak256(
//           ["string"],
//           ["EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"]
//         ),
//         solidityKeccak256(["string"], ["FlowComplication"]),
//         solidityKeccak256(["string"], ["1"]), // for versionId = 1
//         chainId,
//         verifyingContractAddress
//       ]
//     )
//   );
//   return domainSeparator;
// }
