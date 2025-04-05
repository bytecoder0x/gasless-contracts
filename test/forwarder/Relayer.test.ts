import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustedForwarder, Relayer, MockERC20Context } from "../../typechain-types";
import { getSignatureForwardRequest } from "../utils/signature-builder";

describe("Relayer", function () {
    let forwarder: TrustedForwarder;
    let relayer: Relayer;
    let token: MockERC20Context;
    let admin: HardhatEthersSigner;
    let operator: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    async function deployFixture() {
        const [admin, operator, user1, user2, user3] = await ethers.getSigners();

        const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
        const forwarder = await TrustedForwarder.deploy(admin.address);
        await forwarder.waitForDeployment();

        const Relayer = await ethers.getContractFactory("Relayer");
        const relayer = await Relayer.deploy(admin.address, [operator.address], forwarder.target);
        await relayer.waitForDeployment();

        await forwarder.connect(admin).grantRole(await forwarder.RELAYER_ROLE(), relayer.target);

        const MockERC20Context = await ethers.getContractFactory("MockERC20Context");
        const token = await MockERC20Context.deploy("Test Token", "TST", forwarder.target);
        await token.waitForDeployment();

        await token.mint(user1.address, ethers.parseEther("1000"));
        await token.mint(user2.address, ethers.parseEther("1000"));

        return { forwarder, relayer, token, admin, operator, user1, user2, user3 };
    }

    beforeEach(async () => {
        const fixture = await loadFixture(deployFixture);
        forwarder = fixture.forwarder;
        relayer = fixture.relayer;
        token = fixture.token;
        admin = fixture.admin;
        operator = fixture.operator;
        user1 = fixture.user1;
        user2 = fixture.user2;
        user3 = fixture.user3;
    });

    describe("Deployment Functionality", function () {
        it("Should set the correct trusted forwarder", async () => {
            expect(await relayer.trustedForwarder()).to.equal(forwarder.target);
        });

        it("Should set the correct roles", async () => {
            expect(await relayer.hasRole(await relayer.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await relayer.hasRole(await relayer.OPERATOR_ROLE(), operator.address)).to.equal(true);
        });

        it("Should prevent deployment with zero address", async () => {
            const Relayer = await ethers.getContractFactory("Relayer");

            await expect(
                Relayer.deploy(ethers.ZeroAddress, [operator.address], forwarder.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [ethers.ZeroAddress], forwarder.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [operator.address], ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
        });
    });

    describe("Relay Call Functionality", function () {
        it("Should correctly relay call", async () => {
            const amount = ethers.parseEther("100");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            await relayer.connect(operator).relayCall(request);

            expect(await token.balanceOf(user3.address)).to.equal(amount);
            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
        });

        it("Should prevent relay call if request signed by another user", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user2, token.target.toString(), data);

            request.from = user1.address;

            await expect(relayer.connect(operator).relayCall(request)).to.be.revertedWithCustomError(
                forwarder,
                "ERC2771ForwarderInvalidSigner"
            );
        });

        it("Should prevent relay call if called by non-operator", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            await expect(relayer.connect(user1).relayCall(request))
                .to.be.revertedWithCustomError(relayer, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, await relayer.OPERATOR_ROLE());
        });
    });
});
