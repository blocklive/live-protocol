import { BigNumber } from "ethers";
import { ethers } from "hardhat";
const { AddressZero } = ethers.constants;

export const eventData = {
  ticketBase: [
    {
      key: "premium",
      displayName: "premium",
      maxSupply: 2000,
      active: true,
      locked: false,
    },
  ],
  ticketIds: ["premium"],
  ticketNames: ["premium"],
  amounts: [2000],
  uri: "https://blocklive.io/metadata/collection",
  details: {
    _name: "ATX DAO Native 8/8/22",
    _description:
      "All you can crytpo, free drinks with this NFT. Hang out with the ATX DAO.",
    _location: "Native Bar",
    _start: 1662683400,
    _end: 1662690600,
    _host: "ATX DAO",
    _thumbnail:
      "https://worldtop.mypinata.cloud/ipfs/QmbnfRbGnakbaBvXXQvpiLEydTQVvhuG6qALmWHsXnXBDW",
  },
};

export const priceData = {
  priceBase: [
    {
      tokenType: "premium",
      price: BigNumber.from("2000000"), // USD 6 decimals (2 USD)
      currency: "usdc",
      currencyAddress: AddressZero,
    },
  ],
  tickets: ["premium"],
  costs: [
    BigNumber.from("2000000"), // USD 6 decimals (2 USD)
  ],
  currencies: ["usdc"],
};
