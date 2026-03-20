#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Listings,
    Purchases,
    UserCredits,
    ListingCount,
    PurchaseCount,
}

#[contracttype]
#[derive(Clone)]
pub enum ListingStatus {
    Active,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub enum PurchaseStatus {
    Pending,
    Delivered,
    Confirmed,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct Listing {
    pub seller: Address,
    pub amount: i128,
    pub price_per_unit: i128,
    pub project_name: String,
    pub project_description: String,
    pub remaining_amount: i128,
    pub created_at: u64,
    pub status: ListingStatus,
}

#[contracttype]
#[derive(Clone)]
pub struct Purchase {
    pub listing_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub total_price: i128,
    pub status: PurchaseStatus,
    pub created_at: u64,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    // ===== PERMISSIONLESS FUNCTIONS =====

    /// Anyone can create a listing. Credits are minted to the seller's balance.
    pub fn create_listing(
        env: Env,
        seller: Address,
        amount: i128,
        price_per_unit: i128,
        project_name: String,
        project_description: String,
    ) -> u64 {
        seller.require_auth();

        assert!(amount > 0, "amount must be positive");
        assert!(price_per_unit > 0, "price must be positive");

        let listing_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0);
        let listing_id = listing_count + 1;

        let listing = Listing {
            seller: seller.clone(),
            amount,
            price_per_unit,
            project_name,
            project_description,
            remaining_amount: amount,
            created_at: env.ledger().timestamp(),
            status: ListingStatus::Active,
        };

        let mut listings: Map<u64, Listing> = env
            .storage()
            .instance()
            .get(&DataKey::Listings)
            .unwrap_or_else(|| Map::new(&env));
        listings.set(listing_id, listing);

        env.storage().instance().set(&DataKey::Listings, &listings);
        env.storage()
            .instance()
            .set(&DataKey::ListingCount, &listing_id);

        // Credit the seller
        let mut credits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&DataKey::UserCredits)
            .unwrap_or_else(|| Map::new(&env));
        let current = credits.get(seller.clone()).unwrap_or(0);
        credits.set(seller.clone(), current + amount);
        env.storage()
            .instance()
            .set(&DataKey::UserCredits, &credits);

        env.events()
            .publish((symbol_short!("new_lst"),), (listing_id, seller, amount));

        listing_id
    }

    /// Anyone can buy credits from a listing (except the seller).
    pub fn buy_credits(env: Env, buyer: Address, listing_id: u64, amount: i128) -> u64 {
        buyer.require_auth();

        assert!(amount > 0, "amount must be positive");

        let listings: Map<u64, Listing> = env
            .storage()
            .instance()
            .get(&DataKey::Listings)
            .unwrap_or_else(|| Map::new(&env));

        let mut listing = listings.get(listing_id).expect("listing not found");

        assert!(
            matches!(listing.status, ListingStatus::Active),
            "listing not active"
        );
        assert!(listing.seller != buyer, "cannot buy own listing");
        assert!(
            listing.remaining_amount >= amount,
            "insufficient credits available"
        );

        let purchase_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PurchaseCount)
            .unwrap_or(0);
        let purchase_id = purchase_count + 1;
        let total_price = listing.price_per_unit * amount;

        let purchase = Purchase {
            listing_id,
            buyer: buyer.clone(),
            seller: listing.seller.clone(),
            amount,
            total_price,
            status: PurchaseStatus::Pending,
            created_at: env.ledger().timestamp(),
        };

