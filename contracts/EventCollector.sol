// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title EventCollector
 * @notice This contract is used to bridge funds between networks
 */

// Add owners

contract EventCollector is AccessControl {
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    // Mapping from currency names to contract addresses
    mapping(string => address) public currencyAddresses;

    constructor(string[] memory currencyName, address[] memory currencyAddress) {
        _grantRole(OWNER_ROLE, msg.sender);

        // Initialize known currencies
        currencyAddresses["native"] = address(0);
        for (uint i = 0; i < currencyName.length; i++) {
            currencyAddresses[currencyName[i]] = currencyAddress[i];
        }
    }

    /// @notice Purchase a token
    /// @param _tokenType Unique key for token type
    // TODO: map buys to events
    function buyToken(
        string memory _tokenType,
        uint256 amount,
        address receiver,
        string memory currency,
        address payer,
        string memory discountCode,
        bytes32[] memory merkleProof,
        bytes memory signature
    ) public payable {
        address currencyAddress = currencyAddresses[currency];

        // Need the min payment checks native / erc20
        if (currencyAddress == address(0)) {
            require(msg.value >= amount, "ETH sent does not match or exceed amount");
        } else {
            IERC20 token = IERC20(currencyAddress);
            require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }
    }

    function sweepFunds(
        address payable ethTo,
        address[] memory tokens,
        address[] memory tokenRecipients
    ) public onlyRole(OWNER_ROLE) {
        // Sweep Ether
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool success, ) = ethTo.call{value: ethBalance}("");
            require(success, "Failed to send Ether");
        }

        // Sweep Tokens
        for (uint i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 tokenBalance = token.balanceOf(address(this));
            if (tokenBalance > 0) {
                require(token.transfer(tokenRecipients[i], tokenBalance), "Failed to send tokens");
            }
        }
    }
}
