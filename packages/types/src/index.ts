export type CheckoutStatus = "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled";
export type OrderStatus = "created" | "manual_review" | "confirmed" | "canceled" | "shipped" | "fulfilled";
export interface Item { id: string; quantity: number }
export interface Address { name: string; line_one: string; line_two?: string; city: string; state: string; country: string; postal_code: string; phone_number?: string }
export interface Buyer { name: string; email: string; phone_number?: string }
export interface LineItem { id: string; item: Item & { name?: string }; base_amount: number; discount: number; subtotal: number; tax: number; total: number }
export interface FulfillmentOptionShipping { type: "shipping"; id: string; title: string; subtitle: string; carrier: string; earliest_delivery_time: string; latest_delivery_time: string; subtotal: number; tax: number; total: number }
export interface FulfillmentOptionDigital { type: "digital"; id: string; title: string; subtitle?: string; subtotal: number; tax: number; total: number }
export type FulfillmentOption = FulfillmentOptionShipping | FulfillmentOptionDigital;
export type TotalType = "items_base_amount" | "items_discount" | "subtotal" | "discount" | "fulfillment" | "tax" | "fee" | "total";
export interface Total { type: TotalType; display_text: string; amount: number }
export interface Message { type: "info" | "error"; code?: string; param?: string; content_type: "plain" | "markdown"; content: string }
export interface Link { type: "terms_of_use" | "privacy_policy" | "seller_shop_policies"; url: string }
export interface PaymentProvider { provider: "stripe" | "adyen" | "braintree"; supported_payment_methods: ("card")[] }
export interface PaymentData { token: string; provider: "stripe" | "adyen" | "braintree"; billing_address?: Address }
export interface Order { id: string; checkout_session_id: string; permalink_url: string }
export interface CheckoutSession { id: string; buyer?: Buyer; payment_provider: PaymentProvider; status: CheckoutStatus; currency: string; line_items: LineItem[]; fulfillment_address?: Address; fulfillment_options: FulfillmentOption[]; fulfillment_option_id?: string; totals: Total[]; messages: Message[]; links: Link[]; order?: Order }
export interface CreateSessionRequest { buyer?: Buyer; items: Item[]; fulfillment_address?: Address }
export interface UpdateSessionRequest { buyer?: Buyer; items?: Item[]; fulfillment_address?: Address; fulfillment_option_id?: string }
export interface CompleteSessionRequest { buyer?: Buyer; payment_data: PaymentData }
export interface WebhookEvent { type: "order_created" | "order_updated"; data: { type: "order"; checkout_session_id: string; permalink_url: string; status: OrderStatus; refunds: { type: "store_credit" | "original_payment"; amount: number }[] } }