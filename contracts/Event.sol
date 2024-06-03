// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Utils} from "./Utils.sol";
import "operator-filter-registry/src/DefaultOperatorFilterer.sol";

/**
 * @title EventTicketManager
 * @notice This contract is used to manage the sale of tokens/tickets for an event.
 * @custom:coauthor spatializes (Blocklive)
 * @custom:coauthor daagcentral (Blocklive)
 * @custom:coauthor aronvis (Blocklive)
 */

contract Event is ERC1155, ERC2981, Utils, AccessControlEnumerable, DefaultOperatorFilterer {
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, AccessControlEnumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    using ECDSA for bytes32;

    enum DiscountType {
        Merkle,
        Signature
    }

    struct TokenPrice {
        bool exists;
        uint256 value;
    }

    /// @dev Register a discount with either a merkle root or signature
    /// @dev DiscountBase contains the non-nested data used to describe the code for updates
    struct DiscountBase {
        string key; // Key for discount
        string tokenType; // Token type key to apply discount to
        uint256 value; // Basis points off token price
        int256 maxUsesPerAddress; // Uses for the code per users (-1 inf)
        int256 maxUsesTotal; // Uses for the code for all users (-1 inf)
        DiscountType discountType; // Merkle or Signature based discount
        bytes32 merkleRoot; // Merkle root containing addresses which are allowlisted
        address signer; // Address used to sign discounts off chain
    }
    struct Discount {
        bool exists;
        DiscountBase base;
        uint256 uses;
        mapping(address => uint256) usesPerAddress;
    }

    /// @dev Each type of token to be sold (ex: vip, premium)
    /// @dev TokenTypeBase contains the non-nested data used to describe the token type for updates
    struct TokenTypeBase {
        string key; // Name of token type
        string displayName; // Name of token type
        int256 maxSupply; // Max number of token of this type (-1 inf)
        bool active; // Token type can be purchased
        bool locked; // Token is soulbound and cannot be transferred
        bool gated; // Token cannot be purchased without a discount
    }

    /// @dev Used to sync user address with role
    struct RoleBase {
        address userAddress;
        bytes32 role;
    }

    /// @dev Live data to track token type details on an active event.
    struct TokenType {
        bool exists;
        TokenTypeBase base;
        uint256 purchased; // Number of tokens purchased of this type
        mapping(string => Discount) discount; // Mapping of discount key to Discount
        mapping(string => TokenPrice) price; // Mapping of currency key to price
    }

    /// @dev Each type of currency accepted for token purchases
    struct CurrencyBase {
        string tokenType; // Unique key for the token type
        uint256 price; // Price for the token type
        string currency; // Unique key for the erc20 token used for purchase
        address currencyAddress; // Contract address for the erc20 token used for purchase
    }

    /// @dev Split token sales between multiple addresses
    struct Split {
        bool exists;
        address withdrawer;
        uint256 percent;
        uint256 base;
    }

    /// @dev Each token sold
    struct Token {
        bool exists;
        string tokenType; // Map to key of token type
        address owner; // Address of token owner
        bool locked; // Token is soulbound and cannot be transferred
        bool valid; // Token is valid for event entry
    }

    /// Permissions constants
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// Contract version
    string public version = "0.7.0";

    /// Public name shown for collection title on marketplaces
    string public name;

    /// Base URI for metadata reference
    string private _uriBase;

    /// Event is active and tokens can be purchased
    bool public active;

    // Limit of tokens per person per order total
    uint256 public orderLimit = 5;

    // Limit of tokens per contract allowed
    int256 public totalMaxSupply = -1;

    /// Mapping from token ID to its details
    mapping(uint256 => Token) private _tokenRegistry;

    /// Mapping of token key to token type
    mapping(string => TokenType) private _tokenTypeRegistry;

    Split[] public splitRegistry;

    /// Mapping from currency name to its ERC20 address
    mapping(string => IERC20) public tokenCurrencies;

    // All currency keys for iteration
    string[] private currencyKeys;

    /// Latest token id
    uint256 public tokenIdCounter;

    event TokenPurchased(uint256 indexed tokenId, string indexed tokenType);

    constructor(
        address creator,
        string memory uribase,
        string memory nameContract,
        TokenTypeBase[] memory tokenTypeBase,
        CurrencyBase[] memory currencyBase,
        DiscountBase[] memory discountBase,
        Split[] memory splits,
        RoleBase[] memory roles
    ) ERC1155(uribase) {
        name = nameContract;

        /// @notice Assign creator to be owner
        _grantRole(OWNER_ROLE, creator);
        _grantRole(MANAGER_ROLE, creator);

        _uriBase = uribase;
        active = true;

        /// @notice Initialze default split registry with 100% to creator
        splitRegistry.push(Split(true, creator, 1, 1));

        /// @notice Initialize royalties for ERC2981
        _setDefaultRoyalty(creator, 1000);

        /// @notice Initialize token types, currencies, discounts, splits
        syncEventData(tokenTypeBase, currencyBase, discountBase, splits, roles);
    }

    function setURIBase(string memory newuribase) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _uriBase = newuribase;
    }

    function setURI(string memory newuri) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _setURI(newuri);
    }

    function setDefaultRoyalty(address _receiver, uint96 _feeNumerator) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _setDefaultRoyalty(_receiver, _feeNumerator);
    }

    function uri(uint256 _id) public view override returns (string memory) {
        return
            string.concat(_uriBase, "/", toAsciiString(address(this)), "/", Strings.toString(_id));
    }

    function isNative(string memory currency) private pure returns (bool) {
        return keccak256(abi.encodePacked(currency)) == keccak256(abi.encodePacked("native"));
    }

    function buyToken(
        string memory _tokenType,
        uint256 amount,
        address receiver,
        string memory currency
    ) public payable {
        buyToken(_tokenType, amount, receiver, currency, address(0), "", new bytes32[](0), "");
    }

    /// @notice Purchase multiple tokens in a single txn
    function buyToken(
        string[] memory _tokenType,
        uint256[] memory amount,
        address[] memory receiver,
        string[] memory currency,
        address[] memory payer,
        string[] memory discountCode,
        bytes32[][] memory merkleProof,
        bytes[] memory signature
    ) public payable {
        require(active, "Not active");

        require(
            _tokenType.length == amount.length &&
                _tokenType.length == receiver.length &&
                _tokenType.length == currency.length &&
                _tokenType.length == payer.length &&
                _tokenType.length == discountCode.length &&
                _tokenType.length == merkleProof.length &&
                _tokenType.length == signature.length,
            "Arg length mismatch"
        );

        uint256 purchaseTotal = 0;

        for (uint256 i = 0; i < _tokenType.length; i++) {
            uint256 price = buyToken(
                _tokenType[i],
                amount[i],
                receiver[i],
                currency[i],
                payer[i],
                discountCode[i],
                merkleProof[i],
                signature[i]
            );
            if (isNative(currency[i])) {
                purchaseTotal += price;
            }
        }

        require(
            hasRole(OWNER_ROLE, msg.sender) || msg.value >= purchaseTotal,
            "Not enough bal for batch"
        );
    }

    /// @notice Purchase a token
    function buyToken(
        string memory _tokenType, // Unique key for  type to be priced against
        uint256 amount, // Amount to purchase multiple copies of a single token ID
        address receiver, // Address to receive the token
        string memory currency, // Currency to be used for purchase
        address payer, // Address to pay for the token when ERC20
        string memory discountCode, // Discount code to be applied
        bytes32[] memory merkleProof, // Merkle proof for discount
        bytes memory signature // Signature for discount
    ) public payable returns (uint256) {
        address payerAddress = payer != address(0) ? payer : msg.sender;

        require(active, "Not active");

        int256 maxSupply = _tokenTypeRegistry[_tokenType].base.maxSupply;
        require(
            maxSupply < 0 ||
                _tokenTypeRegistry[_tokenType].purchased + amount <= uint256(maxSupply),
            "Max supply for token type"
        );

        require(
            totalMaxSupply < 0 || tokenIdCounter + amount <= uint256(totalMaxSupply),
            "Max supply for contract"
        );

        require(amount < orderLimit, "Exceeds limit");

        require(_tokenTypeRegistry[_tokenType].base.active, "Token type is not active");

        require(
            isNative(currency) || address(tokenCurrencies[currency]) != address(0),
            "Curr not registered"
        );

        require(_tokenTypeRegistry[_tokenType].price[currency].exists, "Type not registered");

        TokenPrice memory price = _tokenTypeRegistry[_tokenType].price[currency];
        Discount storage discount = _tokenTypeRegistry[_tokenType].discount[discountCode];

        if (
            _tokenTypeRegistry[_tokenType].base.gated &&
            !discount.exists &&
            !hasRole(OWNER_ROLE, msg.sender)
        ) {
            revert("Token type is gated");
        }

        if (discount.exists) {
            if (discount.base.discountType == DiscountType.Signature) {
                require(
                    _verifySignature(receiver, signature, discount.base.signer),
                    "Not on signature allow list"
                );
            } else if (discount.base.discountType == DiscountType.Merkle) {
                require(
                    _verifyAddress(merkleProof, discount.base.merkleRoot, receiver),
                    "Not on merkle allow list"
                );
            } else {
                revert("Invalid discount type");
            }

            price.value = price.value - ((price.value * discount.base.value) / 10000);

            int256 maxUsesTotal = discount.base.maxUsesTotal;
            int256 maxUsesPerAddress = discount.base.maxUsesPerAddress;
            require(
                maxUsesTotal < 0 || discount.uses + amount <= uint256(maxUsesTotal),
                "Max uses total reached"
            );
            require(
                maxUsesPerAddress < 0 ||
                    discount.usesPerAddress[receiver] + amount <= uint256(maxUsesPerAddress),
                "Max uses reached for address"
            );

            discount.uses += 1;
            discount.usesPerAddress[receiver] += 1;
        }

        if (isNative(currency)) {
            require(
                hasRole(OWNER_ROLE, msg.sender) || msg.value >= price.value * amount,
                "Not enough bal"
            );
        } else {
            if (!hasRole(OWNER_ROLE, msg.sender)) {
                require(
                    tokenCurrencies[currency].balanceOf(payerAddress) >= price.value * amount,
                    "Not enough bal"
                );

                tokenCurrencies[currency].transferFrom(
                    payerAddress,
                    address(this),
                    price.value * amount
                );
            }
        }

        uint256 tokenId = tokenIdCounter;
        tokenIdCounter += 1;

        _tokenTypeRegistry[_tokenType].purchased += 1;

        _tokenRegistry[tokenId].tokenType = _tokenType;

        emit TokenPurchased(tokenId, _tokenType);
        _mint(receiver, tokenId, 1, "");

        return price.value;
    }

    /// @notice Register token types
    /// @param tokenTypeBase Array of token type base structs
    function registerTokenType(TokenTypeBase[] memory tokenTypeBase) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        for (uint256 i = 0; i < tokenTypeBase.length; i++) {
            TokenType storage _tokenType = _tokenTypeRegistry[tokenTypeBase[i].key];
            _tokenType.base = tokenTypeBase[i];
            _tokenType.exists = true;
        }
    }

    /// @notice Register a currency to be accepted for a token type and price
    /// @param currencyBase Array of currency base structs
    function registerCurrency(CurrencyBase[] memory currencyBase) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        for (uint256 i = 0; i < currencyBase.length; i++) {
            TokenType storage _tokenType = _tokenTypeRegistry[currencyBase[i].tokenType];
            string memory ckey = currencyBase[i].currency;
            address caddr = currencyBase[i].currencyAddress;
            require(_tokenType.exists, "Token key not registered");

            _tokenType.price[ckey] = TokenPrice(true, currencyBase[i].price);

            if (caddr != address(0) && tokenCurrencies[ckey] != IERC20(caddr)) {
                tokenCurrencies[ckey] = IERC20(caddr);
                currencyKeys.push(ckey);
            }
        }
    }

    function _verifyAddress(
        bytes32[] memory merkleProof,
        bytes32 merkleRoot,
        address receiver
    ) private pure returns (bool) {
        bytes32 leafAddress = keccak256(abi.encodePacked(receiver));
        return MerkleProof.verify(merkleProof, merkleRoot, leafAddress);
    }

    function _verifySignature(
        address allowedAddress,
        bytes memory signature,
        address signer
    ) internal pure returns (bool _isValid) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(allowedAddress))
            )
        );

        return signer == digest.recover(signature);
    }

    /// @notice Register a discount for an event
    /// @param discountBase Base input discount data
    function registerDiscount(DiscountBase[] memory discountBase) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        for (uint256 i = 0; i < discountBase.length; i++) {
            Discount storage discount = _tokenTypeRegistry[discountBase[i].tokenType].discount[
                discountBase[i].key
            ];
            discount.base = discountBase[i];
            discount.exists = true;
        }
    }

    function setRole(address user, bytes32 role) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _grantRole(role, user);
    }

    function removeRole(address user, bytes32 role) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _revokeRole(role, user);
    }

    function setActive(bool _active) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        active = _active;
    }

    function setLimit(uint256 limit) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );

        orderLimit = limit;
    }

    function setTotalMaxSupply(int256 _totalMaxSupply) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );

        totalMaxSupply = _totalMaxSupply;
    }

    /// @notice Token Type Registry helpers
    function tokenActive(string memory _tokenType) public view returns (bool) {
        return _tokenTypeRegistry[_tokenType].base.active;
    }

    function tokenAmounts(string memory _tokenType) public view returns (int256) {
        return _tokenTypeRegistry[_tokenType].base.maxSupply;
    }

    function tokensPurchased(string memory _tokenType) public view returns (uint256) {
        return _tokenTypeRegistry[_tokenType].purchased;
    }

    /// @notice Token Registry helpers
    function owned(uint256 tokenId) public view returns (address) {
        return _tokenRegistry[tokenId].owner;
    }

    function tokenType(uint256 tokenId) public view returns (string memory) {
        return _tokenRegistry[tokenId].tokenType;
    }

    function tokenLocked(uint256 tokenId) public view returns (bool) {
        return _tokenRegistry[tokenId].locked;
    }

    function setTokenLock(uint256 tokenId, bool locked) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _tokenRegistry[tokenId].locked = locked;
    }

    /// @notice Register roles
    function registerRoles(RoleBase[] memory roles) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        for (uint256 i = 0; i < roles.length; i++) {
            _grantRole(roles[i].role, roles[i].userAddress);
        }
    }

    /// @notice Address splits for withdraws from the contract
    function getSplits() external view returns (Split[] memory) {
        return splitRegistry;
    }

    function registerSplits(Split[] memory splits) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        if (splits.length < 1) {
            return;
        }

        // Always register fresh splits
        delete splitRegistry;

        uint256 base = splits[0].base;
        uint256 total = 0;
        for (uint256 i = 0; i < splits.length; i++) {
            total += splits[i].percent;
            splitRegistry.push(splits[i]);
            require(splits[i].base == base, "Splits must have same base");
        }
        require(total / base == 1, "Splits must add up to 100%");
    }

    function sweep(string memory currency, Split[] memory splits) internal {
        if (keccak256(abi.encodePacked(currency)) == keccak256(abi.encodePacked("native"))) {
            uint256 _balance = address(this).balance;
            for (uint i = 0; i < splits.length; i++) {
                uint256 splitBalance = (_balance * splits[i].percent) / splits[i].base;
                payable(splits[i].withdrawer).transfer(splitBalance);
            }
        } else {
            IERC20 token = tokenCurrencies[currency];
            uint256 _balance = token.balanceOf(address(this));
            for (uint i = 0; i < splits.length; i++) {
                uint256 splitBalance = (_balance * splits[i].percent) / splits[i].base;
                token.transfer(splits[i].withdrawer, splitBalance);
            }
        }
    }

    function sweepSplit(string memory currency) public {
        require(hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender), "No access");
        sweep(currency, splitRegistry);
    }

    /// @notice Full sweep for the manager as backup if the split registry is corrupted
    function sweepAll(address sweeper) public {
        require(hasRole(OWNER_ROLE, msg.sender), "Access Denied");

        Split[] memory splits = new Split[](1);
        splits[0] = Split(true, sweeper, 1, 1);

        // Sweep all erc20 tokens
        for (uint256 i = 0; i < currencyKeys.length; i++) {
            string memory ckey = currencyKeys[i];
            sweep(ckey, splits);
        }

        // Sweep native currency
        sweep("native", splits);
    }

    /// @notice Sync all event data
    /// @notice (token types, pricing, discounts)
    /// @dev each will be noop if empty array is passed
    function syncEventData(
        TokenTypeBase[] memory tokenTypeBase,
        CurrencyBase[] memory currencyBase,
        DiscountBase[] memory discountBase,
        Split[] memory splits,
        RoleBase[] memory roles
    ) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        registerTokenType(tokenTypeBase);
        registerCurrency(currencyBase);
        registerDiscount(discountBase);
        registerSplits(splits);
        registerRoles(roles);
    }

    function rescueToken(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        _safeTransferFrom(from, to, id, amount, data);
    }

    /// @notice Call for offchain updates to metadata json
    function metadataUpdated(uint256 tokenId) public {
        require(
            hasRole(OWNER_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender),
            "Access Denied"
        );
        emit URI(uri(tokenId), tokenId);
    }

    function contractBalances() public view returns (uint256) {
        uint256 balances = 0;
        for (uint256 i = 0; i < currencyKeys.length; i++) {
            balances += tokenCurrencies[currencyKeys[i]].balanceOf(address(this));
        }
        balances += address(this).balance;
        return balances;
    }

    function renounceAccessControl() public {
        require(hasRole(OWNER_ROLE, msg.sender), "Access Denied");
        require(contractBalances() == 0, "Bal is not zero");

        bytes32[2] memory roles = [OWNER_ROLE, MANAGER_ROLE];

        for (uint256 r = 0; r < roles.length; r++) {
            for (uint256 m = 0; m < getRoleMemberCount(roles[r]); m++) {
                revokeRole(roles[r], getRoleMember(roles[r], m));
            }
        }
    }

    /// Overrides
    /// @notice Keep the list of owners up to date on all transfers, mints, burns
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        // To run **before** the transfer

        super._update(from, to, ids, values);

        // To run **after** the transfer
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            _tokenRegistry[id].owner = to;
        }
    }

    /// Ensure token and token type are both unlocked
    function checkOnlyUnlocked(uint256 tokenId) public view {
        /// Check token is not locked
        require(_tokenRegistry[tokenId].locked == false, "Token is locked");

        /// Check token type is not locked
        require(
            _tokenTypeRegistry[_tokenRegistry[tokenId].tokenType].base.locked == false,
            "Token type is locked"
        );
    }

    /// @notice modifier to block batch transfers when token is locked
    modifier onlyUnlockedBatch(uint256[] memory tokenId) {
        /// Check all tokens, only allow if all are unlocked
        for (uint256 i = 0; i < tokenId.length; ++i) {
            checkOnlyUnlocked(tokenId[i]);
        }
        _;
    }

    /// @notice modifier to block transfers when token is locked
    modifier onlyUnlocked(uint256 tokenId) {
        /// Check all tokens, only allow if all are unlocked
        checkOnlyUnlocked(tokenId);
        _;
    }

    /// @notice Filter registry from OpenSea.
    /// @dev See {IERC1155-setApprovalForAll}.
    /// @dev In this example the added modifier ensures that the operator is allowed by the OperatorFilterRegistry.
    function setApprovalForAll(
        address operator,
        bool approved
    ) public override onlyAllowedOperatorApproval(operator) {
        super.setApprovalForAll(operator, approved);
    }

    /// @dev See {IERC1155-safeTransferFrom}.
    /// @dev In this example the added modifier ensures that the operator is allowed by the OperatorFilterRegistry.
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public override onlyAllowedOperator(from) onlyUnlocked(tokenId) {
        super.safeTransferFrom(from, to, tokenId, amount, data);
    }

    /// @dev See {IERC1155-safeBatchTransferFrom}.
    /// @dev In this example the added modifier ensures that the operator is allowed by the OperatorFilterRegistry.
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override onlyAllowedOperator(from) onlyUnlockedBatch(ids) {
        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }
}
