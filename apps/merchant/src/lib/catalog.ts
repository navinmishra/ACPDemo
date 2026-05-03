export interface Product { id: string; name: string; price: number; description: string; stock: number }
export const CATALOG: Product[] = [
  { id: "item_001", name: "White Canvas Sneakers", price: 8900, description: "Minimalist, breathable canvas", stock: 15 },
  { id: "item_002", name: "Wireless Headphones Pro", price: 24900, description: "30hr battery, ANC", stock: 8 },
  { id: "item_003", name: "Merino Wool Sweater", price: 12900, description: "100% merino, temp-regulating", stock: 22 },
  { id: "item_004", name: "Pour-Over Coffee Set", price: 6400, description: "Hand-crafted ceramic set", stock: 12 },
  { id: "item_005", name: "Full-Grain Leather Wallet", price: 4900, description: "RFID blocking, slim profile", stock: 30 },
];
export const findProduct = (id: string) => CATALOG.find(p => p.id === id);