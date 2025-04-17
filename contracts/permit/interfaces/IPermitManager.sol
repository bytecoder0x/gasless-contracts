// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IPermitManager {
    struct PermitTransferParams {
        address token;
        address owner;
        address recipient;
        uint256 amount;
        bytes tokenData;
        bytes permit2Data;
    }

    function executePermitTransferBatch(PermitTransferParams[] calldata params) external;

    function executePermitTransfer(PermitTransferParams calldata params) external;

    function addSpenders(address[] calldata spenders) external;

    function removeSpenders(address[] calldata spenders) external;
}