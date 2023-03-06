import { BigNumberish } from "ethers";
import { OrderItem, SignedOBOrder } from "../helpers/orderTypes";

export interface Call {
  data: string;
  value: BigNumberish;
  to: string;
}

export interface ExternalFulfillments {
  calls: Call[];
  nftsToTransfer: OrderItem[];
}

export enum MatchOrdersTypes {
  OneToOneSpecific,
  OneToOneUnspecific,
  OneToMany
}

export interface MatchOrders {
  buys: SignedOBOrder[];
  sells: SignedOBOrder[];
  constructs: OrderItem[][];
  matchType: MatchOrdersTypes;
}

export interface Batch {
  externalFulfillments: ExternalFulfillments;
  matches: MatchOrders[];
}
