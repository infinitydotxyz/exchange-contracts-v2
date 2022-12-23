// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.8.14;

interface IFlashLoanRecipient {
    /**
     * @dev When `flashLoan` is called on Euler, it invokes the `onFlashLoan` hook on the recipient.
     *
     * Before this call returns, the recipient must have repaid the loan
     * or else the entire flash loan will revert.
     *
     * `data` is the same value passed in the `flashLoan` call.
     */
    function onFlashLoan(bytes memory data) external;
}
