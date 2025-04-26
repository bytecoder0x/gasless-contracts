// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockDaiPermit is ERC20 {
    string public constant version = "1";

    // keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)")
    bytes32 public constant PERMIT_TYPEHASH = 0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;

    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public nonces;

    constructor(uint256 chainId) ERC20("Dai Stablecoin", "DAI") {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name())),
                keccak256(bytes(version)),
                chainId,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, holder, spender, nonce, expiry, allowed));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        require(holder == ecrecover(digest, v, r, s), "invalid permit");
        require(expiry == 0 || block.timestamp <= expiry, "permit expired");
        require(nonce == nonces[holder]++, "invalid nonce");

        _approve(holder, spender, allowed ? type(uint256).max : 0);
    }
}
