// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

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
        /**
         * @notice the maker 1 orders
         */
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
