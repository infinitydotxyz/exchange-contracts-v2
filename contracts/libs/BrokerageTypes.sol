// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { OrderTypes } from "./OrderTypes.sol";

/**
 * @title BrokerTypes
 * @author Joe
 * @notice This library contains the broker types used by the TokenBroker
 */
library BrokerageTypes {
    struct Call {
        bytes data;
        uint256 value;
        address payable to;
        bool isPayable;
    }

    struct Loans {
        IERC20[] tokens;
        uint256[] amounts;
    }

    struct ExternalFulfillments {
        Call[] calls;
        OrderTypes.OrderItem[] nftsToTransfer;
    }

    enum MatchOrdersType {
        OneToOneSpecific,
        OneToOneUnspecific,
        OneToMany
    }

    struct MatchOrders {
        OrderTypes.MakerOrder[] buys;
        OrderTypes.MakerOrder[] sells;
        OrderTypes.OrderItem[][] constructs;
        MatchOrdersType matchType;
    }

    struct BrokerageBatch {
        ExternalFulfillments externalFulfillments;
        MatchOrders[] matches;
    }
}
