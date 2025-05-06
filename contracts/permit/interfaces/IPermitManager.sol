// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IPermitManager {
    /**
     * @notice Parameters structure for permit transfers
     * @dev Contains all necessary data for executing transfers with permits
     * @param token The token address to be transferred
     * @param owner The address that owns the tokens
     * @param recipient The address that will receive the tokens
     * @param amount The amount of tokens to transfer
     * @param tokenData The data for EIP-2612 permit if used
     * @param permit2Data The data for Permit2 if used
     */
    struct PermitTransferParams {
        address token;
        address owner;
        address recipient;
        uint256 amount;
        bytes tokenData;
        bytes permit2Data;
    }

    /**
     * @notice Executes multiple permit transfers in one transaction
     * @dev Restricted to addresses with SPENDER_ROLE
     * @param params Array of parameters for each transfer
     */
    function executePermitTransferBatch(PermitTransferParams[] calldata params) external;

    /**
     * @notice Executes a single permit transfer
     * @dev Restricted to addresses with SPENDER_ROLE
     * @param params The parameters for the transfer
     */
    function executePermitTransfer(PermitTransferParams calldata params) external;

    /**
     * @notice Adds multiple addresses to the list of authorized spenders
     * @dev Restricted to addresses with DEFAULT_ADMIN_ROLE
     * @param spenders Array of addresses to add as authorized spenders
     */
    function addSpenders(address[] calldata spenders) external;

    /**
     * @notice Removes multiple addresses from the list of authorized spenders
     * @dev Restricted to addresses with DEFAULT_ADMIN_ROLE
     * @param spenders Array of addresses to remove from authorized spenders
     */
    function removeSpenders(address[] calldata spenders) external;
}