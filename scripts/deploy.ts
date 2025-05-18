import hre, { ethers } from "hardhat";

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const [deployer] = await ethers.getSigners();

    const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    // admin should be the deployer, it sets the roles below
    const adminAddress = deployer.address;
    const treasuryAddress = deployer.address;
    const operators = [deployer.address];

    const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
    const forwarder = await TrustedForwarder.deploy(adminAddress);
    await forwarder.waitForDeployment();
    console.log("TrustedForwarder contract deployed to:", forwarder.target);

    const PermitManager = await ethers.getContractFactory("PermitManager");
    const permitManager = await PermitManager.deploy([], permit2Address, adminAddress);
    await permitManager.waitForDeployment();
    console.log("PermitManager contract deployed to:", permitManager.target);

    const Relayer = await ethers.getContractFactory("Relayer");
    const relayer = await Relayer.deploy(adminAddress, operators, forwarder.target, treasuryAddress, permitManager.target);
    await relayer.waitForDeployment();
    console.log("Relayer contract deployed to:", relayer.target);

    const grantTx = await forwarder.grantRole(await forwarder.RELAYER_ROLE(), relayer.target);
    await grantTx.wait();
    const spendersTx = await permitManager.addSpenders([relayer.target]);
    await spendersTx.wait();
    console.log("All roles set successfully!");

    console.log("Waiting for block confirmations...");
    await delay(30000); // Wait for 30 seconds before verifying the contract

    await hre.run("verify:verify", {
        address: forwarder.target,
        constructorArguments: [adminAddress],
    });
    await hre.run("verify:verify", {
        address: permitManager.target,
        constructorArguments: [[], permit2Address, adminAddress],
    });
    await hre.run("verify:verify", {
        address: relayer.target,
        constructorArguments: [adminAddress, operators, forwarder.target, treasuryAddress, permitManager.target],
    });
}

main().then(res => res).catch(err => console.log(err));
