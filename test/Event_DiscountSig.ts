import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { arrayify, defaultAbiCoder, keccak256 } from "ethers/lib/utils";
import { eventData, priceData } from "./data";

const { AddressZero } = ethers.constants;

describe("Event with Discount - Signature", function () {
  async function deployFixture() {
    const [owner, otherAccount, otherAccount2, backendSigner] =
      await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    const mockToken = await MockTokenFactory.deploy(
      "USD COIN",
      "USDC",
      0,
      owner.address
    );

    const Event = await ethers.getContractFactory("Event");

    priceData.priceBase[2].currencyAddress = mockToken.address;
    priceData.priceBase[4].currencyAddress = mockToken.address;

    // For 20% off, we need to send in basis points for discount value of 2000.
    const code20 = "some code 20 percent off";
    const discountValueBasis = 2000;
    const usesLimit = 10;
    const usesLimitPerAddress = 10;

    // For gate pass.
    const codeAccess0 = "codeGate0";
    const discountValueBasis0 = 2000;
    // Register a discount code with signature from allowList above.
    const discounts = [
      {
        key: code20,
        tokenType: "vip",
        value: discountValueBasis,
        maxUsesPerAddress: usesLimitPerAddress,
        maxUsesTotal: usesLimit,
        discountType: 1, // 1 = Signature
        merkleRoot: ethers.constants.HashZero,
        signer: backendSigner.address,
      },
      {
        key: codeAccess0, // Just a gate to unlock, no discount value.
        tokenType: "gated",
        value: discountValueBasis0,
        maxUsesPerAddress: usesLimitPerAddress,
        maxUsesTotal: usesLimit,
        discountType: 1, // 1 = Signature
        merkleRoot: ethers.constants.HashZero,
        signer: backendSigner.address,
      },
    ];

    const event = await Event.deploy(
      owner.address,
      eventData.uri,
      eventData.details._name,
      eventData.ticketBase,
      priceData.priceBase,
      discounts,
      [],
      []
    );

    return {
      event,
      owner,
      otherAccount,
      otherAccount2,
      backendSigner,
      mockToken,
      code20,
      codeAccess0,
      discountValueBasis,
      usesLimit,
      usesLimitPerAddress,
    };
  }

  describe("Discounts", function () {
    // ***** DISCOUNT CODES ********
    it("Should allow us to buy a discounted ticket with a Signature", async function () {
      const { event, backendSigner, code20, otherAccount } = await loadFixture(
        deployFixture
      );

      const messageToSign = keccak256(
        defaultAbiCoder.encode(["address"], [otherAccount.address])
      );
      const signature = await backendSigner.signMessage(
        arrayify(messageToSign)
      );

      // Buy vip ticket with code and 20% off expected eth.
      await event
        .connect(otherAccount)
        [
          "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
        ](
          "vip",
          1,
          otherAccount.address,
          "native",
          AddressZero,
          code20,
          [],
          signature,
          {
            value: ethers.utils.parseEther("0.8"),
          }
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);
    });

    it("Should prevent someone without an AL Signature from buying", async function () {
      const { event, backendSigner, code20, otherAccount, otherAccount2 } =
        await loadFixture(deployFixture);

      // Sign as otherAccount2 which is not buyer
      const messageToSign = keccak256(
        defaultAbiCoder.encode(["address"], [otherAccount2.address])
      );
      const signature = await backendSigner.signMessage(
        arrayify(messageToSign)
      );

      // Buy vip ticket with code and 20% off expected eth.
      await expect(
        event
          .connect(otherAccount)
          [
            "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
          ](
            "vip",
            1,
            otherAccount.address,
            "native",
            AddressZero,
            code20,
            [],
            signature,
            {
              value: ethers.utils.parseEther("0.8"),
            }
          )
      ).to.be.revertedWith("Not on signature allow list");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(0);
    });

    it("Should work with discounts and USDC", async function () {
      const {
        event,
        mockToken,
        otherAccount,
        usesLimit,
        usesLimitPerAddress,
        backendSigner,
      } = await loadFixture(deployFixture);

      const code15 = "media15";
      const discount15Basis = 1500;

      // Give owner exact # of tokens needed for ticket price.
      const discountPrice = 2000000 * (1 - discount15Basis / 10000);
      await mockToken.mint(otherAccount.address, discountPrice);

      // Approve exact # of tokens needed for ticket price.
      await mockToken
        .connect(otherAccount)
        .approve(event.address, discountPrice);

      // Register a discount code

      const discount = [
        {
          key: code15,
          tokenType: "premium",
          value: discount15Basis,
          maxUsesPerAddress: usesLimitPerAddress,
          maxUsesTotal: usesLimit,
          discountType: 1,
          merkleRoot: ethers.constants.HashZero,
          signer: backendSigner.address,
        },
      ];
      await event.registerDiscount(discount);

      // Get signature for address
      const messageToSign = keccak256(
        defaultAbiCoder.encode(["address"], [otherAccount.address])
      );
      const signature = await backendSigner.signMessage(
        arrayify(messageToSign)
      );

      // Buy 1 ticket of type 2 (usdc) with enough usdc
      await event
        .connect(otherAccount)
        [
          "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
        ](
          "premium",
          1,
          otherAccount.address,
          "usdc",
          AddressZero,
          code15,
          [ethers.constants.HashZero],
          signature
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);
    });

    it("Should block an access gated ticket and allow with discount", async function () {
      const { event, backendSigner, codeAccess0, otherAccount } =
        await loadFixture(deployFixture);

      const messageToSign = keccak256(
        defaultAbiCoder.encode(["address"], [otherAccount.address])
      );
      const signature = await backendSigner.signMessage(
        arrayify(messageToSign)
      );

      // Buy gated without discount
      await expect(
        event
          .connect(otherAccount)
          [
            "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
          ](
            "gated",
            1,
            otherAccount.address,
            "native",
            AddressZero,
            "",
            [],
            [],
            {
              value: ethers.utils.parseEther("1"),
            }
          )
      ).to.be.revertedWith("Token type is gated");
      expect((await event.tokensPurchased("gated")).toNumber()).to.equal(0);

      // Buy gated with discount
      await event
        .connect(otherAccount)
        [
          "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
        ](
          "gated",
          1,
          otherAccount.address,
          "native",
          AddressZero,
          codeAccess0,
          [],
          signature,
          {
            value: ethers.utils.parseEther("1"),
          }
        );
      expect((await event.tokensPurchased("gated")).toNumber()).to.equal(1);
    });

    it("Should allow an owner to bypass the Signature requirement", async function () {
      const { event, owner } = await loadFixture(deployFixture);

      // Buy gated ticket with no code and no eth
      await event[
        "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
      ]("gated", 1, owner.address, "native", AddressZero, "", [], []);

      expect((await event.tokensPurchased("gated")).toNumber()).to.equal(1);
    });
  });
});
