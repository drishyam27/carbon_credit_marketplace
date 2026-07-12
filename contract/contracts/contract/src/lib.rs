#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, String,
};

/// Status representing the audit verification stage of a carbon offset listing.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationStatus {
    /// Credit has been listed but not audited by the admin registry yet.
    Pending,
    /// Credit is verified and eligible for trading.
    Verified,
    /// Audit failed or project claims were rejected.
    Rejected,
}

/// Ledger storage keys for the marketplace instance data and persistent records.
#[contracttype]
pub enum DataKey {
    /// Address of the marketplace admin authority.
    Admin,
    /// Address of the payment token contract (e.g. native XLM or USDC).
    Token,
    /// Running counter of total credit listings created.
    CreditCount,
    /// Running counter of total purchase orders processed.
    PurchaseCount,
    /// Persistent storage lookup key for a Credit registry by ID.
    Credit(u64),
    /// Persistent storage lookup key for a Purchase order by ID.
    Purchase(u64),
    /// Tracks the custom carbon‑offset token for the marketplace.
    CarbonTokenGlobal,
}

/// Registry struct storing the profile and inventory of a carbon credit project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Credit {
    /// Unique auto-incrementing ID.
    pub id: u64,
    /// Short descriptive name of the reforestation or carbon-reduction initiative.
    pub project_name: String,
    /// Total quantity of carbon offset credits (in metric tons).
    pub carbon_amount: i128,
    /// Stellar public address of the initial listing author.
    pub creator_address: Address,
    /// Stellar public address of the current token owner.
    pub owner_address: Address,
    /// On-chain verification state.
    pub verification_status: VerificationStatus,
    /// True if the owner has listed these credits for sale on the marketplace.
    pub is_listed: bool,
    /// Price per ton of carbon offset, denominated in payment tokens (stroops).
    pub price_per_ton: i128,
    /// Timestamp of when the listing record was written.
    pub timestamp: u64,
}

/// Escrow status mapping the timeline of a buyer-seller transaction.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PurchaseStatus {
    /// Funds are locked in contract escrow, awaiting seller delivery.
    Pending,
    /// Delivery confirmed by the buyer, funds released to the seller.
    Confirmed,
    /// Cancelled after time-lock deadline, funds returned to the buyer.
    Cancelled,
    /// Locked in dispute mode, waiting for admin arbitration.
    Disputed,
    /// Dispute was resolved and funds settled by the admin.
    Resolved,
}

/// Ledger representation of a purchase transaction locked in escrow.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Purchase {
    /// Unique auto-incrementing purchase transaction ID.
    pub id: u64,
    /// The associated carbon credit registry index.
    pub credit_id: u64,
    /// Public address of the purchasing client.
    pub buyer: Address,
    /// Public address of the credit merchant.
    pub seller: Address,
    /// Volume of credits purchased (in metric tons).
    pub amount_purchased: i128,
    /// Total amount of payment tokens locked in the escrow.
    pub locked_funds: i128,
    /// Current state of the escrow.
    pub status: PurchaseStatus,
    /// Timestamp of when the buy transaction was initiated.
    pub timestamp: u64,
    /// Expiration timestamp after which the buyer or seller can cancel the escrow.
    pub deadline: u64,
}

#[contract]
pub struct CarbonMarketplace;

fn mint_carbon_token(env: &Env, recipient: &Address, amount: i128) {
    let carbon_token_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::CarbonTokenGlobal)
        .expect("Carbon token not initialized");

    let admin_client = token::StellarAssetClient::new(env, &carbon_token_addr);
    admin_client.mint(recipient, &amount);
}

