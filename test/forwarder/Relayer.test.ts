import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustedForwarder, Relayer, PermitManager, MockERC20Context } from "../../typechain-types";
import { getSignatureForwardRequest } from "../utils/signature-builder";

const permit2Addr = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

describe("Relayer", function () {
    let forwarder: TrustedForwarder;
    let relayer: Relayer;
    let permitManager: PermitManager;
    let token: MockERC20Context;
    let admin: HardhatEthersSigner;
    let operator: HardhatEthersSigner;
    let treasury: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    async function deployFixture() {
        const [admin, operator, treasury, user1, user2, user3] = await ethers.getSigners();

        const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
        const forwarder = await TrustedForwarder.deploy(admin.address);
        await forwarder.waitForDeployment();

        const PermitManager = await ethers.getContractFactory("PermitManager");
        const permitManager = await PermitManager.deploy([], permit2Addr, admin.address);
        await permitManager.waitForDeployment();

        const Relayer = await ethers.getContractFactory("Relayer");
        const relayer = await Relayer.deploy(
            admin.address,
            [operator.address],
            forwarder.target,
            treasury.address,
            permitManager.target
        );
        await relayer.waitForDeployment();

        await forwarder.connect(admin).grantRole(await forwarder.RELAYER_ROLE(), relayer.target);
        await permitManager.connect(admin).addSpenders([relayer.target]);

        const MockERC20Context = await ethers.getContractFactory("MockERC20Context");
        const token = await MockERC20Context.deploy("Test Token", "TST", forwarder.target);
        await token.waitForDeployment();

        await token.mint(user1.address, ethers.parseEther("1000"));
        await token.mint(user2.address, ethers.parseEther("1000"));

        return { forwarder, relayer, permitManager, token, admin, operator, treasury, user1, user2, user3 };
    }

    beforeEach(async () => {
        const fixture = await loadFixture(deployFixture);
        forwarder = fixture.forwarder;
        relayer = fixture.relayer;
        permitManager = fixture.permitManager;
        token = fixture.token;
        admin = fixture.admin;
        operator = fixture.operator;
        treasury = fixture.treasury;
        user1 = fixture.user1;
        user2 = fixture.user2;
        user3 = fixture.user3;
    });

    describe("Deployment Functionality", function () {
        it("Should set the correct addresses", async () => {
            expect(await relayer.trustedForwarder()).to.equal(forwarder.target);
            expect(await relayer.treasury()).to.equal(treasury.address);
            expect(await relayer.permitManager()).to.equal(permitManager.target);
        });

        it("Should set the correct roles", async () => {
            expect(await relayer.hasRole(await relayer.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await relayer.hasRole(await relayer.OPERATOR_ROLE(), operator.address)).to.equal(true);
        });

        it("Should prevent deployment with zero address", async () => {
            const Relayer = await ethers.getContractFactory("Relayer");

            await expect(
                Relayer.deploy(ethers.ZeroAddress, [operator.address], forwarder.target, treasury.address, permitManager.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [ethers.ZeroAddress], forwarder.target, treasury.address, permitManager.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [operator.address], ethers.ZeroAddress, treasury.address, permitManager.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [operator.address], forwarder.target, ethers.ZeroAddress, permitManager.target)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
            await expect(
                Relayer.deploy(admin.address, [operator.address], forwarder.target, treasury.address, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(relayer, "ZeroAddress");
        });
    });

    describe("Relay Call Functionality", function () {
        it("Should correctly relay call without payment", async () => {
            const amount = ethers.parseEther("100");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user1.address, token: token.target, amount: 0 };

            await relayer.connect(operator).relayCall(request, paymentData, "0x", "0x");

            expect(await token.balanceOf(user3.address)).to.equal(amount);
            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
        });

        it("Should prevent relay call if payer is not the signer", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user2.address, token: token.target, amount: ethers.parseEther("5") };

            await expect(
                relayer.connect(operator).relayCall(request, paymentData, "0x", "0x")
            ).to.be.revertedWithCustomError(relayer, "PayerMismatch");
        });

        it("Should prevent relay call if request signed by another user", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user2, token.target.toString(), data);

            request.from = user1.address;
            const paymentData = { payer: user1.address, token: token.target, amount: 0 };

            await expect(
                relayer.connect(operator).relayCall(request, paymentData, "0x", "0x")
            ).to.be.revertedWithCustomError(forwarder, "ERC2771ForwarderInvalidSigner");
        });

        it("Should prevent relay call if called by non-operator", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user1.address, token: token.target, amount: 0 };

            await expect(relayer.connect(user1).relayCall(request, paymentData, "0x", "0x"))
                .to.be.revertedWithCustomError(relayer, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, await relayer.OPERATOR_ROLE());
        });
    });
});
