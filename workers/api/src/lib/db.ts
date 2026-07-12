export interface ProductRow {
  id: string;
  kind: 'configurable' | 'unique';
  name: string;
  price_mxn: number;
  stock: number | null;
  active: number;
}

export interface OrderRow {
  id: string;
  provider_session_id: string;
  product_id: string;
  config_json: string | null;
  amount_mxn: number;
  customer_name: string | null;
  shipping_json: string | null;
  status: string;
  paid_at: string | null;
}
