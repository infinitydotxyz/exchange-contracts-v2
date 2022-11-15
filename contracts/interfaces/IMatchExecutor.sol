// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import {OrderTypes} from '../libs/OrderTypes.sol';
import {BrokerageTypes} from '../libs/BrokerageTypes.sol';

/**
 * @title IMatchExecutor
 * @author Joe
 * @notice Match executor interface
 */
interface IMatchExecutor {
  function broker(BrokerageTypes.ExternalFulfillments memory externalFulfillments) external;

  function makeFlashLoan(
    uint256 startGas,
    BrokerageTypes.BrokerageBatch[] calldata batches,
    BrokerageTypes.Loans calldata loans
  ) external;
}
