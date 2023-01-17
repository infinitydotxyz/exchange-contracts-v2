import { BigNumberish, BytesLike } from "ethers";

// types
export type User = {
  address: string;
};

export interface TokenInfo {
  tokenId: BigNumberish;
  numTokens: BigNumberish;
}

export interface OrderItem {
  collection: string;
  tokens: TokenInfo[];
}

export interface ExecParams {
  complicationAddress: string;
  currencyAddress: string;
}

export interface ExtraParams {
  buyer?: string;
}

export interface OBOrder {
  id: string;
  chainId: BigNumberish;
  isSellOrder: boolean;
  signerAddress: string;
  numItems: BigNumberish;
  startPrice: BigNumberish;
  endPrice: BigNumberish;
  startTime: BigNumberish;
  endTime: BigNumberish;
  nonce: BigNumberish;
  nfts: OrderItem[];
  execParams: ExecParams;
  extraParams: ExtraParams;
  isTrustedExec?: boolean;
}

export interface SignedOBOrder {
  isSellOrder: boolean;
  signer: string;
  constraints: BigNumberish[];
  nfts: OrderItem[];
  execParams: string[];
  extraParams: BytesLike;
  sig: BytesLike;
}

export const ORDER_ROOT_EIP712_TYPES = {
  Root: [{ name: "root", type: "bytes32" }]
};

export const ORDER_EIP712_TYPES = {
  Order: [
    { name: "isSellOrder", type: "bool" },
    { name: "signer", type: "address" },
    { name: "constraints", type: "uint256[]" },
    { name: "nfts", type: "OrderItem[]" },
    { name: "execParams", type: "address[]" },
    { name: "extraParams", type: "bytes" }
  ],
  OrderItem: [
    { name: "collection", type: "address" },
    { name: "tokens", type: "TokenInfo[]" }
  ],
  TokenInfo: [
    { name: "tokenId", type: "uint256" },
    { name: "numTokens", type: "uint256" }
  ]
};
