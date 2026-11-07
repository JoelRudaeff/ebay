CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id      SERIAL PRIMARY KEY,
    name    TEXT UNIQUE NOT NULL,
    slug    TEXT UNIQUE NOT NULL
);

CREATE TABLE products (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    category_id     INTEGER REFERENCES categories(id),
    seller_id       INTEGER REFERENCES users(id),
    price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
    currency        TEXT NOT NULL DEFAULT 'USD',
    condition       TEXT NOT NULL DEFAULT 'used' CHECK (condition IN ('new', 'used', 'refurbished')),
    stock_qty       INTEGER NOT NULL DEFAULT 1,
    listing_type    TEXT NOT NULL DEFAULT 'fixed' CHECK (listing_type IN ('fixed', 'auction')),
    highest_bid_cents INTEGER,
    bid_count       INTEGER NOT NULL DEFAULT 0,
    image_emoji     TEXT NOT NULL DEFAULT '📦',
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    buyer_id        INTEGER REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
    total_cents     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER REFERENCES products(id),
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL
);

CREATE TABLE cart_items (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, product_id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
