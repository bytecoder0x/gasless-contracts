import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, config } from 'hardhat';
import { expect } from 'chai';
import {
  PermitManager,
  PermitManager__factory,
  MockERC20__factory,
  MockERC20,
  IPermit2,
  MockERC20Permit__factory,
  MockDaiPermit__factory,
  MockDaiPermit,
  MockERC20Permit,
} from '../../typechain-types';
import { getSignatureERC20Permit, getPermitSingleSignature, getSignatureDAIPermit } from './utils';
import { deployPermit2 } from '../utils/permit2';

const permit2Addr = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

describe.only('PermitManager', () => {
  let permit2: IPermit2;
  let permitManager: PermitManager;
  let erc20: MockERC20;
  let erc20Permit: MockERC20Permit;
  let daiToken: MockDaiPermit;
  let deployer: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;
  let user4: HardhatEthersSigner;
  let executor1: HardhatEthersSigner;
  let executor2: HardhatEthersSigner;
  let multisigWallet: HardhatEthersSigner;

  async function deployFixture() {
    [deployer, user1, user2, user3, user4, executor1, executor2, multisigWallet] = await ethers.getSigners();

    const permitManager = await new PermitManager__factory(deployer).deploy(
      [executor1.address, executor2.address],
      permit2Addr,
      multisigWallet.address
    );

    const chainId = (await ethers.provider.getNetwork()).chainId;
    
    const erc20Permit = await new MockERC20Permit__factory(user1).deploy('ERC Test', 'ERC Test');
    const erc20 = await new MockERC20__factory(user1).deploy('ERC Test', 'ERC Test');
    const daiToken = await new MockDaiPermit__factory(user1).deploy(chainId);
    await deployPermit2();
    const permit2 = await ethers.getContractAt('IPermit2', permit2Addr);

    await erc20.mint(user2.address, ethers.parseEther('10000'));
    await erc20Permit.mint(user2.address, ethers.parseEther('10000'));
    await daiToken.mint(user2.address, ethers.parseEther('10000'));

    await erc20.mint(user3.address, ethers.parseEther('10000'));
    await erc20Permit.mint(user3.address, ethers.parseEther('10000'));
    await daiToken.mint(user3.address, ethers.parseEther('10000'));

    return { permitManager, erc20, erc20Permit, daiToken, permit2, deployer, user1, user2, user3, user4, executor1, executor2, multisigWallet };
  }

  beforeEach(async () => {
    const fixture = await deployFixture();
    permitManager = fixture.permitManager;
    erc20 = fixture.erc20;
    erc20Permit = fixture.erc20Permit;
    daiToken = fixture.daiToken;
    permit2 = fixture.permit2;
    deployer = fixture.deployer;
    user1 = fixture.user1;
    user2 = fixture.user2;
    user3 = fixture.user3;
    user4 = fixture.user4;
    executor1 = fixture.executor1;
    executor2 = fixture.executor2;
    multisigWallet = fixture.multisigWallet;
  });

  describe('Deployment Functionality', () => {
    it('Should set the correct whitelisted spenders', async () => {
      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), executor1.address)).to.equal(true);
      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), executor2.address)).to.equal(true);
    });

    it('Should set the correct permit2 address', async () => {
      expect(await permitManager.permit2()).to.equal(permit2Addr);
    });

    it('Should set the correct multisig wallet with admin role', async () => {
      expect(
        await permitManager.hasRole(
          await permitManager.DEFAULT_ADMIN_ROLE(),
          multisigWallet.address,
        ),
      ).to.equal(true);
    });

    it('Should prevent deploy if spender is zero address', async () => {
      await expect(
        new PermitManager__factory(deployer).deploy(
          [executor1.address, executor2.address],
          permit2Addr,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');
    });

    it('Should prevent deploy if permit2 is zero address', async () => {
      await expect(
        new PermitManager__factory(deployer).deploy(
          [executor1.address, executor2.address],
          ethers.ZeroAddress,
          multisigWallet.address,
        ),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');
    });

    it('Should prevent deploy if multisig wallet is zero address', async () => {
      await expect(
        new PermitManager__factory(deployer).deploy(
          [executor1.address, executor2.address],
          permit2Addr,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');
    });
  });

  describe('Manage Spenders Functionality', () => {
    it('Should correctly add new spenders', async () => {
      await permitManager.connect(multisigWallet).addSpenders([user2.address, user3.address]);

      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), user2.address)).to.equal(true);
      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), user3.address)).to.equal(true);
    });

    it('Should prevent add spenders if spender is zero address', async () => {
      await expect(
        permitManager.connect(multisigWallet).addSpenders([ethers.ZeroAddress]),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');
    });

    it('Should correctly remove spenders', async () => {
      await permitManager.connect(multisigWallet).removeSpenders([executor1.address, executor2.address]);

      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), executor1.address)).to.equal(false);
      expect(await permitManager.hasRole(await permitManager.SPENDER_ROLE(), executor2.address)).to.equal(false);
    });

    it('Should prevent add/remove spenders if called by non-multisig wallet (not admin)', async () => {
      const adminRole = await permitManager.DEFAULT_ADMIN_ROLE();

      await expect(permitManager.connect(user1).addSpenders([user2.address]))
        .to.be.revertedWithCustomError(permitManager, 'AccessControlUnauthorizedAccount')
        .withArgs(user1.address, adminRole);
      await expect(permitManager.connect(user1).removeSpenders([executor1.address]))
        .to.be.revertedWithCustomError(permitManager, 'AccessControlUnauthorizedAccount')
        .withArgs(user1.address, adminRole);
    });
  });

  describe('Permit Transfer Functionality', () => {
    it('Should correctly handle with two permit', async () => {
      const amountToTransfer = ethers.parseEther('10');

      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, amountToTransfer);

      const balanceReceiverBefore = await erc20Permit.balanceOf(user3.address);
      const balanceOwnerOfTokensBefore = await erc20Permit.balanceOf(user2.address);

      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };
      // execute permit transfer from user2 to user3 by executor1
      await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      const balanceReceiverAfter = await erc20Permit.balanceOf(user3.address);
      const balanceOwnerOfTokensAfter = await erc20Permit.balanceOf(user2.address);

      expect(balanceReceiverAfter).to.equal(balanceReceiverBefore + amountToTransfer);
      expect(balanceOwnerOfTokensAfter).to.equal(balanceOwnerOfTokensBefore - amountToTransfer);
      
      // check allowance of user2 to permitManager
      const allowanceData = await permit2.allowance(user2.address, erc20Permit.target.toString(), await permitManager.getAddress());
      expect(allowanceData.amount).to.equal(0);
    });

    it('Should correctly handle with one permit', async () => {
      await erc20.connect(user2).approve(permit2Addr, ethers.MaxUint256);

      const amountToTransfer = ethers.parseEther('10');
      const permitCallPermit2 = await getPermitSingleSignature(erc20, user2, await permitManager.getAddress(), permit2, amountToTransfer);

      const balanceReceiverBefore = await erc20.balanceOf(user3.address);
      const balanceOwnerOfTokensBefore = await erc20.balanceOf(user2.address);

      const permitTransferParams = {
        token: await erc20.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: new Uint8Array(), // empty since token does not support permit, just image that))
        permit2Data: permitCallPermit2,
      };

      // execute permit transfer from user2 to user3 by executor1
      await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      const balanceReceiverAfter = await erc20.balanceOf(user3.address);
      const balanceOwnerOfTokensAfter = await erc20.balanceOf(user2.address);

      expect(balanceReceiverAfter).to.equal(balanceReceiverBefore + amountToTransfer);
      expect(balanceOwnerOfTokensAfter).to.equal(balanceOwnerOfTokensBefore - amountToTransfer);

      // check allowance of user2 to permitManager
      const allowanceData = await permit2.allowance(user2.address, erc20.target.toString(), await permitManager.getAddress());
      expect(allowanceData.amount).to.equal(0);
    });

    it('Should correctly handle batch permit transfer', async () => {
      const amountToTransfer = ethers.parseEther('10');

      const permitCallTokenFromUser2 = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2FromUser2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, amountToTransfer);
      
      const balanceUser2Before = await erc20Permit.balanceOf(user2.address);
      const balanceUser3Before = await erc20Permit.balanceOf(user3.address);
      const balanceReceiverBefore = await erc20Permit.balanceOf(user4.address);

      const permitTransferParamsFromUser2 = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user4.address,
        amount: amountToTransfer,
        tokenData: permitCallTokenFromUser2,
        permit2Data: permitCallPermit2FromUser2,
      };

      const permitCallTokenFromUser3 = await getSignatureERC20Permit(erc20Permit, user3);
      const permitCallPermit2FromUser3 = await getPermitSingleSignature(erc20Permit, user3, await permitManager.getAddress(), permit2, amountToTransfer);

      const permitTransferParamsFromUser3 = {
        token: await erc20Permit.getAddress(),
        owner: user3.address,
        recipient: user4.address,
        amount: amountToTransfer,
        tokenData: permitCallTokenFromUser3,
        permit2Data: permitCallPermit2FromUser3,
      };

      await permitManager.connect(executor1).executePermitTransferBatch([permitTransferParamsFromUser2, permitTransferParamsFromUser3]);

      const balanceUser2After = await erc20Permit.balanceOf(user2.address);
      const balanceUser3After = await erc20Permit.balanceOf(user3.address);
      const balanceReceiverAfter = await erc20Permit.balanceOf(user4.address);

      expect(balanceUser2After).to.equal(balanceUser2Before - amountToTransfer);
      expect(balanceUser3After).to.equal(balanceUser3Before - amountToTransfer);
      expect(balanceReceiverAfter).to.equal(balanceReceiverBefore + amountToTransfer + amountToTransfer);
    });

    it('Should correctly handle twice without require permit for second time', async () => {
      const allowedAmountToTransfer = ethers.parseEther('2000');
      const amountToTransfer = allowedAmountToTransfer / 2n;

      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, allowedAmountToTransfer);

      const balanceReceiverBefore = await erc20Permit.balanceOf(user3.address);
      const balanceOwnerOfTokensBefore = await erc20Permit.balanceOf(user2.address);

      const firstPermitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };
      // example first execution will be by another contract and require two permits for permitManager
      await permitManager.connect(executor1).executePermitTransfer(firstPermitTransferParams);

      const secondPermitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: new Uint8Array(), // empty 
        permit2Data: new Uint8Array(), // empty
      };
      // example second execution will be by relayer and does not require permits for permitManager
      await permitManager.connect(executor2).executePermitTransfer(secondPermitTransferParams);

      // check allowance of user2 to permitManager
      const allowanceData = await permit2.allowance(user2.address, erc20Permit.target.toString(), await permitManager.getAddress());
      expect(allowanceData.amount).to.equal(0);

      const balanceReceiverAfter = await erc20Permit.balanceOf(user3.address);
      const balanceOwnerOfTokensAfter = await erc20Permit.balanceOf(user2.address);

      expect(balanceReceiverAfter).to.equal(balanceReceiverBefore + allowedAmountToTransfer);
      expect(balanceOwnerOfTokensAfter).to.equal(balanceOwnerOfTokensBefore - allowedAmountToTransfer);
    });

    it('Should correctly handle permit transfer with DAI token', async () => {
      const amountToTransfer = ethers.parseEther('100');

      const permitCallToken = await getSignatureDAIPermit(daiToken, user2);
      const permitCallPermit2 = await getPermitSingleSignature(daiToken, user2, await permitManager.getAddress(), permit2, amountToTransfer);
      
      const balanceReceiverBefore = await daiToken.balanceOf(user3.address);
      const balanceOwnerOfTokensBefore = await daiToken.balanceOf(user2.address);

      const permitTransferParams = {
        token: await daiToken.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };
      // execute permit transfer from user2 to user3 by executor1
      await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      const balanceReceiverAfter = await daiToken.balanceOf(user3.address);
      const balanceOwnerOfTokensAfter = await daiToken.balanceOf(user2.address);

      expect(balanceReceiverAfter).to.equal(balanceReceiverBefore + amountToTransfer);
      expect(balanceOwnerOfTokensAfter).to.equal(balanceOwnerOfTokensBefore - amountToTransfer);
      
      // check allowance of user2 to permitManager
      const allowanceData = await permit2.allowance(user2.address, daiToken.target.toString(), await permitManager.getAddress());
      expect(allowanceData.amount).to.equal(0);
    });

    it('Should correctly skip handle permit if permit already enough', async () => {
      const allowedAmountToTransfer = ethers.parseEther('2000');
      const amountToTransfer = allowedAmountToTransfer / 2n;

      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, allowedAmountToTransfer);

      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };
      await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      const allowanceData = await permit2.allowance(user2.address, erc20Permit.target.toString(), await permitManager.getAddress());
      const allowanceDataToken = await erc20Permit.allowance(user2.address, await permit2.getAddress());

      expect(allowanceData.amount).to.equal(allowedAmountToTransfer - amountToTransfer);
      expect(allowanceDataToken).to.equal(ethers.MaxUint256);

      // do again same transfer with new signature
      const newPermitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const newPermitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, allowedAmountToTransfer);
      permitTransferParams.tokenData = newPermitCallToken;
      permitTransferParams.permit2Data = newPermitCallPermit2;

      await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      const allowanceDataAfter = await permit2.allowance(user2.address, erc20Permit.target.toString(), await permitManager.getAddress());
      const allowanceDataTokenAfter = await erc20Permit.allowance(user2.address, await permit2.getAddress());

      expect(allowanceDataAfter.amount).to.equal(0); // its means that we skip handle permit
      expect(allowanceDataTokenAfter).to.equal(ethers.MaxUint256);
    });

    it('Should correctly skip transfer permit if zero amount', async () => {
      const amountToTransfer = ethers.parseEther('10');

      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, amountToTransfer);
      
      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: 0, // zero amount
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };

      const tx = await permitManager.connect(executor1).executePermitTransfer(permitTransferParams);

      // try to get transfer event from tx
      const nameToken = await erc20Permit.getAddress();
      const receipt = await tx.wait();
      const transferEvents = receipt?.logs.filter(
        (log) => log.address === nameToken
      );

      const hasValidTransfer = transferEvents?.some((log) => {
        const parsedLog = erc20Permit.interface.parseLog(log);
        return parsedLog?.name === "Transfer" && parsedLog?.args.value > 0;
      });

      expect(hasValidTransfer).to.be.false;
    });
    
    it('Should prevent execute permit transfer with fake or not correct signature', async () => {
      const amountToTransfer = ethers.parseEther('10');
      
      const fakeSignature = ethers.randomBytes(100);

      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: fakeSignature,
        permit2Data: fakeSignature,
      };

      await expect(
        permitManager.connect(executor1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'PermitFailed');

      const notCorrectSignature = ethers.randomBytes(32); // short signature 

      permitTransferParams.permit2Data = notCorrectSignature;
      permitTransferParams.tokenData = notCorrectSignature;

      await expect(
        permitManager.connect(executor1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'PermitLengthError');
    });

    it('Should prevent execute permit transfer if zero address', async () => {
      const amountToTransfer = ethers.parseEther('10');
      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, amountToTransfer);

      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };

      permitTransferParams.recipient = ethers.ZeroAddress;

      await expect(
        permitManager.connect(executor1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');

      permitTransferParams.recipient = user3.address;
      permitTransferParams.owner = ethers.ZeroAddress;

      await expect(
        permitManager.connect(executor1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');

      permitTransferParams.owner = user2.address;
      permitTransferParams.token = ethers.ZeroAddress;

      await expect(
        permitManager.connect(executor1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'ZeroAddress');
    });

    it('Should prevent execute permit transfer by non-spender', async () => {
      const amountToTransfer = ethers.parseEther('10');
      const permitCallToken = await getSignatureERC20Permit(erc20Permit, user2);
      const permitCallPermit2 = await getPermitSingleSignature(erc20Permit, user2, await permitManager.getAddress(), permit2, amountToTransfer);
      
      const permitTransferParams = {
        token: await erc20Permit.getAddress(),
        owner: user2.address,
        recipient: user3.address,
        amount: amountToTransfer,
        tokenData: permitCallToken,
        permit2Data: permitCallPermit2,
      };

      await expect(
        permitManager.connect(user1).executePermitTransfer(permitTransferParams),
      ).to.be.revertedWithCustomError(permitManager, 'AccessControlUnauthorizedAccount')
        .withArgs(user1.address, await permitManager.SPENDER_ROLE());

      await expect(
        permitManager.connect(user1).executePermitTransferBatch([permitTransferParams]),
      ).to.be.revertedWithCustomError(permitManager, 'AccessControlUnauthorizedAccount')
        .withArgs(user2.address, await permitManager.SPENDER_ROLE());
    });
  });
});
