// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IPermitManager} from "./interfaces/IPermitManager.sol";

import {Permitable} from "./components/Permitable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract PermitManager is Permitable, IPermitManager, AccessControl {
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    constructor(
        address[] memory spenders,
        address _permit2,
        address multisigWallet
    ) Permitable(_permit2) {
        uint256 length = spenders.length;
        for (uint256 i = 0; i < length; ) {
            address spender = spenders[i];
            if (spender == address(0)) revert ZeroAddress();

            _grantRole(SPENDER_ROLE, spender);
            unchecked {
                ++i;
            }
        }

        if (multisigWallet == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, multisigWallet);
    }

    function executePermitTransferBatch(PermitTransferParams[] calldata params) external onlyRole(SPENDER_ROLE) {
        uint256 totalLength = params.length;
        for (uint256 i = 0; i < totalLength; ) {
            executePermitTransfer(params[i]);
            unchecked {
                ++i;
            }
        }
    }

    function executePermitTransfer(PermitTransferParams calldata params) public onlyRole(SPENDER_ROLE) {
        if (params.owner == address(0) || params.recipient == address(0) || params.token == address(0)) {
            revert ZeroAddress();
        }

        if (params.tokenData.length > 0) _makeTokenPermit(params.token, params.owner, params.tokenData);

        if (params.permit2Data.length > 0) _makePermit2(params.token, params.owner, params.amount, params.permit2Data);

        _transferPayment(params.token, params.owner, params.recipient, params.amount);
    }

    function addSpenders(address[] calldata spenders) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = spenders.length;
        for (uint256 i = 0; i < length; ) {
            address spender = spenders[i];
            if (spender == address(0)) revert ZeroAddress();

            _grantRole(SPENDER_ROLE, spender);
            unchecked {
                ++i;
            }
        }
    }

    function removeSpenders(address[] calldata spenders) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = spenders.length;
        for (uint256 i = 0; i < length; ) {
            _revokeRole(SPENDER_ROLE, spenders[i]);
            unchecked {
                ++i;
            }
        }
    }
}
