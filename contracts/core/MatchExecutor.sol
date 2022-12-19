// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IERC165 } from "@openzeppelin/contracts/interfaces/IERC165.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { IFlashLoanRecipient } from "../interfaces/IFlashLoanRecipient.sol";
import { IBalancerVault } from "../interfaces/IBalancerVault.sol";
import { MatchExecutorTypes } from "../libs/MatchExecutorTypes.sol";
import { OrderTypes } from "../libs/OrderTypes.sol";
import { IInfinityExchange } from "../interfaces/IInfinityExchange.sol";

/**
@title MatchExecutor
@author Joe
@notice The contract that is called to execute order matches
*/
contract MatchExecutor is
    IFlashLoanRecipient,
    IERC721Receiver,
    Ownable,
    Pausable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    /*//////////////////////////////////////////////////////////////
                                ADDRESSES
      //////////////////////////////////////////////////////////////*/

    /// @notice The address of the EOA that acts as an intermediary in the brokerage process
    address public intermediary;

    IInfinityExchange public immutable exchange;

    IBalancerVault public immutable balancerVault;

    /*//////////////////////////////////////////////////////////////
                              EXCHANGE STATES
      //////////////////////////////////////////////////////////////*/

    /// @notice Mapping to keep track of which exchanges are enabled
    EnumerableSet.AddressSet private _enabledExchanges;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
      //////////////////////////////////////////////////////////////*/
    event IntermediaryUpdated(address indexed intermediary);
    event EnabledExchangeAdded(address indexed exchange);
    event EnabledExchangeRemoved(address indexed exchange);

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(
        address _intermediary,
        IBalancerVault _balancerVault,
        IInfinityExchange _exchange
    ) {
        _updateIntermediary(_intermediary);
        balancerVault = _balancerVault;
        exchange = _exchange;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @notice Enable an exchange
     * @param _exchange The exchange to enable
     */
    function addEnabledExchange(address _exchange) external onlyOwner {
        _enabledExchanges.add(_exchange);
        emit EnabledExchangeAdded(_exchange);
    }

    /**
     * @notice Disable an exchange
     * @param _exchange The exchange to disable
     */
    function removeEnabledExchange(address _exchange) external onlyOwner {
        _enabledExchanges.remove(_exchange);
        emit EnabledExchangeRemoved(_exchange);
    }

    /**
     * @notice Update the intermediary to a different EOA
     * @param _intermediary The new intermediary to use
     */
    function updateIntermediary(address _intermediary) external onlyOwner {
        _updateIntermediary(_intermediary);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice The entry point for executing matches
     * @param batches The batches of calls to make
     * @param loans The loans to take out
     */
    function executeMatches(
        MatchExecutorTypes.Batch[] calldata batches,
        MatchExecutorTypes.Loans calldata loans
    ) external onlyOwner whenNotPaused {
        require(loans.tokens.length == loans.amounts.length, "length mismatch");

        if (loans.tokens.length > 0) {
            /**
             * take out a flash loan
             *
             * executing matches is called within the receiveFlashLoan callback
             */
            balancerVault.flashLoan(
                this,
                loans.tokens,
                loans.amounts,
                abi.encode(batches)
            );
        } else {
            /**
             * flash loan is not required, proceed to execute matches
             */
            _executeMatchesCalldata(batches);
        }
    }

    /**
     * @notice Function called by the vault after a flash loan has been taken out
     * @param tokens The tokens that were borrowed
     * @param amounts The amounts of each token that were borrowed
     * @param feeAmounts The fees that need to be paid back for each token
     * @param data The abi encoded data that was passed to the vault
     */
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata data
    ) external override whenNotPaused {
        require(msg.sender == address(balancerVault), "only vault can call");
        MatchExecutorTypes.Batch[] memory batches = abi.decode(
            data,
            (MatchExecutorTypes.Batch[])
        );
        /**
         * execute the matches
         */
        _executeMatches(batches);

        /**
         * payback the loan
         */
        for (uint256 i = 0; i < tokens.length; ++i) {
            IERC20 token = tokens[i];
            uint256 amount = amounts[i];
            uint256 feeAmount = feeAmounts[i];
            token.transfer(address(balancerVault), amount + feeAmount);
        }
    }

    function _executeMatches(
        MatchExecutorTypes.Batch[] memory batches
    ) internal {
        uint256 numBatches = batches.length;
        for (uint256 i; i < numBatches; ) {
            _broker(batches[i].externalFulfillments);
            _matchOrders(batches[i].matches);

            unchecked {
                ++i;
            }
        }
    }

    function _executeMatchesCalldata(
        MatchExecutorTypes.Batch[] calldata batches
    ) internal {
        uint256 numBatches = batches.length;
        for (uint256 i; i < numBatches; ) {
            _brokerCalldata(batches[i].externalFulfillments);
            _matchOrdersCalldata(batches[i].matches);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Function called to execute a batch of matches by calling the exchange contract
     * @param matches The batch of matches to execute on the exchange
     */
    function _matchOrders(
        MatchExecutorTypes.MatchOrders[] memory matches
    ) internal {
        uint256 numMatches = matches.length;
        if (numMatches > 0) {
            for (uint256 i; i < numMatches; ) {
                MatchExecutorTypes.MatchOrdersType matchType = matches[i]
                    .matchType;
                if (
                    matchType ==
                    MatchExecutorTypes.MatchOrdersType.OneToOneSpecific
                ) {
                    exchange.matchOneToOneOrders(
                        matches[i].buys,
                        matches[i].sells
                    );
                } else if (
                    matchType ==
                    MatchExecutorTypes.MatchOrdersType.OneToOneUnspecific
                ) {
                    exchange.matchOrders(
                        matches[i].buys,
                        matches[i].sells,
                        matches[i].constructs
                    );
                } else if (
                    matchType == MatchExecutorTypes.MatchOrdersType.OneToMany
                ) {
                    if (matches[i].buys.length == 1) {
                        exchange.matchOneToManyOrders(
                            matches[i].buys[0],
                            matches[i].sells
                        );
                    } else if (matches[i].sells.length == 1) {
                        exchange.matchOneToManyOrders(
                            matches[i].sells[0],
                            matches[i].buys
                        );
                    } else {
                        revert("invalid one to many order");
                    }
                } else {
                    revert("invalid match type");
                }
                unchecked {
                    ++i;
                }
            }
        }
    }

    /**
     * @notice Function called to execute a batch of matches by calling the exchange contract
     * @param matches The batch of matches to execute on the exchange
     */
    function _matchOrdersCalldata(
        MatchExecutorTypes.MatchOrders[] calldata matches
    ) internal {
        uint256 numMatches = matches.length;
        if (numMatches > 0) {
            for (uint256 i; i < numMatches; ) {
                MatchExecutorTypes.MatchOrdersType matchType = matches[i]
                    .matchType;
                if (
                    matchType ==
                    MatchExecutorTypes.MatchOrdersType.OneToOneSpecific
                ) {
                    exchange.matchOneToOneOrders(
                        matches[i].buys,
                        matches[i].sells
                    );
                } else if (
                    matchType ==
                    MatchExecutorTypes.MatchOrdersType.OneToOneUnspecific
                ) {
                    exchange.matchOrders(
                        matches[i].buys,
                        matches[i].sells,
                        matches[i].constructs
                    );
                } else if (
                    matchType == MatchExecutorTypes.MatchOrdersType.OneToMany
                ) {
                    if (matches[i].buys.length == 1) {
                        exchange.matchOneToManyOrders(
                            matches[i].buys[0],
                            matches[i].sells
                        );
                    } else if (matches[i].sells.length == 1) {
                        exchange.matchOneToManyOrders(
                            matches[i].sells[0],
                            matches[i].buys
                        );
                    } else {
                        revert("invalid one to many order");
                    }
                } else {
                    revert("invalid match type");
                }
                unchecked {
                    ++i;
                }
            }
        }
    }

    /**
     * @notice broker a trade by fulfilling orders on other exchanges and transferring nfts to the intermediary
     * @param externalFulfillments The specification of the external calls to make and nfts to transfer
     */
    function _broker(
        MatchExecutorTypes.ExternalFulfillments memory externalFulfillments
    ) internal {
        uint256 numCalls = externalFulfillments.calls.length;
        if (numCalls > 0) {
            for (uint256 i; i < numCalls; ) {
                _call(externalFulfillments.calls[i]);
                unchecked {
                    ++i;
                }
            }
        }

        if (externalFulfillments.nftsToTransfer.length > 0) {
            /// Transfer the nfts to the intermediary
            _transferMultipleNFTs(
                address(this),
                intermediary,
                externalFulfillments.nftsToTransfer
            );
        }
    }

    /**
     * @notice broker a trade by fulfilling orders on other exchanges and transferring nfts to the intermediary
     * @param externalFulfillments The specification of the external calls to make and nfts to transfer
     */
    function _brokerCalldata(
        MatchExecutorTypes.ExternalFulfillments calldata externalFulfillments
    ) internal {
        uint256 numCalls = externalFulfillments.calls.length;
        if (numCalls > 0) {
            for (uint256 i; i < numCalls; ) {
                _call(externalFulfillments.calls[i]);
                unchecked {
                    ++i;
                }
            }
        }

        if (externalFulfillments.nftsToTransfer.length > 0) {
            /// Transfer the nfts to the intermediary
            _transferMultipleNFTs(
                address(this),
                intermediary,
                externalFulfillments.nftsToTransfer
            );
        }
    }

    receive() external payable {
        // this built-in function doesn't require any calldata,
        // it will get called if the data field is empty and
        // the value field is not empty.
        // this allows the smart contract to receive ether just like a
        // regular user account controlled by a private key would.
    }

    /**
     * @notice Execute a call to the specified contract
     * @param params The call to execute
     */
    function _call(
        MatchExecutorTypes.Call memory params
    ) internal returns (bytes memory) {
        if (params.isPayable) {
            require(
                _enabledExchanges.contains(params.to),
                "contract is not payable"
            );
            (bool _success, bytes memory _result) = params.to.call{
                value: params.value
            }(params.data);
            require(_success, "external MP call failed");
            return _result;
        } else {
            require(params.value == 0, "value not 0 in non-payable call");
            (bool _success, bytes memory _result) = params.to.call(params.data);
            require(_success, "external MP call failed");
            return _result;
        }
    }

    function _updateIntermediary(address _intermediary) internal {
        require(_intermediary != address(0), "intermdiary cannot be 0");
        intermediary = _intermediary;
        emit IntermediaryUpdated(_intermediary);
    }

    /**
     * @notice Transfers multiple NFTs
     * @param from the from address
     * @param to the to address
     * @param nfts nfts to transfer
     */
    function _transferMultipleNFTs(
        address from,
        address to,
        OrderTypes.OrderItem[] memory nfts
    ) internal {
        for (uint256 i; i < nfts.length; ) {
            _transferNFTs(from, to, nfts[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Transfer NFTs
     * @dev Only supports ERC721, no ERC1155 or NFTs that conform to both ERC721 and ERC1155
     * @param from address of the sender
     * @param to address of the recipient
     * @param item item to transfer
     */
    function _transferNFTs(
        address from,
        address to,
        OrderTypes.OrderItem memory item
    ) internal {
        require(
            IERC165(item.collection).supportsInterface(0x80ac58cd) &&
                !IERC165(item.collection).supportsInterface(0xd9b67a26),
            "only erc721"
        );
        _transferERC721s(from, to, item);
    }

    /**
     * @notice Transfer ERC721s
     * @param from address of the sender
     * @param to address of the recipient
     * @param item item to transfer
     */
    function _transferERC721s(
        address from,
        address to,
        OrderTypes.OrderItem memory item
    ) internal {
        for (uint256 i; i < item.tokens.length; ) {
            IERC721(item.collection).transferFrom(
                from,
                to,
                item.tokens[i].tokenId
            );
            unchecked {
                ++i;
            }
        }
    }
}
