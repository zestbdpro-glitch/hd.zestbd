-- Import into a database created in cPanel. MySQL 5.7+ / MariaDB 10.4+.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  slug VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  headline VARCHAR(240) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  compare_at_price DECIMAL(12,2) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  stock_quantity INT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  media LONGTEXT NOT NULL,
  specifications LONGTEXT NOT NULL,
  faq LONGTEXT NOT NULL,
  delivery_note VARCHAR(500) NOT NULL DEFAULT '',
  offer LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_zones (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  zone_code VARCHAR(50) NOT NULL UNIQUE,
  zone_name VARCHAR(100) NOT NULL,
  delivery_fee DECIMAL(12,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  content LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id TINYINT UNSIGNED PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  order_reference VARCHAR(40) NOT NULL UNIQUE,
  client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(11) CHARACTER SET ascii NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_zone_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  delivery_zone_name VARCHAR(100) NOT NULL,
  quantity TINYINT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  delivery_fee DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  stock_reserved TINYINT(1) NOT NULL DEFAULT 0,
  order_status ENUM('pending','confirmed','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  customer_note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX orders_status_created (order_status, created_at),
  CONSTRAINT orders_product_fk FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT orders_zone_fk FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  identifier CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope VARCHAR(32) CHARACTER SET ascii NOT NULL,
  window_start BIGINT UNSIGNED NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (identifier, scope, window_start),
  INDEX rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
