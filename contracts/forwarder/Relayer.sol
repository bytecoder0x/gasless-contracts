// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IRelayer} from "./interfaces/IRelayer.sol";
import {IPermitManager} from "../permit/interfaces/IPermitManager.sol";

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Relayer is IRelayer, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    ERC2771Forwarder public immutable trustedForwarder;

    /// @notice The treasury address that receives the payment
    address public immutable treasury;

    /// @notice The permit manager address that handles the permit transfer
    IPermitManager public immutable permitManager;

    constructor(
        address _admin,
        address[] memory _operators,
        address _trustedForwarder,
        address _treasury,
        address _permitManager
    ) {
        if (_admin == address(0) || _trustedForwarder == address(0) || _treasury == address(0) || _permitManager == address(0)) {
            revert ZeroAddress();
        }

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
        permitManager = IPermitManager(_permitManager);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    function relayCallBatch(
        ERC2771Forwarder.ForwardRequestData[] calldata requests,
        PaymentData[] calldata paymentDatas,
        bytes[] calldata tokenSignatures,
        bytes[] calldata permitSingleSignatures
    ) external onlyRole(OPERATOR_ROLE) {
        uint256 length = requests.length;
        if (length != paymentDatas.length) revert ArraysLengthMismatch();

        for (uint256 i = 0; i < length; ) {
            relayCall(requests[i], paymentDatas[i], tokenSignatures[i], permitSingleSignatures[i]);
            unchecked {
                ++i;
            }
        }
    }

    function relayCall(
        ERC2771Forwarder.ForwardRequestData calldata request,
        PaymentData calldata paymentData,
        bytes calldata tokenSignature,
        bytes calldata permitSingleSignature
    ) public onlyRole(OPERATOR_ROLE) {
        if (paymentData.payer != request.from) revert PayerMismatch();

        _receivePayment(paymentData, tokenSignature, permitSingleSignature);

        trustedForwarder.execute(request);
    }

    /**
     * @dev _receivePayment execute the permit transfer to receive payment from the user
     * @param paymentData Payment data, see {PaymentData}
     * @param tokenSignature The token signature (EIP-2612 or DAI)
     * @param permitSingleSignature The permit single signature (Permit2)
     */
    function _receivePayment(
        PaymentData calldata paymentData,
        bytes memory tokenSignature,
        bytes memory permitSingleSignature
    ) private {
        if (paymentData.amount > 0) {
            IPermitManager.PermitTransferParams memory params = IPermitManager.PermitTransferParams({
                token: paymentData.token,
                owner: paymentData.payer,
                recipient: treasury,
                amount: paymentData.amount,
                tokenData: tokenSignature,
                permit2Data: permitSingleSignature
            });

            permitManager.executePermitTransfer(params);
        }
    }
}
