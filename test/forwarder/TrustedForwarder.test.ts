import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustedForwarder, MockERC20Context } from "../../typechain-types";
import { getSignatureForwardRequest } from "../utils/signature-builder";

describe("TrustedForwarder", function () {
    let forwarder: TrustedForwarder;
    let token: MockERC20Context;
    let admin: HardhatEthersSigner;
    let relayer: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    async function deployFixture() {
        const [admin, relayer, user1, user2, user3] = await ethers.getSigners();

        const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
        const forwarder = await TrustedForwarder.deploy(admin.address);
        await forwarder.waitForDeployment();

        const MockERC20Context = await ethers.getContractFactory("MockERC20Context");
        const token = await MockERC20Context.deploy("Test Token", "TST", forwarder.target);
        await token.waitForDeployment();

        // here relayer is just a wallet, relayer contract has own tests
        await forwarder.connect(admin).grantRole(await forwarder.RELAYER_ROLE(), relayer.address);

        await token.mint(user1.address, ethers.parseEther("1000"));
        await token.mint(user2.address, ethers.parseEther("1000"));

        return { forwarder, token, admin, relayer, user1, user2, user3 };
    }

    beforeEach(async () => {
        const fixture = await loadFixture(deployFixture);
        forwarder = fixture.forwarder;
        token = fixture.token;
        admin = fixture.admin;
        relayer = fixture.relayer;
        user1 = fixture.user1;
        user2 = fixture.user2;
        user3 = fixture.user3;
    });

    describe("Deployment Functionality", function () {
        it("Should set the correct admin", async () => {
            expect(await forwarder.hasRole(await forwarder.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
        });

        it("Should prevent deployment with zero admin address", async () => {
            const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");

            await expect(TrustedForwarder.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(forwarder, "ZeroAddress");
        });
    });

    describe("Execute Functionality", function () {
        it("Should correctly execute transfer signed by the user", async () => {
            const amount = ethers.parseEther("100");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            expect(await forwarder.verify(request)).to.equal(true);

            const balanceUserBefore = await token.balanceOf(user1.address);
            const nonceBefore = await forwarder.nonces(user1.address);

            await forwarder.connect(relayer).execute(request);

            expect(await token.balanceOf(user1.address)).to.equal(balanceUserBefore - amount);
            expect(await token.balanceOf(user3.address)).to.equal(amount);
            expect(await forwarder.nonces(user1.address)).to.equal(nonceBefore + 1n);
        });

        it("Should correctly execute batch of requests", async () => {
            const amount = ethers.parseEther("50");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);

            const request1 = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);
            const request2 = await getSignatureForwardRequest(forwarder, user2, token.target.toString(), data);

            await forwarder.connect(relayer).executeBatch([request1, request2], ethers.ZeroAddress);

            expect(await token.balanceOf(user3.address)).to.equal(amount + amount);
        });

        it("Should prevent execute the same request twice", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            await forwarder.connect(relayer).execute(request);

            // nonce is already used so the signer is recovered wrong
            await expect(forwarder.connect(relayer).execute(request)).to.be.revertedWithCustomError(
                forwarder,
                "ERC2771ForwarderInvalidSigner"
            );
        });

        it("Should prevent execute if request was changed after signing", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            request.data = token.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("1000")]);

            await expect(forwarder.connect(relayer).execute(request)).to.be.revertedWithCustomError(
                forwarder,
                "ERC2771ForwarderInvalidSigner"
            );
        });

        it("Should prevent execute if called by non-relayer", async () => {
            const relayerRole = await forwarder.RELAYER_ROLE();
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            await expect(forwarder.connect(user1).execute(request))
                .to.be.revertedWithCustomError(forwarder, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, relayerRole);
            await expect(forwarder.connect(user1).executeBatch([request], ethers.ZeroAddress))
                .to.be.revertedWithCustomError(forwarder, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, relayerRole);
        });
    });
});
