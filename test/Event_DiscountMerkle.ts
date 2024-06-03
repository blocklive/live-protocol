import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { eventData, priceData } from "./data";
import { MerkleTree } from "merkletreejs";

const { AddressZero } = ethers.constants;

describe("Event with Discount - Merkle", function () {
  async function deployFixture() {
    const [owner, otherAccount, otherAccount2] = await ethers.getSigners();

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

    const allowList = [
      owner,
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      ethers.Wallet.createRandom(),
      otherAccount,
      otherAccount2,
    ];

    const { keccak256 } = ethers.utils;
    const leaves = allowList.map((wal) => keccak256(wal.address));
    const merkleTree = new MerkleTree(leaves, keccak256, {
      sortPairs: true,
    });

    // For 20% off, we need to send in basis points for discount value of 2000.
    const code20 = "some code 20 percent off";
    const discountValueBasis = 2000;
    const usesLimit = 10;
    const usesLimitPerAddress = 10;
    // Register a discount code with merkleTree from allowList above.
    const discount = [
      {
        key: code20,
        tokenType: "vip",
        value: discountValueBasis,
        maxUsesPerAddress: usesLimitPerAddress,
        maxUsesTotal: usesLimit,
        discountType: 0,
        merkleRoot: merkleTree.getHexRoot(),
        signer: AddressZero,
      },
    ];
    await event.registerDiscount(discount);

    return {
      event,
      owner,
      otherAccount,
      otherAccount2,
      mockToken,
      merkleTree,
      allowList,
      code20,
      discountValueBasis,
      usesLimit,
      usesLimitPerAddress,
    };
  }

  describe("Discounts", function () {
    // ***** DISCOUNT CODES ********
    it("Should allow us to buy a discounted ticket with a Merkle tree", async function () {
      const { event, owner, merkleTree, code20, otherAccount } =
        await loadFixture(deployFixture);

      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(
        keccak256(otherAccount.address)
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
          merkleProof,
          [],
          {
            value: ethers.utils.parseEther("0.8"),
          }
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);
    });

    it("Should prevent a non allowlisted address from buying a discounted ticket", async function () {
      const { event, merkleTree, code20, otherAccount } = await loadFixture(
        deployFixture
      );

      const walNotOnAL = ethers.Wallet.createRandom();
      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(keccak256(walNotOnAL.address));

      // Buy vip ticket with code and 20% off expected eth.
      await expect(
        event
          .connect(otherAccount)
          [
            "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
          ](
            "vip",
            1,
            walNotOnAL.address,
            "native",
            AddressZero,
            code20,
            merkleProof,
            [],
            {
              value: ethers.utils.parseEther("0.8"),
            }
          )
      ).to.be.revertedWith("Not on merkle allow list");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(0);
    });

    it("Should allow us to registrer and buy free discount", async function () {
      const {
        event,
        merkleTree,
        otherAccount,
        usesLimit,
        usesLimitPerAddress,
      } = await loadFixture(deployFixture);

      const codefree = "some code free";
      const discountFreeValueBasis = 10000;
      // Register a discount code for free pass

      const discount = [
        {
          key: codefree,
          tokenType: "vip",
          value: discountFreeValueBasis,
          maxUsesPerAddress: usesLimitPerAddress,
          maxUsesTotal: usesLimit,
          discountType: 0,
          merkleRoot: merkleTree.getHexRoot(),
          signer: AddressZero,
        },
      ];
      await event.registerDiscount(discount);

      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(
        keccak256(otherAccount.address)
      );

      // Buy vip ticket with code for free.
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
          codefree,
          merkleProof,
          []
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);
    });

    it("Should allow us to buy a discounted ticket with updated code", async function () {
      const {
        event,
        merkleTree,
        otherAccount,
        usesLimit,
        usesLimitPerAddress,
      } = await loadFixture(deployFixture);

      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(
        keccak256(otherAccount.address)
      );

      const code5Off = "some code 5 off";
      const discount5OffBasis = 500;

      const discount = [
        {
          key: code5Off,
          tokenType: "vip",
          value: discount5OffBasis,
          maxUsesPerAddress: usesLimitPerAddress,
          maxUsesTotal: usesLimit,
          discountType: 0,
          merkleRoot: merkleTree.getHexRoot(),
          signer: AddressZero,
        },
      ];
      await event.registerDiscount(discount);

      // Buy vip ticket with code and 5% off expected eth.
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
          code5Off,
          merkleProof,
          [],
          {
            value: ethers.utils.parseEther("0.95"),
          }
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);

      // Fail vip ticket with code and 6% off expected eth.
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
            code5Off,
            merkleProof,
            [],
            {
              value: ethers.utils.parseEther("0.94"),
            }
          )
      ).to.be.revertedWith("Not enough bal");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);
    });

    it("Should allow us to registrer a code with a use limit", async function () {
      const { event, merkleTree, otherAccount, otherAccount2 } =
        await loadFixture(deployFixture);

      const codefree = "Limited To One Free";
      const usesLimit = 4;
      const usesLimitPerAddress = 1;
      // Register a discount code for free pass
      const discount = [
        {
          key: codefree,
          tokenType: "vip",
          value: 10000,
          maxUsesPerAddress: usesLimitPerAddress,
          maxUsesTotal: usesLimit,
          discountType: 0,
          merkleRoot: merkleTree.getHexRoot(),
          signer: AddressZero,
        },
      ];

      await event.registerDiscount(discount);

      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(
        keccak256(otherAccount.address)
      );

      // Buy limited ticket with code for free.
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
          codefree,
          merkleProof,
          []
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);

      // Try to buy a second limited ticket with code for free, should fail.
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
            codefree,
            merkleProof,
            []
          )
      ).to.be.revertedWith("Max uses reached for address");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(1);

      const merkleProof2 = merkleTree.getHexProof(
        keccak256(otherAccount2.address)
      );
      // Try to buy a second limited ticket with code for free with another account
      // , should work, below total and per address
      await event
        .connect(otherAccount2)
        [
          "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
        ](
          "vip",
          1,
          otherAccount2.address,
          "native",
          AddressZero,
          codefree,
          merkleProof2,
          []
        );
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(2);

      await expect(
        event
          .connect(otherAccount2)
          [
            "buyToken(string,uint256,address,string,address,string,bytes32[],bytes)"
          ](
            "vip",
            4,
            otherAccount2.address,
            "native",
            AddressZero,
            codefree,
            merkleProof2,
            []
          )
      ).to.be.revertedWith("Max uses total reached");
      expect((await event.tokensPurchased("vip")).toNumber()).to.equal(2);
    });

    it("Should work with discounts and USDC", async function () {
      const {
        event,
        mockToken,
        merkleTree,
        otherAccount,
        usesLimit,
        usesLimitPerAddress,
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
          discountType: 0,
          merkleRoot: merkleTree.getHexRoot(),
          signer: AddressZero,
        },
      ];
      await event.registerDiscount(discount);

      // Get merkleProof for address
      const { keccak256 } = ethers.utils;
      const merkleProof = merkleTree.getHexProof(
        keccak256(otherAccount.address)
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
          merkleProof,
          []
        );
      expect(await event.tokenIdCounter()).to.equal(1);
      expect((await event.tokensPurchased("premium")).toNumber()).to.equal(1);
    });
  });
});
