import { defaultAbiCoder } from "ethers/lib/utils";
import { ExternalFulfillments } from "./brokerageTypes";

export function encodeExternalFulfillment(externalFulfillments: ExternalFulfillments) {
    const abi = [{
        "components": [
          {
            "components": [
              {
                "internalType": "bytes",
                "name": "data",
                "type": "bytes"
              },
              {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
              },
              {
                "internalType": "address payable",
                "name": "to",
                "type": "address"
              },
              {
                "internalType": "bool",
                "name": "isPayable",
                "type": "bool"
              }
            ],
            "internalType": "struct BrokerageTypes.Call[]",
            "name": "calls",
            "type": "tuple[]"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "collection",
                "type": "address"
              },
              {
                "components": [
                  {
                    "internalType": "uint256",
                    "name": "tokenId",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "numTokens",
                    "type": "uint256"
                  }
                ],
                "internalType": "struct OrderTypes.TokenInfo[]",
                "name": "tokens",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct OrderTypes.OrderItem[]",
            "name": "nftsToTransfer",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct BrokerageTypes.ExternalFulfillments",
        "name": "fulfillments",
        "type": "tuple"
      }]

    const res = defaultAbiCoder.encode(abi as any, [externalFulfillments]);

    return res;
}