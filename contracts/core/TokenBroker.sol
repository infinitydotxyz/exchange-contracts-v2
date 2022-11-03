// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IERC165 } from "@openzeppelin/contracts/interfaces/IERC165.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import { IFlashLoanRecipient } from "../interfaces/IFlashLoanRecipient.sol";
import { IBalancerVault } from "../interfaces/IBalancerVault.sol";
import { ITokenBroker } from "../interfaces/ITokenBroker.sol";
import { BrokerageTypes } from "../libs/BrokerageTypes.sol";
import { OrderTypes } from "../libs/OrderTypes.sol";

/**
@title TokenBroker
@author Joe
@notice The contract that brokers trades among other exchanges
*/
contract TokenBroker is
    IFlashLoanRecipient,
    ITokenBroker,
    IERC721Receiver,
    Ownable,
    Pausable
{
    /*//////////////////////////////////////////////////////////////
                                ADDRESSES
      //////////////////////////////////////////////////////////////*/

    /// @notice The address of the EOA that acts as an intermediary in the brokerage process
    address private intermediary;

    /// @notice The initiator that is allowed to start the brokerage process
    address private initiator;

    IBalancerVault public immutable vault;

    /*//////////////////////////////////////////////////////////////
                              EXCHANGE STATES
      //////////////////////////////////////////////////////////////*/

    /// @notice Mapping to keep track of which exchanges are enabled
    mapping(address => bool) public payableContracts;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
      //////////////////////////////////////////////////////////////*/
    event IntermediaryUpdated(address indexed intermediary);
    event PayableContractUpdated(
        address indexed exchange,
        bool indexed isPayable
    );
    event InitiatorUpdated(address indexed initiator);

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    constructor(
        address _intermediary,
        address _initiator,
        IBalancerVault _vault
    ) {
        _updateIntermediary(_intermediary);
        _updateInitiator(_initiator);
        vault = _vault;
    }

    /**
     * @notice Set the specified contract to allow payable calls
     * @param _payableContract The address to allow or disallow
     * @param _isPayable The state to update the address to
     */
    function updatePayableContract(
        address _payableContract,
        bool _isPayable
    ) external onlyOwner {
        require(
            payableContracts[_payableContract] != _isPayable,
            "update must be meaningful"
        );
        payableContracts[_payableContract] = _isPayable;
        emit PayableContractUpdated(_payableContract, _isPayable);
    }

    /**
     * @notice Update the address that is allowed to initiate the brokerage process
     * @param _initiator The address to use as the initiator
     */
    function updateInitiator(address _initiator) external onlyOwner {
        _updateInitiator(_initiator);
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

    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata fulfillmentBytes
    ) external {
        require(msg.sender == address(vault), "only vault can call");
        _broker(fulfillmentBytes);

        /**
         * payback the loan
         */
        for (uint256 i = 0; i < tokens.length; ++i) {
            IERC20 token = tokens[i];
            uint256 amount = amounts[i];
            uint256 feeAmount = feeAmounts[i];
            token.transfer(address(vault), amount + feeAmount);
        }
    }

    /**
     * @notice broker a trade by fulfilling orders on other exchanges
     * @param fulfillmentBytes A specification of the external fulfillments to make
     */
    function broker(
        bytes calldata fulfillmentBytes,
        BrokerageTypes.Loans calldata loans
    ) external whenNotPaused {
        require(
            msg.sender == initiator,
            "only the initiator can initiate the brokerage process"
        );

        if (loans.tokens.length > 0) {
            /**
             * take out a flash loan
             *
             * receiveFlashLoan will handle decoding bytes and calling _broker
             */
            _makeFlashLoan(loans.tokens, loans.amounts, fulfillmentBytes);
        } else {
            require(loans.amounts.length == 0, "amounts must be empty");
            _broker(fulfillmentBytes);
        }
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _makeFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory fulfillmentBytes
    ) internal {
        vault.flashLoan(this, tokens, amounts, fulfillmentBytes);
    }

    function test(BrokerageTypes.ExternalFulfillments calldata fulfillments) external {    
        bytes memory b = abi.encode(fulfillments);
        IERC20[] memory tokens = new IERC20[](1);
        uint256[] memory amounts = new uint256[](1);
        vault.flashLoan(this, tokens, amounts, b);
    }

    function _broker(bytes calldata fulfillmentBytes) internal {
        BrokerageTypes.ExternalFulfillments memory fulfillments = abi.decode(
            fulfillmentBytes,
            (BrokerageTypes.ExternalFulfillments)
        );

        uint256 numCalls = fulfillments.calls.length;
        for (uint256 i; i < numCalls; ) {
            _call(fulfillments.calls[i]);
            unchecked {
                ++i;
            }
        }

        /// Transfer the nfts to the intermediary
        _transferMultipleNFTs(
            address(this),
            intermediary,
            fulfillments.nftsToTransfer
        );
    }

    /**
     * @notice Execute a call to the specified contract
     * @param params The call to execute
     */
    function _call(
        BrokerageTypes.Call memory params
    ) internal returns (bytes memory) {
        if (params.isPayable) {
            require(payableContracts[params.to], "contract is not payable");
            (bool _success, bytes memory _result) = params.to.call{
                value: params.value
            }(params.data);
            require(_success);
            return _result;
        } else {
            require(
                params.value == 0,
                "value must be zero in a non-payable call"
            );
            (bool _success, bytes memory _result) = params.to.call(params.data);
            require(_success);
            return _result;
        }
    }

    function _updateInitiator(address _initiator) internal {
        require(_initiator != address(0), "initiator cannot be 0");
        initiator = _initiator;
        emit InitiatorUpdated(_initiator);
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
     * @dev requires approvals to be set
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
