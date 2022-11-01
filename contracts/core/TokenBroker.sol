// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import {Ownable} from '@openzeppelin/contracts/access';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';

/**
@title TokenBroker
@author Joe
@notice The contract that brokers trades among other exchanges
*/
contract TokenBroker is Ownable, Pausable {
  /*//////////////////////////////////////////////////////////////
                                ADDRESSES
      //////////////////////////////////////////////////////////////*/

  /// @notice The address of the EOA that acts as an intermediary in the brokerage process
  address public intermediary;

  /// @notice The initiator that is allowed to start the brokerage process
  address public initiator;

  /*//////////////////////////////////////////////////////////////
                              EXCHANGE STATES
      //////////////////////////////////////////////////////////////*/

  /// @notice Mapping to keep track of which exchanges are enabled
  mapping(address => bool) public exchanges;

  /*//////////////////////////////////////////////////////////////
                                EVENTS
      //////////////////////////////////////////////////////////////*/
  event IntermediaryUpdated(address indexed intermediary);
  event ExchangeUpdated(address indexed exchange, bool indexed isEnabled);
  event InitiatorUpdated(address indexed initiator);

  /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

  constructor(address _intermediary, address _initiator) public {
    _updateIntermediary(_intermediary);
    _updateInitiator(_initiator);
  }

  /// @notice Enable or disable the specified exchange
  /// @param _exchange The exchange to enable or disable
  /// @param _isEnabled The state to update the exchange to
  function updateExchange(address _exchange, bool _isEnabled) external onlyOwner {
    require(exchanges[_exchange] != _isEnabled, 'update must be meaningful');
    exchanges[_exchange] = _isEnabled;
    emit ExchangeUpdated(_exchange, _isEnabled);
  }

  /// @notice Update the address that is allowed to initiate the brokerage process
  /// @param _initiator The address to use as the initiator
  function updateInitiator(address _initiator) external onlyOwner {
    _updateInitiator(_initiator);
  }

  function _updateInitiator(address _initiator) internal {
    require(_initiator != address(0), 'initiator cannot be 0');
    initiator = _initiator;
    emit InitiatorUpdated(_initiator);
  }

  /// @notice Update the intermediary to a different EOA
  /// @param _intermediary The new intermediary to use
  function updateIntermediary(address _intermediary) external onlyOwner {
    _updateIntermediary(_intermediary);
  }

  function _updateIntermediary(address _intermediary) internal {
    require(_intermediary != address(0), 'intermdiary cannot be 0');
    intermediary = _intermediary;
    emit IntermediaryUpdated(_intermediary);
  }

  /// @dev Function to pause the contract
  function pause() external onlyOwner {
    _pause();
  }

  /// @dev Function to unpause the contract
  function unpause() external onlyOwner {
    _unpause();
  }
}
