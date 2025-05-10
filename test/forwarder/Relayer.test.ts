import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
    TrustedForwarder,
    Relayer,
    PermitManager,
    IPermit2,
    MockERC20Context,
    MockERC20,
    MockERC20Permit,
} from "../../typechain-types";
import { getSignatureForwardRequest, getSignatureERC20Permit, getPermitSingleSignature } from "../utils/signature-builder";
import { deployPermit2, PERMIT2_ADDRESS } from "../utils/permit2";

describe("Relayer", function () {
    let forwarder: TrustedForwarder;
    let relayer: Relayer;
    let permitManager: PermitManager;
    let permit2: IPermit2;
    let token: MockERC20Context;
    let paymentToken: MockERC20Permit;
    let erc20: MockERC20;
    let admin: HardhatEthersSigner;
    let operator: HardhatEthersSigner;
    let treasury: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    const paymentAmount = ethers.parseEther("5");

    async function deployFixture() {
        const [admin, operator, treasury, user1, user2, user3] = await ethers.getSigners();

        const permit2 = await deployPermit2();

        const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder");
        const forwarder = await TrustedForwarder.deploy(admin.address);
        await forwarder.waitForDeployment();

        const PermitManager = await ethers.getContractFactory("PermitManager");
        const permitManager = await PermitManager.deploy([], PERMIT2_ADDRESS, admin.address);
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

        const MockERC20Permit = await ethers.getContractFactory("MockERC20Permit");
        const paymentToken = await MockERC20Permit.deploy("Payment Token", "PAY");
        await paymentToken.waitForDeployment();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const erc20 = await MockERC20.deploy("ERC Test", "ERC");
        await erc20.waitForDeployment();

        await token.mint(user1.address, ethers.parseEther("1000"));
        await token.mint(user2.address, ethers.parseEther("1000"));
        await paymentToken.mint(user1.address, ethers.parseEther("1000"));
        await paymentToken.mint(user2.address, ethers.parseEther("1000"));
        await erc20.mint(user1.address, ethers.parseEther("1000"));

        return { forwarder, relayer, permitManager, permit2, token, paymentToken, erc20, admin, operator, treasury, user1, user2, user3 };
    }

    beforeEach(async () => {
        const fixture = await loadFixture(deployFixture);
        forwarder = fixture.forwarder;
        relayer = fixture.relayer;
        permitManager = fixture.permitManager;
        permit2 = fixture.permit2;
        token = fixture.token;
        paymentToken = fixture.paymentToken;
        erc20 = fixture.erc20;
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

            const paymentData = { payer: user1.address, token: paymentToken.target, amount: 0 };

            await relayer.connect(operator).relayCall(request, paymentData, "0x", "0x");

            expect(await token.balanceOf(user3.address)).to.equal(amount);
            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
        });

        it("Should correctly relay call with payment by two permits", async () => {
            const amount = ethers.parseEther("100");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const tokenSignature = await getSignatureERC20Permit(paymentToken, user1, PERMIT2_ADDRESS);
            const permitSingleSignature = await getPermitSingleSignature(
                paymentToken,
                user1,
                permitManager.target.toString(),
                permit2,
                paymentAmount
            );

            const balancePayerBefore = await paymentToken.balanceOf(user1.address);
            const paymentData = { payer: user1.address, token: paymentToken.target, amount: paymentAmount };

            await relayer.connect(operator).relayCall(request, paymentData, tokenSignature, permitSingleSignature);

            expect(await token.balanceOf(user3.address)).to.equal(amount);
            expect(await paymentToken.balanceOf(treasury.address)).to.equal(paymentAmount);
            expect(await paymentToken.balanceOf(user1.address)).to.equal(balancePayerBefore - paymentAmount);
        });

        it("Should correctly relay call with payment if token has no permit", async () => {
            await erc20.connect(user1).approve(PERMIT2_ADDRESS, ethers.MaxUint256);

            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);
            const permitSingleSignature = await getPermitSingleSignature(
                erc20,
                user1,
                permitManager.target.toString(),
                permit2,
                paymentAmount
            );

            const paymentData = { payer: user1.address, token: erc20.target, amount: paymentAmount };

            await relayer.connect(operator).relayCall(request, paymentData, "0x", permitSingleSignature);

            expect(await erc20.balanceOf(treasury.address)).to.equal(paymentAmount);
        });

        it("Should correctly relay call without permits if allowance already given", async () => {
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            await paymentToken.connect(user1).approve(PERMIT2_ADDRESS, ethers.MaxUint256);
            await permit2.connect(user1).approve(paymentToken.target, permitManager.target, paymentAmount * 2n, deadline);

            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("10")]);
            const paymentData = { payer: user1.address, token: paymentToken.target, amount: paymentAmount };

            // two calls one by one, nonce of the request is different
            let request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);
            await relayer.connect(operator).relayCall(request, paymentData, "0x", "0x");

            request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);
            await relayer.connect(operator).relayCall(request, paymentData, "0x", "0x");

            expect(await token.balanceOf(user3.address)).to.equal(ethers.parseEther("20"));
            expect(await paymentToken.balanceOf(treasury.address)).to.equal(paymentAmount * 2n);
        });

        it("Should prevent relay call if payment was not permitted", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user1.address, token: paymentToken.target, amount: paymentAmount };
            const fakeSignature = ethers.randomBytes(100);

            await expect(
                relayer.connect(operator).relayCall(request, paymentData, fakeSignature, fakeSignature)
            ).to.be.revertedWithCustomError(permitManager, "PermitFailed");

            expect(await token.balanceOf(user3.address)).to.equal(0);
        });

        it("Should prevent relay call if payer is not the signer", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user2.address, token: paymentToken.target, amount: paymentAmount };

            await expect(
                relayer.connect(operator).relayCall(request, paymentData, "0x", "0x")
            ).to.be.revertedWithCustomError(relayer, "PayerMismatch");
        });

        it("Should prevent relay call if request signed by another user", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user2, token.target.toString(), data);

            request.from = user1.address;
            const paymentData = { payer: user1.address, token: paymentToken.target, amount: 0 };

            await expect(
                relayer.connect(operator).relayCall(request, paymentData, "0x", "0x")
            ).to.be.revertedWithCustomError(forwarder, "ERC2771ForwarderInvalidSigner");
        });

        it("Should prevent relay call if called by non-operator", async () => {
            const data = token.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("100")]);
            const request = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);

            const paymentData = { payer: user1.address, token: paymentToken.target, amount: 0 };

            await expect(relayer.connect(user1).relayCall(request, paymentData, "0x", "0x"))
                .to.be.revertedWithCustomError(relayer, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, await relayer.OPERATOR_ROLE());
        });
    });

    describe("Relay Call Batch Functionality", function () {
        it("Should correctly relay batch of calls from two users", async () => {
            const amount = ethers.parseEther("100");
            const data = token.interface.encodeFunctionData("transfer", [user3.address, amount]);

            const request1 = await getSignatureForwardRequest(forwarder, user1, token.target.toString(), data);
            const request2 = await getSignatureForwardRequest(forwarder, user2, token.target.toString(), data);

            const tokenSignature1 = await getSignatureERC20Permit(paymentToken, user1, PERMIT2_ADDRESS);
            const tokenSignature2 = await getSignatureERC20Permit(paymentToken, user2, PERMIT2_ADDRESS);
            const permitSingleSignature1 = await getPermitSingleSignature(paymentToken, user1, permitManager.target.toString(), permit2, paymentAmount);
            const permitSingleSignature2 = await getPermitSingleSignature(paymentToken, user2, permitManager.target.toString(), permit2, paymentAmount);

            const paymentData1 = { payer: user1.address, token: paymentToken.target, amount: paymentAmount };
            const paymentData2 = { payer: user2.address, token: paymentToken.target, amount: paymentAmount };

            await relayer
                .connect(operator)
                .relayCallBatch(
                    [request1, request2],
                    [paymentData1, paymentData2],
                    [tokenSignature1, tokenSignature2],
                    [permitSingleSignature1, permitSingleSignature2]
                );

            expect(await token.balanceOf(user3.address)).to.equal(amount + amount);
            expect(await paymentToken.balanceOf(treasury.address)).to.equal(paymentAmount + paymentAmount);
        });

        it("Should prevent relay batch if called by non-operator", async () => {
            await expect(relayer.connect(user1).relayCallBatch([], [], [], []))
                .to.be.revertedWithCustomError(relayer, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, await relayer.OPERATOR_ROLE());
        });
    });
});
