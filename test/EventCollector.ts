import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
const hre = require("hardhat");

const { AddressZero } = ethers.constants;

describe("EventCollector", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, otherAccount2] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    const mockUSDC = await MockTokenFactory.deploy(
      "USD COIN",
      "USDC",
      6,
      owner.address
    );
    const mockUSDT = await MockTokenFactory.deploy(
      "Tether USD",
      "USDT",
      6,
      owner.address
    );

    const EventCollector = await ethers.getContractFactory("EventCollector");

    const eventCollector = await EventCollector.deploy(
      ["usdc", "usdt"],
      [mockUSDC.address, mockUSDT.address]
    );

    return {
      eventCollector,
      owner,
      otherAccount,
      otherAccount2,
      mockUSDC,
      mockUSDT,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { eventCollector, owner } = await loadFixture(deployFixture);
    });
  });

  describe("buyToken function", function () {
    it("Should accept ETH payment", async function () {
      const { eventCollector, owner, otherAccount, otherAccount2 } =
        await loadFixture(deployFixture);
      await eventCollector
        .connect(owner)
        .buyToken(
          "NFT1",
          100,
          otherAccount.address,
          "native",
          owner.address,
          "",
          [],
          [],
          { value: 100 }
        );
      expect(await ethers.provider.getBalance(eventCollector.address)).to.equal(
        100
      );
    });

    // Assuming you've deployed some ERC20 tokens and their contracts are known
    it("Should accept ERC20 payment", async function () {
      const { eventCollector, owner, otherAccount, otherAccount2, mockUSDC } =
        await loadFixture(deployFixture);

      // Give owner exact # of tokens needed for ticket price.
      await mockUSDC.mint(owner.address, 200);
      // Approve exact # of tokens needed for ticket price.
      await mockUSDC.connect(owner).approve(eventCollector.address, 200);

      await eventCollector.buyToken(
        "NFT1",
        100,
        owner.address,
        "usdc",
        owner.address,
        "",
        [],
        []
      );

      expect(await mockUSDC.balanceOf(eventCollector.address)).to.equal(100);
    });
  });
  describe("sweepFunds function", function () {
    it("Should sweep ETH funds", async function () {
      const { eventCollector, owner, otherAccount } = await loadFixture(
        deployFixture
      );

      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      );

      // Buy a token with ETH
      await eventCollector
        .connect(otherAccount)
        .buyToken(
          "NFT1",
          100,
          owner.address,
          "native",
          owner.address,
          "",
          [],
          [],
          { value: 100 }
        );

      // Ensure contract has the funds
      expect(await ethers.provider.getBalance(eventCollector.address)).to.equal(
        100
      );

      // Now sweep those funds
      const tx = await eventCollector.sweepFunds(owner.address, [], []);

      // Expect contract balance to be zero after sweep
      expect(await ethers.provider.getBalance(eventCollector.address)).to.equal(
        0
      );

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(tx.gasPrice);

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance.add(gasUsed)).to.equal(
        initialOwnerBalance.add(100)
      );
    });

    it("Should sweep ERC20 funds", async function () {
      const { eventCollector, owner, otherAccount, mockUSDC } =
        await loadFixture(deployFixture);

      const initialOwnerBalance = await mockUSDC.balanceOf(owner.address);

      // Mint and approve tokens
      await mockUSDC.mint(otherAccount.address, 200);
      await mockUSDC.connect(otherAccount).approve(eventCollector.address, 200);

      // Buy a token with ERC20
      await eventCollector
        .connect(otherAccount)
        .buyToken(
          "NFT1",
          100,
          owner.address,
          "usdc",
          owner.address,
          "",
          [],
          []
        );

      // Ensure contract has the funds
      expect(await mockUSDC.balanceOf(eventCollector.address)).to.equal(100);

      // Now sweep those funds
      await eventCollector.sweepFunds(
        AddressZero,
        [mockUSDC.address],
        [owner.address]
      );

      // Expect contract balance to be zero after sweep
      expect(await mockUSDC.balanceOf(eventCollector.address)).to.equal(0);

      // Expect owner to receive the swept funds
      const finalOwnerBalance = await mockUSDC.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.add(100));
    });
  });
});
