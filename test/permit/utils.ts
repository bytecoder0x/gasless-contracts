import { TypedDataDomain } from 'ethers';
import { ethers } from 'hardhat';
import { IPermit2, MockERC20, MockERC20Permit } from '../../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { Signature } from 'ethers';
import { AllowanceTransfer } from '@uniswap/permit2-sdk';

const permit2Addr = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const getSignatureERC20Permit = async (
  erc20Permit: MockERC20Permit,
  from: HardhatEthersSigner,
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

export const getPermitSingleSignature = async (
  erc20: MockERC20 | MockERC20Permit,
  from: HardhatEthersSigner,
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

  const data = AllowanceTransfer.getPermitData(permitSingle, permit2Addr, Number(chainId));
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

export function cutSelector(data: string): string {
  const hexPrefix = '0x';
  return hexPrefix + data.substring(hexPrefix.length + 8);
}

export function trim0x(bigNumber: bigint | string): string {
  const s = bigNumber.toString();
  if (s.startsWith('0x')) {
    return s.substring(2);
  }
  return s;
}
