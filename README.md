# gasless-contracts

## Overview

This repository contains Solidity smart contracts for gasless transactions (ERC-2771). User signs a request off-chain, the operator sends it through the relayer and the user pays for gas with ERC20 token instead of native coin.

## Smart Contracts

1. **TrustedForwarder**: Forwarder based on OpenZeppelin `ERC2771Forwarder`. It checks the signature of the request and calls the target contract. `execute` and `executeBatch` can be called only by relayer contracts.
2. **Relayer**: Contract which the operator calls. It takes the payment for gas from the user through PermitManager and then executes the request in the forwarder.
3. **PermitManager**: Makes the token permit and the Permit2 permit, then transfers tokens from the user with Permit2.

## Technologies Used

- **Solidity**: 0.8.28 with optimizer and `viaIR`.
- **Hardhat**: compile, tests and deploy, TypeScript and ethers v6.
- **OpenZeppelin Contracts**: `ERC2771Forwarder`, `ERC2771Context`, `AccessControl`.
- **Permit2**: allowance transfer for the payment.

## Running the Project

1. Install dependencies using `npm install`.
2. Compile the contracts using `npx hardhat compile`.
3. Run tests using `npx hardhat test`.
4. Deploy using `npx hardhat run scripts/deploy.ts --network sepolia`.
