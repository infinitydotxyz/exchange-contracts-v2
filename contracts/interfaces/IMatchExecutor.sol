// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import {OrderTypes} from '../libs/OrderTypes.sol';
import {MatchExecutorTypes} from '../libs/MatchExecutorTypes.sol';

/**
 * @title IMatchExecutor
 * @author Joe
 * @notice Match executor interface
 */
interface IMatchExecutor {
  function broker(MatchExecutorTypes.ExternalFulfillments memory externalFulfillments) external;

  function makeFlashLoan(
    uint256 startGas,
    MatchExecutorTypes.Batch[] calldata batches,
    MatchExecutorTypes.Loans calldata loans
  ) external;
}
