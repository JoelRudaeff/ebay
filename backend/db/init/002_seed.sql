CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Demo seller account. Password: sellerpass123
INSERT INTO users (email, password_hash, display_name, role)
VALUES ('seller@example.com', crypt('sellerpass123', gen_salt('bf')), 'Demo Seller', 'seller');

INSERT INTO categories (name, slug) VALUES
    ('Electronics', 'electronics'),
    ('Home & Garden', 'home-garden'),
    ('Collectibles', 'collectibles'),
    ('Fashion', 'fashion'),
    ('Sporting Goods', 'sporting-goods'),
    ('Books', 'books');

INSERT INTO products (title, description, category_id, seller_id, price_cents, condition, stock_qty, listing_type, highest_bid_cents, bid_count, image_emoji) VALUES
    ('Wireless Noise-Cancelling Headphones', 'Over-ear Bluetooth headphones with 30-hour battery life.', 1, 1, 8999, 'new', 12, 'fixed', NULL, 0, '🎧'),
    ('Mechanical Keyboard - Hot-Swappable', 'RGB mechanical keyboard with hot-swap switches and PBT keycaps.', 1, 1, 6499, 'new', 8, 'fixed', NULL, 0, '⌨️'),
    ('Vintage Polaroid Camera', 'Fully working 1970s instant camera, recently serviced.', 3, 1, 4500, 'used', 1, 'auction', 5200, 7, '📷'),
    ('Cast Iron Dutch Oven, 6qt', 'Pre-seasoned enameled cast iron dutch oven.', 2, 1, 5999, 'new', 15, 'fixed', NULL, 0, '🍲'),
    ('Leather Messenger Bag', 'Full-grain leather bag, handmade, fits 15" laptop.', 4, 1, 12999, 'new', 5, 'fixed', NULL, 0, '💼'),
    ('Carbon Fiber Road Bike Frame', 'Size 56cm carbon frame, lightly used one season.', 5, 1, 45000, 'used', 1, 'auction', 47500, 14, '🚴'),
    ('First Edition Sci-Fi Novel Set', 'Collector''s hardcover set, three volumes, mint condition.', 6, 1, 22000, 'new', 2, 'auction', 23100, 4, '📚'),
    ('Smart Home Hub', '4-in-1 hub: zigbee, z-wave, bluetooth and wifi bridge.', 1, 1, 3999, 'new', 20, 'fixed', NULL, 0, '🏠'),
    ('Running Shoes - Trail Edition', 'Waterproof trail running shoes, men''s size 10.', 5, 1, 8500, 'new', 10, 'fixed', NULL, 0, '👟'),
    ('Antique Brass Compass', 'Working nautical compass, early 1900s reproduction.', 3, 1, 3200, 'used', 3, 'fixed', NULL, 0, '🧭'),
    ('4K Action Camera', 'Waterproof action camera with stabilization and accessory kit.', 1, 1, 14999, 'new', 7, 'fixed', NULL, 0, '📹'),
    ('Ceramic Plant Pot Set (3-piece)', 'Minimalist ceramic pots with drainage, various sizes.', 2, 1, 2799, 'new', 25, 'fixed', NULL, 0, '🪴');
