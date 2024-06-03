import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { eventData, priceData } from "./data";

const { AddressZero } = ethers.constants;

describe("Event Withdraw", function () {
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

    priceData.priceBase[2].currencyAddress = mockToken.address;
    priceData.priceBase[4].currencyAddress = mockToken.address;
    await event.registerTokenType(eventData.ticketBase);
    await event.registerCurrency(priceData.priceBase);

    return { event, owner, otherAccount, mockToken };
  }

  describe("Deployment", function () {
    it("Should allow a manager to withdrawer to withdraw funds from eth/native", async function () {
      const { event, otherAccount } = await loadFixture(deployFixture);

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
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);

      // Check to see if the contract has the eth sent
      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("1")
      );

      // Set withdrawer
      await event.registerSplits([
        {
          withdrawer: otherAccount.address,
          percent: 100,
          base: 100,
          exists: true,
        },
      ]);

      // Withdraw
      // Withdraw fails for non manager / owner
      await expect(
        event.connect(otherAccount).sweepSplit("native")
      ).to.be.revertedWith("No access");

      // Withdraw works with registered manager
      const MANAGER_ROLE = await event.MANAGER_ROLE();
      await event.setRole(otherAccount.address, MANAGER_ROLE);

      const otherAccountBalPre = await otherAccount.getBalance();

      const tx = await event.connect(otherAccount).sweepSplit("native");
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const otherAccountBalPost = await otherAccount.getBalance();
      const withdrawn = otherAccountBalPost.sub(
        otherAccountBalPre.sub(gasUsed)
      );

      // Check to see if the contract eth is gone
      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("0")
      );

      // Withdrawer holds eth.
      expect(withdrawn).to.equal(ethers.utils.parseEther("1"));
    });

    it("Should allow owner to withdraw all", async function () {
      const { event, owner, otherAccount, mockToken } = await loadFixture(
        deployFixture
      );

      // Buy 2 from the second ticket type with enough eth
      await event["buyToken(string,uint256,address,string)"](
        "vip",
        1,
        owner.address,
        "native",
        {
          value: ethers.utils.parseEther("1"),
        }
      );
      await event["buyToken(string,uint256,address,string)"](
        "vip",
        1,
        owner.address,
        "native",
        { value: ethers.utils.parseEther("1") }
      );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(2);

      // Check to see if the contract has the eth sent
      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("2")
      );

      // Give owner exact # of tokens needed for ticket price.
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
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);

      // Set withdrawer
      const otherAccount2 = ethers.Wallet.createRandom();
      const otherAccount3 = ethers.Wallet.createRandom();

      const splits = {
        split0: {
          withdrawer: otherAccount3.address,
          percent: 25,
          base: 100,
          exists: true,
        },

        split1: {
          withdrawer: otherAccount2.address,
          percent: 75,
          base: 100,
          exists: true,
        },
      };

      await event.registerSplits([splits["split0"], splits["split1"]]);

      // Withdraw
      const OWNER_ROLE = await event.OWNER_ROLE();
      await event.setRole(otherAccount.address, OWNER_ROLE);

      const otherAccountBalPre = await otherAccount.getBalance();

      const tx = await event
        .connect(otherAccount)
        .sweepAll(otherAccount.address);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const otherAccountBalPost = await otherAccount.getBalance();
      const withdrawn = otherAccountBalPost.sub(
        otherAccountBalPre.sub(gasUsed)
      );

      // Check to see if the contract eth is gone
      expect(await event.provider.getBalance(event.address)).to.equal(
        ethers.utils.parseEther("0")
      );

      // Manager holds eth.
      expect(withdrawn).to.equal(ethers.utils.parseEther("2"));

      // Manager holds usdc.
      expect(await mockToken.balanceOf(otherAccount.address)).to.equal(2000000);
    });

    it("Should allow the withdrawer to withdraw funds from usdc/erc20", async function () {
      const { event, otherAccount, mockToken } = await loadFixture(
        deployFixture
      );

      // Give owner exact # of tokens needed for ticket price.
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
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);

      // Set withdrawers
      const otherAccount2 = ethers.Wallet.createRandom();
      const otherAccount3 = ethers.Wallet.createRandom();

      await event.registerSplits([
        {
          withdrawer: otherAccount3.address,
          percent: 25,
          base: 100,
          exists: true,
        },
        {
          withdrawer: otherAccount2.address,
          percent: 75,
          base: 100,
          exists: true,
        },
      ]);
      expect(await mockToken.balanceOf(otherAccount3.address)).to.equal(0);

      // Check to see if the contract has the eth sent
      expect(await mockToken.balanceOf(event.address)).to.equal(2000000);

      // Withdraw
      await event.sweepSplit("usdc");

      // Check to see if the contract eth is gone
      expect(await mockToken.balanceOf(event.address)).to.equal(0);

      // Withdrawer account should now hold tokens.
      expect(await mockToken.balanceOf(otherAccount3.address)).to.equal(500000);
      expect(await mockToken.balanceOf(otherAccount2.address)).to.equal(
        1500000
      );
    });

    it("Should properly iterate splits", async function () {
      const { event, owner, otherAccount, mockToken } = await loadFixture(
        deployFixture
      );

      // Set withdrawer
      const otherAccount2 = ethers.Wallet.createRandom();
      const otherAccount3 = ethers.Wallet.createRandom();

      const splits: any = {
        split0: {
          withdrawer: otherAccount3.address,
          percent: 25,
          base: 100,
          exists: true,
        },

        split1: {
          withdrawer: otherAccount2.address,
          percent: 75,
          base: 100,
          exists: true,
        },
      };

      await event.registerSplits([splits["split0"], splits["split1"]]);

      // Check that all current splits equal the ones added above.
      const currentSplits = await event.getSplits();

      for (let i = 0; i < currentSplits.length; i++) {
        expect(currentSplits[i].exists).to.equal(splits[`split${i}`].exists);
        expect(currentSplits[i].percent).to.equal(splits[`split${i}`].percent);
        expect(currentSplits[i].base).to.equal(splits[`split${i}`].base);
      }
    });
  });
});
