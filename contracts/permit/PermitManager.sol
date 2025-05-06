// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IPermitManager} from "./interfaces/IPermitManager.sol";

import {Permitable} from "./components/Permitable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PermitManager
 * @notice A contract that handles the permit transfer
 */
contract PermitManager is Permitable, IPermitManager, AccessControl {
    /// @notice This role whitelists addresses which can execute permit transfer
    /// @dev keccak256("SPENDER_ROLE")
    bytes32 public constant SPENDER_ROLE = 0x7434c6f201a551bfd17336985361933e0c4935b520dac8a49d937b325f7d5c0a;

    /**
     * @dev Constructor
     * @param spenders Array of initial spender addresses
     * @param _permit2 Address of the Permit2 contract
     * @param multisigWallet Address of the admin multisig wallet
     */
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

    // @inheritdoc IPermitManager
    function executePermitTransferBatch(PermitTransferParams[] calldata params) external onlyRole(SPENDER_ROLE) {
        uint256 totalLength = params.length;
        for (uint256 i = 0; i < totalLength; ) {
            executePermitTransfer(params[i]);
            unchecked {
                ++i;
            }
        }
    }

    // @inheritdoc IPermitManager
    function executePermitTransfer(PermitTransferParams calldata params) public onlyRole(SPENDER_ROLE) {
        if (params.owner == address(0) || params.recipient == address(0) || params.token == address(0)) {
            revert ZeroAddress();
        }

        if (params.tokenData.length > 0) _makeTokenPermit(params.token, params.owner, params.tokenData);

        if (params.permit2Data.length > 0) _makePermit2(params.token, params.owner, params.amount, params.permit2Data);

        _transferPayment(params.token, params.owner, params.recipient, params.amount);
    }

    // @inheritdoc IPermitManager
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

    // @inheritdoc IPermitManager
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
