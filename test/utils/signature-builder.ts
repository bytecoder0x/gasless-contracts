import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { Signature, TypedDataDomain, Wallet } from 'ethers';
import { AllowanceTransfer } from '@uniswap/permit2-sdk';
import { TrustedForwarder, IPermit2, MockERC20, MockDaiPermit, MockERC20Permit, ERC20 } from '../../typechain-types';

export const getSignatureForwardRequest = async (
  forwarder: TrustedForwarder,
  from: HardhatEthersSigner,
  to: string,
  data: string,
) => {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const nonce = await forwarder.nonces(from.address);

  const domain = {
    name: 'TrustedForwarder',
    version: '1',
    chainId: chainId,
    verifyingContract: forwarder.target.toString(),
  };

  const types = {
    ForwardRequest: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint48' },
      { name: 'data', type: 'bytes' },
    ],
  };

  const request = {
    from: from.address,
    to,
    value: 0n,
    gas: 200000n,
    deadline,
    data,
  };

  const signature = await from.signTypedData(domain, types, { ...request, nonce });

  return { ...request, signature };
};

export const getSignatureERC20Permit = async (
  erc20Permit: MockERC20Permit,
  from: HardhatEthersSigner,
  permit2Addr: string,
) => {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const nonce = await erc20Permit.nonces(from);

  const domain = {
    name: await erc20Permit.name(),
    version: '1',
    chainId: chainId,
    verifyingContract: erc20Permit.target.toString(),
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const values = {
    owner: from.address,
    spender: permit2Addr,
    value: ethers.MaxUint256,
    nonce,
    deadline,
  };

  const signature = await from.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(signature);

  const permitCallToken = cutSelector(
    erc20Permit.interface.encodeFunctionData('permit', [
      from.address,
      permit2Addr,
      ethers.MaxUint256,
      deadline,
      v,
      r,
      s,
    ]),
  );

  return permitCallToken;
};

export const getSignatureDAIPermit = async (daiToken: MockDaiPermit, from: HardhatEthersSigner, permit2Addr: string) => {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const nonce = await daiToken.nonces(from);

  const domain = {
    name: await daiToken.name(),
    version: await daiToken.version(),
    chainId: chainId,
    verifyingContract: daiToken.target.toString(),
  };

  const types = {
    Permit: [
      { name: 'holder', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'allowed', type: 'bool' },
    ],
  };

  const values = {
    holder: from.address,
    spender: permit2Addr,
    nonce,
    expiry: deadline,
    allowed: true,
  };

  const signature = await from.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(signature);

  const permitCallToken = cutSelector(
    daiToken.interface.encodeFunctionData('permit', [
      from.address,
      permit2Addr,
      nonce,
      deadline,
      true,
      v,
      r,
      s,
    ]),
  );

  return permitCallToken;
};

export const getPermitSingleSignature = async (
  erc20: ERC20 |MockERC20 | MockDaiPermit | MockERC20Permit,
  from: HardhatEthersSigner | Wallet,
  spender: string,
  permit2: IPermit2,
  amount: bigint,
) => {
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const allowanceData = await permit2.allowance(from.address, erc20.target.toString(), spender);
  const details = {
    token: erc20.target.toString(),
    amount: amount,
    expiration: deadline,
    nonce: allowanceData.nonce,
  };

  const permitSingle = {
    details,
    spender: spender,
    sigDeadline: deadline,
  };

  const data = AllowanceTransfer.getPermitData(permitSingle, permit2.target.toString(), Number(chainId));
  const sig = Signature.from(
    await from.signTypedData(data.domain as TypedDataDomain, data.types, data.values),
  );

  const permitCallPermit2 = cutSelector(
    permit2.interface.encodeFunctionData('permit', [
      from.address,
      permitSingle,
      sig.r + trim0x(sig.yParityAndS),
    ]),
  );

  return permitCallPermit2;
};

function cutSelector(data: string): string {
  const hexPrefix = '0x';
  return hexPrefix + data.substring(hexPrefix.length + 8);
}

function trim0x(bigNumber: bigint | string): string {
  const s = bigNumber.toString();
  if (s.startsWith('0x')) {
    return s.substring(2);
  }
  return s;
}
