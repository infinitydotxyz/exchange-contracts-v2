// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IFlashLoanRecipient} from './IFlashLoanRecipient.sol';

interface IBalancerVault {
  function flashLoan(
    IFlashLoanRecipient recipient,
    IERC20[] memory tokens,
    uint256[] memory amounts,
    bytes memory userData
  ) external;
}
