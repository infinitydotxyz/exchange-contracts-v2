import { BigNumberish } from "@ethersproject/bignumber";
import { BytesLike } from "ethers";
import { defaultAbiCoder, keccak256, recoverAddress, solidityKeccak256 } from "ethers/lib/utils";
import { OrderItem, SignedOBOrder } from "./orderTypes";
import { MerkleTree } from "merkletreejs";

export async function getOrderTreeRoot(orders: SignedOBOrder[]) {
  const leaves = await Promise.all(
    orders.map(async (order) => {
      return orderHash(order);
    })
  );
  const tree = new MerkleTree(leaves, keccak256, { sort: true });
  const root = tree.getHexRoot();
  return { tree, root };
}

export function trimLowerCase(str?: string) {
  return (str || "").trim().toLowerCase();
}

export function orderHash(order: SignedOBOrder): string {
  const fnSign =
    "Order(bool isSellOrder,address signer,uint256[] constraints,OrderItem[] nfts,address[] execParams,bytes extraParams)OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
  const orderTypeHash = solidityKeccak256(["string"], [fnSign]);

  const constraints = order.constraints;
  const execParams = order.execParams;
  const extraParams = order.extraParams;

  const constraintsHash = keccak256(
    defaultAbiCoder.encode(
      ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      constraints
    )
  );

  const orderItemsHash = nftsHash(order.nfts);
  const execParamsHash = keccak256(defaultAbiCoder.encode(["address", "address"], execParams));

  const calcEncode = defaultAbiCoder.encode(
    ["bytes32", "bool", "address", "bytes32", "bytes32", "bytes32", "bytes32"],
    [
      orderTypeHash,
      order.isSellOrder,
      order.signer,
      constraintsHash,
      orderItemsHash,
      execParamsHash,
      keccak256(extraParams)
    ]
  );

  return keccak256(calcEncode);
}

export function nftsHash(nfts: OrderItem[]): string {
  const fnSign =
    "OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
  const typeHash = solidityKeccak256(["string"], [fnSign]);

  const hashes: string[] = [];
  for (const nft of nfts) {
    const hash = keccak256(
      defaultAbiCoder.encode(
        ["bytes32", "uint256", "bytes32"],
        [typeHash, nft.collection, tokensHash(nft.tokens)]
      )
    );
    hashes.push(hash);
  }
  const encodeTypeArray = hashes.map(() => "bytes32");
  const nftsHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));

  return nftsHash;
}

export function tokensHash(tokens: OrderItem["tokens"]): string {
  const fnSign = "TokenInfo(uint256 tokenId,uint256 numTokens)";
  const typeHash = solidityKeccak256(["string"], [fnSign]);

  const hashes: string[] = [];
  for (const token of tokens) {
    const hash = keccak256(
      defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [typeHash, token.tokenId, token.numTokens]
      )
    );
    hashes.push(hash);
  }
  const encodeTypeArray = hashes.map(() => "bytes32");
  const tokensHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));
  return tokensHash;
}

export function getDigest(
  chainId: BigNumberish,
  verifyingContractAddress: BytesLike | string,
  orderHash: string | BytesLike
): string {
  const domainSeparator = getDomainSeparator(chainId, verifyingContractAddress);
  return solidityKeccak256(
    ["string", "bytes32", "bytes32"],
    ["\x19\x01", domainSeparator, orderHash]
  );
}

export function getDomainSeparator(
  chainId: BigNumberish,
  verifyingContractAddress: BytesLike
): string {
  const domainSeparator = keccak256(
    defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        solidityKeccak256(
          ["string"],
          ["EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"]
        ),
        solidityKeccak256(["string"], ["InfinityComplication"]),
        solidityKeccak256(["string"], ["1"]), // for versionId = 1
        chainId,
        verifyingContractAddress
      ]
    )
  );
  return domainSeparator;
}

export function verifySig(digest: BytesLike, signer: string, sig: BytesLike): boolean {
  const decodedSig = defaultAbiCoder.decode(["bytes32", "bytes32", "uint8"], sig);
  const sigObject = {
    r: decodedSig[0],
    s: decodedSig[1],
    v: decodedSig[2]
  };
  const recoveredAddress = recoverAddress(digest, sigObject);
  return trimLowerCase(recoveredAddress) === trimLowerCase(signer);
}
