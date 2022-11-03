// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { OrderTypes } from "../libs/OrderTypes.sol";
import { BrokerageTypes } from "../libs/BrokerageTypes.sol";

/**
 * @title IBroker
 * @author Joe
 * @notice Broker interface
 */
interface ITokenBroker {
    function broker(
        bytes calldata fulfillmentBytes,
        BrokerageTypes.Loans calldata loans
    ) external;
}
