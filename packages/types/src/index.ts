export type CheckoutStatus = "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled";
export type OrderStatus = "created" | "manual_review" | "confirmed" | "canceled" | "shipped" | "fulfilled";

export interface Item { id: string; quantity: number }
export interface Address { name: string; line_one: string; line_two?: string; city: string; state: string; country: string; postal_code: string; phone_number?: string }
export interface Buyer { name: string; email: string; phone_number?: string }
export interface LineItem { id: string; item: Item & { name?: string }; base_amount: number; discount: number; subtotal: number; tax: number; total: number }
export interface FulfillmentOptionShipping { type: "shipping"; id: string; title: string; subtitle: string; carrier: string; earliest_delivery_time: string; latest_delivery_time: string; subtotal: number; tax: number; total: number }
export interface FulfillmentOptionDigital { type: "digital"; id: string; title: string; subtitle?: string; subtotal: number; tax: number; total: number }
export type FulfillmentOption = FulfillmentOptionShipping | FulfillmentOptionDigital;
export type TotalType = "items_base_amount" | "items_discount" | "subtotal" | "discount" | "fulfillment" | "tax" | "fee" | "total" | "amount_refunded";
export interface Total { type: TotalType | string; display_text: string; amount: number }
export interface Message { type: "info" | "error"; code?: string; param?: string; content_type: "plain" | "markdown"; content: string }
export interface Link { type: "terms_of_use" | "privacy_policy" | "seller_shop_policies"; url: string }
export interface PaymentProvider { provider: "stripe" | "adyen" | "braintree"; supported_payment_methods: ("card")[] }
export interface PaymentData { token: string; provider?: "stripe" | "adyen" | "braintree"; billing_address?: Address }

// Enriched Order matching the ACP webhook spec Order schema
export interface OrderLineItem {
  id: string;
  title: string;
  quantity: { ordered: number; current: number; fulfilled: number };
  unit_price: number;
  subtotal: number;
  status?: string;
}
export interface OrderFulfillment {
  id: string;
  type: "shipping" | "digital" | "pickup";
  status: "pending" | "shipped" | "delivered" | "canceled";
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  line_items: { id: string; quantity: number }[];
  events?: { id: string; type: string; occurred_at: string }[];
}
export interface OrderAdjustment {
  id: string;
  type: "refund" | "credit" | "return" | "dispute";
  occurred_at: string;
  status: "pending" | "processing" | "completed" | "failed";
  amount: number;
  currency: string;
  description?: string;
}
export interface Order {
  id: string;
  type: "order";
  order_number?: string;
  checkout_session_id: string;
  permalink_url: string;
  status: OrderStatus;
  currency: string;
  line_items: OrderLineItem[];
  totals: { type: string; display_text: string; amount: number }[];
  fulfillments?: OrderFulfillment[];
  adjustments?: OrderAdjustment[];
  created_at: string;
}

export interface CheckoutSession {
  id: string;
  buyer?: Buyer;
  payment_provider: PaymentProvider;
  status: CheckoutStatus;
  currency: string;
  line_items: LineItem[];
  fulfillment_address?: Address;
  fulfillment_options: FulfillmentOption[];
  fulfillment_option_id?: string;
  totals: Total[];
  messages: Message[];
  links: Link[];
  order?: Order;
  affiliate_attribution?: AffiliateAttribution;
}

// ACP Affiliate Attribution (spec: create + complete requests)
export interface AffiliateAttribution {
  provider: string;
  token: string;
  publisher_id?: string;
  touchpoint: "first" | "last";
}

// ACP Intent Trace (spec: cancel session body)
export interface IntentTrace {
  reason_code: string;
  trace_summary?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface CreateSessionRequest {
  buyer?: Buyer;
  items: Item[];
  fulfillment_address?: Address;
  affiliate_attribution?: AffiliateAttribution;
  currency?: string;
  capabilities?: Record<string, unknown>;
}
export interface UpdateSessionRequest {
  buyer?: Buyer;
  items?: Item[];
  fulfillment_address?: Address;
  fulfillment_option_id?: string;
  selected_fulfillment_options?: unknown[];
}
export interface CompleteSessionRequest {
  buyer?: Buyer;
  payment_data: PaymentData;
  affiliate_attribution?: AffiliateAttribution;
  authentication_result?: unknown;
}
export interface CancelSessionRequest {
  intent_trace?: IntentTrace;
}

// Cart API (spec: openapi.cart.yaml)
export interface CartLineItem {
  id: string;
  item: { id: string; name: string; unit_amount: number };
  quantity: number;
  totals: { type: string; display_text: string; amount: number }[];
}
export interface Cart {
  id: string;
  line_items: CartLineItem[];
  currency: string;
  totals: { type: string; display_text: string; amount: number }[];
  buyer?: { email: string };
  continue_url: string;
  expires_at: string;
}

// Vault Token — persisted by the Delegate Payment endpoint
export interface VaultToken {
  id: string;
  checkout_session_id: string;
  max_amount: number;
  currency: string;
  expires_at: string;
  stripe_pm_id?: string;
}

// Feed API (spec: openapi.feed.yaml)
export interface FeedMetadata {
  id: string;
  target_country?: string;
  updated_at: string;
}
export interface FeedVariant {
  id: string;
  title: string;
  price?: { amount: number; currency: string };
  availability?: { available: boolean; status: string };
  description?: { plain?: string };
}
export interface FeedProduct {
  id: string;
  title: string;
  description?: { plain?: string };
  url?: string;
  media?: { type: string; url: string; alt_text?: string }[];
  variants: FeedVariant[];
}
