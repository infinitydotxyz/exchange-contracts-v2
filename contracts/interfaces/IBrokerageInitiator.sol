// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFlashLoanRecipient } from "./IFlashLoanRecipient.sol";
import { BrokerageTypes } from "../libs/BrokerageTypes.sol";

/**
 * @title IBrokerageInitiator
 * @author Joe
 * @notice The interface that must be implemented by the contract that initiates the
 * brokerage process on a ITokenBroker contract
 */
interface IBrokerageInitiator {
    /**
     * @notice Function that initiates the brokerage process
     *
     * @param batches The steps to be executed in the brokerage process
     * @param loan The loan required to be taken out by the TokenBroker
     * in order to complete the batches
     */
    function initiateBrokerage(
        BrokerageTypes.BrokerageBatch[] calldata batches,
        BrokerageTypes.Loans calldata loan
    ) external;

    /**
     * @notice Function that returns control to the IBrokerageInitiator
     * contract after the brokerage process has beeen initiated
     * (i.e.loans have been taken out)
     *
     * @param startGas the start gas of the transaction
     * @param batches The steps to be executed in the brokerage process
     */
    function receiveBrokerage(
        uint256 startGas,
        BrokerageTypes.BrokerageBatch[] calldata batches
    ) external;
}
