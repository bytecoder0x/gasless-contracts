# gasless-contracts

## Overview

This repository contains Solidity smart contracts for gasless transactions (ERC-2771). User signs a request off-chain, the operator sends it through the relayer and the user pays for gas with ERC20 token instead of native coin.

## Smart Contracts

1. **TrustedForwarder**: Forwarder based on OpenZeppelin `ERC2771Forwarder`. It checks the EIP-712 signature of the request and calls the target contract with the user address added to calldata. `execute` and `executeBatch` can be called only by relayer contracts.
2. **Relayer**: Contract which the operator calls. It takes the payment for gas from the user through PermitManager and then executes the request in the forwarder. There is `relayCall` for one request and `relayCallBatch` for many.
3. **PermitManager**: Makes the token permit (EIP-2612 or DAI-like) and the Permit2 permit if they are needed, then transfers tokens from the user with Permit2 `transferFrom`. Only addresses with spender role can call it.

## How it works

1. User signs `ForwardRequest` with the call to the target contract.
2. User signs permit of the payment token for Permit2 and Permit2 permit for PermitManager. If the allowances already exist, signatures can be empty.
3. Operator calls `relayCall` in Relayer with the request, payment data and signatures.
4. Relayer sends the payment to the treasury through PermitManager.
5. Forwarder verifies the request and calls the target contract, the target gets the user address from `_msgSender()`.

## Technologies Used

- **Solidity**: 0.8.28 with optimizer and `viaIR`.
- **Hardhat**: compile, tests and deploy, TypeScript and ethers v6.
- **OpenZeppelin Contracts**: `ERC2771Forwarder`, `ERC2771Context`, `AccessControl`.
- **Permit2**: allowance transfer for the payment. Tests put the Permit2 code to its address in the local network, so fork is not needed.
- **Permit2 SDK**: builds the Permit2 typed data in tests.

## Running the Project

1. Install dependencies using `npm install`.
2. Compile the contracts using `npx hardhat compile`.
3. Run tests using `npx hardhat test` (`.env` is not needed for tests).
4. Check coverage using `npx hardhat coverage`.
5. To deploy create `.env` from `.env.example` and run `npx hardhat run scripts/deploy.ts --network sepolia`.
