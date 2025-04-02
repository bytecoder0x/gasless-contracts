// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract TrustedForwarder is ERC2771Forwarder, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    error ZeroAddress();

    constructor(address _admin) ERC2771Forwarder("TrustedForwarder") {
        if (_admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // requests can be executed only through relayer contracts
    function execute(ForwardRequestData calldata request) public payable override onlyRole(RELAYER_ROLE) {
        super.execute(request);
    }

    function executeBatch(
        ForwardRequestData[] calldata requests,
        address payable refundReceiver
    ) public payable override onlyRole(RELAYER_ROLE) {
        super.executeBatch(requests, refundReceiver);
    }
}
