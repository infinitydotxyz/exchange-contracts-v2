![Infinity](./static/infinitySmallerLogo.png)

# Infinity Exchange Contracts V2

These contracts will be used in production. They are gas optimized and a subset of our Certik audited [v1 contracts](https://github.com/infinitydotxyz/exchange-contracts-v1). These are also reviewed by an independent auditor that helped us patch a few vulnerabilities and helped us optimize them for gas efficiency. We tested a version of these contracts with ERC721 and ERC20 transfer functions written in assembly for gas optimization. We've found that the gains are not significant (esp when compared to gas savings offered by batching orders) and decided to favor code readability over these optimizations. We hope to write them in [Vyper](https://vyper.readthedocs.io/en/stable/) with the help of Vyper community in the future. Contributions welcome.

# Features

Together with our off chain sniping engine, the contracts support a host of features:

- Auto sniping
- Limit orders
- Dutch auctions and reverse dutch auctions
- Batched operations for a fluid UX and gas efficiency
  - Listings
  - Offers
  - Buys
  - Sells
  - Transfers
- Set based offers and listings like collection wide offers, multi collection wide offers, any collection offers and 'm of n' offers/listings
  - Example 1: User has a budget of 10 ETH. They wish to acquire any one NFT from either Goblintown, Moonbirds or Doodles. They can place an offer that specifies these criteria. As soon as a match is found from _any_ of these collections, order will be executed automatically.
  - Example 2: User has a budget of 10 ETH. They wish to acquire any one NFT from Goblintown NFTs with token ids 10, 20, 30, 40 and 50. They can place an offer that specifies these criteria. As soon as a match is found from _any_ of these token ids, order will be executed automatically.

# Modular architecture

Contracts are designed to be extensible. The main contract is `FlowExchange.sol` which is used for taking approvals for spending NFTs and transaction currencies like `WETH`. It also has transfer functions that move assets between addresses. The contract is extensible via `Complications`. Complications are used to extend the functionality of the main contract to support different order types. We currently have one complication - `FlowOrderBookComplication` that supports the order types above. More `complications` are in the works.

- [FlowExchange.sol](./contracts/core/FlowExchange.sol) - main contract that stores state and has user approvals for spending assets
- [FlowOrderBookComplication.sol](./contracts/core/FlowOrderBookComplication.sol) - our first complication that helps execute the order types listed above

![Exchange graph](./static/contractGraphExchange.svg?sanitize-true)
![OB Complication graph](./static/contractGraphOBComplication.svg?sanitize-true)

# Gas costs

Our contracts are the most efficient NFT exchange contracts in the world. Users save upto 60% gas compared to Opensea and Looksrare. We achieve these gas savings via contract supported batch execution.

Match orders gas table (auto sniped by our matching engine):

Min gas is for autosniping single NFTs and max gas is for multiple NFTs (10 in the highest case).

![Match_Orders](./static/matchOrdersGas.png)

Take orders gas table (user initiated):

The min gas of 121176 units is for exchanging one NFT (33% less gas than Opensea). The max gas of 764129 is for exchanging a batch of 10 NFTs making the per NFT exchange gas cost a mere 76412.9 (60% less gas than performing 10 individual NFT exchanges on Opensea)

![Take_Orders](./static/takeOrdersGas.png)

# Tests

The contracts have been extensively tested. All tests can be found in the `test` folder organized into different files. Tests can be run individually with `npx hardhat test --grep <test name>` or all at once with `./runTests.sh`

# Audits

- [Immunefi bug bounty](https://immunefi.com/bounty/infinity/)
- [Code4Arena audit contest](https://code4rena.com/contests/2022-06-infinity-nft-marketplace-contest)

# Links

[App](https://pixelpack.io)

[Twitter](https://twitter.com/pixelpackio)

[Discord](https://discord.gg/invite/pixelpackio)

[Github](https://github.com/infinitydotxyz)
