// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import {OrderTypes} from "./OrderTypes.sol";

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

    struct Brokerage {
        Call[] calls;
        OrderTypes.OrderItem[] nftsToTransfer;
    }
}
