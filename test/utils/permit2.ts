import { ethers, network } from "hardhat";
import { PERMIT2_BYTECODE } from "./permit2-bytecode";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// code of Permit2 from mainnet, so the tests don't need a fork
export const deployPermit2 = async () => {
    await network.provider.send("hardhat_setCode", [PERMIT2_ADDRESS, PERMIT2_BYTECODE]);

    return ethers.getContractAt("IPermit2", PERMIT2_ADDRESS);
};