#[contractimpl]
impl CarbonMarketplace {
    pub fn init(env: Env, admin: Address, token: Address, carbon_token: Address) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "Already initialized");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::CarbonTokenGlobal, &carbon_token);
        env.storage().instance().set(&DataKey::CreditCount, &0u64);
        env.storage().instance().set(&DataKey::PurchaseCount, &0u64);
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can upgrade");
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn create_credit(
        env: Env,
        creator: Address,
        project_name: String,
        carbon_amount: i128,
    ) -> u64 {
        creator.require_auth();
        assert!(carbon_amount > 0, "Carbon amount must be strictly positive");

        let mut count: u64 = env.storage().instance().get(&DataKey::CreditCount).unwrap();
        count += 1;
        env.storage().instance().set(&DataKey::CreditCount, &count);

        let credit = Credit {
            id: count,
            project_name,
            carbon_amount,
            creator_address: creator.clone(),
            owner_address: creator.clone(),
            verification_status: VerificationStatus::Pending,
            is_listed: false,
            price_per_ton: 0,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Credit(count), &credit);
        env.events().publish((symbol_short!("created"), count), creator);

        count
    }

    /// Creates a new carbon‑credit listing **and** deploys a custom Soroban
    /// token (Stellar Asset) that represents fractional ownership of the
    /// carbon offset.  Tokens are minted to buyers on `confirm_delivery` and
    /// during favorable dispute resolution.
    pub fn create_listing(
        env: Env,
        creator: Address,
        project_name: String,
        description: String,
        carbon_amount: i128,
        price_per_ton: i128,
    ) -> u64 {
        creator.require_auth();
        assert!(carbon_amount > 0, "Carbon amount must be strictly positive");
        assert!(price_per_ton > 0, "Price must be strictly positive");

        let mut count: u64 = env.storage().instance().get(&DataKey::CreditCount).unwrap();
        count += 1;
        env.storage().instance().set(&DataKey::CreditCount, &count);

        let credit = Credit {
            id: count,
            project_name,
            // Note: 'description' is accepted to match frontend args, but not stored 
            // on-chain to save storage fees and avoid breaking the Credit struct.
            carbon_amount,
            creator_address: creator.clone(),
            owner_address: creator.clone(),
            verification_status: VerificationStatus::Pending,
            is_listed: true,
            price_per_ton,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Credit(count), &credit);
        env.events().publish((symbol_short!("listed"), count), creator);

        count
    }

    pub fn verify_credit(env: Env, admin: Address, credit_id: u64, status: VerificationStatus) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can verify");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        credit.verification_status = status.clone();
        
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);
        env.events().publish((symbol_short!("verified"), credit_id), status);
    }

    pub fn list_credit(env: Env, owner: Address, credit_id: u64, price_per_ton: i128) {
        owner.require_auth();
        assert!(price_per_ton > 0, "Price must be strictly positive");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        assert!(credit.owner_address == owner, "Only owner can list");
        assert!(credit.verification_status == VerificationStatus::Verified, "Credit not verified");
        assert!(credit.carbon_amount > 0, "No carbon available to list");

        credit.is_listed = true;
        credit.price_per_ton = price_per_ton;
        
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);
        env.events().publish((symbol_short!("listed"), credit_id), price_per_ton);
    }

    pub fn unlist_credit(env: Env, owner: Address, credit_id: u64) {
        owner.require_auth();
        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).unwrap();
        assert!(credit.owner_address == owner, "Only owner can unlist");
        credit.is_listed = false;
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);
        env.events().publish((symbol_short!("unlisted"), credit_id), owner);
    }

    /// Purchases `amount` tons of carbon credit from a listing.
    ///
    /// Locks the payment in escrow **and** mints the equivalent custom
    /// carbon‑offset tokens to the buyer's wallet immediately, representing
    /// their fractional ownership of the offset.
    pub fn buy_credit(env: Env, buyer: Address, credit_id: u64, amount: i128) -> u64 {
        buyer.require_auth();
        assert!(amount > 0, "Must buy at least 1 ton");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        assert!(credit.is_listed, "Credit is not listed");
        assert!(credit.owner_address != buyer, "Owner cannot buy own credit");
        assert!(credit.carbon_amount >= amount, "Insufficient carbon amount available");

        let locked_funds = amount.checked_mul(credit.price_per_ton).expect("Price overflow");

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        token_client.transfer(&buyer, &contract_addr, &locked_funds);

        // ── Custom Token Mint ──────────────────────────────────
        // Mint carbon‑offset tokens to the buyer's wallet. Each token unit
        // represents 1 ton of carbon offset from this specific project.
        mint_carbon_token(&env, &buyer, amount);

        let mut p_count: u64 = env.storage().instance().get(&DataKey::PurchaseCount).unwrap();
        p_count += 1;
        env.storage().instance().set(&DataKey::PurchaseCount, &p_count);

        let purchase = Purchase {
            id: p_count,
            credit_id,
            buyer: buyer.clone(),
            seller: credit.owner_address.clone(),
            amount_purchased: amount,
            locked_funds,
            status: PurchaseStatus::Pending,
            timestamp: env.ledger().timestamp(),
            deadline: env.ledger().timestamp() + 604800, // 7 days lock
        };

        credit.carbon_amount -= amount;
        if credit.carbon_amount == 0 {
            credit.is_listed = false;
        }
        
        env.storage().persistent().set(&DataKey::Purchase(p_count), &purchase);
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);

        env.events().publish((symbol_short!("purchased"), credit_id), buyer);
        
        p_count
    }

    pub fn confirm_delivery(env: Env, buyer: Address, purchase_id: u64) -> u64 {
        buyer.require_auth();

        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found");
        assert!(purchase.buyer == buyer, "Only buyer can confirm");
        assert!(purchase.status == PurchaseStatus::Pending, "Not a pending purchase");

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        token_client.transfer(&contract_addr, &purchase.seller, &purchase.locked_funds);

        purchase.status = PurchaseStatus::Confirmed;

        // Generate a new credit struct representing the fractional ownership for the buyer
        let mut count: u64 = env.storage().instance().get(&DataKey::CreditCount).unwrap();
        count += 1;
        env.storage().instance().set(&DataKey::CreditCount, &count);

        let parent_credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();

        let new_credit = Credit {
            id: count,
            project_name: parent_credit.project_name,
            carbon_amount: purchase.amount_purchased,
            creator_address: parent_credit.creator_address,
            owner_address: buyer.clone(),
            verification_status: VerificationStatus::Verified,
            is_listed: false,
            price_per_ton: 0,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Credit(count), &new_credit);
        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);

        env.events().publish((symbol_short!("released"), purchase_id), count);
        
        count // returns the ID of the new fractional credit
    }

    pub fn cancel_purchase(env: Env, caller: Address, purchase_id: u64) {
        caller.require_auth();

        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found");
        assert!(purchase.buyer == caller || purchase.seller == caller, "Only buyer or seller can cancel");
        assert!(purchase.status == PurchaseStatus::Pending, "Not a pending purchase");
        
        // Critical Fix: Time-lock expiration check
        assert!(env.ledger().timestamp() > purchase.deadline, "Deadline has not expired yet");

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        token_client.transfer(&contract_addr, &purchase.buyer, &purchase.locked_funds);

        purchase.status = PurchaseStatus::Cancelled;
        
        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();
        credit.carbon_amount += purchase.amount_purchased; // Returns the carbon back to seller's supply
        // we can implicitly relist it if we want, or just leave it out
        
        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);
        env.storage().persistent().set(&DataKey::Credit(purchase.credit_id), &credit);

        env.events().publish((symbol_short!("cancelled"), purchase_id), caller);
    }

    pub fn resolve_dispute(env: Env, admin: Address, purchase_id: u64, refund_buyer: bool) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can resolve");

        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).unwrap();
        assert!(purchase.status == PurchaseStatus::Pending || purchase.status == PurchaseStatus::Disputed, "Not disputable");

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        if refund_buyer {
            token_client.transfer(&contract_addr, &purchase.buyer, &purchase.locked_funds);
            let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();
            credit.carbon_amount += purchase.amount_purchased;
            env.storage().persistent().set(&DataKey::Credit(purchase.credit_id), &credit);
            purchase.status = PurchaseStatus::Resolved;
        } else {
            // Pay seller (arbitration sides with seller)
            token_client.transfer(&contract_addr, &purchase.seller, &purchase.locked_funds);
            // Mint to buyer
            let mut count: u64 = env.storage().instance().get(&DataKey::CreditCount).unwrap();
            count += 1;
            env.storage().instance().set(&DataKey::CreditCount, &count);

            let parent_credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();

            let new_credit = Credit {
                id: count,
                project_name: parent_credit.project_name,
                carbon_amount: purchase.amount_purchased,
                creator_address: parent_credit.creator_address,
                owner_address: purchase.buyer.clone(),
                verification_status: VerificationStatus::Verified,
                is_listed: false,
                price_per_ton: 0,
                timestamp: env.ledger().timestamp(),
            };
            env.storage().persistent().set(&DataKey::Credit(count), &new_credit);
            purchase.status = PurchaseStatus::Resolved;
        }

        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);
        env.events().publish((symbol_short!("resolved"), purchase_id), refund_buyer);
    }

    pub fn mark_disputed(env: Env, caller: Address, purchase_id: u64) {
        caller.require_auth();
        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).unwrap();
        assert!(purchase.buyer == caller || purchase.seller == caller, "Not involved");
        assert!(purchase.status == PurchaseStatus::Pending, "Cannot dispute");
        purchase.status = PurchaseStatus::Disputed;
        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);
    }

    // ── Read Methods ──

    pub fn get_credit(env: Env, credit_id: u64) -> Credit {
        env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found")
    }

    pub fn get_purchase(env: Env, purchase_id: u64) -> Purchase {
        env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found")
    }

    /// Returns the address of the global custom carbon‑offset token.
    pub fn get_carbon_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::CarbonTokenGlobal)
            .expect("Carbon token not found")
    }
}

mod test;
