#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

#[test]
fn test_create_listing_and_receive_credits() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);

    // Create listing with 100 tons of carbon credits
    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128, // 500 XLM per ton
        &String::from_str(&env, "Amazon Forest Project"),
        &String::from_str(&env, "Protecting 1000 acres of rainforest"),
    );

    assert_eq!(listing_id, 1);

    let listing = client.get_listing(&listing_id).unwrap();
    assert_eq!(listing.amount, 100i128);
    assert_eq!(listing.remaining_amount, 100i128);
    assert_eq!(listing.price_per_unit, 500i128);
    assert!(matches!(listing.status, ListingStatus::Active));

    // Seller should have received the credits
    assert_eq!(client.get_user_credits(&seller), 100i128);
}

#[test]
fn test_buy_credits_creates_pending_purchase() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Seller creates listing
    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Wind Farm Project"),
        &String::from_str(&env, "50MW wind farm in Texas"),
    );

    // Buyer buys 30 tons
    let purchase_id = client.buy_credits(&buyer, &listing_id, &30i128);

    assert_eq!(purchase_id, 1);

    let purchase = client.get_purchase(&purchase_id).unwrap();
    assert_eq!(purchase.listing_id, listing_id);
    assert_eq!(purchase.buyer, buyer);
    assert_eq!(purchase.seller, seller);
    assert_eq!(purchase.amount, 30i128);
    assert_eq!(purchase.total_price, 15000i128); // 30 * 500
    assert!(matches!(purchase.status, PurchaseStatus::Pending));

    // Listing remaining amount should be reduced
    let listing = client.get_listing(&listing_id).unwrap();
    assert_eq!(listing.remaining_amount, 70i128);
}

#[test]
fn test_deliver_credits_transfers_to_buyer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Seller creates listing
    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Solar Project"),
        &String::from_str(&env, "10MW solar farm"),
    );

    // Buyer buys credits
    let purchase_id = client.buy_credits(&buyer, &listing_id, &30i128);

    // Check balances before delivery
    assert_eq!(client.get_user_credits(&seller), 100i128);
    assert_eq!(client.get_user_credits(&buyer), 0i128);

    // Seller delivers credits
    client.deliver_credits(&seller, &purchase_id);

    // Check purchase status
    let purchase = client.get_purchase(&purchase_id).unwrap();
    assert!(matches!(purchase.status, PurchaseStatus::Delivered));

    // Credits transferred to buyer
    assert_eq!(client.get_user_credits(&buyer), 30i128);
    // Seller's balance reduced by delivered amount
    assert_eq!(client.get_user_credits(&seller), 70i128); // 100 - 30
}

#[test]
fn test_confirm_delivery_completes_purchase() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Reforestation"),
        &String::from_str(&env, "Planting 10,000 trees"),
    );

    let purchase_id = client.buy_credits(&buyer, &listing_id, &30i128);

    // Seller delivers
    client.deliver_credits(&seller, &purchase_id);

    // Buyer confirms delivery
    client.confirm_delivery(&buyer, &purchase_id);

    let purchase = client.get_purchase(&purchase_id).unwrap();
    assert!(matches!(purchase.status, PurchaseStatus::Confirmed));

    // Credits remain with buyer
    assert_eq!(client.get_user_credits(&buyer), 30i128);
}

#[test]
fn test_cancel_purchase_refunds_buyer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Ocean Conservation"),
        &String::from_str(&env, "Protecting marine ecosystems"),
    );

    let purchase_id = client.buy_credits(&buyer, &listing_id, &30i128);

    // Buyer cancels
    client.cancel_purchase(&buyer, &purchase_id);

    let purchase = client.get_purchase(&purchase_id).unwrap();
    assert!(matches!(purchase.status, PurchaseStatus::Cancelled));

    // Listing remaining amount restored
    let listing = client.get_listing(&listing_id).unwrap();
    assert_eq!(listing.remaining_amount, 100i128);
}

#[test]
#[should_panic(expected = "cannot buy own listing")]
fn test_cannot_buy_own_listing() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Test"),
    );

    // Seller tries to buy own listing
    client.buy_credits(&seller, &listing_id, &30i128);
}

#[test]
#[should_panic(expected = "insufficient credits available")]
fn test_cannot_buy_more_than_available() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &50i128,
        &500i128,
        &String::from_str(&env, "Small Project"),
        &String::from_str(&env, "Only 50 tons"),
    );

    // Try to buy more than available
    client.buy_credits(&buyer, &listing_id, &100i128);
}

#[test]
#[should_panic(expected = "not the buyer")]
fn test_cannot_confirm_delivery_as_non_buyer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let attacker = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Test"),
    );

    let purchase_id = client.buy_credits(&buyer, &listing_id, &30i128);

    // Seller delivers
    client.deliver_credits(&seller, &purchase_id);

    // Attacker tries to confirm (should fail)
    client.confirm_delivery(&attacker, &purchase_id);
}

#[test]
fn test_get_active_listings() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller1 = Address::generate(&env);
    let seller2 = Address::generate(&env);

    client.create_listing(
        &seller1,
        &100i128,
        &500i128,
        &String::from_str(&env, "Project A"),
        &String::from_str(&env, "Description A"),
    );

    client.create_listing(
        &seller2,
        &200i128,
        &600i128,
        &String::from_str(&env, "Project B"),
        &String::from_str(&env, "Description B"),
    );

    let listings = client.get_active_listings();
    assert_eq!(listings.len(), 2);
}

#[test]
fn test_get_user_purchases() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Test"),
    );

    client.buy_credits(&buyer, &listing_id, &30i128);

    // Get purchases for buyer
    let buyer_purchases = client.get_user_purchases(&buyer);
    assert_eq!(buyer_purchases.len(), 1);

    // Get purchases for seller
    let seller_purchases = client.get_user_purchases(&seller);
    assert_eq!(seller_purchases.len(), 1);
}

#[test]
fn test_listing_completes_when_all_sold() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    let listing_id = client.create_listing(
        &seller,
        &100i128,
        &500i128,
        &String::from_str(&env, "Full Sale Project"),
        &String::from_str(&env, "All credits sold"),
    );

    // Buy all credits
    client.buy_credits(&buyer, &listing_id, &100i128);

    let listing = client.get_listing(&listing_id).unwrap();
    assert_eq!(listing.remaining_amount, 0i128);
    assert!(matches!(listing.status, ListingStatus::Completed));
}
