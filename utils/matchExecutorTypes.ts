import { BigNumberish } from "ethers";
import { OrderItem, SignedOBOrder } from "../helpers/orders";

export interface Call {
  data: string;
  value: BigNumberish;
  to: string;
  isPayable: boolean;
}

export interface Loans {
  tokens: string[];
  amounts: BigNumberish[];
}

export interface ExternalFulfillments {
  calls: Call[];
  nftsToTransfer: OrderItem[];
}

export enum MatchOrdersTypes {
  OneToOneSpecific,
  OneToOneUnspecific,
  OneToMany,
}

export interface MatchOrders {
  buys: SignedOBOrder[];
  sells: SignedOBOrder[];
  constructs: OrderItem[][];
  matchType: MatchOrdersTypes;
}

export interface BrokerageBatch {
  externalFulfillments: ExternalFulfillments;
  matches: MatchOrders[];
}
