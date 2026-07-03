import os
import time
import logging
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pymysql

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder=os.environ.get('STATIC_FOLDER', '../frontend'))
CORS(app)

# Database configuration from environment variables
MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', 'password')
MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'cafe_db')

def get_db_connection(database=None):
    """Establish connection to MySQL."""
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=database,
        cursorclass=pymysql.cursors.DictCursor
    )

def init_db():
    """Retry database connection and initialize database schema and seed data."""
    retries = 15
    conn = None
    while retries > 0:
        try:
            logger.info(f"Connecting to database at {MYSQL_HOST}:{MYSQL_PORT} (retries left: {retries})...")
            # Connect without database first to create it
            conn = get_db_connection()
            break
        except Exception as e:
            logger.warning(f"Database connection failed: {e}. Retrying in 3 seconds...")
            retries -= 1
            time.sleep(3)
    
    if not conn:
        logger.error("Could not connect to database. Exiting.")
        return False

    try:
        with conn.cursor() as cursor:
            # Create Database
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {MYSQL_DATABASE}")
            logger.info(f"Database '{MYSQL_DATABASE}' verified/created.")
        conn.close()

        # Connect to the created database
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            # Create Inventory Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS inventory (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    item_name VARCHAR(100) UNIQUE NOT NULL,
                    quantity DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    unit VARCHAR(20) NOT NULL,
                    min_required DECIMAL(10,2) NOT NULL DEFAULT 10.00
                )
            """)

            # Create Menu Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS menu (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    image_url VARCHAR(255)
                )
            """)

            # Create Menu Ingredients Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS menu_ingredients (
                    menu_id INT,
                    inventory_id INT,
                    quantity_needed DECIMAL(10,2) NOT NULL,
                    PRIMARY KEY (menu_id, inventory_id),
                    FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE,
                    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
                )
            """)

            # Create Orders Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    order_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_price DECIMAL(10,2) NOT NULL
                )
            """)

            # Create Order Items Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS order_items (
                    order_id INT,
                    menu_id INT,
                    quantity INT NOT NULL,
                    PRIMARY KEY (order_id, menu_id),
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                    FOREIGN KEY (menu_id) REFERENCES menu(id) ON DELETE CASCADE
                )
            """)
            
            # Check and Seed Default Inventory
            cursor.execute("SELECT COUNT(*) as count FROM inventory")
            if cursor.fetchone()['count'] == 0:
                logger.info("Seeding default inventory...")
                default_inventory = [
                    ("Coffee Beans", 5000.0, "g", 500.0),
                    ("Milk", 10000.0, "ml", 1000.0),
                    ("Sugar", 2000.0, "g", 200.0),
                    ("Chocolate Syrup", 1000.0, "g", 150.0),
                    ("Cups", 200.0, "pcs", 30.0),
                    ("Pastries", 50.0, "pcs", 10.0)
                ]
                cursor.executemany(
                    "INSERT INTO inventory (item_name, quantity, unit, min_required) VALUES (%s, %s, %s, %s)",
                    default_inventory
                )
                conn.commit()

            # Check and Seed Default Menu & Ingredients
            cursor.execute("SELECT COUNT(*) as count FROM menu")
            if cursor.fetchone()['count'] == 0:
                logger.info("Seeding default menu...")
                default_menu = [
                    ("Espresso", 3.00, "Coffee", "https://images.unsplash.com/photo-1510707577719-ee7c182ac733?w=500&auto=format&fit=crop&q=60"),
                    ("Cappuccino", 4.50, "Coffee", "https://images.unsplash.com/photo-1534778101976-62847782c213?w=500&auto=format&fit=crop&q=60"),
                    ("Mocha", 5.00, "Coffee", "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=500&auto=format&fit=crop&q=60"),
                    ("Hot Chocolate", 4.00, "Beverage", "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=60"),
                    ("Butter Croissant", 3.50, "Bakery", "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60")
                ]
                
                # Fetch inventory ids
                cursor.execute("SELECT id, item_name FROM inventory")
                inv_map = {row['item_name']: row['id'] for row in cursor.fetchall()}

                for name, price, category, img in default_menu:
                    cursor.execute("INSERT INTO menu (name, price, category, image_url) VALUES (%s, %s, %s, %s)", (name, price, category, img))
                    menu_id = cursor.lastrowid
                    
                    # Map ingredients
                    ingredients = []
                    if name == "Espresso":
                        ingredients = [(inv_map["Coffee Beans"], 18.0), (inv_map["Cups"], 1.0)]
                    elif name == "Cappuccino":
                        ingredients = [(inv_map["Coffee Beans"], 18.0), (inv_map["Milk"], 150.0), (inv_map["Cups"], 1.0)]
                    elif name == "Mocha":
                        ingredients = [(inv_map["Coffee Beans"], 18.0), (inv_map["Milk"], 150.0), (inv_map["Chocolate Syrup"], 20.0), (inv_map["Cups"], 1.0)]
                    elif name == "Hot Chocolate":
                        ingredients = [(inv_map["Milk"], 200.0), (inv_map["Chocolate Syrup"], 30.0), (inv_map["Cups"], 1.0)]
                    elif name == "Butter Croissant":
                        ingredients = [(inv_map["Pastries"], 1.0)]
                    
                    for inv_id, qty in ingredients:
                        cursor.execute("INSERT INTO menu_ingredients (menu_id, inventory_id, quantity_needed) VALUES (%s, %s, %s)", (menu_id, inv_id, qty))
                
                conn.commit()
                logger.info("Database seeding completed.")
        
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error during DB initialization: {e}")
        if conn:
            conn.close()
        return False

# Serve static frontend files
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

# Health Check Endpoint
@app.route('/healthz', methods=['GET'])
def health_check():
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
        conn.close()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "database": "disconnected", "error": str(e)}), 500

# System Info Endpoint (useful for K8s testing to see which Pod is answering)
@app.route('/api/system-info', methods=['GET'])
def system_info():
    db_connected = False
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
        conn.close()
        db_connected = True
    except:
        pass

    return jsonify({
        "hostname": os.environ.get('HOSTNAME', 'Localhost'),
        "db_host": MYSQL_HOST,
        "db_connected": db_connected,
        "python_version": os.sys.version.split()[0],
        "app_env": os.environ.get('APP_ENV', 'Production')
    })


# API Endpoints: Inventory
@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM inventory ORDER BY item_name ASC")
            items = cursor.fetchall()
        conn.close()
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/inventory/restock', methods=['POST'])
def restock_inventory():
    data = request.json
    if not data or 'item_id' not in data or 'quantity' not in data:
        return jsonify({"error": "Missing required fields (item_id, quantity)"}), 400
    
    item_id = data['item_id']
    quantity = float(data['quantity'])
    
    if quantity <= 0:
        return jsonify({"error": "Quantity must be positive"}), 400

    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("SELECT item_name FROM inventory WHERE id = %s", (item_id,))
            if not cursor.fetchone():
                conn.close()
                return jsonify({"error": "Inventory item not found"}), 404
            
            cursor.execute("UPDATE inventory SET quantity = quantity + %s WHERE id = %s", (quantity, item_id))
            conn.commit()
            
            cursor.execute("SELECT * FROM inventory WHERE id = %s", (item_id,))
            updated_item = cursor.fetchone()
        conn.close()
        return jsonify({"message": f"Successfully restocked {updated_item['item_name']}", "item": updated_item})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/inventory', methods=['POST'])
def add_inventory_item():
    data = request.json
    if not data or 'item_name' not in data or 'quantity' not in data or 'unit' not in data:
        return jsonify({"error": "Missing fields: item_name, quantity, unit"}), 400
    
    name = data['item_name']
    qty = float(data['quantity'])
    unit = data['unit']
    min_req = float(data.get('min_required', 10.0))

    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO inventory (item_name, quantity, unit, min_required) VALUES (%s, %s, %s, %s)",
                (name, qty, unit, min_req)
            )
            conn.commit()
            item_id = cursor.lastrowid
            cursor.execute("SELECT * FROM inventory WHERE id = %s", (item_id,))
            item = cursor.fetchone()
        conn.close()
        return jsonify(item), 201
    except pymysql.err.IntegrityError:
        return jsonify({"error": f"Item '{name}' already exists in inventory"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# API Endpoints: Menu
@app.route('/api/menu', methods=['GET'])
def get_menu():
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            # Fetch menu items
            cursor.execute("SELECT * FROM menu ORDER BY category, name ASC")
            menu_items = cursor.fetchall()
            
            # Fetch ingredients for each menu item
            for item in menu_items:
                cursor.execute("""
                    SELECT i.id, i.item_name, i.unit, mi.quantity_needed
                    FROM menu_ingredients mi
                    JOIN inventory i ON mi.inventory_id = i.id
                    WHERE mi.menu_id = %s
                """, (item['id'],))
                item['ingredients'] = cursor.fetchall()
        conn.close()
        return jsonify(menu_items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/menu', methods=['POST'])
def add_menu_item():
    data = request.json
    if not data or 'name' not in data or 'price' not in data or 'category' not in data:
        return jsonify({"error": "Missing name, price, or category"}), 400
    
    name = data['name']
    price = float(data['price'])
    category = data['category']
    image_url = data.get('image_url', '')
    ingredients = data.get('ingredients', []) # List of dicts: {"inventory_id": X, "quantity_needed": Y}

    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO menu (name, price, category, image_url) VALUES (%s, %s, %s, %s)", (name, price, category, image_url))
            menu_id = cursor.lastrowid
            
            for ing in ingredients:
                cursor.execute(
                    "INSERT INTO menu_ingredients (menu_id, inventory_id, quantity_needed) VALUES (%s, %s, %s)",
                    (menu_id, int(ing['inventory_id']), float(ing['quantity_needed']))
                )
            conn.commit()
        conn.close()
        return jsonify({"message": f"Menu item '{name}' added successfully", "menu_id": menu_id}), 201
    except pymysql.err.IntegrityError:
        return jsonify({"error": f"Menu item '{name}' already exists"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/menu/<int:item_id>', methods=['DELETE'])
def delete_menu_item(item_id):
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM menu WHERE id = %s", (item_id,))
            affected = cursor.rowcount
            conn.commit()
        conn.close()
        if affected == 0:
            return jsonify({"error": "Menu item not found"}), 404
        return jsonify({"message": "Menu item deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# API Endpoints: Orders
@app.route('/api/order', methods=['POST'])
def place_order():
    data = request.json
    if not data or 'items' not in data or not isinstance(data['items'], list):
        return jsonify({"error": "Invalid order. Must contain a list of items with menu_id and quantity"}), 400
    
    order_items = data['items'] # List of {"menu_id": X, "quantity": Y}
    if not order_items:
        return jsonify({"error": "Order cannot be empty"}), 400

    conn = None
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            # 1. Validate items and verify inventory
            total_price = 0.0
            
            # Map of ingredient requirement calculations for this order
            needed_ingredients = {} # inventory_id -> total_quantity_needed
            
            for item in order_items:
                menu_id = int(item['menu_id'])
                qty = int(item['quantity'])
                if qty <= 0:
                    return jsonify({"error": f"Quantity must be greater than 0 for menu_id {menu_id}"}), 400
                
                # Get menu item details
                cursor.execute("SELECT name, price FROM menu WHERE id = %s", (menu_id,))
                menu_row = cursor.fetchone()
                if not menu_row:
                    return jsonify({"error": f"Menu item with ID {menu_id} not found"}), 404
                
                total_price += float(menu_row['price']) * qty
                
                # Get ingredients for this menu item
                cursor.execute("SELECT inventory_id, quantity_needed FROM menu_ingredients WHERE menu_id = %s", (menu_id,))
                ingredients = cursor.fetchall()
                for ing in ingredients:
                    inv_id = ing['inventory_id']
                    req_qty = float(ing['quantity_needed']) * qty
                    needed_ingredients[inv_id] = needed_ingredients.get(inv_id, 0.0) + req_qty
            
            # 2. Check inventory availability
            for inv_id, req_qty in needed_ingredients.items():
                cursor.execute("SELECT item_name, quantity, unit FROM inventory WHERE id = %s", (inv_id,))
                inv_row = cursor.fetchone()
                if not inv_row:
                    return jsonify({"error": f"Inventory item ID {inv_id} not found"}), 500
                
                available = float(inv_row['quantity'])
                if available < req_qty:
                    return jsonify({
                        "error": "Insufficient inventory",
                        "details": f"Need {req_qty:.2f}{inv_row['unit']} of '{inv_row['item_name']}', but only {available:.2f}{inv_row['unit']} is available."
                    }), 400

            # 3. All checks passed! Proceed with order placement & decrementing inventory
            # Insert Order
            cursor.execute("INSERT INTO orders (total_price) VALUES (%s)", (total_price,))
            order_id = cursor.lastrowid
            
            # Insert Order Items and Update Inventory
            for item in order_items:
                menu_id = int(item['menu_id'])
                qty = int(item['quantity'])
                cursor.execute("INSERT INTO order_items (order_id, menu_id, quantity) VALUES (%s, %s, %s)", (order_id, menu_id, qty))
                
            for inv_id, req_qty in needed_ingredients.items():
                cursor.execute("UPDATE inventory SET quantity = quantity - %s WHERE id = %s", (req_qty, inv_id))
                
            conn.commit()
            
        conn.close()
        return jsonify({
            "message": "Order placed successfully!",
            "order_id": order_id,
            "total_price": total_price
        }), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders', methods=['GET'])
def get_orders():
    try:
        conn = get_db_connection(MYSQL_DATABASE)
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM orders ORDER BY order_time DESC LIMIT 50")
            orders = cursor.fetchall()
            
            for order in orders:
                cursor.execute("""
                    SELECT m.name, oi.quantity, m.price
                    FROM order_items oi
                    JOIN menu m ON oi.menu_id = m.id
                    WHERE oi.order_id = %s
                """, (order['id'],))
                order['items'] = cursor.fetchall()
        conn.close()
        return jsonify(orders)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Initialize DB
    logger.info("Initializing database...")
    db_initialized = init_db()
    if not db_initialized:
        logger.warning("Database initialization failed. App starting but DB features might fail.")
    
    # Run server
    port = int(os.environ.get('PORT', 5000))
    # In production/K8s, listening on 0.0.0.0 is required
    app.run(host='0.0.0.0', port=port, debug=False)
