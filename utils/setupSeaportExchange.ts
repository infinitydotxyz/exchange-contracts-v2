import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deployContract } from "../tasks/utils";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { Contract, constants, Wallet } from "ethers";
import { ConduitControllerInterface, ImmutableCreate2FactoryInterface } from "../typechain-types";
import { getCreate2Address, keccak256 } from "ethers/lib/utils";
import { expect } from "chai";

export type SeaportExchangeConfig = {
  contract: Contract;
  owner: SignerWithAddress;
  conduitController: string;
};

// export const conduitFixture = async (
//   getContractFactory: HardhatEthersHelpers["getContractFactory"],
//   owner: SignerWithAddress
// ) => {
//   let conduitController: ConduitControllerInterface;
//   let conduitImplementation: any;
//   if (process.env.REFERENCE) {
//     conduitImplementation = await getContractFactory("ReferenceConduit");
//     conduitController = (await deployContract(
//       "ConduitController",
//       await getContractFactory("ConduitController"),
//       owner
//     )) as ConduitControllerInterface;
//   } else {
//     conduitImplementation = await getContractFactory("Conduit");
//     conduitController = (await deployContract(
//       "ConduitController",
//       await getContractFactory("ConduitController"),
//       owner
//     )) as any;

//     // // Deploy conduit controller through efficient create2 factory
//     // const conduitControllerFactory = await getContractFactory("ConduitController");

//     // const conduitControllerAddress = await create2Factory.findCreate2Address(
//     //   deployConstants.CONDUIT_CONTROLLER_CREATION_SALT,
//     //   conduitControllerFactory.bytecode
//     // );

//     // let { gasLimit } = await ethers.provider.getBlock("latest");

//     // if ((hre as any).__SOLIDITY_COVERAGE_RUNNING) {
//     //   gasLimit = ethers.BigNumber.from(300_000_000);
//     // }
//     // await create2Factory.safeCreate2(
//     //   deployConstants.CONDUIT_CONTROLLER_CREATION_SALT,
//     //   conduitControllerFactory.bytecode,
//     //   {
//     //     gasLimit
//     //   }
//     // );

//     // conduitController = (await ethers.getContractAt(
//     //   "ConduitController",
//     //   conduitControllerAddress,
//     //   owner
//     // )) as any;
//   }
//   const conduitCodeHash = keccak256(conduitImplementation.bytecode);

//   const conduitKeyOne = `${owner.address}000000000000000000000000`;

//   await conduitController.createConduit(conduitKeyOne, owner.address);

//   const { conduit: conduitOneAddress, exists } = await conduitController.getConduit(conduitKeyOne);

//   // eslint-disable-next-line no-unused-expressions
//   expect(exists).to.be.true;

//   const conduitOne = conduitImplementation.attach(conduitOneAddress);

//   const getTransferSender = (account: string, conduitKey: string) => {
//     if (!conduitKey || conduitKey === constants.HashZero) {
//       return account;
//     }
//     return getCreate2Address(conduitController.address, conduitKey, conduitCodeHash);
//   };

//   // const deployNewConduit = async (owner: Wallet, conduitKey?: string) => {
//   //   // Create a conduit key with a random salt
//   //   const assignedConduitKey = conduitKey || owner.address + randomHex(12).slice(2);

//   //   const { conduit: tempConduitAddress } = await conduitController.getConduit(assignedConduitKey);

//   //   await whileImpersonating(owner.address, ethers.provider, async () => {
//   //     await expect(
//   //       conduitController.connect(owner).createConduit(assignedConduitKey, constants.AddressZero)
//   //     ).to.be.revertedWith("InvalidInitialOwner");

//   //     await conduitController.connect(owner).createConduit(assignedConduitKey, owner.address);
//   //   });

//   //   const tempConduit = conduitImplementation.attach(tempConduitAddress);
//   //   return tempConduit;
//   // };

//   return {
//     conduitController,
//     conduitImplementation,
//     conduitCodeHash,
//     conduitKeyOne,
//     conduitOne,
//     getTransferSender
//     // deployNewConduit
//   };
// };

export async function setupSeaportExchange(
  getContractFactory: HardhatEthersHelpers["getContractFactory"],
  owner: SignerWithAddress
) {
  const conduitController = await deployContract(
    "ConduitController",
    await getContractFactory("ConduitController"),
    owner
  );

  const conduitImplementation = await getContractFactory("Conduit");

  const conduitKeyOne = `${owner.address}000000000000000000000000`;

  await conduitController.createConduit(conduitKeyOne, owner.address);

  const { conduit: conduitOneAddress, exists } = await conduitController.getConduit(conduitKeyOne);

  // eslint-disable-next-line no-unused-expressions
  expect(exists).to.be.true;

  const conduitOne = conduitImplementation.attach(conduitOneAddress);

  const seaportExchange = await deployContract(
    "Seaport",
    await getContractFactory("Seaport"),
    owner,
    [conduitController.address]
  );

  await conduitController
    .connect(owner)
    .updateChannel(conduitOne.address, seaportExchange.address, true);

  return {
    contract: seaportExchange,
    owner,
    conduitController: conduitController.address
  };
}
