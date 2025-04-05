// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

interface IRelayer {
    error ZeroAddress();

    function relayCall(ERC2771Forwarder.ForwardRequestData calldata request) external;
}
