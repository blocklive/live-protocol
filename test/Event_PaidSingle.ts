import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { eventData, priceData } from "./data_paidSingle";
const { AddressZero } = ethers.constants;

describe("Event Paid - Single", function () {
  async function deployFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    const mockToken = await MockTokenFactory.deploy(
      "USD COIN",
      "USDC",
      0,
      owner.address
    );

    const Event = await ethers.getContractFactory("Event");

    const event = await Event.deploy(
      owner.address,
      eventData.uri,
      eventData.details._name,
      [],
      [],
      [],
      [],
      []
    );

    priceData.priceBase[0].currencyAddress = mockToken.address;
    await event.registerTokenType(eventData.ticketBase);
    await event.registerCurrency(priceData.priceBase);

    // await event.registerTickets(
    //   eventData.ticketIds,
    //   eventData.ticketNames,
    //   eventData.amounts
    // );

    // await event.registerCurrency(
    //   priceData.tickets,
    //   priceData.costs,
    //   priceData.currencies,
    //   [mockToken.address]
    // );

    return { event, owner, otherAccount, mockToken };
  }

  describe("Deployment", function () {
    it("Should set up ticket types", async function () {
      const { event } = await loadFixture(deployFixture);

      // Amount of tickets available for each type is set.
      expect((await event.tokenAmounts("premium")).toNumber()).to.equal(
        eventData.amounts[0]
      );
    });

    it("Should prevent buying a native premium ticket for free", async function () {
      const { event, otherAccount } = await loadFixture(deployFixture);

      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "premium",
            1,
            otherAccount.address,
            "native"
          )
      ).to.be.revertedWith("Type not registered");

      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(0);
    });

    it("Should let us buy with usdc", async function () {
      const { event, owner, mockToken, otherAccount } = await loadFixture(
        deployFixture
      );

      // Give owner exact # of tokens needed for ticket price.
      await mockToken.mint(otherAccount.address, 2000000);

      // Approve exact # of tokens needed for ticket price.
      await mockToken.connect(otherAccount).approve(event.address, 2000000);

      // Buy 1 ticket of type 0 (usdc) with enough usdc
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "premium",
          1,
          otherAccount.address,
          "usdc"
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);

      // Buy another ticket of type 2 (usdc), not enough approved, should fail.
      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "premium",
            1,
            otherAccount.address,
            "usdc"
          )
      ).to.be.revertedWith("Not enough bal");

      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);
    });
  });
});
