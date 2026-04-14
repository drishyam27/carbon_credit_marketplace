#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationStatus {
    Pending,
    Verified,
    Rejected,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    CreditCount,
    PurchaseCount,
    Credit(u64),
    Purchase(u64),
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Credit {
    pub id: u64,
    pub project_name: String,
    pub carbon_amount: i128,
    pub creator_address: Address,
    pub owner_address: Address,
    pub verification_status: VerificationStatus,
    pub is_listed: bool,
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PurchaseStatus {
    Pending,
    Confirmed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Purchase {
    pub id: u64,
    pub credit_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub price: i128,
    pub status: PurchaseStatus,
    pub timestamp: u64,
}

#[contract]
pub struct CarbonMarketplace;

#[contractimpl]
impl CarbonMarketplace {
    /// Initialize the contract with a verifier admin and a stablecoin/token address
    pub fn init(env: Env, admin: Address, token: Address) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "Already initialized");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::CreditCount, &0u64);
        env.storage().instance().set(&DataKey::PurchaseCount, &0u64);
    }

    /// Anyone can create a credit, but it starts as Pending and cannot be listed yet
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
            verification_status: VerificationStatus::Pending, // Prevents infinite mint abuse
            is_listed: false,
            price: 0,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Credit(count), &credit);
        env.events().publish((symbol_short!("created"), count), creator);

        count
    }

    /// Admin verifies the credit authenticity off-chain, then updates status
    pub fn verify_credit(env: Env, admin: Address, credit_id: u64, status: VerificationStatus) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can verify");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        credit.verification_status = status.clone();
        
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);
        env.events().publish((symbol_short!("verified"), credit_id), status);
    }

    /// Owner lists a Verified credit for sale
    pub fn list_credit(env: Env, owner: Address, credit_id: u64, price: i128) {
        owner.require_auth();
        assert!(price > 0, "Price must be strictly positive");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        assert!(credit.owner_address == owner, "Only owner can list");
        assert!(credit.verification_status == VerificationStatus::Verified, "Credit not verified");

        credit.is_listed = true;
        credit.price = price;
        
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);
        env.events().publish((symbol_short!("listed"), credit_id), price);
    }

    /// Buyer purchases a listed credit. Tokens are moved to contract as Escrow.
    pub fn buy_credit(env: Env, buyer: Address, credit_id: u64) -> u64 {
        buyer.require_auth();

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found");
        assert!(credit.is_listed, "Credit is not listed for sale");
        assert!(credit.owner_address != buyer, "Owner cannot buy own credit");

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        // ESCROW FUNDS: Transfer from buyer to this contract
        token_client.transfer(&buyer, &contract_addr, &credit.price);

        let mut p_count: u64 = env.storage().instance().get(&DataKey::PurchaseCount).unwrap();
        p_count += 1;
        env.storage().instance().set(&DataKey::PurchaseCount, &p_count);

        let purchase = Purchase {
            id: p_count,
            credit_id,
            buyer: buyer.clone(),
            seller: credit.owner_address.clone(),
            price: credit.price,
            status: PurchaseStatus::Pending,
            timestamp: env.ledger().timestamp(),
        };

        // Unlist to prevent double spending
        credit.is_listed = false;
        
        env.storage().persistent().set(&DataKey::Purchase(p_count), &purchase);
        env.storage().persistent().set(&DataKey::Credit(credit_id), &credit);

        env.events().publish((symbol_short!("purchased"), credit_id), buyer);
        
        p_count
    }

    /// Buyer confirms physical/off-chain delivery. Funds released to Seller. Ownership transferred.
    pub fn confirm_delivery(env: Env, buyer: Address, purchase_id: u64) {
        buyer.require_auth();

        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found");
        assert!(purchase.buyer == buyer, "Only buyer can confirm");
        assert!(purchase.status == PurchaseStatus::Pending, "Not a pending purchase");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        // RELEASE ESCROW: Funds go to seller
        token_client.transfer(&contract_addr, &purchase.seller, &purchase.price);

        purchase.status = PurchaseStatus::Confirmed;
        credit.owner_address = buyer.clone(); // Transfer ownership permanently

        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);
        env.storage().persistent().set(&DataKey::Credit(purchase.credit_id), &credit);

        env.events().publish((symbol_short!("released"), purchase_id), buyer);
    }

    /// Buyer or Seller can cancel a pending order. Escrow refunded to Buyer.
    pub fn cancel_purchase(env: Env, caller: Address, purchase_id: u64) {
        caller.require_auth();

        let mut purchase: Purchase = env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found");
        assert!(purchase.buyer == caller || purchase.seller == caller, "Only buyer or seller can cancel");
        assert!(purchase.status == PurchaseStatus::Pending, "Not a pending purchase");

        let mut credit: Credit = env.storage().persistent().get(&DataKey::Credit(purchase.credit_id)).unwrap();

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();

        // REFUND BUYER: Escrow returned
        token_client.transfer(&contract_addr, &purchase.buyer, &purchase.price);

        purchase.status = PurchaseStatus::Cancelled;
        credit.is_listed = true; // Relist the credit since sale fell through

        env.storage().persistent().set(&DataKey::Purchase(purchase_id), &purchase);
        env.storage().persistent().set(&DataKey::Credit(purchase.credit_id), &credit);

        env.events().publish((symbol_short!("cancelled"), purchase_id), caller);
    }

    // ====== Read Methods ======
    pub fn get_credit(env: Env, credit_id: u64) -> Credit {
        env.storage().persistent().get(&DataKey::Credit(credit_id)).expect("Credit not found")
    }

    pub fn get_purchase(env: Env, purchase_id: u64) -> Purchase {
        env.storage().persistent().get(&DataKey::Purchase(purchase_id)).expect("Purchase not found")
    }
}

mod test;