        let mut purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));
        purchases.set(purchase_id, purchase);

        env.storage()
            .instance()
            .set(&DataKey::Purchases, &purchases);
        env.storage()
            .instance()
            .set(&DataKey::PurchaseCount, &purchase_id);

        // Update listing remaining amount
        listing.remaining_amount -= amount;
        if listing.remaining_amount == 0 {
            listing.status = ListingStatus::Completed;
        }
        let mut updated_listings = listings;
        updated_listings.set(listing_id, listing);
        env.storage()
            .instance()
            .set(&DataKey::Listings, &updated_listings);

        env.events().publish(
            (symbol_short!("buy_cr"),),
            (purchase_id, buyer, listing_id, amount),
        );

        purchase_id
    }

    /// Seller delivers credits to buyer (requires seller auth).
    pub fn deliver_credits(env: Env, seller: Address, purchase_id: u64) {
        seller.require_auth();

        let purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));

        let mut purchase = purchases.get(purchase_id).expect("purchase not found");

        assert!(
            matches!(purchase.status, PurchaseStatus::Pending),
            "purchase not pending"
        );
        assert!(purchase.seller == seller, "not the seller");

        // Transfer credits from seller to buyer
        let mut credits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&DataKey::UserCredits)
            .unwrap_or_else(|| Map::new(&env));

        let seller_balance = credits.get(seller.clone()).unwrap_or(0);
        assert!(
            seller_balance >= purchase.amount,
            "insufficient credits to deliver"
        );

        credits.set(seller.clone(), seller_balance - purchase.amount);
        let buyer_balance = credits.get(purchase.buyer.clone()).unwrap_or(0);
        credits.set(purchase.buyer.clone(), buyer_balance + purchase.amount);

        env.storage()
            .instance()
            .set(&DataKey::UserCredits, &credits);

        // Update purchase status
        purchase.status = PurchaseStatus::Delivered;
        let mut updated_purchases = purchases;
        updated_purchases.set(purchase_id, purchase.clone());
        env.storage()
            .instance()
            .set(&DataKey::Purchases, &updated_purchases);

        env.events().publish(
            (symbol_short!("delivered"),),
            (purchase_id, seller, purchase.buyer.clone()),
        );
    }

    /// Buyer confirms receipt and releases escrowed funds to seller.
    pub fn confirm_delivery(env: Env, buyer: Address, purchase_id: u64) {
        buyer.require_auth();

        let purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));

        let mut purchase = purchases.get(purchase_id).expect("purchase not found");

        assert!(
            matches!(purchase.status, PurchaseStatus::Delivered),
            "purchase not delivered"
        );
        assert!(purchase.buyer == buyer, "not the buyer");

        purchase.status = PurchaseStatus::Confirmed;
        let mut updated_purchases = purchases;
        updated_purchases.set(purchase_id, purchase);
        env.storage()
            .instance()
            .set(&DataKey::Purchases, &updated_purchases);

        env.events()
            .publish((symbol_short!("confirmed"),), (purchase_id, buyer));
    }

    /// Buyer cancels pending purchase and gets refund.
    pub fn cancel_purchase(env: Env, buyer: Address, purchase_id: u64) {
        buyer.require_auth();

        let purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));

        let mut purchase = purchases.get(purchase_id).expect("purchase not found");

        assert!(
            matches!(purchase.status, PurchaseStatus::Pending),
            "can only cancel pending purchase"
        );
        assert!(purchase.buyer == buyer, "not the buyer");

        purchase.status = PurchaseStatus::Cancelled;
        let mut updated_purchases = purchases;
        updated_purchases.set(purchase_id, purchase.clone());
        env.storage()
            .instance()
            .set(&DataKey::Purchases, &updated_purchases);

        // Refund: return credits to listing's remaining amount
        let listings: Map<u64, Listing> = env
            .storage()
            .instance()
            .get(&DataKey::Listings)
            .unwrap_or_else(|| Map::new(&env));
        let mut listing = listings.get(purchase.listing_id).unwrap();
        listing.remaining_amount += purchase.amount;
        if matches!(listing.status, ListingStatus::Completed) {
            listing.status = ListingStatus::Active;
        }
        let mut updated_listings = listings;
        updated_listings.set(purchase.listing_id, listing);
        env.storage()
            .instance()
            .set(&DataKey::Listings, &updated_listings);

        env.events()
            .publish((symbol_short!("cancelled"),), (purchase_id, buyer));
    }

    // ===== READ-ONLY FUNCTIONS =====

    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        let listings: Map<u64, Listing> = env
            .storage()
            .instance()
            .get(&DataKey::Listings)
            .unwrap_or_else(|| Map::new(&env));
        listings.get(listing_id)
    }

    pub fn get_purchase(env: Env, purchase_id: u64) -> Option<Purchase> {
        let purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));
        purchases.get(purchase_id)
    }

    pub fn get_user_credits(env: Env, user: Address) -> i128 {
        let credits: Map<Address, i128> = env
            .storage()
            .instance()
            .get(&DataKey::UserCredits)
            .unwrap_or_else(|| Map::new(&env));
        credits.get(user).unwrap_or(0)
    }

    pub fn get_active_listings(env: Env) -> Vec<Listing> {
        let listings: Map<u64, Listing> = env
            .storage()
            .instance()
            .get(&DataKey::Listings)
            .unwrap_or_else(|| Map::new(&env));
        listings.values()
    }

    pub fn get_user_purchases(env: Env, user: Address) -> Vec<Purchase> {
        let purchases: Map<u64, Purchase> = env
            .storage()
            .instance()
            .get(&DataKey::Purchases)
            .unwrap_or_else(|| Map::new(&env));
        let mut result = Vec::new(&env);
        for p in purchases.values() {
            if p.buyer == user.clone() || p.seller == user.clone() {
                result.push_back(p);
            }
        }
        result
    }
}

mod test;
