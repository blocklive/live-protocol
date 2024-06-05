![leoc](https://github.com/BlockLive/live-protocol/assets/2586086/29776a2f-d529-48da-975d-ccc05a72b775)

# Live Protocol 

The Live Protocol is an onchain live events management system.

<img width="1176" alt="image" src="https://github.com/BlockLive/live-protocol/assets/2586086/2f421e34-ee02-4620-9c10-28f8be3774da">

Live events through abstracted wallets and airdrops are the best way to onboard non-crypto users to the crypto ecosystem. Onchain tickets and events also represent one of the most valuable use cases for crypto  in its current state today. The Live Protocol enables end-to-end onchain event management and ticketing. The protocol enables proof of history as a way for organizers to target and reward fans. The Live Protocol will create the most powerful decentralized graph of real world human interaction.

### How it works

Blocklive starts by deploying a Live contract for each event. This is the source of truth for the system. Each RSVP or ticket purchased is recorded onchain in this contract. 

The Live Protocol, through its smart contract implementation, offers an onchain source of truth for event management and ticketing. Here's a breakdown of how the protocol works:

- **Contract Deployment**: For each event, a unique `Live` smart contract is deployed. This contract acts as the definitive source of truth, storing all relevant event information and participant interactions onchain.

- **Token Management**: Each contract inherits from ERC1155, a multi-token standard, to issue tickets. Each ticket type (e.g., VIP, General Admission) is represented as a distinct token within the contract. This approach allows for efficient management of multiple ticket types and features within a single contract.

- **Dynamic Pricing and Discounts**: Tickets can be priced in various currencies, supported by the protocol's ability to handle multiple ERC20 tokens. Special pricing mechanisms are implemented, such as discounts through Merkle proofs (for batch allowlist verifications) or ECDSA signatures (for individualized discounts), allowing event organizers to offer promotions and manage ticket sales strategically.

- **Access Control and Roles**: Utilizing OpenZeppelin's Access Control, the protocol assigns roles like `OWNER_ROLE` and `MANAGER_ROLE` to govern who can perform administrative actions within the contract. This ensures that only authorized personnel can modify critical settings, register new ticket types, or handle funds.

- **Royalties and Splits**: The protocol supports ERC2981, a standard for handling royalties on transactions. It allows event organizers to set up payment splits among multiple stakeholders, ensuring that contributors like artists or venue owners receive their share of the revenue automatically upon ticket sales.

- **Purchase Process**:
   - **Token Purchase**: When a purchase is initiated, the contract checks the availability and validity of the ticket type and applies any applicable discounts.
   - **Payment Handling**: Payments can be made in ETH or any ERC20 token supported by the contract. The protocol handles conversions and transfers, ensuring that funds are appropriately distributed according to the predefined splits.
   - **Minting Tickets**: Upon successful payment, the specified amount of tickets (tokens) are minted and transferred to the buyer's wallet. This process is secured and verifiable, providing transparency and trust in the transaction.

- **Secondary Market Controls**: The protocol can enforce rules on ticket resale, such as locking tokens (making them non-transferable) or gating sales to approved secondary markets, helping organizers control scalping and ensuring tickets are sold at fair prices.

- **Proof of History**: Utilizing blockchain's inherent characteristics, every transaction and interaction within the contract is recorded permanently, providing a proof of history. This feature is crucial for organizers to analyze event success, attendee engagement, and for future planning and rewards distribution based on past attendee behavior.

- **Event Lifecycle Management**: From setting up the initial event details and ticket types to managing sales, processing payments, and handling post-event activities, the Live Protocol offers tools to manage the entire lifecycle of an event seamlessly.

- **Decentralized Interaction Graph**: By recording interactions onchain, the Live Protocol facilitates the creation of a decentralized graph of real-world human interactions. This data is used by organizers to understand attendee behavior, preferences, and network effects, which can be leveraged for marketing and creating more personalized event experiences in the future.

The Live Protocol decentralizes and secures the process of event management and ticketing, making it transparent, efficient, and fair for all stakeholders involved.

<img width="1181" alt="image" src="https://github.com/BlockLive/live-protocol/assets/2586086/2c0f9cf3-b0f8-41ba-944f-eaab63e830f2">

### Contributing

Contracts tested, compiled, and deployed with Hardhat on EVM based networks.

Steps to run:

Copy & paste .env.example. Rename to .env

Steps to test:

Setup hardhat.config.ts
At the root of the repo, run `npm test`




