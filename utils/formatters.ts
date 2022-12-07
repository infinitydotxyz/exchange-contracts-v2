import { BigNumber } from "ethers";

export const nowSeconds = (): BigNumber => {
  return BigNumber.from(Math.floor(Date.now() / 1000));
};

export function trimLowerCase(str?: string) {
  return (str || "").trim().toLowerCase();
}
