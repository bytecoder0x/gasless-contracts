// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

interface IRelayer {
    /**
     * @dev Payment data struct
     * @param payer The address who pays the gas expenses
     * @param token The payment token address
     * @param amount The payment amount in wei
     */
    struct PaymentData {
        address payer;
        address token;
        uint256 amount;
    }

    /// @dev Error thrown when the address is zero
    error ZeroAddress();
    /// @dev Error thrown when the payer is not the signer of the request
    error PayerMismatch();

    /**
     * @notice Receives the payment for gas and relays a call to the trusted forwarder
     * @param request Forwarder request data signed by the user
     * @param paymentData Payment data, see {PaymentData}
     * @param tokenSignature The token signature (EIP-2612 or DAI)
     * @param permitSingleSignature The permit single signature (Permit2)
     */
    function relayCall(
        ERC2771Forwarder.ForwardRequestData calldata request,
        PaymentData calldata paymentData,
        bytes calldata tokenSignature,
        bytes calldata permitSingleSignature
    ) external;
}
