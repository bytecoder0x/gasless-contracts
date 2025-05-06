// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IPermit2} from "../interfaces/IPermit2.sol";
import {IDaiLikePermit} from "../interfaces/IDaiLikePermit.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract Permitable {
    /// @notice The Permit2 contract instance used for token approvals
    IPermit2 public immutable permit2;

    /// @dev Error thrown when the address is zero
    error ZeroAddress();
    /// @dev Error thrown when the permit fails
    error PermitFailed();
    /// @dev Error thrown when the permit length for signature is incorrect
    error PermitLengthError();

    /**
     * @dev Constructor
     * @param _permit2 The address of the Permit2 contract
     */
    constructor(address _permit2) {
        if (_permit2 == address(0)) revert ZeroAddress();
        permit2 = IPermit2(_permit2);
    }

    /**
     * @dev Makes a token permit for EIP-2612 or DAI
     * @param token The address of the token
     * @param owner The address of the owner
     * @param permit The signature of the permit (EIP-2612 or DAI)
     */
    function _makeTokenPermit(address token, address owner, bytes calldata permit) internal {
        if (IERC20(token).allowance(owner, address(permit2)) == type(uint256).max) return;
        _safePermit(IERC20(token), owner, permit);
    }

    /**
     * @dev Makes a token permit for Permit2
     * @param token The address of the token
     * @param owner The address of the owner
     * @param amount The amount of the token
     * @param permit2Data The signature of the Permit2
     */
    function _makePermit2(address token, address owner, uint256 amount, bytes calldata permit2Data) internal {
        IPermit2.PackedAllowance memory allowanceData = permit2.allowance(
            owner,
            token,
            address(this)
        );

        if (amount <= allowanceData.amount && allowanceData.expiration >= block.timestamp) return;
        _safePermit(IERC20(token), owner, permit2Data);
    }

    /**
     * @dev Transfers the payment from the owner to the recipient
     * @param token The address of the token
     * @param owner The address of the owner
     * @param to The address of the recipient
     * @param amount The amount of the token
     */
    function _transferPayment(address token, address owner, address to, uint256 amount) internal {
        if (amount > 0) {
            permit2.transferFrom(owner, to, uint160(amount), token);
        }
    }

    /**
     * @dev Tries to make a permit with the given permit data
     * @param token The address of the token
     * @param owner The address of the owner
     * @param permit The permit data
     */
    function _safePermit(IERC20 token, address owner, bytes calldata permit) private {
        if (!_tryPermit(token, owner, address(this), permit)) revert PermitFailed();
    }

    /**
     * @dev Tries to make a permit with the given permit data 
     * @dev That function from one inch (https://www.codeslaw.app/contracts/ethereum/0x111111125421cA6dc452d289314280a0f8842A65)
     * @param token The address of the token
     * @param owner The address of the owner of the token
     * @param spender The address of the spender that can spend the token
     * @param permit The signature of the permit (EIP-2612 or DAI or Permit2)
     */
    function _tryPermit(
        IERC20 token,
        address owner,
        address spender,
        bytes calldata permit
    ) private returns (bool success) {
        address permit2Address = address(permit2);
        bytes4 permitLengthError = PermitLengthError.selector; 
        // load function selectors for different permit standards
        bytes4 permitSelector = IERC20Permit.permit.selector;
        bytes4 daiPermitSelector = IDaiLikePermit.permit.selector;
        bytes4 permit2Selector = IPermit2.permit.selector;
        assembly ("memory-safe") {
            // solhint-disable-line no-inline-assembly
            let ptr := mload(0x40)

            // Switch case for different permit lengths, indicating different permit standards
            switch permit.length
            // Compact IERC20Permit
            case 100 {
                mstore(ptr, permitSelector) // store selector
                mstore(add(ptr, 0x04), owner) // store owner
                mstore(add(ptr, 0x24), spender) // store spender

                // Compact IERC20Permit.permit(uint256 value, uint32 deadline, uint256 r, uint256 vs)
                {
                    // stack too deep
                    let deadline := shr(224, calldataload(add(permit.offset, 0x20))) // loads permit.offset 0x20..0x23
                    let vs := calldataload(add(permit.offset, 0x44)) // loads permit.offset 0x44..0x63

                    calldatacopy(add(ptr, 0x44), permit.offset, 0x20) // store value     = copy permit.offset 0x00..0x19
                    mstore(add(ptr, 0x64), sub(deadline, 1)) // store deadline  = deadline - 1
                    mstore(add(ptr, 0x84), add(27, shr(255, vs))) // store v         = most significant bit of vs + 27 (27 or 28)
                    calldatacopy(add(ptr, 0xa4), add(permit.offset, 0x24), 0x20) // store r         = copy permit.offset 0x24..0x43
                    mstore(add(ptr, 0xc4), shr(1, shl(1, vs))) // store s         = vs without most significant bit
                }
                // IERC20Permit.permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
                success := call(gas(), token, 0, ptr, 0xe4, 0, 0)
            }
            // Compact IDaiLikePermit
            case 72 {
                mstore(ptr, daiPermitSelector) // store selector
                mstore(add(ptr, 0x04), owner) // store owner
                mstore(add(ptr, 0x24), spender) // store spender

                // Compact IDaiLikePermit.permit(uint32 nonce, uint32 expiry, uint256 r, uint256 vs)
                {
                    // stack too deep
                    let expiry := shr(224, calldataload(add(permit.offset, 0x04))) // loads permit.offset 0x04..0x07
                    let vs := calldataload(add(permit.offset, 0x28)) // loads permit.offset 0x28..0x47

                    mstore(add(ptr, 0x44), shr(224, calldataload(permit.offset))) // store nonce   = copy permit.offset 0x00..0x03
                    mstore(add(ptr, 0x64), sub(expiry, 1)) // store expiry  = expiry - 1
                    mstore(add(ptr, 0x84), true) // store allowed = true
                    mstore(add(ptr, 0xa4), add(27, shr(255, vs))) // store v       = most significant bit of vs + 27 (27 or 28)
                    calldatacopy(add(ptr, 0xc4), add(permit.offset, 0x08), 0x20) // store r       = copy permit.offset 0x08..0x27
                    mstore(add(ptr, 0xe4), shr(1, shl(1, vs))) // store s       = vs without most significant bit
                }
                // IDaiLikePermit.permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)
                success := call(gas(), token, 0, ptr, 0x104, 0, 0)
            }
            // IERC20Permit
            case 224 {
                mstore(ptr, permitSelector)
                calldatacopy(add(ptr, 0x04), permit.offset, permit.length) // copy permit calldata
                // IERC20Permit.permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
                success := call(gas(), token, 0, ptr, 0xe4, 0, 0)
            }
            // IDaiLikePermit
            case 256 {
                mstore(ptr, daiPermitSelector)
                calldatacopy(add(ptr, 0x04), permit.offset, permit.length) // copy permit calldata
                // IDaiLikePermit.permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)
                success := call(gas(), token, 0, ptr, 0x104, 0, 0)
            }
            // Compact IPermit2
            case 96 {
                // Compact IPermit2.permit(uint160 amount, uint32 expiration, uint32 nonce, uint32 sigDeadline, uint256 r, uint256 vs)
                mstore(ptr, permit2Selector) // store selector
                mstore(add(ptr, 0x04), owner) // store owner
                mstore(add(ptr, 0x24), token) // store token

                calldatacopy(add(ptr, 0x50), permit.offset, 0x14) // store amount = copy permit.offset 0x00..0x13
                // and(0xffffffffffff, ...) - conversion to uint48
                mstore(add(ptr, 0x64), and(0xffffffffffff, sub(shr(224, calldataload(add(permit.offset, 0x14))), 1))) // store expiration = ((permit.offset 0x14..0x17 - 1) & 0xffffffffffff)
                mstore(add(ptr, 0x84), shr(224, calldataload(add(permit.offset, 0x18)))) // store nonce = copy permit.offset 0x18..0x1b
                mstore(add(ptr, 0xa4), spender) // store spender
                // and(0xffffffffffff, ...) - conversion to uint48
                mstore(add(ptr, 0xc4), and(0xffffffffffff, sub(shr(224, calldataload(add(permit.offset, 0x1c))), 1))) // store sigDeadline = ((permit.offset 0x1c..0x1f - 1) & 0xffffffffffff)
                mstore(add(ptr, 0xe4), 0x100) // store offset = 256
                mstore(add(ptr, 0x104), 0x40) // store length = 64
                calldatacopy(add(ptr, 0x124), add(permit.offset, 0x20), 0x20) // store r      = copy permit.offset 0x20..0x3f
                calldatacopy(add(ptr, 0x144), add(permit.offset, 0x40), 0x20) // store vs     = copy permit.offset 0x40..0x5f
                // IPermit2.permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature)
                success := call(gas(), permit2Address, 0, ptr, 0x164, 0, 0)
            }
            // IPermit2
            case 352 {
                mstore(ptr, permit2Selector)
                calldatacopy(add(ptr, 0x04), permit.offset, permit.length) // copy permit calldata
                // IPermit2.permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature)
                success := call(gas(), permit2Address, 0, ptr, 0x164, 0, 0)
            }
            // Unknown
            default {
                mstore(ptr, permitLengthError)
                revert(ptr, 4)
            }
        }
    }
}