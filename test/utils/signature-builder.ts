import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { TrustedForwarder } from '../../typechain-types';

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
