#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _},
    token, Address, Env, String,
};

fn setup_test() -> (Env, CarbonMarketplaceClient<'static>, Address, Address, token::Client<'static>, token::StellarAssetClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Create a generic token (e.g., USDC or XLM) for payment
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_contract.address());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_contract.address());

    // 2. Deploy Carbon Marketplace
    let contract_id = env.register(CarbonMarketplace, ());
    let market_client = CarbonMarketplaceClient::new(&env, &contract_id);

    // 3. Initialize Contract with Admin and Token
    let admin = Address::generate(&env);
    market_client.init(&admin, &token_client.address);

    (env, market_client, admin, token_admin, token_client, token_admin_client)
}

#[test]
fn test_successful_purchase_and_escrow() {
    let (env, market, admin, _, token_client, token_admin) = setup_test();

    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Mint some test tokens to buyer
    token_admin.mint(&buyer, &10_000);
    assert_eq!(token_client.balance(&buyer), 10_000);

    // 1. Creator creates credit
    let credit_id = market.create_credit(
        &creator,
        &String::from_str(&env, "Amazon Reforestation"),
        &100,
    );

    // 2. Admin verifies credit
    market.verify_credit(&admin, &credit_id, &VerificationStatus::Verified);

    // 3. Creator lists credit
    let price = 500;
    market.list_credit(&creator, &credit_id, &price);

    // 4. Buyer purchases credit (funds go to escrow)
    let purchase_id = market.buy_credit(&buyer, &credit_id);
    
    // Check escrow holds funds
    assert_eq!(token_client.balance(&buyer), 9_500);
    assert_eq!(token_client.balance(&market.address), 500); // Contract holds the escrow
    assert_eq!(token_client.balance(&creator), 0);

    // 5. Buyer confirms delivery (funds go to creator, ownership transfers)
    market.confirm_delivery(&buyer, &purchase_id);

    // Check final balances
    assert_eq!(token_client.balance(&market.address), 0);
    assert_eq!(token_client.balance(&creator), 500); // Creator got paid

    // Check ownership
    let credit = market.get_credit(&credit_id);
    assert_eq!(credit.owner_address, buyer);
}

#[test]
#[should_panic(expected = "Credit not verified")]
fn test_cannot_list_unverified() {
    let (env, market, _admin, _, _, _) = setup_test();
    let creator = Address::generate(&env);

    let credit_id = market.create_credit(
        &creator,
        &String::from_str(&env, "Fake Project"),
        &100,
    );

    market.list_credit(&creator, &credit_id, &500); // Should panic
}

#[test]
fn test_cancel_purchase_refunds_escrow() {
    let (env, market, admin, _, token_client, token_admin) = setup_test();

    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);
    token_admin.mint(&buyer, &10_000);

    let credit_id = market.create_credit(&creator, &String::from_str(&env, "Wind Project"), &100);
    market.verify_credit(&admin, &credit_id, &VerificationStatus::Verified);
    market.list_credit(&creator, &credit_id, &500);

    let purchase_id = market.buy_credit(&buyer, &credit_id);
    assert_eq!(token_client.balance(&buyer), 9_500);
    assert_eq!(token_client.balance(&market.address), 500);

    // Seller or buyer can cancel
    market.cancel_purchase(&creator, &purchase_id);

    // Funds refunded to buyer
    assert_eq!(token_client.balance(&buyer), 10_000);
    assert_eq!(token_client.balance(&market.address), 0);
    
    // Credit is automatically relisted
    let credit = market.get_credit(&credit_id);
    assert!(credit.is_listed);
}
