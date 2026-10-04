export type Role = 'admin' | 'operator';
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  stock: number;
  min_stock: number;
  active: boolean;
  created_at: string;
}
export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  min_stock: number;
  initial_stock?: number;
}
export interface Movement {
  id: number;
  product_id: number;
  kind: 'IN' | 'OUT';
  quantity: number;
  note: string;
  product_name: string;
  sku: string;
  actor_name: string | null;
  order_id: number | null;
  created_at: string;
}
export interface OrderLine {
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  price_cents: number;
}
export interface Order {
  id: number;
  customer: string;
  note: string;
  status: 'confirmed' | 'cancelled';
  total_cents: number;
  actor_name: string;
  created_at: string;
  lines?: OrderLine[];
}
export interface Report {
  products: number;
  units: number;
  value_cents: number;
  low_stock: number;
  orders: number;
  revenue_cents: number;
  categories: { category: string; units: number; value_cents: number }[];
  daily_sales: { day: string; total_cents: number; orders: number }[];
  top_products: { name: string; quantity: number; total_cents: number }[];
}
