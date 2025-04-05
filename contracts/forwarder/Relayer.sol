// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IRelayer} from "./interfaces/IRelayer.sol";

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Relayer is IRelayer, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    ERC2771Forwarder public immutable trustedForwarder;

    constructor(address _admin, address[] memory _operators, address _trustedForwarder) {
        if (_admin == address(0) || _trustedForwarder == address(0)) revert ZeroAddress();

        uint256 length = _operators.length;
        for (uint256 i = 0; i < length; ) {
            address operator = _operators[i];
            if (operator == address(0)) revert ZeroAddress();

            _grantRole(OPERATOR_ROLE, operator);
            unchecked {
                ++i;
            }
        }

        trustedForwarder = ERC2771Forwarder(_trustedForwarder);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    function relayCall(ERC2771Forwarder.ForwardRequestData calldata request) external onlyRole(OPERATOR_ROLE) {
        trustedForwarder.execute(request);
    }
}
