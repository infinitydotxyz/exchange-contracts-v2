// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { IBalancerVault } from "./interfaces/IBalancerVault.sol";
import { IFlashLoanRecipient } from "./interfaces/IFlashLoanRecipient.sol";

contract MockBalancerVault is IBalancerVault, ReentrancyGuard {
    event FlashLoan(
        IFlashLoanRecipient indexed recipient,
        IERC20 indexed token,
        uint256 indexed amount,
        uint256 feeAmount
    );

    receive() external payable {}

    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external override nonReentrant {
        require(
            tokens.length == amounts.length,
            "token & amount lengths not same"
        );

        uint256[] memory feeAmounts = new uint256[](tokens.length);
        uint256[] memory preLoanBalances = new uint256[](tokens.length);

        // Used to ensure `tokens` is sorted in ascending order, which ensures token uniqueness.
        address previousToken = address(0);

        for (uint256 i = 0; i < tokens.length; ++i) {
            IERC20 token = tokens[i];
            uint256 amount = amounts[i];

            require(
                address(token) > address(previousToken),
                address(token) == address(0)
                    ? "received zero token"
                    : "tokens not sorted"
            );
            previousToken = address(token);

            preLoanBalances[i] = token.balanceOf(address(this));
            feeAmounts[i] = 0;

            require(preLoanBalances[i] >= amount, "insuff bal for flash loan");
            token.transfer(address(recipient), amount);
        }

        recipient.receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        for (uint256 i = 0; i < tokens.length; ++i) {
            IERC20 token = tokens[i];
            uint256 preLoanBalance = preLoanBalances[i];

            // Checking for loan repayment first (without accounting for fees) makes for simpler debugging, and results
            // in more accurate revert reasons if the flash loan protocol fee percentage is zero.
            uint256 postLoanBalance = token.balanceOf(address(this));
            require(
                postLoanBalance >= preLoanBalance,
                "invalid post loan balance"
            );

            // No need for checked arithmetic since we know the loan was fully repaid.
            uint256 receivedFeeAmount = postLoanBalance - preLoanBalance;
            require(
                receivedFeeAmount >= feeAmounts[i],
                "insuff flash loan fee amount"
            );

            emit FlashLoan(recipient, token, amounts[i], receivedFeeAmount);
        }
    }
}
