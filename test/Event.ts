import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { eventData, priceData } from "./data";
const hre = require("hardhat");

const { AddressZero } = ethers.constants;

describe("Event", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
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

    priceData.priceBase[2].currencyAddress = mockToken.address;
    priceData.priceBase[4].currencyAddress = mockToken.address;
    await event.registerTokenType(eventData.ticketBase);
    await event.registerCurrency(priceData.priceBase);

    return { event, owner, otherAccount, mockToken };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { event, owner } = await loadFixture(deployFixture);

      const OWNER_ROLE = await event.OWNER_ROLE();
      expect(await event.hasRole(OWNER_ROLE, owner.address)).to.equal(true);
    });

    it("Should set up ticket types", async function () {
      const { event } = await loadFixture(deployFixture);

      // Amount of tickets available for each type is set.
      expect((await event.tokenAmounts("free")).toNumber()).to.equal(
        eventData.amounts[0]
      );
      expect((await event.tokenAmounts("vip")).toNumber()).to.equal(
        eventData.amounts[1]
      );

      expect((await event.tokensPurchased("free")).toNumber()).to.equal(0);
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(0);

      // Latest tokens are set up with proper ids
      expect(await event.tokenIdCounter()).to.equal(0);
      expect(await event.tokenIdCounter()).to.equal(0);
    });

    it("Should not allow us to register a currency until we register a ticket", async function () {
      const { event, mockToken } = await loadFixture(deployFixture);

      const newCurrency = {
        tokenType: "special",
        price: 0,
        currency: "sol",
        currencyAddress: mockToken.address,
      };
      await expect(
        // event.registerCurrency(["special"], [0], ["sol"], [mockToken.address])
        event.registerCurrency([newCurrency])
      ).to.be.revertedWith("Token key not registered");
    });

    it("Should not allow us to buy when not active", async function () {
      const { event, owner } = await loadFixture(deployFixture);

      // Set inactive, fail to buy ticket
      await event.setActive(false);
      await expect(
        event["buyToken(string,uint256,address,string)"](
          "free",
          1,
          owner.address,
          "native"
        )
      ).to.be.revertedWith("Not active");
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(0);

      // Set active, succeed to buy ticket
      await event.setActive(true);
      await event["buyToken(string,uint256,address,string)"](
        "free",
        1,
        owner.address,
        "native"
      );
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);
    });

    it("Should let us buy tickets", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      // Buy a ticket, count increases
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

      // Buy 1 more
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );
      expect(await event.tokenIdCounter()).to.equal(2);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(2);

      // Buy 1 more from the second ticket type without enough eth
      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "vip",
            1,
            otherAccount.address,
            "native",
            {
              value: ethers.utils.parseEther("0.99"),
            }
          )
      ).to.be.revertedWith("Not enough bal");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(0);

      // Buy 1 more from the second ticket type with enough eth
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "vip",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("1"),
          }
        );
      expect(await event.tokenIdCounter()).to.equal(3);
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);

      // Check to see if the contract has the eth sent
      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("1")
      );

      // Buy more from the second ticket type with enough eth
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "vip",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("1"),
          }
        );

      expect(await event.tokenIdCounter()).to.equal(4);
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(2);

      // Checked the owned
      expect(await event.owned(0)).to.be.equal(otherAccount.address);
      expect(await event.owned(3)).to.be.equal(otherAccount.address);

      // Ticket type should be visible for tokens
      expect(await event.tokenType(0)).to.be.equal("free");
      expect(await event.tokenType(3)).to.be.equal("vip");
    });

    it("Should let us buy multiple native tickets", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      // Buy 1 ticket to start
      const tokenTypes = ["free"]; // string[]
      const amounts = [1]; // uint256[]
      const receivers = [otherAccount.address]; // address[]
      const currencies = ["native"]; // string[]
      const payers = [otherAccount.address]; // address[]
      const discountCodes = [""]; // string[]
      const merkleProofs = [[]]; // bytes32[][]
      const signatures = [[]]; // bytes[]

      const funcSignature =
        "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])";
      const tx = await event
        .connect(otherAccount)
        .functions[funcSignature](
          tokenTypes,
          amounts,
          receivers,
          currencies,
          payers,
          discountCodes,
          merkleProofs,
          signatures
        );
      await tx.wait();

      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

      // Buy 5 more tickets of different types
      const buyTwoTx = await event
        .connect(otherAccount)
        .functions[
          "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])"
        ](
          ["free", "free", "vip", "vip", "vip"],
          [1, 1, 1, 1, 1],
          [
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
          ],
          ["native", "native", "native", "native", "native"],
          [
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
            otherAccount.address,
          ],
          ["", "", "", "", ""],
          [[], [], [], [], []],
          [[], [], [], [], []],
          {
            value: ethers.utils.parseEther("3"),
          }
        );
      const buyTwoTxRecipt = await buyTwoTx.wait();
      const mintedTokens: number[] = [];
      buyTwoTxRecipt?.events?.forEach((tsEvent) => {
        if (tsEvent.event === "TransferSingle") {
          mintedTokens.push(tsEvent.args?.id);
        }
      });

      // Expect 5 tokens to be minted with ids 1-5
      expect(mintedTokens?.length).to.equal(5);
      expect(mintedTokens[0]).to.equal(1);
      expect(mintedTokens[1]).to.equal(2);
      expect(mintedTokens[2]).to.equal(3);
      expect(mintedTokens[3]).to.equal(4);
      expect(mintedTokens[4]).to.equal(5);

      // Expect token types in order of minting array
      expect(await event.tokenType(1)).to.be.equal("free");
      expect(await event.tokenType(2)).to.be.equal("free");
      expect(await event.tokenType(3)).to.be.equal("vip");
      expect(await event.tokenType(4)).to.be.equal("vip");
      expect(await event.tokenType(5)).to.be.equal("vip");

      expect(await event.tokenIdCounter()).to.equal(6);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(3);
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(3);

      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("3")
      );

      // Buy 3 more VIP, should fail with only enough price for 2
      await expect(
        event
          .connect(otherAccount)
          .functions[
            "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])"
          ](
            ["vip", "vip", "vip"],
            [1, 1, 1],
            [otherAccount.address, otherAccount.address, otherAccount.address],
            ["native", "native", "native"],
            [otherAccount.address, otherAccount.address, otherAccount.address],
            ["", "", ""],
            [[], [], []],
            [[], [], []],
            {
              value: ethers.utils.parseEther("2"),
            }
          )
      ).to.be.revertedWith("Not enough bal for batch");

      // // Buy 50 tickets
      const tix50 = Array(50).fill(null);
      await event
        .connect(otherAccount)
        .functions[
          "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])"
        ](
          tix50.map(() => "free"),
          tix50.map(() => 1),
          tix50.map(() => otherAccount.address),
          tix50.map(() => "native"),
          tix50.map(() => otherAccount.address),
          tix50.map(() => ""),
          tix50.map(() => []),
          tix50.map(() => [])
        );

      expect(await event.tokenIdCounter()).to.equal(56);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(53);
    });

    it("Should let us buy multiple usdc tickets", async function () {
      const { event, owner, otherAccount, mockToken } = await loadFixture(
        deployFixture
      );

      // Buy 3 Premium tickets with USDC
      // Give buyer exact # of tokens needed for ticket price.
      await mockToken.mint(otherAccount.address, 6000000);
      // Approve exact # of tokens needed for ticket price.
      await mockToken.connect(otherAccount).approve(event.address, 6000000);
      await event
        .connect(otherAccount)
        .functions[
          "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])"
        ](
          ["premium", "premium", "premium"],
          [1, 1, 1],
          [otherAccount.address, otherAccount.address, otherAccount.address],
          ["usdc", "usdc", "usdc"],
          [otherAccount.address, otherAccount.address, otherAccount.address],
          ["", "", ""],
          [[], [], []],
          [[], [], []]
        );

      expect(await event.tokenIdCounter()).to.equal(3);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(3);

      // Give buyer only enough # of tokens needed for 2 /3 tickets.
      await mockToken.mint(otherAccount.address, 4000000);
      await mockToken.connect(otherAccount).approve(event.address, 4000000);
      await expect(
        event
          .connect(otherAccount)
          .functions[
            "buyToken(string[],uint256[],address[],string[],address[],string[],bytes32[][],bytes[])"
          ](
            ["premium", "premium", "premium"],
            [1, 1, 1],
            [otherAccount.address, otherAccount.address, otherAccount.address],
            ["usdc", "usdc", "usdc"],
            [otherAccount.address, otherAccount.address, otherAccount.address],
            ["", "", ""],
            [[], [], []],
            [[], [], []]
          )
      ).to.be.revertedWith("Not enough bal");

      expect(await event.tokenIdCounter()).to.equal(3);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(3);
    });

    it("Should let us change ticket price", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      // Buy 1 ticket with enough ETH
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("1"),
          }
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

      const newCurrency = {
        tokenType: "free",
        price: ethers.utils.parseEther("2"),
        currency: "native",
        currencyAddress: ethers.constants.AddressZero,
      };
      await event.registerCurrency([newCurrency]);

      // Buy another ticket with same 1 ETH, should fail
      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "free",
            1,
            otherAccount.address,
            "native",
            {
              value: ethers.utils.parseEther("1"),
            }
          )
      ).to.be.revertedWith("Not enough bal");
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

      // Buy another ticket with enough ETH
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("2"),
          }
        );
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(2);
    });

    it("Should let an owner buy without any eth", async function () {
      const { event, owner, mockToken, otherAccount } = await loadFixture(
        deployFixture
      );

      await event["buyToken(string,uint256,address,string)"](
        "vip",
        1,
        otherAccount.address,
        "native"
      );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);
    });

    it("Should let an owner buy without any USDC", async function () {
      const { event, owner, mockToken } = await loadFixture(deployFixture);

      // NO tokens needed.
      // No approval on token needed.

      // Buy 1 ticket of type 2 (usdc) with enough usdc
      await event["buyToken(string,uint256,address,string)"](
        "premium",
        1,
        owner.address,
        "usdc"
      );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);

      expect(await mockToken.balanceOf(owner.address)).to.equal(0);
    });

    it("Should let a user buy with USDC", async function () {
      const { event, mockToken, otherAccount } = await loadFixture(
        deployFixture
      );

      // Give buyer exact # of tokens needed for ticket price.
      await mockToken.mint(otherAccount.address, 2000000);

      // Approve exact # of tokens needed for ticket price.
      await mockToken.connect(otherAccount).approve(event.address, 2000000);

      // Buy 1 ticket of type 2 (usdc) with enough usdc
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

      expect(await event.contractBalances()).to.equal(2000000);

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

    it("Should prevent buying when not enough usdc has been allowed for amount", async function () {
      const { event, owner, mockToken, otherAccount } = await loadFixture(
        deployFixture
      );

      // Give owner exact # of tokens needed for 1 ticket price.
      await mockToken.mint(otherAccount.address, 2000000);

      // Approve exact # of tokens needed for ticket price.
      await mockToken.connect(otherAccount).approve(event.address, 2000000);

      // Buy 2 ticket of type 2 (usdc) with enough usdc
      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "premium",
            2,
            otherAccount.address,
            "usdc"
          )
      ).to.be.reverted;

      expect(await event.tokenIdCounter()).to.equal(0);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(0);
    });

    it("Should prevent buying when currency isnt registered for a ticket type", async function () {
      const { event, owner, mockToken, otherAccount } = await loadFixture(
        deployFixture
      );

      // Give owner exact # of tokens needed for ticket price.
      await mockToken.mint(otherAccount.address, 2000000);

      // Approve exact # of tokens needed for ticket price.
      await mockToken.connect(otherAccount).approve(event.address, 2000000);

      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "vip",
            1,
            otherAccount.address,
            "usdc"
          )
      ).to.be.revertedWith("Type not registered");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(0);
    });

    it("Should prevent buying beyond the order limit", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "free",
            6,
            otherAccount.address,
            "native"
          )
      ).to.be.revertedWith("Exceeds limit");

      expect((await event.tokensPurchased("free")).toNumber()).to.equal(0);

      // Set limit lower, fail to buy ticket
      await event.setLimit(2);

      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "free",
            3,
            otherAccount.address,
            "native"
          )
      ).to.be.revertedWith("Exceeds limit");
    });

    it("Should prevent buying when ticket is disabled", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      // Set inactive, fail to buy ticket
      // await event.setTokenActive("free", false);
      const ticketInactive = {
        key: "free",
        displayName: "free",
        maxSupply: 100,
        active: false,
        locked: false,
      };
      await event.registerTokenType([ticketInactive]);

      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "free",
            1,
            otherAccount.address,
            "native"
          )
      ).to.be.revertedWith("Token type is not active");
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(0);

      const ticketActive = {
        key: "free",
        displayName: "free",
        maxSupply: 100,
        active: true,
        locked: false,
      };
      await event.registerTokenType([ticketActive]);

      // Set active, succeed to buy ticket
      // await event.setTokenActive("free", true);

      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );
      expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);
    });

    it("Should allow us to set and revoke a role", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      const OWNER_ROLE = await event.OWNER_ROLE();
      // Non owner cannot set active.
      await expect(event.connect(otherAccount).setActive(false)).to.be.reverted;
      expect(await event.active()).to.be.true;

      // Make owner, now can set active.
      await event.setRole(otherAccount.address, OWNER_ROLE);
      await event.connect(otherAccount).setActive(false);
      expect(await event.active()).to.be.false;
    });

    // it("Should allow us to update supply", async function () {
    //   const { event, owner, otherAccount } = await loadFixture(deployFixture);

    //   // Open up limit
    //   await event.setLimit(10000);

    //   // Fail to buy over the max supply (100)
    //   await expect(
    //     event.connect(otherAccount)["buyToken(string,uint256,address,string)"](
    //       "free",
    //       // 101,
    //       1,
    //       otherAccount.address,
    //       "native"
    //     )
    //   ).to.be.reverted;
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(0);

    //   // Successfully buy all of supply
    //   await event
    //     .connect(otherAccount)
    //     ["buyToken(string,uint256,address,string)"](
    //       "free",
    //       1,
    //       otherAccount.address,
    //       "native"
    //     );
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(100);

    //   // Fail to buy 1 over the max supply (100)
    //   await expect(
    //     event
    //       .connect(otherAccount)
    //       ["buyToken(string,uint256,address,string)"](
    //         "free",
    //         1,
    //         otherAccount.address,
    //         "native"
    //       )
    //   ).to.be.reverted;
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(100);

    //   const tokenSupplyUpdate = {
    //     key: "free",
    //     displayName: "free",
    //     maxSupply: 110,
    //     active: true,
    //     locked: false,
    //   };
    //   await event.registerTokenType([tokenSupplyUpdate]);

    //   // await event.setTicketSupply("free", 110);

    //   // Succeed to buy 1 with new max supply (110)
    //   await event
    //     .connect(otherAccount)
    //     ["buyToken(string,uint256,address,string)"](
    //       "free",
    //       1,
    //       otherAccount.address,
    //       "native"
    //     );
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(101);

    //   // Fail to buy over the new max supply (110)
    //   await expect(
    //     event
    //       .connect(otherAccount)
    //       ["buyToken(string,uint256,address,string)"](
    //         "free",
    //         10,
    //         otherAccount.address,
    //         "native"
    //       )
    //   ).to.be.reverted;
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(101);
    // });

    // it("Should allow us to update supply", async function () {
    //   const { event, otherAccount } = await loadFixture(deployFixture);

    //   // Open up limit on all tickets
    //   await event.setLimit(10000);

    //   // Buy 1 ticket successfully
    //   await event
    //     .connect(otherAccount)
    //     ["buyToken(string,uint256,address,string)"](
    //       "free",
    //       1,
    //       otherAccount.address,
    //       "native"
    //     );
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

    //   // Set 3 ticket total supply
    //   await event.setTotalMaxSupply(20);

    //   // Fail to buy over the max supply (20)
    //   await expect(
    //     event
    //       .connect(otherAccount)
    //       ["buyToken(string,uint256,address,string)"](
    //         "free",
    //         20,
    //         otherAccount.address,
    //         "native"
    //       )
    //   ).to.be.reverted;
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(1);

    //   // Successfully buy within supply range
    //   await event
    //     .connect(otherAccount)
    //     ["buyToken(string,uint256,address,string)"](
    //       "free",
    //       19,
    //       otherAccount.address,
    //       "native"
    //     );
    //   expect((await event.tokensPurchased("free")).toNumber()).to.equal(20);
    // });

    it("Should prevent transfer by account not holding the nft, but allow owner revoke transfer", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      // Get 2 tickets
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );

      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );

      expect((await event.tokensPurchased("free")).toNumber()).to.equal(2);
      let balToken0 = await event.balanceOf(otherAccount.address, 0);
      let balToken1 = await event.balanceOf(otherAccount.address, 1);
      expect(balToken0.toNumber()).to.equal(1);
      expect(balToken1.toNumber()).to.equal(1);

      // Transfer 1 away
      await event
        .connect(otherAccount)
        .safeTransferFrom(otherAccount.address, owner.address, 0, 1, "0x");

      balToken0 = await event.balanceOf(otherAccount.address, 0);
      balToken1 = await event.balanceOf(otherAccount.address, 1);
      expect(balToken0.toNumber()).to.equal(0);
      expect(balToken1.toNumber()).to.equal(1);

      // Try to transfer as owner, fail
      await expect(
        event.safeTransferFrom(otherAccount.address, owner.address, 1, 1, "0x")
      ).to.be.reverted;

      // Transfer as owner
      await event.rescueToken(otherAccount.address, owner.address, 1, 1, "0x");
      balToken0 = await event.balanceOf(otherAccount.address, 0);
      balToken1 = await event.balanceOf(otherAccount.address, 1);
      expect(balToken0.toNumber()).to.equal(0);
      expect(balToken1.toNumber()).to.equal(0);

      const balTokenOwner0 = await event.balanceOf(owner.address, 0);
      const balTokenOwner1 = await event.balanceOf(owner.address, 1);
      expect(balTokenOwner0.toNumber()).to.equal(1);
      expect(balTokenOwner1.toNumber()).to.equal(1);
    });

    it("Should emit URI event on update metadata", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      const tokenId = 0;
      const uri = await event.uri(tokenId);
      await expect(event.metadataUpdated(tokenId))
        .to.emit(event, "URI")
        .withArgs(uri, tokenId);
    });

    // Test the sync function
    // Add and update each of the things we sync (ticket type, discount code, currency)
    it("Should sync the ticket type", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      const newTicket = {
        key: "backstage",
        displayName: "backstage",
        maxSupply: 100,
        active: true,
        locked: false,
      };

      const newPrice = {
        tokenType: "backstage",
        price: ethers.utils.parseEther("200"), // 2 eth
        currency: "native",
        currencyAddress: AddressZero,
      };
      await event.syncEventData([newTicket], [newPrice], [], [], []);

      expect((await event.tokensPurchased("backstage")).toNumber()).to.equal(0);

      // Buy a ticket, count increases
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "backstage",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("200"),
          }
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("backstage")).toNumber()).to.equal(1);
      expect((await event.tokenAmounts("backstage")).toNumber()).to.equal(100);

      // Sync again, change the price
      newPrice.price = ethers.utils.parseEther("300");

      await event.syncEventData([], [newPrice], [], [], []);

      // Buy a ticket, fails because old price
      await expect(
        event
          .connect(otherAccount)
          ["buyToken(string,uint256,address,string)"](
            "backstage",
            1,
            otherAccount.address,
            "native",
            {
              value: ethers.utils.parseEther("200"),
            }
          )
      ).to.be.revertedWith("Not enough bal");
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("backstage")).toNumber()).to.equal(1);

      // Buy a ticket, success because new price
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "backstage",
          1,
          otherAccount.address,
          "native",
          {
            value: ethers.utils.parseEther("300"),
          }
        );
      expect(await event.tokenIdCounter()).to.equal(2);
      expect((await event.tokensPurchased("backstage")).toNumber()).to.equal(2);
    });

    /// Test to check that transfer is prevented when the ticket is soulbound
    it("Should prevent transfer when locked", async function () {
      const { event, owner, otherAccount } = await loadFixture(deployFixture);

      const updatedFree = {
        key: "free",
        displayName: "free",
        maxSupply: 1000,
        active: true,
        locked: true,
      };

      event.syncEventData([updatedFree], [], [], [], []);

      // Get 2 tickets
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );
      await event
        .connect(otherAccount)
        ["buyToken(string,uint256,address,string)"](
          "free",
          1,
          otherAccount.address,
          "native"
        );

      expect((await event.tokensPurchased("free")).toNumber()).to.equal(2);
      let balToken0 = await event.balanceOf(otherAccount.address, 0);
      let balToken1 = await event.balanceOf(otherAccount.address, 1);
      expect(balToken0.toNumber()).to.equal(1);
      expect(balToken1.toNumber()).to.equal(1);

      // Holder cannot transfer their own ticket because it's now soulbound.
      await expect(
        event
          .connect(otherAccount)
          .safeTransferFrom(otherAccount.address, owner.address, 0, 1, "0x")
      ).to.be.revertedWith("Token type is locked");

      balToken0 = await event.balanceOf(otherAccount.address, 0);
      expect(balToken0.toNumber()).to.equal(1);

      // Unlock it, transfer should work
      const updatedFreeUnlock = {
        key: "free",
        displayName: "free",
        maxSupply: 1000,
        active: true,
        locked: false,
      };

      event.syncEventData([updatedFreeUnlock], [], [], [], []);
      await event
        .connect(otherAccount)
        .safeTransferFrom(otherAccount.address, owner.address, 0, 1, "0x");

      balToken0 = await event.balanceOf(otherAccount.address, 0);
      expect(balToken0.toNumber()).to.equal(0);

      // Lock specific token itself, transfer should fail
      event.setTokenLock(1, true);
      await expect(
        event
          .connect(otherAccount)
          .safeTransferFrom(otherAccount.address, owner.address, 1, 1, "0x")
      ).to.be.revertedWith("Token is locked");

      balToken1 = await event.balanceOf(otherAccount.address, 1);
      expect(balToken1.toNumber()).to.equal(1);
    });
  });
});
